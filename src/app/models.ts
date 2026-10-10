export type OrderStatus =
  'new' | 'in-progress' | 'ready' | 'ready-for-customer' | 'collected' | 'cancelled';

export interface OrderItem {
  name: string;
  qty: number;
  note: string;
}

export interface Order {
  id: string;
  number: number;
  customer: string;
  items: OrderItem[];
  note: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface QueueState {
  id: string;
  name: string;
  nextNumber: number;
  orders: Order[];
}

export type QueueAction =
  | { type: 'add'; id: string; customer: string; items: OrderItem[]; note: string }
  | { type: 'status'; id: string; status: OrderStatus };

/** Messages sent over a peer data connection. */
export type PeerMessage = { t: 'state'; state: QueueState } | { t: 'action'; action: QueueAction };

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  'in-progress': 'In the oven',
  ready: 'Baked',
  'ready-for-customer': 'Ready for customer',
  collected: 'Picked up',
  cancelled: 'Cancelled',
};

/** The step before each status, used for undo buttons. */
export const PREVIOUS_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  'in-progress': 'new',
  ready: 'in-progress',
  'ready-for-customer': 'ready',
  collected: 'ready-for-customer',
};

export const MENU = [
  { name: 'Margherita', emoji: '🍅' },
  { name: 'Pepperoni', emoji: '🌶️' },
  { name: 'Quattro Formaggi', emoji: '🧀' },
  { name: 'Funghi', emoji: '🍄' },
  { name: 'Hawaii', emoji: '🍍' },
  { name: 'Diavola', emoji: '🔥' },
  { name: 'Vegetariana', emoji: '🥦' },
  { name: 'Prosciutto', emoji: '🥓' },
  { name: 'Tonno', emoji: '🐟' },
  { name: 'Calzone', emoji: '🥟' },
];

/** Keeps at most this many finished (picked up or cancelled) orders in the queue. */
const MAX_FINISHED = 100;

/** Applies an action to the queue. Pure: returns a new state, or the same state when nothing changed. */
export function applyAction(state: QueueState, action: QueueAction, now = Date.now()): QueueState {
  switch (action.type) {
    case 'add': {
      if (state.orders.some((o) => o.id === action.id)) return state;
      const items = action.items
        .filter((i) => i.name.trim() && i.qty > 0)
        .map((i) => ({
          name: i.name.trim().slice(0, 60),
          qty: Math.min(99, Math.floor(i.qty)),
          note: i.note.trim().slice(0, 120),
        }));
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
      const orders = state.orders.map((o) =>
        o.id === action.id ? { ...o, status: action.status, updatedAt: now } : o,
      );
      return { ...state, orders: trimFinished(orders) };
    }
  }
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
