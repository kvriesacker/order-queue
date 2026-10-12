import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';
import { putInOven } from './oven';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('kitchen and oven see what they just marked and can undo it', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.locator('input[name=customer]').fill('Anna');
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();

  // Kitchen: the order leaves the list once prepared, but stays under "Just prepared".
  await tab(page, 'Kitchen').click();
  const recent = page.locator('.recent li');
  await expect(recent).toHaveText(['Nothing yet.']);
  await page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true }).click();
  await expect(page.locator('.kitchen-order')).toHaveCount(0);
  await expect(recent).toHaveCount(1);
  await expect(recent.first()).toContainText('#1');
  await expect(recent.first()).toContainText('Margherita');
  await expect(recent.first()).toContainText('just now');

  // A mistake: undo puts it back to prepare.
  await page.getByRole('button', { name: 'Undo Margherita of order 1' }).click();
  await expect(page.locator('.kitchen-order')).toHaveCount(1);
  await expect(recent).toHaveText(['Nothing yet.']);
  await page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true }).click();

  // Oven: once baked the order goes to the counter, and "Just baked" can still undo it.
  await tab(page, 'Oven').click();
  await putInOven(page.locator('.kitchen-order'));
  await page.locator('.kitchen-order').getByRole('button', { name: 'Baked', exact: true }).click();
  await expect(page.locator('.kitchen-order')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Just baked' })).toBeVisible();
  await expect(recent.first()).toContainText('#1');
  await tab(page, 'Counter').click();
  await expect(page.locator('app-order-card', { hasText: '#1' })).toBeVisible();

  await tab(page, 'Oven').click();
  await page.getByRole('button', { name: 'Undo Margherita of order 1' }).click();
  await expect(page.locator('.kitchen-order')).toHaveCount(1);
  // Taken back, it's in its oven again.
  await expect(page.locator('.kitchen-order').getByRole('button', { name: 'Baked', exact: true })).toBeVisible();

  // The kitchen no longer lists a pizza the oven has baked, so it can't undo past the oven.
  await page.locator('.kitchen-order').getByRole('button', { name: 'Baked', exact: true }).click();
  await tab(page, 'Kitchen').click();
  await expect(recent).toHaveText(['Nothing yet.']);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
