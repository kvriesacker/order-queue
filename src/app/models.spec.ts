import { QueueAction, QueueState, applyAction, normalizeState } from './models';

describe('applyAction', () => {
  const empty: QueueState = { id: 'q', name: 'Test', nextNumber: 1, menu: [], orders: [] };
  const add = (id: string): QueueAction & { type: 'add' } => ({
    type: 'add',
    id,
    customer: ' Anna ',
    items: [{ name: 'Margherita', qty: 2, note: '', color: '#e53935' }],
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

  it('marks an order ready once every pizza is ready', () => {
    let s = applyAction(empty, add('a'));
    const pizza = (unit: number, status: 'in-progress' | 'ready') =>
      (s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit, status }));
    pizza(0, 'in-progress');
    expect(s.orders[0].status).toBe('in-progress');
    pizza(0, 'ready');
    expect(s.orders[0].status).toBe('in-progress');
    pizza(1, 'in-progress');
    pizza(1, 'ready');
    expect(s.orders[0].status).toBe('ready');
    expect(s.orders[0].items[0].units).toEqual(['ready', 'ready']);
  });

  it('upgrades a queue saved before menus and per-pizza tracking', () => {
    const old = {
      id: 'q',
      name: 'Old',
      nextNumber: 2,
      orders: [
        {
          id: 'a',
          number: 1,
          customer: '',
          note: '',
          status: 'in-progress',
          createdAt: 0,
          updatedAt: 0,
          items: [{ name: 'Funghi', qty: 2, note: '' }],
        },
      ],
    } as unknown as QueueState;
    const s = normalizeState(old);
    expect(s.menu.length).toBeGreaterThan(0);
    expect(s.orders[0].items[0].units).toEqual(['in-progress', 'in-progress']);
    expect(s.orders[0].items[0].color).toBe('#6d4c41');
  });
});
