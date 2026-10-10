import { Order, QueueState } from './models';

const MINUTE = 60000;

/**
 * Estimates when each open order will be ready, as a timestamp per order id.
 *
 * Pizzas come out of the oven one after another in order of arrival. The pace starts at
 * the host's "minutes between pizzas" and switches to the measured pace once a few
 * pizzas have been baked recently. A new order also can't be ready before the host's
 * "minutes for the first pizza" have passed since it was placed. Because the clock and
 * the pace move, the estimates update by themselves as the shift goes on.
 */
export function estimateReady(state: QueueState, now: number): Map<string, number> {
  const result = new Map<string, number>();
  const pace = currentPace(state, now);
  const first = state.timing.firstMinutes * MINUTE;
  const lastBake = state.bakeLog.at(-1);

  // When the next pizza can come out of the oven.
  let next = now;
  if (lastBake && now - lastBake < pace * 2) next = Math.max(now, lastBake + pace);

  const open = state.orders
    .filter((o) => o.status === 'new' || o.status === 'in-progress')
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const order of open) {
    const left = remainingPizzas(order);
    if (!left) continue;
    let t = Math.max(next, order.createdAt + first);
    t += (left - 1) * pace;
    result.set(order.id, t);
    next = t + pace;
  }
  return result;
}

/** Milliseconds between pizzas: measured from recent bakes, or the host's setting. */
export function currentPace(state: QueueState, now: number): number {
  const configured = state.timing.perPizzaMinutes * MINUTE;
  const recent = state.bakeLog.filter((t) => now - t < 60 * MINUTE);
  if (recent.length < 3) return configured;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]);
  // Ignore long pauses (no orders) so they don't make the pace look slow.
  const busy = gaps.filter((g) => g < configured * 3);
  if (busy.length < 2) return configured;
  const measured = busy.reduce((a, b) => a + b, 0) / busy.length;
  // Blend with the setting so one fast or slow pizza doesn't swing everything.
  const weight = Math.min(1, busy.length / 6);
  return Math.max(MINUTE / 4, measured * weight + configured * (1 - weight));
}

function remainingPizzas(order: Order): number {
  return order.items.reduce((n, i) => n + i.units.filter((u) => u !== 'baked').length, 0);
}

/** "18:42" for a timestamp. */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "about 12 min" until a timestamp, or "any minute" when it's (nearly) due. */
export function minutesUntil(ts: number, now: number): string {
  const minutes = Math.round((ts - now) / MINUTE);
  return minutes <= 1 ? 'any minute' : `${minutes} min`;
}
