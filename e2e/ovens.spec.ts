import { expect, test, type Page } from '@playwright/test';

// Nothing listens on this port, so the app never reaches a public broker during tests.
const START = '?broker=ws://127.0.0.1:9#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('the oven station sees its ovens and can mark one out of order', async ({ page }) => {
  await page.goto(START);
  // Two ovens of two pizzas.
  await page.getByLabel('Ovens').fill('2');
  await page.getByLabel('Pizzas per oven').fill('2');
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  await tab(page, 'Orders').click();
  for (const p of ['Margherita', 'Funghi', 'Diavola']) await page.locator('.menu-item', { hasText: p }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();

  await tab(page, 'Kitchen').click();
  const prepared = page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true });
  for (let left = 3; left > 0; left--) {
    await prepared.first().click();
    await expect(prepared).toHaveCount(left - 1);
  }

  // Three prepared pizzas fill oven 1, then oven 2.
  await tab(page, 'Oven').click();
  const oven = (n: number) => page.locator('.oven', { has: page.getByText(`Oven ${n}`, { exact: true }) });
  await expect(oven(1)).toContainText('2 / 2 pizzas');
  await expect(oven(1)).toContainText('#1 Margherita');
  await expect(oven(2)).toContainText('1 / 2 pizzas');
  await expect(page.locator('.oven-waiting')).toHaveCount(0);
  const before = await page.locator('.kitchen-order app-eta').textContent();

  // Oven 2 breaks: its pizza waits for a spot, and the order's estimate moves later.
  await oven(2).getByRole('button', { name: 'Mark out of order' }).click();
  await expect(oven(2)).toHaveClass(/broken/);
  await expect(oven(2)).toContainText('Out of order');
  await expect(page.locator('.oven-waiting')).toContainText('1 prepared pizza waits for a free spot');
  await expect(page.locator('.kitchen-order app-eta')).not.toHaveText(before!);

  // Fixed again.
  await oven(2).getByRole('button', { name: 'Working again' }).click();
  await expect(oven(2)).toContainText('1 / 2 pizzas');
  await expect(page.locator('.kitchen-order app-eta')).toHaveText(before!);

  // Every oven out: the station says so.
  await oven(1).getByRole('button', { name: 'Mark out of order' }).click();
  await oven(2).getByRole('button', { name: 'Mark out of order' }).click();
  await expect(page.locator('.oven-waiting')).toContainText('every oven is out of order');

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
