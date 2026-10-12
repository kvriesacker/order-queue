import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

async function bigOrder(page: Page) {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  for (const p of ['Margherita', 'Funghi', 'Hawaii']) await page.locator('.menu-item', { hasText: p }).click();
  await page.locator('input[name=customer]').fill('Anna');
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
}

test('ticked pizzas move to the right, so the next one is always on top', async ({ page }) => {
  await bigOrder(page);
  await tab(page, 'Kitchen').click();
  const todo = page.locator('.kitchen-order .pizzas li');
  await expect(todo).toHaveText([/Margherita/, /Funghi/, /Hawaii/]);
  await todo.first().getByRole('button', { name: 'Prepared', exact: true }).click();
  await expect(todo).toHaveText([/Funghi/, /Hawaii/]);
  await expect(page.locator('.kitchen-order')).toContainText('1/3 prepared');
  await expect(page.locator('.recent li')).toHaveText([/#1\s*Margherita/]);

  // The oven sees what it can bake, and how many are still in the kitchen.
  await tab(page, 'Oven').click();
  await expect(page.locator('.kitchen-order .pizzas li')).toHaveText([/Margherita/]);
  await expect(page.locator('.kitchen-order')).toContainText('+2 pizzas still in the kitchen');
});

test('kitchen and oven in full screen show only what to tick off', async ({ page }) => {
  await bigOrder(page);
  await tab(page, 'Kitchen').click();
  await page.getByRole('button', { name: /Full screen/ }).click();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.locator('app-type-limits')).toHaveCount(0);
  await expect(page.getByText('Coming up for the oven')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Just prepared' })).toBeVisible();
  await page.locator('.kitchen-order .pizzas li').first().getByRole('button', { name: 'Prepared', exact: true }).click();
  await expect(page.locator('.recent li')).toHaveText([/Margherita/]);
  await expect(page.locator('.kitchen-order .pizzas li')).toHaveCount(2);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(tab(page, 'Oven')).toBeVisible();
  await expect(page.locator('app-type-limits')).toHaveCount(1);
});

test('the counter can hand over the baked pizzas of a big order before the rest is done', async ({ page }) => {
  await bigOrder(page);
  await tab(page, 'Kitchen').click();
  await page.locator('.kitchen-order .pizzas li').first().getByRole('button', { name: 'Prepared', exact: true }).click();
  await tab(page, 'Oven').click();
  await page.locator('.kitchen-order').getByRole('button', { name: 'Baked', exact: true }).click();

  // The counter sees the baked Margherita while the rest is still being made.
  await tab(page, 'Counter').click();
  const card = page.locator('app-order-card', { hasText: '#1' });
  await expect(card.locator('.counter-pizzas li')).toHaveText([/Margherita.*Hand over/, /Funghi.*In the kitchen/, /Hawaii.*In the kitchen/]);
  await card.getByRole('button', { name: 'Hand over Margherita' }).click();
  await expect(card.locator('.counter-pizzas li').first()).toContainText('Handed over');
  // A mistake can be undone.
  await card.getByRole('button', { name: 'Undo handing over Margherita' }).click();
  await expect(card.getByRole('button', { name: 'Hand over Margherita' })).toBeVisible();
  await card.getByRole('button', { name: 'Hand over Margherita' }).click();

  // The rest gets baked: the order comes from the kitchen with the Margherita already given.
  await tab(page, 'Kitchen').click();
  for (let n = 2; n > 0; n--) {
    await page.locator('.kitchen-order .pizzas li').first().getByRole('button', { name: 'Prepared', exact: true }).click();
    await expect(page.locator('.kitchen-order .pizzas li')).toHaveCount(n - 1);
  }
  await tab(page, 'Oven').click();
  for (let n = 2; n > 0; n--) {
    await page.locator('.kitchen-order .pizzas li').first().getByRole('button', { name: 'Baked', exact: true }).click();
    await expect(page.locator('.kitchen-order .pizzas li')).toHaveCount(n - 1);
  }
  await tab(page, 'Counter').click();
  const ready = page.locator('.column', { hasText: 'From the kitchen' }).locator('app-order-card', { hasText: '#1' });
  await expect(ready.locator('.counter-pizzas li').first()).toContainText('Handed over');
  // Handing over the last pizzas finishes the order.
  await ready.getByRole('button', { name: 'Hand over Funghi' }).click();
  await ready.getByRole('button', { name: 'Hand over Hawaii' }).click();
  await expect(page.locator('app-order-card', { hasText: '#1' })).toHaveCount(0);
});
