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

async function bake(page: Page, pizzas: number) {
  for (const [name, button] of [['Kitchen', 'Prepared'], ['Oven', 'Baked']]) {
    await tab(page, name).click();
    const rows = page.locator('.kitchen-order .pizzas li');
    await expect(rows.first()).toBeVisible();
    const start = await rows.count();
    for (let n = 1; n <= pizzas; n++) {
      await rows.first().getByRole('button', { name: button, exact: true }).click();
      await expect(rows).toHaveCount(start - n);
    }
  }
  await tab(page, 'Counter').click();
}

function column(page: Page, title: string) {
  return page.locator('.column', { has: page.getByRole('heading', { name: new RegExp(title) }) });
}

test('the counter can show and hand over the baked pizzas of a big order before the rest is done', async ({ page, context }) => {
  await bigOrder(page);
  const queueId = page.url().split('/q/')[1].split('/')[0];
  await bake(page, 1);

  // At the counter the partly baked order is with the ones from the kitchen.
  const fromKitchen = column(page, 'From the kitchen');
  const onScreen = column(page, 'On the customer screen');
  await expect(page.locator('.making-col')).not.toContainText('#1');
  const card = fromKitchen.locator('app-order-card', { hasText: '#1' });
  await expect(card.locator('.counter-pizzas li')).toHaveText([
    /Margherita.*To customer screen/,
    /Funghi.*In the kitchen/,
    /Hawaii.*In the kitchen/,
  ]);
  // The Margherita goes on the customer screen on its own: the order is now in both columns.
  await card.getByRole('button', { name: 'Show Margherita on the customer screen' }).click();
  await expect(card.locator('.counter-pizzas li')).toHaveText([/Funghi/, /Hawaii/]);
  const shown = onScreen.locator('app-order-card', { hasText: '#1' });
  await expect(shown.locator('.counter-pizzas li')).toHaveText([/Margherita.*Hand over/]);

  const display = await context.newPage();
  await display.goto(`/?emulator=127.0.0.1#/q/${queueId}/display`);
  const block = (title: string) =>
    display.locator('.display-col', { has: display.getByRole('heading', { name: title }) }).locator('.prep-list li');
  await expect(block('Ready! Please collect')).toHaveText([/1\s*Anna\s*1× Margherita\s*Part of the order, the rest follows/]);
  await expect(block('Ordered')).toHaveText([/1\s*Anna\s*1× Funghi, 1× Hawaii\s*Rest of the order/]);

  // Handed over: it leaves the Ready block. A mistake can be undone.
  await shown.getByRole('button', { name: 'Hand over Margherita' }).click();
  await expect(shown.locator('.counter-pizzas li').first()).toContainText('Handed over');
  await expect(block('Ready! Please collect')).toHaveCount(0);
  await shown.getByRole('button', { name: 'Undo handing over Margherita' }).click();
  await expect(block('Ready! Please collect')).toHaveCount(1);
  await shown.getByRole('button', { name: 'Hand over Margherita' }).click();

  // The rest is baked: since part went ahead, it can still go pizza by pizza or all at once.
  await bake(page, 2);
  await expect(card.locator('.counter-pizzas li')).toHaveText([/Funghi.*To customer screen/, /Hawaii.*To customer screen/]);
  await expect(card.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Ready for customer' }).click();
  await expect(fromKitchen.locator('app-order-card', { hasText: '#1' })).toHaveCount(0);
  await expect(block('Ready! Please collect')).toHaveText([/1× Funghi, 1× Hawaii\s*The rest was already handed over/]);
  // The whole order is on the screen now: no buttons per pizza, just Picked up.
  await expect(shown.locator('.counter-pizzas li')).toHaveText([/Margherita.*Handed over/, /Funghi/, /Hawaii/]);
  await expect(shown.getByRole('button', { name: /Hand over/ })).toHaveCount(0);
  await shown.getByRole('button', { name: 'Picked up' }).click();
  await expect(page.locator('app-order-card', { hasText: '#1' })).toHaveCount(0);
  await expect(block('Ready! Please collect')).toHaveCount(0);
});

test('a big order baked all at once needs no buttons per pizza at the counter', async ({ page }) => {
  await bigOrder(page);
  await bake(page, 3);
  const card = column(page, 'From the kitchen').locator('app-order-card', { hasText: '#1' });
  await expect(card.locator('.counter-pizzas li')).toHaveText([/Margherita/, /Funghi/, /Hawaii/]);
  await expect(card.getByRole('button', { name: /customer screen/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Ready for customer' }).click();
  const shown = column(page, 'On the customer screen').locator('app-order-card', { hasText: '#1' });
  await expect(shown.locator('.counter-pizzas li')).toHaveCount(3);
  await expect(shown.getByRole('button', { name: /Hand over/ })).toHaveCount(0);
  await expect(shown.getByRole('button', { name: 'Picked up' })).toBeVisible();
});
