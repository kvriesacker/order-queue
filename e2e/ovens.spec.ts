import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('the oven station marks an oven out of order, and the estimates follow', async ({ page }) => {
  await page.goto(START);
  // Two ovens of one pizza each.
  await page.getByLabel('Ovens').fill('2');
  await page.getByLabel('Pizzas per oven').fill('1');
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  await tab(page, 'Orders').click();
  for (const p of ['Margherita', 'Funghi']) await page.locator('.menu-item', { hasText: p }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();

  await tab(page, 'Kitchen').click();
  const prepared = page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true });
  for (let left = 2; left > 0; left--) {
    await prepared.first().click();
    await expect(prepared).toHaveCount(left - 1);
  }

  // The ovens sit in the side bar under "Just baked", without pizzas or counts.
  await tab(page, 'Oven').click();
  const side = page.locator('.column.narrow');
  await expect(side.locator('h2')).toHaveText([/Just baked/, /Ovens/, /Baked, waiting at counter/]);
  const oven = (n: number) => side.locator('.oven', { hasText: `Oven ${n}` });
  await expect(oven(1)).toBeVisible();
  await expect(side.locator('.ovens-list')).not.toContainText('pizza');
  await expect(side.locator('.ovens-list .chip')).toHaveCount(0);
  const eta = page.locator('.kitchen-order app-eta');
  const before = await eta.textContent();

  // Oven 2 breaks: the order now waits for one oven, so its estimate moves later.
  await oven(2).getByRole('button', { name: 'Mark out of order' }).click();
  await expect(oven(2)).toHaveClass(/broken/);
  await expect(oven(2)).toContainText('Out of order');
  await expect(eta).not.toHaveText(before!);

  // Fixed again.
  await oven(2).getByRole('button', { name: 'Working again' }).click();
  await expect(eta).toHaveText(before!);

  // Every oven out: the station says so.
  await oven(1).getByRole('button', { name: 'Mark out of order' }).click();
  await oven(2).getByRole('button', { name: 'Mark out of order' }).click();
  await expect(page.locator('.oven-waiting')).toContainText('Every oven is out of order');

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
