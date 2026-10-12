import { QueueAction, QueueState, applyAction } from './models';
import { settle, trackChanges } from './sync';

const empty: QueueState = {
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
const add = (id: string, qty = 1): QueueAction => ({
  type: 'add',
  id,
  customer: 'Anna',
  items: [{ name: 'Margherita', qty, note: '', color: '#e53935' }],
  note: '',
});

describe('settle', () => {
  it('applies a change', () => {
    const { next, refused } = settle(empty, add('a'));
    expect(next.orders.length).toBe(1);
    expect(refused).toBe(false);
  });

  it('refuses an order when too few pizzas are left', () => {
    const limited = { ...empty, timing: { ...empty.timing, maxPizzas: 2 } };
    const { next, refused } = settle(applyAction(limited, add('a', 2)), add('b'));
    expect(refused).toBe(true);
    expect(next.orders.map((o) => o.id)).toEqual(['a']);
  });

  it('does not refuse an order sent twice, when the answer to the first try got lost', () => {
    const once = applyAction(empty, add('a'));
    const { next, refused } = settle(once, add('a'));
    expect(next).toBe(once);
    expect(refused).toBe(false);
  });

  it('ignores a malformed change', () => {
    const { next } = settle(empty, { type: 'pizza' } as unknown as QueueAction);
    expect(next).toBe(empty);
  });
});

describe('trackChanges', () => {
  const now = Date.now();

  it('tracks a new order', () => {
    const after = applyAction(empty, add('a'), now);
    const changes = trackChanges(empty, after, now);
    expect([...changes.keys()]).toEqual(['a']);
    expect(changes.get('a')).toEqual(expect.objectContaining({ number: 1, status: 'new' }));
  });

  it('leaves orders a change does not affect alone', () => {
    const before = applyAction(applyAction(empty, add('a'), now), add('b'), now);
    const after = applyAction(before, { type: 'status', id: 'b', status: 'cancelled' }, now);
    const changes = trackChanges(before, after, now);
    expect(changes.has('b')).toBe(true);
    // Order a is first in line either way, so its page doesn't change.
    expect(changes.has('a')).toBe(false);
  });

  it('stops tracking orders the queue no longer has', () => {
    const before = applyAction(empty, add('a'), now);
    const changes = trackChanges(before, { ...before, orders: [] }, now);
    expect(changes.get('a')).toBeNull();
  });
});
