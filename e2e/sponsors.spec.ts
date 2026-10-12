import { expect, test } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

test('sponsors set in Settings take turns on the customer screens', async ({ page, context }) => {
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  // Other tabs don't share the emulator setting (it's per tab): give it again.
  const queue = `/${START.split('#')[0]}#/q/${page.url().split('/q/')[1]}`;

  // No sponsors yet: the customer screen shows no banner.
  const display = await context.newPage();
  await display.goto(queue + '/display');
  await expect(display.locator('.display-col').first()).toBeVisible();
  await expect(display.locator('.sponsor-banner')).toHaveCount(0);

  await page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true }).click();
  const add = page.getByRole('button', { name: '+ Add sponsor' });
  await add.click();
  await page.getByLabel('Sponsor name').nth(0).fill('Bakkerij Jansens');
  await page.getByLabel('Message').nth(0).fill('Vers brood elke dag');
  await add.click();
  await page.getByLabel('Sponsor name').nth(1).fill('Garage Peeters');
  await add.click(); // A blank row is left out.
  await page.getByLabel('Show each sponsor for (seconds)').fill('3');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByLabel('Sponsor name')).toHaveCount(2);

  // The shop screen shows one sponsor at a time, then the next. (A tab in the background
  // hardly runs, unlike the shop's TV, so bring it to the front.)
  await display.bringToFront();
  const banner = display.locator('.sponsor-banner');
  await expect(banner).toHaveCount(1);
  await expect(banner).toContainText('With thanks to');
  await expect(banner).toContainText(/Bakkerij Jansens\s*Vers brood elke dag|Garage Peeters/);
  const first = await banner.locator('.sponsor-name').textContent();
  await expect(banner.locator('.sponsor-name')).not.toHaveText(first!, { timeout: 5000 });

  // The order point's customer screen shows them too.
  const orderScreen = await context.newPage();
  await orderScreen.goto(queue + '/order-screen');
  await orderScreen.bringToFront();
  await expect(orderScreen.locator('.sponsor-banner .sponsor-name')).toHaveText(/Bakkerij Jansens|Garage Peeters/);

  // All removed: the banners go away.
  await page.bringToFront();
  await page.getByRole('button', { name: 'Remove sponsor 2' }).click();
  await page.getByRole('button', { name: 'Remove sponsor 1' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await display.bringToFront();
  await expect(display.locator('.sponsor-banner')).toHaveCount(0);
  await orderScreen.bringToFront();
  await expect(orderScreen.locator('.sponsor-banner')).toHaveCount(0);
});
