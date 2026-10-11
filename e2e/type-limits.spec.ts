import { expect, test, type Page } from '@playwright/test';

// Nothing listens on this port, so the app never reaches a public broker during tests.
const START = '?broker=ws://127.0.0.1:9#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

function pizza(page: Page, name: string) {
  return page.locator('.menu-item', { hasText: name });
}

async function send(page: Page) {
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #\d+ sent/)).toBeVisible();
}

test('a maximum set at the start stops orders of that pizza', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Maximum Margherita').fill('2');
  // The extra field still fits on a phone.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  await tab(page, 'Orders').click();
  await expect(pizza(page, 'Margherita')).toContainText('2 left');
  await pizza(page, 'Margherita').click();
  await expect(pizza(page, 'Margherita')).toContainText('1 left');
  await pizza(page, 'Margherita').click();
  // Both are in this order: no third one, and "+ same" can't add one either.
  await expect(pizza(page, 'Margherita')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add another one' }).first()).toBeDisabled();
  // Other pizzas have no maximum.
  await expect(pizza(page, 'Funghi')).toBeEnabled();
  await expect(pizza(page, 'Funghi')).not.toContainText('left');
  await send(page);
  await expect(pizza(page, 'Margherita')).toContainText('Sold out');
  await expect(pizza(page, 'Margherita')).toBeDisabled();
});

test('the kitchen changes a maximum and marks pizzas sold out', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  await pizza(page, 'Margherita').click();
  await send(page);

  await tab(page, 'Kitchen').click();
  const panel = page.locator('.type-limits');
  const margherita = panel.locator('li', { hasText: 'Margherita' });
  await expect(margherita).toContainText('1 sold');
  await margherita.getByLabel('Maximum Margherita').fill('3');
  await margherita.getByLabel('Maximum Margherita').press('Enter');
  await expect(margherita).toContainText('2 left');
  const funghi = panel.locator('li', { hasText: 'Funghi' });
  await funghi.getByRole('button', { name: 'Mark sold out' }).click();
  await expect(funghi).toHaveClass(/out/);

  await tab(page, 'Orders').click();
  await expect(pizza(page, 'Margherita')).toContainText('2 left');
  await expect(pizza(page, 'Funghi')).toContainText('Sold out');
  await expect(pizza(page, 'Funghi')).toBeDisabled();

  // Settings shows the kitchen's maximum, and saving keeps the sold-out mark.
  await tab(page, 'Settings').click();
  await expect(page.getByLabel('Maximum Margherita')).toHaveValue('3');
  await page.getByLabel('Maximum Margherita').fill('5');
  await page.getByLabel('Maximum Margherita').blur();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await tab(page, 'Orders').click();
  await expect(pizza(page, 'Margherita')).toContainText('4 left');
  await expect(pizza(page, 'Funghi')).toBeDisabled();

  // Back on sale.
  await tab(page, 'Kitchen').click();
  await funghi.getByRole('button', { name: 'Available again' }).click();
  await tab(page, 'Orders').click();
  await expect(pizza(page, 'Funghi')).toBeEnabled();

  // The kitchen panel fits on a phone.
  await tab(page, 'Kitchen').click();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
