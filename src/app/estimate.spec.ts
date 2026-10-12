import { estimateIfSent, estimateReady, phaseTimes, pizzaSummary } from './estimate';
import { NewOrderItem, PizzaStatus, QueueState, applyAction } from './models';

const MIN = 60000;
const T0 = 1_000_000_000_000;

function queue(): QueueState {
  return {
    id: 'q',
    name: 'Test',
    nextNumber: 1,
    menu: [],
    timing: { prepareMinutes: 3, bakeMinutes: 8, counterMinutes: 2, ovens: 1, pizzasPerOven: 4, maxPizzas: 0, price: 0 },
    orders: [],
    soldCleared: 0,
    soldClearedByType: {},
    ovensOut: [],
    hostEpoch: 0,
    hostId: '',
  };
}

function order(s: QueueState, id: string, pizzas: number, at: number): QueueState {
  const items: NewOrderItem[] = [
    { name: 'Margherita', qty: pizzas, note: 'no onion', color: '#e53935' },
  ];
  return applyAction(s, { type: 'add', id, customer: '', items, note: '' }, at);
}

function pizza(s: QueueState, id: string, unit: number, status: PizzaStatus, at: number) {
  return applyAction(s, { type: 'pizza', id, item: 0, unit, status }, at);
}

describe('estimateReady', () => {
  it('adds up prepare, bake and counter from the host settings', () => {
    let s = order(queue(), 'a', 2, T0);
    s = order(s, 'b', 1, T0);
    const eta = estimateReady(s, T0);
    // a: pizzas prepared at 3 and 6 min, the second baked at 14, called at 16.
    expect(eta.get('a')).toBe(T0 + 16 * MIN);
    // b: prepared at 9, baked at 17, called at 19.
    expect(eta.get('b')).toBe(T0 + 19 * MIN);
  });

  it('pulls estimates earlier when the kitchen prepares faster', () => {
    let s = order(queue(), 'a', 6, T0);
    s = order(s, 'b', 2, T0);
    const before = estimateReady(s, T0).get('b')!;
    // The kitchen prepares a pizza every minute instead of every 3.
    for (let i = 0; i < 6; i++) s = pizza(s, 'a', i, 'prepared', T0 + (i + 1) * MIN);
    const now = T0 + 6 * MIN;
    expect(phaseTimes(s, now).prepare).toBeLessThan(2 * MIN);
    expect(estimateReady(s, now).get('b')!).toBeLessThan(before);
  });

  it('learns the bake and counter times separately', () => {
    let s = queue();
    for (let k = 0; k < 5; k++) {
      const id = `o${k}`;
      const at = T0 + k * 10 * MIN;
      s = order(s, id, 1, at);
      s = pizza(s, id, 0, 'prepared', at + 3 * MIN);
      s = pizza(s, id, 0, 'baked', at + 8 * MIN); // 5 min in the oven
      s = applyAction(s, { type: 'status', id, status: 'ready-for-customer' }, at + 9 * MIN);
    }
    const t = phaseTimes(s, T0 + 50 * MIN);
    expect(t.bake).toBe(5 * MIN);
    expect(t.counter).toBe(1 * MIN);
  });

  it('waits for room in the ovens and speeds up with more ovens', () => {
    const base = queue();
    base.timing = { ...base.timing, prepareMinutes: 1, ovens: 1, pizzasPerOven: 1 };
    const s = order(base, 'a', 3, T0);
    // Prepared at 1, 2, 3 but one at a time in the oven: baked at 9, 17, 25, called at 27.
    expect(estimateReady(s, T0).get('a')).toBe(T0 + 27 * MIN);
    const more = applyAction(s, { type: 'timing', timing: { ...s.timing, ovens: 3 } });
    // Three ovens: baked at 9, 10, 11, called at 13.
    expect(estimateReady(more, T0).get('a')).toBe(T0 + 13 * MIN);
  });

  it('leaves ovens marked out of order out of the estimate', () => {
    const base = queue();
    base.timing = { ...base.timing, prepareMinutes: 1, ovens: 3, pizzasPerOven: 1 };
    let s = order(base, 'a', 3, T0);
    expect(estimateReady(s, T0).get('a')).toBe(T0 + 13 * MIN);
    // Two of three ovens out: one at a time again, as with a single oven.
    s = applyAction(s, { type: 'oven', index: 0, out: true });
    s = applyAction(s, { type: 'oven', index: 2, out: true });
    expect(estimateReady(s, T0).get('a')).toBe(T0 + 27 * MIN);
    // Every oven out: no estimate until one works again.
    s = applyAction(s, { type: 'oven', index: 1, out: true });
    expect(estimateReady(s, T0).has('a')).toBe(false);
    s = applyAction(s, { type: 'oven', index: 1, out: false });
    expect(estimateReady(s, T0).get('a')).toBe(T0 + 27 * MIN);
  });

  it('ignores bake times of pizzas that waited for a full oven', () => {
    let s = queue();
    s.timing = { ...s.timing, ovens: 1, pizzasPerOven: 1 };
    s = order(s, 'a', 2, T0);
    s = pizza(s, 'a', 0, 'prepared', T0);
    s = pizza(s, 'a', 1, 'prepared', T0 + MIN); // waits for the first pizza
    s = pizza(s, 'a', 0, 'baked', T0 + 8 * MIN);
    s = pizza(s, 'a', 1, 'baked', T0 + 16 * MIN);
    // Only the first pizza counts (8 min, the same as the setting), not the 15 min wait.
    expect(phaseTimes(s, T0 + 16 * MIN).bake).toBe(8 * MIN);
  });

  it('moves estimates later when an order is running late', () => {
    const s = order(queue(), 'a', 1, T0);
    const late = T0 + 30 * MIN;
    expect(estimateReady(s, late).get('a')).toBeGreaterThanOrEqual(late);
  });

  it('summarises pizzas without notes', () => {
    let s = applyAction(queue(), {
      type: 'add',
      id: 'a',
      customer: 'Anna',
      note: '',
      items: [
        { name: 'Margherita', qty: 1, note: 'no cheese', color: '#e53935' },
        { name: 'Funghi', qty: 1, note: '', color: '#6d4c41' },
        { name: 'Margherita', qty: 1, note: '', color: '#e53935' },
      ],
    });
    expect(pizzaSummary(s.orders[0])).toBe('2× Margherita, 1× Funghi');
  });
});

describe('estimateIfSent', () => {
  const items: NewOrderItem[] = [{ name: 'Margherita', qty: 1, note: '', color: '#e53935' }];

  it('gives the time an order would be ready if sent now, the same as once sent', () => {
    const s = order(queue(), 'a', 2, T0);
    const draft = estimateIfSent(s, items, T0);
    expect(draft).toBe(estimateReady(order(s, 'b', 1, T0 + 1), T0).get('b'));
    // Behind the orders already waiting: 3 pizzas × 3 min, then 8 min baking and 2 at the counter.
    expect(draft).toBe(T0 + 19 * MIN);
  });

  it('gives no time when the order could not be sent', () => {
    const s = queue();
    const full = { ...s, timing: { ...s.timing, maxPizzas: 1 } };
    expect(estimateIfSent(order(full, 'a', 1, T0), items, T0)).toBeUndefined();
  });
});
