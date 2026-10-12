import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('prices: a general price, a price per pizza, and totals for order taker and customer', async ({
  page,
  context,
}) => {
  await page.goto(START);
  await page.getByLabel('Price per pizza').fill('9.5');
  await page.getByLabel('Price Calzone').fill('12');
  await page.getByLabel('Price Calzone').blur();
  // The general price shows where a pizza has no price of its own.
  await expect(page.getByLabel('Price Margherita')).toHaveAttribute('placeholder', '€ 9.5');
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  await tab(page, 'Orders').click();
  const [screen] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Customer screen ↗' }).click(),
  ]);
  for (const p of ['Margherita', 'Margherita', 'Calzone']) await page.locator('.menu-item', { hasText: p }).click();

  // The order taker sees the price per pizza type and the total.
  const totals = page.locator('.totals');
  await expect(totals.locator('tbody tr')).toHaveText([
    /2× Margherita\s*2 × €9\.50\s*€19\.00/,
    /1× Calzone\s*1 × €12\.00\s*€12\.00/,
  ]);
  await expect(totals.locator('tfoot')).toHaveText(/Total \(3 pizzas\)\s*€31\.00/);

  // So does the customer, while the order is taken.
  await expect(screen.locator('.os-lines li')).toHaveText([
    /2× Margherita\s*2 × €9\.50\s*€19\.00/,
    /1× Calzone\s*1 × €12\.00\s*€12\.00/,
  ]);
  await expect(screen.locator('.os-total')).toHaveText(/Total\s*€31\.00/);

  // After sending, both still see what to pay.
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.locator('.sent')).toContainText('To pay: €31.00');
  await expect(screen.locator('.os-order')).toContainText('Total €31.00');

  // A new general price counts for new orders only. (Back to the order taker's window: one
  // in the background barely updates.)
  await page.bringToFront();
  await tab(page, 'Settings').click();
  // Settings show the queue's own values once ready to edit.
  await expect(page.getByLabel('Price per pizza')).toHaveValue('9.5');
  await page.getByLabel('Price per pizza').fill('10');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(totals.locator('tfoot')).toHaveText(/Total \(1 pizza\)\s*€10\.00/);
  await tab(page, 'Stats').click();
  await expect(page.locator('.tile', { hasText: 'Revenue' })).toContainText('€31.00');

  for (const p of [page, screen]) {
    const width = await p.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(p.viewportSize()!.width);
  }
});

test('a price of 0 hides prices', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Price per pizza').fill('0');
  await page.getByRole('button', { name: 'Start queue' }).click();
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(page.locator('.cart li')).toHaveCount(1);
  await expect(page.locator('.totals')).toHaveCount(0);
});
