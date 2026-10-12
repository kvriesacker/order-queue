import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';
import { putInOven } from './oven';

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
  if (button === 'Baked') await putInOven(card, count);
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

test('the customer screen shows each pizza in one of five blocks, ready ones in green', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const queue = page.url();

  await order(page, 'Anna', ['Margherita', 'Margherita', 'Funghi'], 'No onion');
  await order(page, 'Bram', ['Diavola']);
  await order(page, 'Chris', ['Hawaii']);
  await order(page, 'Dana', ['Funghi', 'Diavola']);
  await order(page, 'Eva', ['Margherita']);
  await order(page, 'Fien', ['Funghi']);
  await finish(page, 1);
  await finish(page, 2);
  await station(page, 'Kitchen', 'Prepared', 3);
  await station(page, 'Kitchen', 'Prepared', 4);
  await station(page, 'Kitchen', 'Prepared', 6); // Fien: prepared, waiting for the oven
  await tab(page, 'Oven').click();
  await putInOven(page.locator('.kitchen-order', { hasText: '#3' })); // Chris: in the oven
  await station(page, 'Oven', 'Baked', 4, 1); // Dana: one pizza baked…
  await putInOven(page.locator('.kitchen-order', { hasText: '#4' })); // …the other in the oven

  // Staff see the same steps on the order list.
  await tab(page, 'Orders').click();
  const status = (n: number) => page.locator('app-order-card', { hasText: `#${n}` }).locator('.status-label');
  await expect(status(4)).toHaveText('In the oven (1) · Baked (1)');
  await expect(status(3)).toHaveText('In the oven');
  await expect(status(6)).toHaveText('Being prepared');
  await expect(status(5)).toHaveText('Ordered');

  await page.goto(queue + '/display');
  const block = (title: string) =>
    page.locator('.display-col', { has: page.getByRole('heading', { name: title }) }).locator('.prep-list li');

  // "In the oven" only once a pizza is put in; each pizza sits where it is, so Dana's order is split.
  await expect(block('Ordered')).toHaveText([/Eva/]);
  await expect(block('Being prepared')).toHaveText([/Fien/]);
  await expect(block('In the oven')).toHaveText([/Chris\s*1× Hawaii/, /Dana\s*1× \w+\s*Part of the order/]);
  await expect(block('Baked')).toHaveText([/Dana\s*1× \w+\s*Part of the order/]);
  const danaPizzas = await page.locator('.display-col li', { hasText: 'Dana' }).locator('.prep-pizzas').allTextContents();
  expect(danaPizzas.sort()).toEqual(['1× Diavola', '1× Funghi']);
  const ready = block('Ready! Please collect');
  await expect(ready).toHaveCount(2);

  // Orders still being made keep their time; ready rows have number, name and pizzas, no time.
  for (const title of ['Ordered', 'Being prepared', 'In the oven', 'Baked']) {
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
