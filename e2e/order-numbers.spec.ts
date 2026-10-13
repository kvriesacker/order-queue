import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

async function order(page: Page, pizza: string) {
  await page.locator('.menu-item', { hasText: pizza }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
}

test('order numbers start at the number set at the start and can jump to a new range', async ({ page }) => {
  await page.goto(START);
  // 1 unless changed, to match the first printed ticket.
  const first = page.getByLabel('First order number');
  await expect(first).toHaveValue('1');
  await first.fill('1000');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();

  const next = page.locator('.next-number');
  await expect(next).toContainText('Next order number: #1000');
  await order(page, 'Margherita');
  await expect(page.getByText(/Order #1000 sent/)).toBeVisible();
  await expect(next).toContainText('#1001');

  // The tickets 1000-1001 ran out: jump to the next roll.
  await next.getByRole('button', { name: 'Change' }).click();
  const input = next.getByLabel('Next order number');
  await expect(input).toHaveValue('1001');
  // A number an open order still has is refused.
  await input.fill('1000');
  await next.getByRole('button', { name: 'Save' }).click();
  await expect(next.getByText('Order #1000 is still in the shop. Pick another number.')).toBeVisible();
  await input.fill('100');
  await next.getByRole('button', { name: 'Save' }).click();
  await expect(next).toContainText('Next order number: #100');
  await page.screenshot({ path: `test-results/order-numbers-${test.info().project.name}.png` });
  await order(page, 'Funghi');
  await expect(page.getByText(/Order #100 sent/)).toBeVisible();
  await expect(next).toContainText('#101');

  // Cancel leaves the number as it was.
  await next.getByRole('button', { name: 'Change' }).click();
  await next.getByLabel('Next order number').fill('5');
  await next.getByRole('button', { name: 'Cancel' }).click();
  await expect(next).toContainText('#101');

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
