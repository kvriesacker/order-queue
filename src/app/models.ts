export type OrderStatus =
  'new' | 'in-progress' | 'ready' | 'ready-for-customer' | 'collected' | 'cancelled';

/** Where one pizza is: waiting for the kitchen, prepared (waiting for the oven) or baked. */
export type PizzaStatus = 'new' | 'prepared' | 'baked';

const PIZZA_STATUSES: PizzaStatus[] = ['new', 'prepared', 'baked'];

export interface MenuItem {
  name: string;
  /** Hex color, so the kitchen can tell pizzas apart at a glance. */
  color: string;
  enabled: boolean;
  /** How many of this pizza can be made (ingredients); 0 or missing means no limit. */
  max?: number;
  /** Marked sold out by hand, for example when an ingredient runs out early. */
  soldOut?: boolean;
  /** Price of this pizza in euros; 0 or missing means the general price. */
  price?: number;
}

export interface OrderItem {
  name: string;
  qty: number;
  note: string;
  color: string;
  /** One entry per pizza (qty of them), so the kitchen can bake them one by one. */
  units: PizzaStatus[];
  /** When each pizza was prepared and baked, to learn how long each phase takes. */
  times: PizzaTimes[];
  /** Price of one pizza in euros when it was ordered (0 when the queue has no prices). */
  price?: number;
}

export interface PizzaTimes {
  prepared?: number;
  baked?: number;
}

/** An order line as the order taker sends it, before the kitchen tracks its pizzas. */
export type NewOrderItem = Pick<OrderItem, 'name' | 'qty' | 'note' | 'color'>;

export interface Order {
  id: string;
  number: number;
  customer: string;
  items: OrderItem[];
  note: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  /** When the last pizza came out of the oven. */
  bakedAt?: number;
  /** When the counter called the order for the customer. */
  calledAt?: number;
}

export interface QueueState {
  id: string;
  name: string;
  nextNumber: number;
  menu: MenuItem[];
  timing: Timing;
  orders: Order[];
  /** Pizzas in picked-up orders that were cleared from the list, so they still count as sold. */
  soldCleared: number;
  /** The same per pizza type, for the per-type maximum. */
  soldClearedByType: Record<string, number>;
  /** Ovens marked out of order by the oven station (0 is the first oven). */
  ovensOut: number[];
  /** Goes up by one each time another device takes over as host. */
  hostEpoch: number;
  /** Identifies the device hosting this epoch (a random id it keeps with its saved queue). */
  hostId: string;
}

/**
 * Whether queue `a` comes from a newer host than `b`: a later takeover wins, and if two
 * devices took over at the same moment, the one with the smaller id wins.
 */
export function outranks(a: QueueState, b: QueueState): boolean {
  if (a.hostEpoch !== b.hostEpoch) return a.hostEpoch > b.hostEpoch;
  return !!a.hostId && a.hostId !== b.hostId && (!b.hostId || a.hostId < b.hostId);
}

/** The host's starting guess for each phase; real times take over as orders go through. */
export interface Timing {
  /** Minutes the kitchen needs to prepare one pizza (one after another). */
  prepareMinutes: number;
  /** Minutes a prepared pizza spends in the oven. */
  bakeMinutes: number;
  /** Minutes from the last pizza baked until the counter calls the order. */
  counterMinutes: number;
  /** How many ovens bake at the same time. */
  ovens: number;
  /** How many pizzas fit in one oven at once. */
  pizzasPerOven: number;
  /** How many pizzas can be made in total (dough, toppings); 0 means no limit. */
  maxPizzas: number;
  /** General price of a pizza in euros; 0 means the queue shows no prices. */
  price: number;
}

export const DEFAULT_TIMING: Timing = {
  prepareMinutes: 3,
  bakeMinutes: 8,
  counterMinutes: 2,
  ovens: 1,
  pizzasPerOven: 4,
  maxPizzas: 0,
  price: 10,
};
/** The phase durations, in minutes. */
export const TIMING_KEYS = ['prepareMinutes', 'bakeMinutes', 'counterMinutes'] as const;
/** The oven capacity, as whole numbers. */
export const OVEN_KEYS = ['ovens', 'pizzasPerOven'] as const;
const OVEN_MAX = 50;
const MAX_PIZZAS = 99999;
const MAX_PRICE = 1000;

/** A valid price in euros, rounded to cents; 0 when missing or invalid. */
export function cleanPrice(n: unknown): number {
  return typeof n === 'number' && n > 0 && n <= MAX_PRICE ? Math.round(n * 100) / 100 : 0;
}

/** What one pizza of this type costs now: its own price, or else the general price. */
export function priceOf(state: Pick<QueueState, 'menu' | 'timing'>, name: string): number {
  return state.menu.find((m) => m.name === name)?.price || state.timing.price || 0;
}

/** The price of an order, from the prices its pizzas had when it was ordered. */
export function orderTotal(order: Pick<Order, 'items'>): number {
  return Math.round(order.items.reduce((sum, i) => sum + (i.price ?? 0) * i.qty, 0) * 100) / 100;
}

const EURO = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

/** "€9.50" */
export function formatPrice(euros: number): string {
  return EURO.format(euros);
}

/** Pizzas sold so far: every order except cancelled ones. */
export function pizzasSold(state: QueueState): number {
  const inList = state.orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.items.reduce((n, i) => n + i.qty, 0), 0);
  return inList + state.soldCleared;
}

/** How many pizzas can still be sold, or null when there's no limit. */
export function pizzasLeft(state: QueueState): number | null {
  const max = state.timing.maxPizzas;
  return max > 0 ? Math.max(0, max - pizzasSold(state)) : null;
}

/** Pizzas of one type sold so far: every order except cancelled ones. */
export function typeSold(state: QueueState, name: string): number {
  const inList = state.orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.items.reduce((n, i) => n + (i.name === name ? i.qty : 0), 0), 0);
  return inList + (state.soldClearedByType[name] ?? 0);
}

/**
 * How many pizzas of one type can still be sold: 0 when marked sold out, null when the type
 * has no maximum (the total limit still applies) or isn't on the menu.
 */
export function typeLeft(state: QueueState, name: string): number | null {
  const item = state.menu.find((m) => m.name === name);
  if (!item) return null;
  if (item.soldOut) return 0;
  return item.max ? Math.max(0, item.max - typeSold(state, name)) : null;
}

/** Pizzas of one type the kitchen has prepared (or that are further along). */
export function typeMade(state: QueueState, name: string): number {
  const waiting = state.orders
    .filter((o) => o.status !== 'cancelled')
    .flatMap((o) => o.items.filter((i) => i.name === name))
    .reduce((n, i) => n + i.units.filter((u) => u === 'new').length, 0);
  return typeSold(state, name) - waiting;
}

/**
 * What the kitchen can still make of one type with the ingredients left, counting ordered
 * pizzas it hasn't prepared yet: 0 when marked sold out without a maximum, null with no limit.
 */
export function kitchenLeft(state: QueueState, name: string): number | null {
  const item = state.menu.find((m) => m.name === name);
  if (!item) return null;
  if (item.max) return Math.max(0, item.max - typeMade(state, name));
  return item.soldOut ? 0 : null;
}

/**
 * The change when the kitchen says it can still make `left` of a type: the maximum becomes
 * what it has prepared plus that, which also puts a sold-out pizza back on sale. Null means
 * no limit.
 */
export function leftChange(made: number, left: number | null): { max: number; soldOut: boolean } {
  if (left === null) return { max: 0, soldOut: false };
  const max = made + Math.max(0, Math.min(MAX_PIZZAS, Math.floor(left)));
  return { max, soldOut: max === 0 };
}

/** Whether these pizzas fit under the total limit and each type's maximum. */
export function canSell(state: QueueState, items: Pick<OrderItem, 'name' | 'qty'>[]): boolean {
  const left = pizzasLeft(state);
  if (left !== null && items.reduce((n, i) => n + i.qty, 0) > left) return false;
  const perType = new Map<string, number>();
  for (const i of items) perType.set(i.name, (perType.get(i.name) ?? 0) + i.qty);
  for (const [name, qty] of perType) {
    const typeLeftNow = typeLeft(state, name);
    if (typeLeftNow !== null && qty > typeLeftNow) return false;
  }
  return true;
}

export type QueueAction =
  | { type: 'add'; id: string; customer: string; items: NewOrderItem[]; note: string }
  | { type: 'status'; id: string; status: OrderStatus }
  | { type: 'pizza'; id: string; item: number; unit: number; status: PizzaStatus }
  | { type: 'menu'; menu: MenuItem[] }
  | { type: 'timing'; timing: Timing }
  /** The oven station marks one oven out of order, or working again. */
  | { type: 'oven'; index: number; out: boolean }
  /** The kitchen changes one pizza's maximum or sold-out mark, without touching the rest. */
  | { type: 'type-limit'; name: string; max?: number; soldOut?: boolean };

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  'in-progress': 'Being made',
  ready: 'Baked',
  'ready-for-customer': 'Ready for customer',
  collected: 'Picked up',
  cancelled: 'Cancelled',
};

export const OTHER_COLOR = '#8a8a8a';

export const DEFAULT_MENU: MenuItem[] = [
  { name: 'Margherita', color: '#e53935', enabled: true },
  { name: 'Pepperoni', color: '#8e24aa', enabled: true },
  { name: 'Quattro Formaggi', color: '#fdd835', enabled: true },
  { name: 'Funghi', color: '#6d4c41', enabled: true },
  { name: 'Hawaii', color: '#fb8c00', enabled: true },
  { name: 'Diavola', color: '#212121', enabled: true },
  { name: 'Vegetariana', color: '#43a047', enabled: true },
  { name: 'Prosciutto', color: '#ec407a', enabled: true },
  { name: 'Tonno', color: '#1e88e5', enabled: true },
  { name: 'Calzone', color: '#00acc1', enabled: true },
];

/** Keeps at most this many finished (picked up or cancelled) orders in the queue. */
const MAX_FINISHED = 100;

/** Applies an action to the queue. Pure: returns a new state, or the same state when nothing changed. */
export function applyAction(state: QueueState, action: QueueAction, now = Date.now()): QueueState {
  switch (action.type) {
    case 'add': {
      if (state.orders.some((o) => o.id === action.id)) return state;
      const items: OrderItem[] = action.items
        .filter((i) => i.name.trim() && i.qty > 0)
        .map((i) => {
          const qty = Math.min(99, Math.floor(i.qty));
          return {
            name: i.name.trim().slice(0, 60),
            qty,
            note: i.note.trim().slice(0, 120),
            color: isColor(i.color) ? i.color : OTHER_COLOR,
            units: Array<PizzaStatus>(qty).fill('new'),
            times: Array.from({ length: qty }, () => ({})),
            // The host's prices count, so every order taker charges the same.
            price: priceOf(state, i.name.trim().slice(0, 60)),
          };
        });
      if (!items.length) return state;
      // Never sell more pizzas than can be made, in total or of one type.
      if (!canSell(state, items)) return state;
      const order: Order = {
        id: action.id,
        number: state.nextNumber,
        customer: action.customer.trim().slice(0, 40),
        items,
        note: action.note.trim().slice(0, 200),
        status: 'new',
        createdAt: now,
        updatedAt: now,
      };
      return trimFinished({ ...state, nextNumber: state.nextNumber + 1 }, [...state.orders, order]);
    }
    case 'status': {
      const target = state.orders.find((o) => o.id === action.id);
      if (!target || target.status === action.status || !(action.status in STATUS_LABELS))
        return state;
      // Bringing back a cancelled order sells its pizzas again, so it needs room.
      if (target.status === 'cancelled' && !canSell(state, target.items)) return state;
      return updateOrder(state, action.id, (o) => {
        let items = o.items;
        // Moving a whole order back into the kitchen (undo at the counter) or forward
        // past it keeps its pizzas consistent with the order.
        const unit = UNIT_FOR_ORDER_STATUS[action.status];
        if (unit) {
          items = o.items.map((i) => ({
            ...i,
            units: i.units.map(() => unit),
            times: unit === 'new' ? i.times.map(() => ({})) : i.times,
          }));
        }
        const bakedAt = action.status === 'ready' ? (o.bakedAt ?? now) : o.bakedAt;
        const calledAt = action.status === 'ready-for-customer' ? now : o.calledAt;
        return { ...o, items, status: action.status, bakedAt, calledAt, updatedAt: now };
      });
    }
    case 'pizza': {
      const target = state.orders.find((o) => o.id === action.id);
      const current = target?.items[action.item]?.units[action.unit];
      if (!target || !current || current === action.status) return state;
      if (!['new', 'in-progress', 'ready'].includes(target.status)) return state;
      if (!PIZZA_STATUSES.includes(action.status)) return state;
      return updateOrder(state, action.id, (o) => {
        const items = o.items.map((item, i) =>
          i !== action.item
            ? item
            : {
                ...item,
                units: item.units.map((u, j) => (j === action.unit ? action.status : u)),
                times: item.times.map((t, j) =>
                  j === action.unit ? stampTimes(t, action.status, now) : t,
                ),
              },
        );
        const status = kitchenStatus(items);
        const bakedAt = status === 'ready' ? now : undefined;
        return { ...o, items, status, bakedAt, updatedAt: now };
      });
    }
    case 'timing': {
      const minutes = (n: unknown, fallback: number) =>
        typeof n === 'number' && n > 0 && n <= 180 ? Math.round(n * 10) / 10 : fallback;
      const count = (n: unknown, fallback: number) =>
        typeof n === 'number' && n >= 1 && n <= OVEN_MAX ? Math.floor(n) : fallback;
      const timing = { ...state.timing };
      for (const key of TIMING_KEYS) timing[key] = minutes(action.timing[key], timing[key]);
      for (const key of OVEN_KEYS) timing[key] = count(action.timing[key], timing[key]);
      const max = action.timing.maxPizzas;
      if (typeof max === 'number' && max >= 0 && max <= MAX_PIZZAS) timing.maxPizzas = Math.floor(max);
      if (typeof action.timing.price === 'number') timing.price = cleanPrice(action.timing.price);
      return { ...state, timing, ovensOut: state.ovensOut.filter((i) => i < timing.ovens) };
    }
    case 'menu': {
      const menu = action.menu
        .filter((m) => m.name.trim())
        .slice(0, 50)
        .map((m) => ({
          name: m.name.trim().slice(0, 40),
          color: isColor(m.color) ? m.color : OTHER_COLOR,
          enabled: !!m.enabled,
          max: typeMax(m.max),
          price: cleanPrice(m.price),
          // Sold out is the kitchen's call, so a Settings save keeps what the kitchen set.
          soldOut: !!state.menu.find((old) => old.name === m.name.trim())?.soldOut,
        }));
      return { ...state, menu };
    }
    case 'oven': {
      const { index, out } = action;
      if (!Number.isInteger(index) || index < 0 || index >= state.timing.ovens) return state;
      if (state.ovensOut.includes(index) === !!out) return state;
      const ovensOut = out
        ? [...state.ovensOut, index].sort((a, b) => a - b)
        : state.ovensOut.filter((i) => i !== index);
      return { ...state, ovensOut };
    }
    case 'type-limit': {
      const index = state.menu.findIndex((m) => m.name === action.name);
      if (index < 0) return state;
      const item = { ...state.menu[index] };
      if (action.max !== undefined) item.max = typeMax(action.max);
      if (action.soldOut !== undefined) item.soldOut = !!action.soldOut;
      if (item.max === state.menu[index].max && item.soldOut === state.menu[index].soldOut)
        return state;
      return { ...state, menu: state.menu.map((m, i) => (i === index ? item : m)) };
    }
  }
}

/** An order's status follows its pizzas: ready for the counter once every pizza is baked. */
export function kitchenStatus(items: OrderItem[]): OrderStatus {
  const units = items.flatMap((i) => i.units);
  if (units.every((u) => u === 'baked')) return 'ready';
  if (units.every((u) => u === 'new')) return 'new';
  return 'in-progress';
}

/** The block an order shows in on the customer screen. */
export type DisplayStage = 'ordered' | 'preparing' | 'baking' | 'ready';

/**
 * An order moves to the next block as soon as its first pizza does: "Being prepared" once the
 * kitchen has prepared one pizza, "Baking" once all are prepared (in the oven) or one is baked,
 * and "Ready" once the counter calls it. Finished and cancelled orders show nowhere.
 */
export function displayStage(order: Order): DisplayStage | null {
  if (order.status === 'ready-for-customer') return 'ready';
  if (order.status === 'collected' || order.status === 'cancelled') return null;
  const units = order.items.flatMap((i) => i.units);
  if (units.some((u) => u === 'baked') || units.every((u) => u !== 'new')) return 'baking';
  if (units.some((u) => u === 'prepared')) return 'preparing';
  return 'ordered';
}

/** A valid per-type maximum: a whole number, 0 meaning no limit. */
function typeMax(n: unknown): number {
  return typeof n === 'number' && n > 0 && n <= MAX_PIZZAS ? Math.floor(n) : 0;
}

/** Records when a pizza reached a step; going back clears the later steps. */
function stampTimes(times: PizzaTimes, status: PizzaStatus, now: number): PizzaTimes {
  if (status === 'new') return {};
  if (status === 'prepared') return { prepared: times.prepared ?? now };
  return { prepared: times.prepared, baked: now };
}

/** What every pizza becomes when a whole order is moved back (an undo at the counter). */
const UNIT_FOR_ORDER_STATUS: Partial<Record<OrderStatus, PizzaStatus>> = {
  new: 'new',
  'in-progress': 'prepared',
  ready: 'baked',
};

/** Pizza steps saved by older versions: "in the oven" counts as prepared, "ready" as baked. */
const LEGACY_UNITS: Record<string, PizzaStatus> = {
  new: 'new',
  'in-progress': 'prepared',
  ready: 'baked',
  prepared: 'prepared',
  baked: 'baked',
};

/** Upgrades a queue saved by an older version of the app (no menu, no per-pizza tracking). */
export function normalizeState(state: QueueState): QueueState {
  const menu = (Array.isArray(state.menu) ? state.menu : DEFAULT_MENU).map((m) => ({
    ...m,
    max: typeMax(m.max),
    soldOut: !!m.soldOut,
    price: cleanPrice(m.price),
  }));
  // Queues from before the three phases had a different timing shape; start fresh.
  const timing = TIMING_KEYS.every((k) => (state.timing?.[k] ?? 0) > 0)
    ? { ...state.timing }
    : { ...DEFAULT_TIMING };
  // Queues from before the oven settings get the default oven.
  for (const key of OVEN_KEYS) if (!(timing[key] >= 1)) timing[key] = DEFAULT_TIMING[key];
  if (!(timing.maxPizzas >= 0)) timing.maxPizzas = 0;
  // Queues from before prices show none until the host sets one.
  timing.price = cleanPrice(timing.price);
  const colorOf = (name: string) => menu.find((m) => m.name === name)?.color ?? OTHER_COLOR;
  const orders = state.orders.map((o) => {
    const current = (u: string) => PIZZA_STATUSES.includes(u as PizzaStatus);
    const upToDate = (i: OrderItem) =>
      Array.isArray(i.units) && i.units.every(current) && i.color && Array.isArray(i.times);
    if (o.items.every(upToDate)) return o;
    const unit = UNIT_FOR_ORDER_STATUS[o.status] ?? 'baked';
    const items = o.items.map((i) => ({
      ...i,
      color: i.color ?? colorOf(i.name),
      units: Array.isArray(i.units)
        ? i.units.map((u) => LEGACY_UNITS[u] ?? 'new')
        : Array<PizzaStatus>(i.qty).fill(unit),
      times: Array.isArray(i.times) ? i.times : Array.from({ length: i.qty }, () => ({})),
    }));
    return { ...o, items };
  });
  const { id, name, nextNumber } = state;
  const soldCleared = state.soldCleared >= 0 ? state.soldCleared : 0;
  const soldClearedByType =
    state.soldClearedByType && typeof state.soldClearedByType === 'object'
      ? state.soldClearedByType
      : {};
  const ovensOut = Array.isArray(state.ovensOut)
    ? state.ovensOut.filter((i) => Number.isInteger(i) && i >= 0 && i < timing.ovens)
    : [];
  const hostEpoch = state.hostEpoch >= 0 ? state.hostEpoch : 0;
  const hostId = typeof state.hostId === 'string' ? state.hostId : '';
  return {
    id, name, nextNumber, menu, timing, orders, soldCleared, soldClearedByType, ovensOut,
    hostEpoch, hostId,
  };
}

/** Black or white, whichever reads better on the given background color. */
export function textOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1a1a1a' : '#ffffff';
}

function updateOrder(state: QueueState, id: string, fn: (o: Order) => Order): QueueState {
  return trimFinished(state, state.orders.map((o) => (o.id === id ? fn(o) : o)));
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** Sets the orders, clearing the oldest finished ones while keeping the sold count right. */
function trimFinished(state: QueueState, orders: Order[]): QueueState {
  const finished = orders.filter((o) => o.status === 'collected' || o.status === 'cancelled');
  if (finished.length <= MAX_FINISHED) return { ...state, orders };
  const dropped = finished
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, finished.length - MAX_FINISHED);
  const ids = new Set(dropped.map((o) => o.id));
  const collected = dropped.filter((o) => o.status === 'collected').flatMap((o) => o.items);
  const sold = collected.reduce((n, i) => n + i.qty, 0);
  const soldClearedByType = { ...state.soldClearedByType };
  for (const i of collected) soldClearedByType[i.name] = (soldClearedByType[i.name] ?? 0) + i.qty;
  return {
    ...state,
    orders: orders.filter((o) => !ids.has(o.id)),
    soldCleared: state.soldCleared + sold,
    soldClearedByType,
  };
}

export function randomId(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
