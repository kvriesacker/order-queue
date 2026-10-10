import { expect, test, type Page } from '@playwright/test';

// Nothing listens on this port, so the app never reaches a public broker during tests.
const START = '?broker=ws://127.0.0.1:9#/';

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

/** Kitchen, oven and counter finish one order (this tab is the host, so it can do all). */
async function finish(page: Page, number: number) {
  for (const [station, button] of [
    ['Kitchen', 'Prepared'],
    ['Oven', 'Baked'],
  ]) {
    await tab(page, station).click();
    const card = page.locator('.kitchen-order', { hasText: `#${number}` });
    const buttons = card.getByRole('button', { name: button, exact: true });
    await expect(buttons.first()).toBeVisible();
    // Wait for each click to land before the next, so a re-render never swallows one.
    for (let left = await buttons.count(); left > 0; left--) {
      await buttons.first().click();
      await expect(buttons).toHaveCount(left - 1);
    }
  }
  await tab(page, 'Counter').click();
  await page
    .locator('app-order-card', { hasText: `#${number}` })
    .getByRole('button', { name: 'Ready for customer' })
    .click();
}

test('ready orders show like the preparing list, in green and without a time', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const queue = page.url();

  await order(page, 'Anna', ['Margherita', 'Margherita', 'Funghi'], 'No onion');
  await order(page, 'Bram', ['Diavola']);
  await order(page, 'Chris', ['Hawaii']);
  await finish(page, 1);
  await finish(page, 2);

  await page.goto(queue + '/display');
  const preparing = page.locator('.preparing .prep-list li');
  const ready = page.locator('.ready-list li');
  await expect(preparing).toHaveCount(1);
  await expect(ready).toHaveCount(2);

  // Preparing keeps its time; ready rows have number, name and pizzas, but no time.
  await expect(preparing.first().locator('.prep-eta')).toBeVisible();
  const anna = ready.filter({ hasText: 'Anna' });
  await expect(anna.locator('.prep-num')).toHaveText('1');
  await expect(anna.locator('.prep-pizzas')).toHaveText('2× Margherita, 1× Funghi');
  await expect(page.locator('.ready-list .prep-eta')).toHaveCount(0);
  await expect(page.locator('.ready-list')).not.toContainText('onion');

  // Green rows; the order called last stands out.
  await expect(anna).toHaveCSS('background-color', 'rgb(31, 122, 58)');
  const bram = ready.filter({ hasText: 'Bram' });
  await expect(bram).toHaveClass(/fresh/);
  await expect(bram).toHaveCSS('background-color', 'rgb(46, 155, 79)');
  await expect(ready.first()).toContainText('Bram');

  // Same layout as the preparing rows, and nothing spills off a phone screen.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
