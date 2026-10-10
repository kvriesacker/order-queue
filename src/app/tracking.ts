import { Order, OrderStatus, QueueState } from './models';
import { QueueCrypto } from './queue-crypto';
import { pizzaSummary } from './estimate';

/**
 * What a customer sees when following their own order on their phone. The host publishes
 * it per order, encrypted with a key derived from the order id, so the tracking link
 * never reveals the queue itself.
 */
export interface OrderTrack {
  shop: string;
  number: number;
  customer: string;
  pizzas: string;
  status: OrderStatus;
  /** Estimated ready time, cut to the minute, as clocks show it; absent once the order is ready. */
  eta?: number;
}

/** Orders stay followable for this long after they're picked up or cancelled. */
export const TRACK_AFTER_DONE = 60 * 60000;

export function trackCrypto(orderId: string): Promise<QueueCrypto> {
  return QueueCrypto.forQueue(`track:${orderId}`);
}

export function orderTrack(state: QueueState, order: Order, eta: number | undefined): OrderTrack {
  return {
    shop: state.name,
    number: order.number,
    customer: order.customer,
    pizzas: pizzaSummary(order),
    status: order.status,
    eta: eta === undefined ? undefined : Math.floor(eta / 60000) * 60000,
  };
}
