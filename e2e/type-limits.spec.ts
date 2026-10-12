import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

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
  await page.getByLabel('Queue password').fill(PASSWORD);
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

test('the kitchen counts its ingredients, and ordered pizzas count as still to make', async ({
  page,
}) => {
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  await pizza(page, 'Margherita').click();
  await send(page);

  await tab(page, 'Kitchen').click();
  const panel = page.locator('.type-limits');
  const margherita = panel.locator('li', { hasText: 'Margherita' });
  const left = margherita.getByLabel('Margherita left');
  await expect(margherita).toContainText('1 sold');
  await expect(left).toHaveValue('');
  // The kitchen sees and edits what it can still make, never the maximum.
  await expect(panel.getByText('Max')).toHaveCount(0);
  await left.fill('3');
  await left.press('Enter');
  await expect(left).toHaveValue('3');
  await margherita.getByRole('button', { name: 'One more Margherita' }).click();
  await expect(left).toHaveValue('4');
  await margherita.getByRole('button', { name: 'One less Margherita' }).click();
  await margherita.getByRole('button', { name: 'One less Margherita' }).click();
  await expect(left).toHaveValue('2');
  const funghi = panel.locator('li', { hasText: 'Funghi' });
  await funghi.getByRole('button', { name: 'Sold out' }).click();
  await expect(funghi).toHaveClass(/out/);
  await expect(funghi.getByLabel('Funghi left')).toHaveValue('0');

  // Ingredients for 2, one already ordered: the order taker can sell 1 more.
  await tab(page, 'Orders').click();
  await expect(pizza(page, 'Margherita')).toContainText('1 left');
  await expect(pizza(page, 'Funghi')).toContainText('Sold out');
  await expect(pizza(page, 'Funghi')).toBeDisabled();
  await pizza(page, 'Margherita').click();
  await send(page);
  await expect(pizza(page, 'Margherita')).toContainText('Sold out');

  // New orders don't change the kitchen's count; preparing a pizza does.
  await tab(page, 'Kitchen').click();
  await expect(left).toHaveValue('2');
  await expect(margherita).toHaveClass(/out/);
  await page.locator('.kitchen-order', { hasText: '#1' }).getByRole('button', { name: 'Prepared', exact: true }).click();
  await expect(left).toHaveValue('1');

  // Settings shows the maximum that follows: 1 prepared + 1 left.
  await tab(page, 'Settings').click();
  await expect(page.getByLabel('Maximum Margherita')).toHaveValue('2');

  // New ingredients put Funghi back on sale; "No limit" lifts the limit on Margherita.
  await tab(page, 'Kitchen').click();
  await funghi.getByLabel('Funghi left').fill('5');
  await funghi.getByLabel('Funghi left').press('Enter');
  await margherita.getByRole('button', { name: 'No limit' }).click();
  await expect(left).toHaveValue('');
  await tab(page, 'Orders').click();
  await expect(pizza(page, 'Funghi')).toContainText('5 left');
  await expect(pizza(page, 'Funghi')).toBeEnabled();
  await expect(pizza(page, 'Margherita')).not.toContainText('left');

  // The kitchen panel fits on a phone.
  await tab(page, 'Kitchen').click();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
