import { QueueAction, QueueState, applyAction } from './models';

describe('applyAction', () => {
  const empty: QueueState = { id: 'q', name: 'Test', nextNumber: 1, orders: [] };
  const add = (id: string): QueueAction & { type: 'add' } => ({
    type: 'add',
    id,
    customer: ' Anna ',
    items: [{ name: 'Margherita', qty: 2, note: '' }],
    note: '',
  });

  it('numbers new orders in sequence', () => {
    const s = applyAction(applyAction(empty, add('a')), add('b'));
    expect(s.orders.map((o) => o.number)).toEqual([1, 2]);
    expect(s.orders[0].customer).toBe('Anna');
    expect(s.nextNumber).toBe(3);
  });

  it('ignores a duplicate add, such as a resent action', () => {
    const once = applyAction(empty, add('a'));
    expect(applyAction(once, add('a'))).toBe(once);
  });

  it('ignores orders without items', () => {
    expect(applyAction(empty, { ...add('a'), items: [] })).toBe(empty);
  });

  it('moves an order through the pizza flow', () => {
    let s = applyAction(empty, add('a'));
    for (const status of ['in-progress', 'ready', 'ready-for-customer', 'collected'] as const) {
      s = applyAction(s, { type: 'status', id: 'a', status });
      expect(s.orders[0].status).toBe(status);
    }
  });

  it('keeps at most 100 finished orders', () => {
    let s = empty;
    for (let i = 0; i < 105; i++) {
      s = applyAction(s, add(`o${i}`), i);
      s = applyAction(s, { type: 'status', id: `o${i}`, status: 'collected' }, i);
    }
    expect(s.orders.length).toBe(100);
    expect(s.orders[0].id).toBe('o5');
  });
});
