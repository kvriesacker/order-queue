import { defineConfig } from '@playwright/test';

// Browser tests run against the production build (`ng build` first). They use one tab as
// the queue's host, which works without a broker, so no network is needed.
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
    // A local broker for the tests that run several devices together.
    { command: 'node e2e/broker.mjs', url: 'http://127.0.0.1:8884/', reuseExistingServer: !process.env['CI'] },
  ],
});
