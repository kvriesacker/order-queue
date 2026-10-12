import { EMULATOR_HOST } from './firebase';

/**
 * The customer's own app for following one order (repository order-follow). The QR code on the
 * order screen opens it, so customers never land in this staff app.
 */
export const FOLLOW_APP = 'https://kvriesacker.github.io/order-follow/';

/**
 * `?follow=<address>` in the page URL uses another copy of the follow app instead (for local
 * tests). Remembered per tab, because the router drops the query string.
 */
export const FOLLOW_OVERRIDE = (() => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('follow');
    if (fromUrl) sessionStorage.setItem('pizza-queue:follow', fromUrl);
    return fromUrl ?? sessionStorage.getItem('pizza-queue:follow');
  } catch {
    return null;
  }
})();

/** The link a customer scans to follow one order (it doesn't give access to the queue). */
export function followLink(orderId: string): string {
  const search = EMULATOR_HOST ? `?emulator=${encodeURIComponent(EMULATOR_HOST)}` : '';
  return `${FOLLOW_OVERRIDE ?? FOLLOW_APP}${search}#/${encodeURIComponent(orderId)}`;
}
