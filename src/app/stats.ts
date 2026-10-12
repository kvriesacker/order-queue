import { Order, QueueState, orderTotal } from './models';
import { t } from './i18n/i18n';

const MINUTE = 60000;
/** Orders are grouped into blocks of this many minutes to find the busy moments. */
export const BLOCK_MINUTES = 15;

export interface PhaseStat {
  /** Which step this is, for code; `label` is the name shown on screen. */
  step: 'prepare' | 'bake' | 'counter';
  label: string;
  /** What the host set, in minutes. */
  setting: number;
  /** Real average and median in minutes, or null without measurements. */
  average: number | null;
  median: number | null;
  samples: number;
}

export interface QueueStats {
  orders: number;
  pizzas: number;
  /** Money taken in euros, from the prices pizzas had when ordered (cancelled orders left out). */
  revenue: number;
  cancelledOrders: number;
  cancelledPizzas: number;
  pizzasPerOrder: number;
  firstOrder: number | null;
  lastOrder: number | null;
  /** Pizzas per hour between the first and last order. */
  pizzasPerHour: number | null;
  maxPizzas: number;
  /** When the last pizza that fit under the limit was ordered. */
  soldOutAt: number | null;
  perPizza: { name: string; color: string; count: number; share: number }[];
  blocks: { start: number; orders: number; pizzas: number }[];
  busiest: { start: number; pizzas: number } | null;
  phases: PhaseStat[];
  /** Order placed until called for the customer, in minutes. */
  wait: { average: number | null; median: number | null; longest: number | null; samples: number };
  notes: { note: string; count: number }[];
}

/**
 * Totals and timings over every order of a queue, including finished orders that were
 * cleared from the live list (`archived`), so the host can learn for next time.
 */
export function queueStats(state: QueueState, archived: Order[] = []): QueueStats {
  const all = mergeOrders(archived, state.orders);
  const sold = all.filter((o) => o.status !== 'cancelled');
  const cancelled = all.filter((o) => o.status === 'cancelled');
  const qty = (o: Order) => o.items.reduce((n, i) => n + i.qty, 0);
  const pizzas = sold.reduce((n, o) => n + qty(o), 0);

  // Per pizza type.
  const types = new Map<string, { color: string; count: number }>();
  for (const o of sold)
    for (const i of o.items) {
      const t = types.get(i.name) ?? { color: i.color, count: 0 };
      t.count += i.qty;
      types.set(i.name, t);
    }
  const perPizza = [...types]
    .map(([name, t]) => ({ name, ...t, share: pizzas ? t.count / pizzas : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Busy moments, in blocks of 15 minutes from the first order to the last.
  const times = sold.map((o) => o.createdAt).sort((a, b) => a - b);
  const firstOrder = times[0] ?? null;
  const lastOrder = times.at(-1) ?? null;
  const blocks: QueueStats['blocks'] = [];
  if (firstOrder !== null && lastOrder !== null) {
    const size = BLOCK_MINUTES * MINUTE;
    const start = Math.floor(firstOrder / size) * size;
    for (let t = start; t <= lastOrder; t += size) blocks.push({ start: t, orders: 0, pizzas: 0 });
    for (const o of sold) {
      const block = blocks[Math.floor((o.createdAt - start) / size)];
      block.orders++;
      block.pizzas += qty(o);
    }
  }
  const busiest = blocks.reduce<QueueStats['busiest']>(
    (best, b) => (b.pizzas > (best?.pizzas ?? 0) ? { start: b.start, pizzas: b.pizzas } : best),
    null,
  );
  const hours = firstOrder !== null && lastOrder !== null ? (lastOrder - firstOrder) / 3600000 : 0;

  // When the limit was reached.
  let soldOutAt: number | null = null;
  const max = state.timing.maxPizzas;
  if (max > 0) {
    let count = state.soldCleared - archivedSold(archived);
    for (const o of [...sold].sort((a, b) => a.createdAt - b.createdAt)) {
      count += qty(o);
      if (count >= max) {
        soldOutAt = o.createdAt;
        break;
      }
    }
  }

  // Real phase times against the settings.
  const pizzaTimes = sold.flatMap((o) => o.items.flatMap((i) => i.times));
  const prepared = pizzaTimes
    .map((t) => t.prepared)
    .filter((t): t is number => !!t)
    .sort((a, b) => a - b);
  // Gaps between pizzas leave out pauses when the kitchen had nothing to do.
  const prepareGaps = prepared
    .slice(1)
    .map((t, i) => t - prepared[i])
    .filter((g) => g < state.timing.prepareMinutes * 4 * MINUTE);
  const bakeTimes = pizzaTimes
    .filter((t) => t.prepared && t.baked)
    .map((t) => t.baked! - t.prepared!);
  const counterTimes = sold
    .filter((o) => o.bakedAt && o.calledAt)
    .map((o) => o.calledAt! - o.bakedAt!);
  const waits = sold.filter((o) => o.calledAt).map((o) => o.calledAt! - o.createdAt);

  const phase = (step: PhaseStat['step'], label: string, setting: number, samples: number[]): PhaseStat => ({
    step,
    label,
    setting,
    average: average(samples),
    median: median(samples),
    samples: samples.length,
  });

  // Notes: each quick note or comma-separated part counts once per pizza line.
  const notes = new Map<string, { note: string; count: number }>();
  for (const o of sold)
    for (const i of o.items)
      for (const part of i.note.split(',').map((n) => n.trim()).filter(Boolean)) {
        const key = part.toLowerCase();
        const n = notes.get(key) ?? { note: part, count: 0 };
        n.count += i.qty;
        notes.set(key, n);
      }

  return {
    orders: sold.length,
    pizzas,
    revenue: Math.round(sold.reduce((sum, o) => sum + orderTotal(o), 0) * 100) / 100,
    cancelledOrders: cancelled.length,
    cancelledPizzas: cancelled.reduce((n, o) => n + qty(o), 0),
    pizzasPerOrder: sold.length ? pizzas / sold.length : 0,
    firstOrder,
    lastOrder,
    pizzasPerHour: hours >= 0.25 ? pizzas / hours : null,
    maxPizzas: max,
    soldOutAt,
    perPizza,
    blocks,
    busiest,
    phases: [
      phase('prepare', t('Prepare (per pizza)'), state.timing.prepareMinutes, prepareGaps),
      phase('bake', t('Bake'), state.timing.bakeMinutes, bakeTimes),
      phase('counter', t('Counter'), state.timing.counterMinutes, counterTimes),
    ],
    wait: {
      average: average(waits),
      median: median(waits),
      longest: waits.length ? Math.max(...waits) / MINUTE : null,
      samples: waits.length,
    },
    notes: [...notes.values()].sort((a, b) => b.count - a.count).slice(0, 10),
  };
}

/** One row per pizza, for a spreadsheet. */
export function statsCsv(state: QueueState, archived: Order[] = []): string {
  const time = (t?: number) => (t ? new Date(t).toLocaleString() : '');
  const rows = [
    ['Order', 'Customer', 'Ordered at', 'Status', 'Pizza', 'Price', 'Note', 'Prepared at', 'Baked at', 'Called at'],
  ];
  for (const o of mergeOrders(archived, state.orders))
    for (const i of o.items)
      for (let j = 0; j < i.qty; j++) {
        const t = i.times[j] ?? {};
        rows.push([
          String(o.number),
          o.customer,
          time(o.createdAt),
          o.status,
          i.name,
          (i.price ?? 0).toFixed(2),
          i.note,
          time(t.prepared),
          time(t.baked),
          time(o.calledAt),
        ]);
      }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Archived orders plus the live list, without duplicates, oldest first. */
function mergeOrders(archived: Order[], live: Order[]): Order[] {
  const ids = new Set(live.map((o) => o.id));
  return [...archived.filter((o) => !ids.has(o.id)), ...live].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

function archivedSold(archived: Order[]): number {
  return archived
    .filter((o) => o.status === 'collected')
    .reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0);
}

function average(ms: number[]): number | null {
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length / MINUTE : null;
}

function median(ms: number[]): number | null {
  if (!ms.length) return null;
  const s = [...ms].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) / MINUTE;
}
