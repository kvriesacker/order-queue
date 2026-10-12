import { defineConfig } from '@playwright/test';

// Browser tests run against the production build (`ng build` first) and a local Firebase
// emulator (needs Java), so they never touch the real Firebase project.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321/',
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
