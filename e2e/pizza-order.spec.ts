import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

async function start(page: Page) {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
}

test('each pizza button shows how many of it the order already has', async ({ page }) => {
  await start(page);
  const button = (name: string) => page.locator('.menu-item', { hasText: name });
  for (const p of ['Margherita', 'Funghi', 'Margherita']) await button(p).click();
  await expect(button('Margherita').locator('.in-order-count')).toHaveText('2');
  await expect(button('Funghi').locator('.in-order-count')).toHaveText('1');
  await expect(button('Diavola').locator('.in-order-count')).toHaveCount(0);

  // The count sits at the right of the button.
  const box = (await button('Margherita').boundingBox())!;
  const count = (await button('Margherita').locator('.in-order-count').boundingBox())!;
  expect(count.x + count.width).toBeGreaterThan(box.x + box.width - 24);

  // A new order starts from nothing.
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
  await expect(page.locator('.in-order-count')).toHaveCount(0);
});

test('kitchen and oven show the pizzas of an order by type, and the oven one order under another', async ({
  page,
}) => {
  await start(page);
  for (const pizzas of [['Diavola', 'Margherita', 'Funghi', 'Margherita'], ['Funghi'], ['Hawaii']]) {
    for (const p of pizzas) await page.locator('.menu-item', { hasText: p }).click();
    await page.getByRole('button', { name: 'Send to kitchen' }).click();
    await expect(page.locator('.sent strong').first()).toHaveText(/#\d/);
  }

  // Kitchen: the same pizzas together, in menu order.
  await tab(page, 'Kitchen').click();
  const first = page.locator('.kitchen-order').first();
  await expect(first.locator('.chip')).toHaveText(['Margherita', 'Margherita', 'Funghi', 'Diavola']);
  for (let n = 1; n <= 3; n++) {
    const card = page.locator('.kitchen-order', { has: page.locator('.num', { hasText: `#${n}` }) });
    const buttons = card.getByRole('button', { name: 'Prepared', exact: true });
    for (let left = await buttons.count(); left > 0; left--) {
      await buttons.first().click();
      await expect(buttons).toHaveCount(left - 1);
    }
  }
  await expect(page.locator('.kitchen-order')).toHaveCount(0);

  // Oven: the same order of pizzas, and the orders one under the other however wide the screen.
  await tab(page, 'Oven').click();
  const orders = page.locator('.kitchen-order');
  await expect(orders).toHaveCount(3);
  await expect(orders.first().locator('.chip')).toHaveText(['Margherita', 'Margherita', 'Funghi', 'Diavola']);
  const boxes = await Promise.all([0, 1, 2].map((i) => orders.nth(i).boundingBox()));
  for (let i = 1; i < 3; i++) {
    expect(boxes[i]!.x).toBe(boxes[0]!.x);
    expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
  }
});

test('the order taker sees when an order will be ready before sending it', async ({ page }) => {
  await start(page);
  const eta = page.locator('.draft-eta');
  await expect(eta).toHaveCount(0);
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(eta).toContainText(/Ready around \d{1,2}:\d{2}.*if sent now/);

  // Under the total, above the customer name.
  const etaBox = (await eta.boundingBox())!;
  expect(etaBox.y).toBeGreaterThan((await page.locator('.totals').boundingBox())!.y);
  expect(etaBox.y).toBeLessThan((await page.locator('input[name=customer]').boundingBox())!.y);

  // Once sent, the order gets the same time.
  const before = await eta.locator('strong').innerText();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.locator('.sent')).toContainText(`Estimated ready at ${before}`);
  await expect(eta).toHaveCount(0);
});
