import { defineConfig } from '@playwright/test';

/**
 * The tests were written in English: each test device starts switched to English (the app's
 * default is Dutch). Tests for the languages themselves start without this.
 */
export const ENGLISH = {
  cookies: [],
  origins: [{ origin: 'http://127.0.0.1:4321', localStorage: [{ name: 'pizza-queue:lang', value: 'en' }] }],
};

// Browser tests run against the production build (`ng build` first) and a local Firebase
// emulator (needs Java), so they never touch the real Firebase project.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321/',
    // A stuck tap fails on its own line (with the reason) instead of only timing out the test.
    actionTimeout: 10_000,
    storageState: ENGLISH,
    launchOptions: { executablePath: process.env['CHROMIUM_PATH'] || undefined },
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: [
    { command: 'node e2e/serve.mjs', url: 'http://127.0.0.1:4321/', reuseExistingServer: !process.env['CI'] },
    {
      command: 'npx firebase emulators:start --only firestore,auth --project demo-pizza-queue',
      url: 'http://127.0.0.1:8085/',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
