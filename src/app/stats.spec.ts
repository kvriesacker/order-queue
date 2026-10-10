import { queueStats, statsCsv } from './stats';
import { NewOrderItem, QueueState, applyAction } from './models';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 18, 0);

function queue(maxPizzas = 0): QueueState {
  return {
    id: 'q',
    name: 'Test',
    nextNumber: 1,
    menu: [],
    timing: { prepareMinutes: 3, bakeMinutes: 8, counterMinutes: 2, ovens: 1, pizzasPerOven: 4, maxPizzas },
    orders: [],
    soldCleared: 0,
    hostEpoch: 0,
    hostId: '',
  };
}

function add(s: QueueState, id: string, at: number, items: [string, string][]): QueueState {
  const lines: NewOrderItem[] = items.map(([name, note]) => ({ name, qty: 1, note, color: '#e53935' }));
  return applyAction(s, { type: 'add', id, customer: 'X, "Y"', items: lines, note: '' }, at);
}

describe('queueStats', () => {
  it('totals pizzas per type, busy blocks, notes and the sold-out time', () => {
    let s = queue(4);
    s = add(s, 'a', T0, [['Margherita', 'No cheese'], ['Funghi', '']]);
    s = add(s, 'b', T0 + 20 * MIN, [['Margherita', 'no cheese, Spicy']]);
    s = add(s, 'c', T0 + 22 * MIN, [['Margherita', '']]);
    s = add(s, 'd', T0 + 25 * MIN, [['Hawaii', '']]); // over the limit, refused
    s = add(s, 'e', T0 + 26 * MIN, [['Diavola', '']]);
    s = applyAction(s, { type: 'status', id: 'e', status: 'cancelled' }, T0 + 27 * MIN);
    const st = queueStats(s);
    expect(st.orders).toBe(3);
    expect(st.pizzas).toBe(4);
    expect(st.cancelledOrders).toBe(0); // e was refused too: the limit was reached
    expect(st.perPizza.map((p) => [p.name, p.count])).toEqual([
      ['Margherita', 3],
      ['Funghi', 1],
    ]);
    expect(st.blocks.map((b) => b.pizzas)).toEqual([2, 2]);
    expect(st.busiest?.start).toBe(T0);
    expect(st.soldOutAt).toBe(T0 + 22 * MIN);
    expect(st.notes).toEqual([
      { note: 'No cheese', count: 2 },
      { note: 'Spicy', count: 1 },
    ]);
  });

  it('measures the real phase times and the wait', () => {
    let s = add(queue(), 'a', T0, [['Margherita', '']]);
    s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit: 0, status: 'prepared' }, T0 + 2 * MIN);
    s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit: 0, status: 'baked' }, T0 + 9 * MIN);
    s = applyAction(s, { type: 'status', id: 'a', status: 'ready-for-customer' }, T0 + 10 * MIN);
    const st = queueStats(s);
    expect(st.phases[1].average).toBe(7);
    expect(st.phases[2].average).toBe(1);
    expect(st.wait.average).toBe(10);
  });

  it('writes one CSV row per pizza and quotes commas and quotes', () => {
    const s = add(queue(), 'a', T0, [['Margherita', 'No cheese, Spicy'], ['Funghi', '']]);
    const lines = statsCsv(s).split('\r\n');
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('"X, ""Y"""');
    expect(lines[1]).toContain('"No cheese, Spicy"');
  });
});
