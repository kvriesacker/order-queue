import { expect, test, type Locator, type Page } from '@playwright/test';
import { PASSWORD } from './password';
import { putInOven } from './oven';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

/** The options show as bright yellow tags, one per option. */
async function expectTags(where: Locator) {
  const tags = where.locator('.note-tag');
  await expect(tags).toHaveText(['Extra cheese', 'Spicy', 'cut in 8']);
  expect(await tags.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 225, 77)');
}

test('pizza options stand out as yellow tags in the kitchen, oven and counter', async ({ page }, info) => {
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.locator('.quick-notes .note-chip', { hasText: 'Extra cheese' }).click();
  await page.locator('.quick-notes .note-chip', { hasText: 'Spicy' }).click();
  await page.locator('.line-note').fill('Extra cheese, Spicy, cut in 8');
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();

  await tab(page, 'Kitchen').click();
  await expectTags(page.locator('.kitchen-order'));
  await page.screenshot({ path: `test-results/note-tags-kitchen-${info.project.name}.png` });
  await page.locator('.kitchen-order').getByRole('button', { name: 'Prepared', exact: true }).click();

  await tab(page, 'Oven').click();
  await expectTags(page.locator('.kitchen-order'));
  await putInOven(page.locator('.kitchen-order'));
  await page.locator('.kitchen-order').getByRole('button', { name: 'Baked', exact: true }).click();

  await tab(page, 'Counter').click();
  await expectTags(page.locator('app-order-card', { hasText: '#1' }).first());
});
