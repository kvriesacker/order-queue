import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('a pizza that has baked long enough turns red and says to take it out', async ({ page }, info) => {
  await page.goto(START);
  await page.getByLabel('Bake minutes').fill('0');
  await page.getByLabel('Bake seconds').fill('5');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
  await tab(page, 'Kitchen').click();
  await page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true }).click();

  await tab(page, 'Oven').click();
  const row = page.locator('.kitchen-order .pizzas li', { hasText: 'Margherita' });
  await row.getByRole('button', { name: 'In the oven' }).click();
  // Still baking: the usual yellow row, no warning.
  await expect(row).toHaveClass(/in-oven/);
  await expect(row).not.toHaveClass(/bake-done/);
  await expect(row.getByText('Take it out!')).toHaveCount(0);

  // Done: red frame, the warning, and a red Baked button.
  await expect(row).toHaveClass(/bake-done/, { timeout: 10_000 });
  await expect(row.getByRole('timer')).toContainText(/Take it out!\s*Done 0:\d\d ago/);
  const frame = await row.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(frame).toContain('inset');
  const button = row.getByRole('button', { name: 'Baked', exact: true });
  expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(200, 16, 46)');
  await page.screenshot({ path: `test-results/oven-done-${info.project.name}.png` });

  await button.click();
  await expect(row).toHaveCount(0);
});
