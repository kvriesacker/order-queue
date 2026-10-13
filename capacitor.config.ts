import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app: the same web app, packed in a native shell (Koen chose one codebase). */
const config: CapacitorConfig = {
  appId: 'io.github.kvriesacker.orderqueue',
  appName: 'Pizza queue',
  webDir: 'dist/order-queue/browser',
  android: {
    // Firebase and the encryption need a secure origin: https://localhost.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
