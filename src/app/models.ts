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
}

export const DEFAULT_TIMING: Timing = {
  prepareMinutes: 3,
  bakeMinutes: 8,
  counterMinutes: 2,
  ovens: 1,
  pizzasPerOven: 4,
};
/** The phase durations, in minutes. */
export const TIMING_KEYS = ['prepareMinutes', 'bakeMinutes', 'counterMinutes'] as const;
/** The oven capacity, as whole numbers. */
export const OVEN_KEYS = ['ovens', 'pizzasPerOven'] as const;
const OVEN_MAX = 50;

export type QueueAction =
  | { type: 'add'; id: string; customer: string; items: NewOrderItem[]; note: string }
  | { type: 'status'; id: string; status: OrderStatus }
  | { type: 'pizza'; id: string; item: number; unit: number; status: PizzaStatus }
  | { type: 'menu'; menu: MenuItem[] }
  | { type: 'timing'; timing: Timing };

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
          };
        });
      if (!items.length) return state;
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
      return {
        ...state,
        nextNumber: state.nextNumber + 1,
        orders: trimFinished([...state.orders, order]),
      };
    }
    case 'status': {
      const target = state.orders.find((o) => o.id === action.id);
      if (!target || target.status === action.status || !(action.status in STATUS_LABELS))
        return state;
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
      return { ...state, timing };
    }
    case 'menu': {
      const menu = action.menu
        .filter((m) => m.name.trim())
        .slice(0, 50)
        .map((m) => ({
          name: m.name.trim().slice(0, 40),
          color: isColor(m.color) ? m.color : OTHER_COLOR,
          enabled: !!m.enabled,
        }));
      return { ...state, menu };
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
  const menu = Array.isArray(state.menu) ? state.menu : DEFAULT_MENU.map((m) => ({ ...m }));
  // Queues from before the three phases had a different timing shape; start fresh.
  const timing = TIMING_KEYS.every((k) => (state.timing?.[k] ?? 0) > 0)
    ? { ...state.timing }
    : { ...DEFAULT_TIMING };
  // Queues from before the oven settings get the default oven.
  for (const key of OVEN_KEYS) if (!(timing[key] >= 1)) timing[key] = DEFAULT_TIMING[key];
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
  return { id, name, nextNumber, menu, timing, orders };
}

/** Black or white, whichever reads better on the given background color. */
export function textOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1a1a1a' : '#ffffff';
}

function updateOrder(state: QueueState, id: string, fn: (o: Order) => Order): QueueState {
  const orders = state.orders.map((o) => (o.id === id ? fn(o) : o));
  return { ...state, orders: trimFinished(orders) };
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function trimFinished(orders: Order[]): Order[] {
  const finished = orders.filter((o) => o.status === 'collected' || o.status === 'cancelled');
  if (finished.length <= MAX_FINISHED) return orders;
  const drop = new Set(
    finished
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, finished.length - MAX_FINISHED)
      .map((o) => o.id),
  );
  return orders.filter((o) => !drop.has(o.id));
}

export function randomId(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
