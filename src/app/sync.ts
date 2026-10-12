import { QueueAction, QueueState, applyAction } from './models';
import { estimateReady } from './estimate';
import { OrderTrack, TRACK_AFTER_DONE, orderTrack } from './tracking';

/**
 * What one action does to the stored queue: the new queue (the same object when nothing
 * changes) and whether a new order was refused because too few pizzas were left. Sending
 * an action again (when the answer to the first try got lost) changes nothing.
 */
export function settle(
  state: QueueState,
  action: QueueAction,
  now = Date.now(),
): { next: QueueState; refused: boolean } {
  let next: QueueState;
  try {
    next = applyAction(state, action, now);
  } catch {
    return { next: state, refused: false }; // Malformed action.
  }
  const refused =
    next === state && action.type === 'add' && !state.orders.some((o) => o.id === action.id);
  return { next, refused };
}

/**
 * The tracking pages a change affects: per order id what customers following it should
 * now see, or null for orders no longer followed.
 */
export function trackChanges(
  before: QueueState | null,
  after: QueueState,
  now = Date.now(),
): Map<string, OrderTrack | null> {
  const changes = new Map<string, OrderTrack | null>();
  const etasBefore = before ? estimateReady(before, now) : new Map<string, number>();
  const etasAfter = estimateReady(after, now);
  const followed = (status: string, updatedAt: number) =>
    !(status === 'collected' || status === 'cancelled') || now - updatedAt < TRACK_AFTER_DONE;
  for (const order of after.orders) {
    if (!followed(order.status, order.updatedAt)) continue;
    const track = orderTrack(after, order, etasAfter.get(order.id));
    const old = before?.orders.find((o) => o.id === order.id);
    const was = old && before ? orderTrack(before, old, etasBefore.get(old.id)) : null;
    if (JSON.stringify(track) !== JSON.stringify(was)) changes.set(order.id, track);
  }
  for (const old of before?.orders ?? []) {
    if (!after.orders.some((o) => o.id === old.id)) changes.set(old.id, null);
  }
  return changes;
}
