import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

// Inside the Android app (Capacitor) the page is https://localhost; pretend to be there.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
  });
});

test('in the Android app, links for others point at the website and screens open inside the app', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const id = page.url().split('#/q/')[1];

  // The link to invite the team is the website, not the app's own address.
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.locator('.share-link')).toHaveText(`https://kvriesacker.github.io/order-queue/#/q/${id}`);
  await page.keyboard.press('Escape');

  // The customer screen opens in the app itself: no new tab that would leave the app.
  await tab(page, 'Orders').click();
  const screen = page.getByRole('link', { name: /Customer screen/ });
  await expect(screen).not.toHaveAttribute('target', /.+/);
  await expect(screen).toHaveAttribute('href', new RegExp(`^#/q/${id}/order-screen\\?pos=`));
  await screen.click();
  await expect(page).toHaveURL(new RegExp(`#/q/${id}/order-screen\\?pos=`));
  await expect(page.getByText('Next customer')).toBeVisible();

  // No service worker: the app already has its files on the device.
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
