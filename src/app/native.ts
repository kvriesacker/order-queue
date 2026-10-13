/**
 * The Android app (Capacitor) runs this same web app from https://localhost inside the app.
 * Links meant for other people must point at the website instead, and screens that open in
 * a new browser tab on the web open inside the app.
 */
export const IS_NATIVE: boolean = (() => {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
})();

/** The website, for links other people open (share link, QR codes). */
export const WEB_APP = 'https://kvriesacker.github.io/order-queue/';
