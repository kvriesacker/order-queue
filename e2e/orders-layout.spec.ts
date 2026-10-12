import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('open orders show only on request, and this order sits beside the menu on a wide screen', async ({
  page,
}) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.locator('input[name=customer]').fill('Anna');
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
  await page.locator('.menu-item', { hasText: 'Funghi' }).click();

  // Open orders are hidden until asked for.
  const panel = page.getByRole('dialog', { name: 'Open orders' });
  await expect(panel).toBeHidden();
  const toggle = page.getByRole('button', { name: /Open orders/ });
  await expect(toggle).toContainText('1');
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('app-order-card', { hasText: '#1' })).toContainText('Anna');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Wide: the pizzas of this order are to the right of the menu, the send button under the menu.
  // Narrow: menu, then this order, then the send button, one under the other.
  const menu = (await page.locator('.menu').boundingBox())!;
  const cart = (await page.locator('.cart').boundingBox())!;
  const send = (await page.getByRole('button', { name: 'Send to kitchen' }).boundingBox())!;
  if (page.viewportSize()!.width > 860) {
    expect(cart.x).toBeGreaterThanOrEqual(menu.x + menu.width);
    expect(send.x).toBeLessThan(cart.x);
    expect(send.y).toBeGreaterThan(menu.y + menu.height);
  } else {
    expect(cart.y).toBeGreaterThanOrEqual(menu.y + menu.height);
    expect(send.y).toBeGreaterThanOrEqual(cart.y + cart.height);
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
