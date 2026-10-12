import {
  Order, PizzaStatus, QueueAction, QueueState, applyAction, displayStage, normalizeState, outranks, ovenLoad,
  pizzaStage, stageCounts,
  cleanPrice, formatPrice, kitchenLeft, leftChange, orderTotal, pizzasLeft, priceOf, typeLeft, typeMade,
  typeSold,
} from './models';

describe('applyAction', () => {
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

  it('marks ovens out of order and keeps them within the number of ovens', () => {
    let s: QueueState = { ...empty, timing: { ...empty.timing, ovens: 3 } };
    s = applyAction(s, { type: 'oven', index: 2, out: true });
    s = applyAction(s, { type: 'oven', index: 0, out: true });
    expect(s.ovensOut).toEqual([0, 2]);
    expect(applyAction(s, { type: 'oven', index: 0, out: true })).toBe(s);
    expect(applyAction(s, { type: 'oven', index: 3, out: true })).toBe(s);
    s = applyAction(s, { type: 'oven', index: 0, out: false });
    expect(s.ovensOut).toEqual([2]);
    // Fewer ovens in Settings drops the ones that are gone.
    s = applyAction(s, { type: 'timing', timing: { ...s.timing, ovens: 2 } });
    expect(s.ovensOut).toEqual([]);
    expect(normalizeState({ ...s, ovensOut: undefined } as unknown as QueueState).ovensOut).toEqual([]);
  });

  it('lets the counter show and hand over baked pizzas of a big order before the rest is done', () => {
    let s = applyAction(empty, { ...add('a'), items: [{ name: 'Margherita', qty: 3, note: '', color: '#e53935' }] });
    const pizza = (unit: number, status: 'new' | 'prepared' | 'baked'): QueueAction =>
      ({ type: 'pizza', id: 'a', item: 0, unit, status });
    const call = (unit: number, called = true): QueueAction => ({ type: 'call', id: 'a', item: 0, unit, called });
    const hand = (unit: number, handed = true): QueueAction => ({ type: 'hand', id: 'a', item: 0, unit, handed });
    s = applyAction(applyAction(s, pizza(0, 'prepared')), pizza(0, 'baked'));
    // Only a baked pizza goes on the customer screen, and only one there is handed over.
    expect(applyAction(s, call(1))).toBe(s);
    expect(applyAction(s, hand(0))).toBe(s);
    s = applyAction(s, call(0), 4);
    expect(s.orders[0].items[0].times[0].called).toBe(4);
    expect(s.orders[0].status).toBe('in-progress');
    // On the customer screen: the oven can't take it back.
    expect(applyAction(s, pizza(0, 'prepared'))).toBe(s);
    expect(applyAction(s, call(0, false)).orders[0].items[0].times[0].called).toBeUndefined();
    s = applyAction(s, hand(0), 5);
    expect(s.orders[0].items[0].times[0].handed).toBe(5);
    expect(applyAction(s, call(0, false))).toBe(s);
    // Moving the order back keeps what the customer has.
    const back = applyAction(s, { type: 'status', id: 'a', status: 'new' });
    expect(back.orders[0].items[0].units).toEqual(['baked', 'new', 'new']);
    expect(back.orders[0].items[0].times[0].handed).toBe(5);
    expect(applyAction(s, hand(0, false)).orders[0].items[0].times[0].handed).toBeUndefined();
    // The rest is baked and shown: the whole order is on the customer screen.
    for (const u of [1, 2]) s = applyAction(applyAction(s, pizza(u, 'prepared')), pizza(u, 'baked'));
    expect(s.orders[0].status).toBe('ready');
    s = applyAction(applyAction(s, call(1)), call(2));
    expect(s.orders[0].status).toBe('ready-for-customer');
    // Taking the order back off the screen takes its pizzas off too, except the given one.
    const off = applyAction(s, { type: 'status', id: 'a', status: 'ready' });
    expect(off.orders[0].items[0].times.map((t) => !!t.called)).toEqual([true, false, false]);
    // Once the customer has every pizza, the order is picked up.
    s = applyAction(applyAction(s, hand(1)), hand(2));
    expect(s.orders[0].status).toBe('collected');
  });

  it('puts prepared pizzas in an oven only while it has room, and baking frees the spot', () => {
    let s: QueueState = { ...empty, timing: { ...empty.timing, ovens: 2, pizzasPerOven: 1 } };
    s = applyAction(s, { ...add('a'), items: [{ name: 'Margherita', qty: 3, note: '', color: '#e53935' }] });
    const pizza = (unit: number, status: PizzaStatus): QueueAction => ({ type: 'pizza', id: 'a', item: 0, unit, status });
    const bake = (unit: number, oven: number | null): QueueAction => ({ type: 'bake', id: 'a', item: 0, unit, oven });
    const times = () => s.orders[0].items[0].times;
    // Not before the kitchen has prepared it.
    expect(applyAction(s, bake(0, 0))).toBe(s);
    for (const u of [0, 1, 2]) s = applyAction(s, pizza(u, 'prepared'));
    s = applyAction(s, bake(0, 0), 1000);
    expect(times()[0]).toMatchObject({ inOven: 1000, oven: 0 });
    expect(ovenLoad(s)).toEqual([1, 0]);
    expect(displayStage(s.orders[0])).toBe('baking');
    // Oven 1 is full; oven 2 has room; nothing goes in twice or into a missing oven.
    expect(applyAction(s, bake(1, 0))).toBe(s);
    expect(applyAction(s, bake(0, 1))).toBe(s);
    expect(applyAction(s, bake(1, 2))).toBe(s);
    s = applyAction(s, bake(1, 1));
    expect(ovenLoad(s)).toEqual([1, 1]);
    // In the oven, a pizza can't go back to the kitchen.
    expect(applyAction(s, pizza(0, 'new'))).toBe(s);
    // Baked: the spot is free again, and the times are kept for the statistics.
    s = applyAction(s, pizza(0, 'baked'), 9000);
    expect(ovenLoad(s)).toEqual([0, 1]);
    expect(times()[0]).toMatchObject({ inOven: 1000, oven: 0, baked: 9000 });
    s = applyAction(s, bake(2, 0));
    expect(ovenLoad(s)).toEqual([1, 1]);
    // Taken back out (a mistake), it waits for the oven again.
    s = applyAction(s, bake(2, null));
    expect(times()[2].inOven).toBeUndefined();
    expect(ovenLoad(s)).toEqual([0, 1]);
    // An oven out of order takes no pizzas.
    s = applyAction(s, { type: 'oven', index: 0, out: true });
    expect(applyAction(s, bake(2, 0))).toBe(s);
  });

  it('puts a baked pizza that is taken back (Undo) in its oven again', () => {
    let s = applyAction(empty, add('a'));
    s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit: 0, status: 'prepared' });
    s = applyAction(s, { type: 'bake', id: 'a', item: 0, unit: 0, oven: 0 }, 1000);
    s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit: 0, status: 'baked' }, 9000);
    s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit: 0, status: 'prepared' });
    expect(s.orders[0].items[0].times[0]).toMatchObject({ inOven: 1000, oven: 0 });
    expect(s.orders[0].items[0].times[0].baked).toBeUndefined();
    expect(ovenLoad(s)).toEqual([1]);
  });

  it('keeps the language for joining devices and customer screens; old queues speak Dutch', () => {
    expect(normalizeState(empty).lang).toBe('nl');
    const s = applyAction(empty, { type: 'lang', lang: 'en' });
    expect(normalizeState(s).lang).toBe('en');
    expect(applyAction(s, { type: 'lang', lang: 'fr' as 'en' })).toBe(s);
  });

  it('keeps the sponsors for the customer screens, trimmed, with a sensible interval', () => {
    expect(normalizeState(empty)).toMatchObject({ sponsors: [], sponsorSeconds: 10 });
    const s = applyAction(empty, {
      type: 'sponsors',
      sponsors: [
        { name: '  Bakkerij Jansens ', message: ' Vers brood elke dag ' },
        { name: '   ', message: 'no name' },
        { name: 'Garage Peeters', message: '' },
      ],
      seconds: 15,
    });
    expect(s.sponsors).toEqual([
      { name: 'Bakkerij Jansens', message: 'Vers brood elke dag' },
      { name: 'Garage Peeters', message: '' },
    ]);
    expect(s.sponsorSeconds).toBe(15);
    expect(applyAction(s, { type: 'sponsors', sponsors: [], seconds: 1 })).toMatchObject({ sponsors: [], sponsorSeconds: 10 });
    expect(normalizeState({ ...s, sponsors: 'x' } as unknown as QueueState).sponsors).toEqual([]);
  });

  it('charges the general price unless a pizza has its own, as set when ordered', () => {
    let s: QueueState = {
      ...empty,
      timing: { ...empty.timing, price: 9.5 },
      menu: [
        { name: 'Margherita', color: '#e53935', enabled: true },
        { name: 'Calzone', color: '#00acc1', enabled: true, price: 12 },
      ],
    };
    expect(priceOf(s, 'Margherita')).toBe(9.5);
    expect(priceOf(s, 'Calzone')).toBe(12);
    expect(priceOf(s, 'Something else')).toBe(9.5);
    s = applyAction(s, {
      type: 'add', id: 'a', customer: '', note: '',
      items: [
        { name: 'Margherita', qty: 2, note: '', color: '#e53935' },
        { name: 'Calzone', qty: 1, note: '', color: '#00acc1' },
      ],
    });
    expect(orderTotal(s.orders[0])).toBe(31);
    // A later price change doesn't change what was already ordered.
    s = applyAction(s, { type: 'timing', timing: { ...s.timing, price: 11 } });
    expect(orderTotal(s.orders[0])).toBe(31);
    expect(priceOf(s, 'Margherita')).toBe(11);
    // Prices are rounded to cents; nonsense becomes "no price".
    expect(cleanPrice(9.999)).toBe(10);
    expect(cleanPrice(-1)).toBe(0);
    expect(formatPrice(9.5)).toBe('€9.50');
  });

  describe('maximum per pizza type', () => {
    const menu = (max: number, soldOut = false) => [
      { name: 'Margherita', color: '#e53935', enabled: true, max, soldOut },
      { name: 'Funghi', color: '#6d4c41', enabled: true },
    ];
    const order = (id: string, items: [string, number][]): QueueAction => ({
      type: 'add', id, customer: '', note: '',
      items: items.map(([name, qty]) => ({ name, qty, note: '', color: '#000000' })),
    });

    it('never sells more of a type than its maximum, counted over every line', () => {
      let s: QueueState = { ...empty, menu: menu(3) };
      s = applyAction(s, order('a', [['Margherita', 2]]));
      expect(typeLeft(s, 'Margherita')).toBe(1);
      expect(typeLeft(s, 'Funghi')).toBeNull();
      // Two lines of one Margherita each are still two.
      expect(applyAction(s, order('b', [['Margherita', 1], ['Margherita', 1]]))).toBe(s);
      // Other types aren't held back.
      s = applyAction(s, order('b', [['Margherita', 1], ['Funghi', 5]]));
      expect(typeLeft(s, 'Margherita')).toBe(0);
      expect(typeSold(s, 'Funghi')).toBe(5);
      // Cancelling frees them; bringing the order back needs room again.
      s = applyAction(s, { type: 'status', id: 'a', status: 'cancelled' });
      expect(typeLeft(s, 'Margherita')).toBe(2);
      s = applyAction(s, order('c', [['Margherita', 2]]));
      expect(applyAction(s, { type: 'status', id: 'a', status: 'new' })).toBe(s);
    });

    it('works alongside the total limit', () => {
      let s: QueueState = { ...empty, menu: menu(10), timing: { ...empty.timing, maxPizzas: 3 } };
      expect(applyAction(s, order('a', [['Margherita', 4]]))).toBe(s);
      s = applyAction(s, order('a', [['Margherita', 3]]));
      expect(pizzasLeft(s)).toBe(0);
    });

    it('lets the kitchen mark a type sold out and change its maximum', () => {
      let s: QueueState = { ...empty, menu: menu(0) };
      s = applyAction(s, { type: 'type-limit', name: 'Margherita', soldOut: true });
      expect(typeLeft(s, 'Margherita')).toBe(0);
      expect(applyAction(s, order('a', [['Margherita', 1]]))).toBe(s);
      s = applyAction(s, { type: 'type-limit', name: 'Margherita', soldOut: false, max: 4 });
      expect(typeLeft(s, 'Margherita')).toBe(4);
      // Unknown pizzas and no-op changes leave the queue alone.
      expect(applyAction(s, { type: 'type-limit', name: 'Nope', max: 2 })).toBe(s);
      expect(applyAction(s, { type: 'type-limit', name: 'Margherita', max: 4 })).toBe(s);
      // A Settings save keeps the kitchen's sold-out mark.
      s = applyAction(s, { type: 'type-limit', name: 'Margherita', soldOut: true });
      s = applyAction(s, { type: 'menu', menu: menu(6) });
      expect(s.menu[0]).toMatchObject({ max: 6, soldOut: true });
    });

    it('counts ordered pizzas the kitchen has not prepared as still left for the kitchen', () => {
      let s: QueueState = { ...empty, menu: menu(0) };
      s = applyAction(s, order('a', [['Margherita', 3]]));
      const setLeft = (left: number | null) =>
        applyAction(s, { type: 'type-limit', name: 'Margherita', ...leftChange(typeMade(s, 'Margherita'), left) });
      // Nothing prepared yet: ingredients for 5 means 5 - 3 ordered = 2 more to sell.
      s = setLeft(5);
      expect(s.menu[0].max).toBe(5);
      expect(kitchenLeft(s, 'Margherita')).toBe(5);
      expect(typeLeft(s, 'Margherita')).toBe(2);
      // Preparing one uses up ingredients, but doesn't change what can be sold.
      s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit: 0, status: 'prepared' });
      expect(typeMade(s, 'Margherita')).toBe(1);
      expect(kitchenLeft(s, 'Margherita')).toBe(4);
      expect(typeLeft(s, 'Margherita')).toBe(2);
      // Only enough for the ordered ones: nothing more to sell.
      s = setLeft(2);
      expect(s.menu[0].max).toBe(3);
      expect(typeLeft(s, 'Margherita')).toBe(0);
      s = setLeft(null);
      expect(kitchenLeft(s, 'Margherita')).toBeNull();
      // Nothing made and nothing left is sold out, not "no limit".
      expect(leftChange(0, 0)).toEqual({ max: 0, soldOut: true });
      s = applyAction(s, { type: 'type-limit', name: 'Margherita', soldOut: true });
      expect(kitchenLeft(s, 'Margherita')).toBe(0);
    });

    it('keeps counting pizzas from orders cleared from the list', () => {
      let s: QueueState = { ...empty, menu: menu(200) };
      for (let i = 0; i < 105; i++) {
        s = applyAction(s, order('o' + i, [['Margherita', 1]]));
        s = applyAction(s, { type: 'status', id: 'o' + i, status: 'collected' });
      }
      expect(s.orders.length).toBe(100);
      expect(typeSold(s, 'Margherita')).toBe(105);
    });
  });

  it('never sells more pizzas than the limit', () => {
    const limited = { ...empty, timing: { ...empty.timing, maxPizzas: 5 } };
    let s = applyAction(applyAction(limited, add('a')), add('b'));
    expect(pizzasLeft(s)).toBe(1);
    // 2 more don't fit.
    expect(applyAction(s, add('c'))).toBe(s);
    // Cancelling frees the pizzas again, but bringing it back needs room.
    s = applyAction(s, { type: 'status', id: 'a', status: 'cancelled' });
    expect(pizzasLeft(s)).toBe(3);
    s = applyAction(s, add('c'));
    expect(pizzasLeft(s)).toBe(1);
    expect(applyAction(s, { type: 'status', id: 'a', status: 'new' })).toBe(s);
    expect(pizzasLeft(empty)).toBeNull();
  });

  it('keeps counting pizzas of picked-up orders that were cleared from the list', () => {
    let s = { ...empty, timing: { ...empty.timing, maxPizzas: 500 } };
    for (let i = 0; i < 110; i++) {
      s = applyAction(s, add(`o${i}`), i);
      s = applyAction(s, { type: 'status', id: `o${i}`, status: 'collected' }, i);
    }
    expect(s.orders.length).toBe(100);
    expect(pizzasLeft(s)).toBe(500 - 220);
  });

  it('ranks a takeover above the old host, and settles a tie by id', () => {
    const old = { ...empty, hostEpoch: 0, hostId: 'mmm' };
    const next = { ...empty, hostEpoch: 1, hostId: 'zzz' };
    expect(outranks(next, old)).toBe(true);
    expect(outranks(old, next)).toBe(false);
    const a = { ...next, hostId: 'aaa' };
    expect(outranks(a, next)).toBe(true);
    expect(outranks(next, a)).toBe(false);
    expect(outranks(next, next)).toBe(false);
    // A queue saved before takeovers existed never beats a known host.
    expect(outranks({ ...old, hostId: '' }, old)).toBe(false);
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

  it('marks an order ready once every pizza is baked', () => {
    let s = applyAction(empty, add('a'));
    const pizza = (unit: number, status: 'prepared' | 'baked') =>
      (s = applyAction(s, { type: 'pizza', id: 'a', item: 0, unit, status }));
    pizza(0, 'prepared');
    expect(s.orders[0].status).toBe('in-progress');
    pizza(0, 'baked');
    expect(s.orders[0].status).toBe('in-progress');
    pizza(1, 'prepared');
    pizza(1, 'baked');
    expect(s.orders[0].status).toBe('ready');
    expect(s.orders[0].items[0].units).toEqual(['baked', 'baked']);
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
    expect(s.orders[0].items[0].units).toEqual(['prepared', 'prepared']);
    expect(s.orders[0].items[0].color).toBe('#6d4c41');
  });

  it('upgrades pizza steps saved before the oven became its own step', () => {
    let s = applyAction(empty, add('a'));
    s.orders[0].items[0].units = ['in-progress', 'ready'] as never;
    expect(normalizeState(s).orders[0].items[0].units).toEqual(['prepared', 'baked']);
  });
});

describe('displayStage', () => {
  function order(units: PizzaStatus[], status: Order['status'] = 'in-progress'): Order {
    return {
      id: 'o', number: 1, customer: '', note: '', status, createdAt: 0, updatedAt: 0,
      items: [{ name: 'Margherita', qty: units.length, note: '', color: '', units, times: [] }],
    };
  }

  it('moves an order on as soon as its first pizza moves', () => {
    expect(displayStage(order(['new', 'new'], 'new'))).toBe('ordered');
    expect(displayStage(order(['prepared', 'new']))).toBe('preparing');
    // Prepared pizzas wait for the oven: "In the oven" only once one is put in.
    expect(displayStage(order(['prepared', 'prepared']))).toBe('preparing');
    const oven = order(['prepared', 'prepared']);
    oven.items[0].times = [{ prepared: 1, inOven: 2, oven: 0 }, { prepared: 1 }];
    expect(displayStage(oven)).toBe('baking');
    expect(displayStage(order(['baked', 'new']))).toBe('baked');
    expect(displayStage(order(['baked', 'baked'], 'ready'))).toBe('baked');
    expect(displayStage(order(['baked'], 'ready-for-customer'))).toBe('ready');
  });

  it('puts each pizza in its own block', () => {
    const o = order(['new', 'prepared', 'prepared', 'baked', 'baked']);
    o.items[0].times = [{}, { prepared: 1 }, { prepared: 1, inOven: 2, oven: 0 }, { prepared: 1, baked: 3 }, { prepared: 1, baked: 3, called: 4 }];
    expect([0, 1, 2, 3, 4].map((u) => pizzaStage(o, 0, u))).toEqual(['preparing', 'preparing', 'baking', 'baked', 'ready']);
    expect(stageCounts(o)).toEqual({ preparing: 2, baking: 1, baked: 1, ready: 1 });
    // Nothing started yet: every pizza is just ordered.
    expect(pizzaStage(order(['new', 'new'], 'new'), 0, 1)).toBe('ordered');
    // Everything called but not yet given: the order is ready.
    const called = order(['baked'], 'ready');
    called.items[0].times = [{ baked: 1, called: 2 }];
    expect(displayStage(called)).toBe('ready');
  });

  it('hides picked-up and cancelled orders', () => {
    expect(displayStage(order(['baked'], 'collected'))).toBeNull();
    expect(displayStage(order(['new'], 'cancelled'))).toBeNull();
  });
});
