import { estimateReady } from './estimate';
import { NewOrderItem, QueueState, applyAction } from './models';

const MIN = 60000;
const T0 = 1_000_000_000_000;

function queue(): QueueState {
  return {
    id: 'q',
    name: 'Test',
    nextNumber: 1,
    menu: [],
    timing: { firstMinutes: 15, perPizzaMinutes: 4 },
    bakeLog: [],
    orders: [],
  };
}

function order(s: QueueState, id: string, pizzas: number, at: number): QueueState {
  const items: NewOrderItem[] = [{ name: 'Margherita', qty: pizzas, note: '', color: '#e53935' }];
  return applyAction(s, { type: 'add', id, customer: '', items, note: '' }, at);
}

describe('estimateReady', () => {
  it('uses the host settings before anything is baked', () => {
    let s = order(queue(), 'a', 2, T0);
    s = order(s, 'b', 1, T0);
    const eta = estimateReady(s, T0);
    // First pizza after 15 min, second 4 min later; the next order follows 4 min after.
    expect(eta.get('a')).toBe(T0 + 19 * MIN);
    expect(eta.get('b')).toBe(T0 + 23 * MIN);
  });

  it('switches to the measured pace once pizzas are baked', () => {
    let s = order(queue(), 'a', 6, T0);
    s = order(s, 'b', 1, T0);
    // The oven bakes a pizza every 2 minutes instead of 4.
    for (let i = 0; i < 6; i++) {
      s = applyAction(
        s,
        { type: 'pizza', id: 'a', item: 0, unit: i, status: 'baked' },
        T0 + (16 + 2 * i) * MIN,
      );
    }
    const now = T0 + 27 * MIN;
    const eta = estimateReady(s, now);
    expect(eta.has('a')).toBe(false);
    const b = eta.get('b')!;
    expect(b).toBeGreaterThan(now);
    expect(b - now).toBeLessThan(4 * MIN);
  });

  it('moves estimates later when the kitchen falls behind', () => {
    const s = order(queue(), 'a', 1, T0);
    const late = T0 + 30 * MIN;
    expect(estimateReady(s, late).get('a')).toBeGreaterThanOrEqual(late);
  });
});
