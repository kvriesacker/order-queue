import { DisplayStage, Order, OrderStatus, QueueState, displayStage, stageCounts } from './models';
import { QueueCrypto } from './queue-crypto';
import { pizzaSummary } from './estimate';

/**
 * What a customer sees when following their own order on their phone, in the follow app
 * (repository order-follow, which has its own copy of this type: keep the two in step). It's
 * stored per order, encrypted with a key derived from the order id, so the tracking link
 * never reveals the queue itself.
 */
export interface OrderTrack {
  shop: string;
  number: number;
  customer: string;
  pizzas: string;
  status: OrderStatus;
  /**
   * The furthest block of the customer display the order's pizzas not yet called reached
   * (older versions don't send it).
   */
  stage?: DisplayStage | null;
  /** How many pizzas are in each block, as an order can be split (older versions don't send it). */
  stages?: Partial<Record<DisplayStage, number>>;
  /** Estimated ready time, cut to the minute, as clocks show it; absent once the order is ready. */
  eta?: number;
  /** The queue's language, which the follow page speaks (older versions don't send it). */
  lang?: 'nl' | 'en';
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
    stage: displayStage(order),
    stages: stageCounts(order),
    eta: eta === undefined ? undefined : Math.floor(eta / 60000) * 60000,
    lang: state.lang ?? 'nl',
  };
}
