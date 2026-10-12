import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('the oven puts each pizza in an oven with room, times it, and frees the spot when baked', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Ovens').fill('2');
  await page.getByLabel('Pizzas per oven').fill('1');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  for (const p of ['Margherita', 'Funghi', 'Hawaii']) await page.locator('.menu-item', { hasText: p }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
  await tab(page, 'Kitchen').click();
  const prepared = page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true });
  for (let left = 3; left > 0; left--) {
    await prepared.first().click();
    await expect(prepared).toHaveCount(left - 1);
  }

  await tab(page, 'Oven').click();
  const row = (name: string) => page.locator('.kitchen-order .pizzas li', { hasText: name });
  // One red button per oven, no Baked yet.
  await expect(row('Margherita').getByRole('button')).toHaveText(['In oven 1', 'In oven 2']);
  await expect(page.getByRole('button', { name: 'Baked', exact: true })).toHaveCount(0);

  await row('Margherita').getByRole('button', { name: 'In oven 1' }).click();
  await expect(row('Margherita').getByRole('button', { name: 'Baked', exact: true })).toBeVisible();
  await expect(row('Margherita').getByRole('timer')).toContainText(/Oven 1\s*[78]:\d\d left/);
  // Oven 1 is full (one pizza fits): its button is off for the others.
  for (const name of ['Funghi', 'Hawaii']) {
    await expect(row(name).getByRole('button', { name: 'In oven 1' })).toBeDisabled();
    await expect(row(name).getByRole('button', { name: 'In oven 2' })).toBeEnabled();
  }
  await row('Funghi').getByRole('button', { name: 'In oven 2' }).click();
  await expect(row('Hawaii').getByRole('button', { name: 'In oven 2' })).toBeDisabled();
  // The timer counts down.
  const before = await row('Margherita').getByRole('timer').textContent();
  await expect(row('Margherita').getByRole('timer')).not.toHaveText(before!, { timeout: 3000 });

  // The kitchen can't undo a pizza that's in the oven.
  await tab(page, 'Kitchen').click();
  await expect(page.locator('.recent li', { hasText: 'Margherita' })).toContainText('In the oven');
  await expect(page.getByRole('button', { name: 'Undo Margherita of order 1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo Hawaii of order 1' })).toBeVisible();

  // Baked frees oven 1 for the next pizza; tapping that row now bakes it.
  await tab(page, 'Oven').click();
  await row('Margherita').click();
  await expect(row('Margherita')).toHaveCount(0);
  await expect(row('Hawaii').getByRole('button', { name: 'In oven 1' })).toBeEnabled();
  await row('Hawaii').getByRole('button', { name: 'In oven 1' }).click();
  await expect(row('Hawaii').getByRole('timer')).toBeVisible();

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
