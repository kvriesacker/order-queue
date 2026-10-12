import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('the kitchen lists its orders one under the other, oldest on top', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  for (const [n, pizza] of ['Margherita', 'Funghi', 'Diavola'].entries()) {
    await page.locator('.menu-item', { hasText: pizza }).click();
    await page.getByRole('button', { name: 'Send to kitchen' }).click();
    await expect(page.getByText(`Order #${n + 1} sent`)).toBeVisible();
  }

  await tab(page, 'Kitchen').click();
  const orders = page.locator('.kitchen-order');
  await expect(orders).toHaveCount(3);
  await expect(orders.locator('.num')).toHaveText(['#1', '#2', '#3']);
  const boxes = await Promise.all([0, 1, 2].map((i) => orders.nth(i).boundingBox()));
  for (let i = 1; i < 3; i++) {
    expect(boxes[i]!.x).toBe(boxes[0]!.x);
    expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
  }
});
