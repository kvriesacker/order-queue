import { Order, QueueState, Timing } from './models';

const MINUTE = 60000;
/** Only the last hour counts when measuring how fast things go. */
const RECENT = 60 * MINUTE;
/** With this many measurements the real time fully replaces the host's setting. */
const FULL_TRUST = 5;

export interface PhaseTimes {
  /** Milliseconds per pizza in the kitchen (pizzas are prepared one after another). */
  prepare: number;
  /** Milliseconds a pizza spends in the oven. */
  bake: number;
  /** Milliseconds from the last pizza baked until the counter calls the order. */
  counter: number;
}

/**
 * How long each phase takes right now: the host's settings at first, then more and more
 * the times measured over the last hour, so a faster or slower kitchen, oven or counter
 * moves the estimates by itself.
 */
export function phaseTimes(state: QueueState, now: number): PhaseTimes {
  const setting = (key: keyof Timing) => state.timing[key] * MINUTE;
  const recent = (t: number | undefined): t is number => !!t && now - t < RECENT;
  const pizzas = state.orders.flatMap((o) => o.items.flatMap((i) => i.times));

  // Kitchen: the gaps between pizzas being marked prepared, leaving out idle pauses.
  const prepared = pizzas
    .map((t) => t.prepared)
    .filter(recent)
    .sort((a, b) => a - b);
  const prepareGaps = prepared.slice(1).map((t, i) => t - prepared[i]);

  // Oven: from prepared to baked, per pizza. A pizza that had to wait for room in a full
  // oven doesn't tell how long baking takes, so it's left out.
  const slots = ovenSlots(state);
  const inOvenAt = (at: number) =>
    pizzas.filter((t) => t.prepared && t.prepared < at && (!t.baked || t.baked > at)).length;
  const bakeTimes = pizzas
    .filter((t) => recent(t.baked) && t.prepared && inOvenAt(t.prepared) < slots)
    .map((t) => t.baked! - t.prepared!);

  // Counter: from the order's last pizza baked to the customer being called.
  const counterTimes = state.orders
    .filter((o) => recent(o.calledAt) && o.bakedAt)
    .map((o) => o.calledAt! - o.bakedAt!);

  return {
    prepare: blend(prepareGaps, setting('prepareMinutes')),
    bake: blend(bakeTimes, setting('bakeMinutes')),
    counter: blend(counterTimes, setting('counterMinutes')),
  };
}

/** Mixes measurements into the setting, ignoring outliers (pauses, forgotten taps). */
function blend(samples: number[], setting: number): number {
  const usable = samples.filter((s) => s >= 0 && s < setting * 4).slice(-12);
  if (!usable.length) return setting;
  const measured = usable.reduce((a, b) => a + b, 0) / usable.length;
  const weight = Math.min(1, usable.length / FULL_TRUST);
  return Math.max(MINUTE / 6, measured * weight + setting * (1 - weight));
}

/** How many pizzas fit at once in the ovens that work (0 when every oven is out of order). */
export function ovenSlots(state: QueueState): number {
  const working = state.timing.ovens - state.ovensOut.length;
  return Math.max(0, working) * state.timing.pizzasPerOven;
}

/**
 * Estimates when each open order will be ready for the customer, per order id.
 *
 * The kitchen prepares pizzas one after another in order of arrival. Each prepared pizza
 * then goes into the first oven spot that frees up (the host sets how many ovens and how
 * many pizzas fit in each; ovens marked out of order don't count) and bakes for the bake time. When an order's last pizza is
 * baked, the counter needs its own time to call it. Each phase uses {@link phaseTimes},
 * and anything running late is pushed to "now", so the estimates keep moving with reality.
 */
export function estimateReady(state: QueueState, now: number): Map<string, number> {
  const { prepare, bake, counter } = phaseTimes(state, now);

  // The kitchen started its current pizza when it finished the previous one, unless it
  // has been idle for longer than a pizza takes.
  const lastPrepared = Math.max(
    0,
    ...state.orders.flatMap((o) => o.items.flatMap((i) => i.times.map((t) => t.prepared ?? 0))),
  );
  let kitchen = now - lastPrepared < prepare ? lastPrepared : now;

  const open = state.orders
    .filter((o) => o.status === 'new' || o.status === 'in-progress' || o.status === 'ready')
    .sort((a, b) => a.createdAt - b.createdAt);

  // When each order's pizzas are baked, and which pizzas still need the oven.
  const lastBaked = new Map<string, number>();
  const forOven: { order: string; from: number }[] = [];
  for (const order of open) {
    lastBaked.set(order.id, order.status === 'ready' ? (order.bakedAt ?? now) : 0);
    if (order.status === 'ready') continue;
    for (const item of order.items) {
      item.units.forEach((unit, j) => {
        const times = item.times[j] ?? {};
        if (unit === 'baked') {
          lastBaked.set(order.id, Math.max(lastBaked.get(order.id)!, times.baked ?? now));
        } else if (unit === 'prepared') {
          forOven.push({ order: order.id, from: times.prepared ?? now });
        } else {
          kitchen = Math.max(now, kitchen + prepare);
          forOven.push({ order: order.id, from: kitchen });
        }
      });
    }
  }

  // Fill the oven spots in the order pizzas come out of the kitchen. With every oven out of
  // order, orders that still need the oven have no estimate until one works again.
  const free = Array<number>(ovenSlots(state)).fill(0);
  if (!free.length) for (const pizza of forOven) lastBaked.delete(pizza.order);
  for (const pizza of free.length ? forOven.sort((a, b) => a.from - b.from) : []) {
    const spot = free.indexOf(Math.min(...free));
    const baked = Math.max(now, Math.max(pizza.from, free[spot]) + bake);
    free[spot] = baked;
    lastBaked.set(pizza.order, Math.max(lastBaked.get(pizza.order)!, baked));
  }

  const result = new Map<string, number>();
  for (const [id, baked] of lastBaked) result.set(id, Math.max(now, baked + counter));
  return result;
}

/** "2× Margherita, 1× Funghi" for an order, without per-pizza notes. */
export function pizzaSummary(order: Order): string {
  const counts = new Map<string, number>();
  for (const item of order.items) counts.set(item.name, (counts.get(item.name) ?? 0) + item.qty);
  return [...counts].map(([name, n]) => `${n}× ${name}`).join(', ');
}

/** "18:42" for a timestamp. */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "12 min" until a timestamp, or "any minute" when it's (nearly) due. */
export function minutesUntil(ts: number, now: number): string {
  const minutes = Math.round((ts - now) / MINUTE);
  return minutes <= 1 ? 'any minute' : `${minutes} min`;
}
