import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

async function order(page: Page, customer: string, pizzas: string[], note?: string) {
  await tab(page, 'Orders').click();
  for (const p of pizzas) await page.locator('.menu-item', { hasText: p }).click();
  if (note) await page.locator('.cart li').first().getByRole('button', { name: note }).click();
  await page.locator('input[name=customer]').fill(customer);
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #\d+ sent/)).toBeVisible();
}

/** Clicks a station's done button for `count` pizzas of one order (all of them by default). */
async function station(page: Page, name: string, button: string, number: number, count?: number) {
  await tab(page, name).click();
  const card = page.locator('.kitchen-order', { hasText: `#${number}` });
  const buttons = card.getByRole('button', { name: button, exact: true });
  await expect(buttons.first()).toBeVisible();
  // Wait for each click to land before the next, so a re-render never swallows one.
  const total = await buttons.count();
  for (let left = total; left > total - (count ?? total); left--) {
    await buttons.first().click();
    await expect(buttons).toHaveCount(left - 1);
  }
}

/** Kitchen, oven and counter finish one order (one device can do all). */
async function finish(page: Page, number: number) {
  await station(page, 'Kitchen', 'Prepared', number);
  await station(page, 'Oven', 'Baked', number);
  await tab(page, 'Counter').click();
  await page
    .locator('app-order-card', { hasText: `#${number}` })
    .getByRole('button', { name: 'Ready for customer' })
    .click();
}

test('the customer screen shows orders in four blocks, ready ones in green', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const queue = page.url();

  await order(page, 'Anna', ['Margherita', 'Margherita', 'Funghi'], 'No onion');
  await order(page, 'Bram', ['Diavola']);
  await order(page, 'Chris', ['Hawaii']);
  await order(page, 'Dana', ['Funghi', 'Diavola']);
  await order(page, 'Eva', ['Margherita']);
  await finish(page, 1);
  await finish(page, 2);
  await station(page, 'Kitchen', 'Prepared', 3); // Chris: in the oven
  await station(page, 'Kitchen', 'Prepared', 4, 1); // Dana: first of two pizzas prepared

  await page.goto(queue + '/display');
  const block = (title: string) =>
    page.locator('.display-col', { has: page.getByRole('heading', { name: title }) }).locator('.prep-list li');

  // Each order sits in the block its first pizza reached.
  await expect(block('Ordered')).toHaveText([/Eva/]);
  await expect(block('Being prepared')).toHaveText([/Dana/]);
  await expect(block('Baking')).toHaveText([/Chris/]);
  const ready = block('Ready! Please collect');
  await expect(ready).toHaveCount(2);

  // Orders still being made keep their time; ready rows have number, name and pizzas, no time.
  for (const title of ['Ordered', 'Being prepared', 'Baking']) {
    await expect(block(title).first().locator('.prep-eta')).toBeVisible();
  }
  const anna = ready.filter({ hasText: 'Anna' });
  await expect(anna.locator('.prep-num')).toHaveText('1');
  await expect(anna.locator('.prep-pizzas')).toHaveText('2× Margherita, 1× Funghi');
  await expect(page.locator('.ready-list .prep-eta')).toHaveCount(0);
  await expect(page.locator('.display')).not.toContainText('onion');

  // Green rows; the order called last stands out.
  await expect(anna).toHaveCSS('background-color', 'rgb(31, 122, 58)');
  const bram = ready.filter({ hasText: 'Bram' });
  await expect(bram).toHaveClass(/fresh/);
  await expect(bram).toHaveCSS('background-color', 'rgb(46, 155, 79)');
  await expect(ready.first()).toContainText('Bram');

  // Nothing spills off a phone screen.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
