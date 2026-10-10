import { estimateReady, phaseTimes, pizzaSummary } from './estimate';
import { NewOrderItem, PizzaStatus, QueueState, applyAction } from './models';

const MIN = 60000;
const T0 = 1_000_000_000_000;

function queue(): QueueState {
  return {
    id: 'q',
    name: 'Test',
    nextNumber: 1,
    menu: [],
    timing: { prepareMinutes: 3, bakeMinutes: 8, counterMinutes: 2 },
    orders: [],
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
