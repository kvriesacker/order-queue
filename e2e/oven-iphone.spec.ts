import { expect, test, type Locator, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Nothing in an oven row covers anything else, and all of it stays inside the row. */
async function expectNoOverlap(row: Locator) {
  const outer = (await row.boundingBox())!;
  // Text never runs out of its own box either.
  for (const el of await row.locator('.pizza-meta, .bake-timer').all()) {
    expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  }
  const parts = row.locator('.chip, .pizza-meta, .bake-timer, .btn');
  const boxes: Box[] = [];
  for (let i = 0; i < (await parts.count()); i++) {
    const box = await parts.nth(i).boundingBox();
    if (box) boxes.push(box);
  }
  for (const [i, a] of boxes.entries()) {
    expect(a.x).toBeGreaterThanOrEqual(outer.x - 0.5);
    expect(a.x + a.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
    for (const b of boxes.slice(i + 1)) expect(overlaps(a, b), JSON.stringify([a, b])).toBe(false);
  }
}

// iPhone 16: 393 × 852.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

test('the oven tab in full screen on an iPhone 16 keeps every part of a pizza row apart', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'one phone size is enough');
  test.setTimeout(60_000);
  await page.goto(START);
  await page.getByLabel('Ovens').fill('2');
  await page.getByLabel('Bake minutes').fill('0');
  await page.getByLabel('Bake seconds').fill('5');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await page.getByRole('button', { name: 'NL', exact: true }).click();
  await tab(page, 'Bestellingen').click();
  for (const p of ['Quattro Formaggi', 'Margherita', 'Funghi']) await page.locator('.menu-item', { hasText: p }).first().click();
  await page.locator('.line-note').first().fill('Extra kaas, zonder basilicum, goed doorbakken');
  await page.getByRole('button', { name: 'Naar de keuken' }).click();
  await tab(page, 'Keuken').click();
  const prepared = page.locator('.kitchen-order').getByRole('button', { name: 'Belegd', exact: true });
  for (let left = 3; left > 0; left--) {
    await prepared.first().click();
    await expect(prepared).toHaveCount(left - 1);
  }

  await tab(page, 'Oven').click();
  await page.getByRole('button', { name: /Volledig scherm/ }).click();
  const rows = page.locator('.kitchen-order .pizzas li');
  await expect(rows).toHaveCount(3);
  // One baking (and soon done), one done waiting for its oven, one with two oven buttons.
  await rows.first().locator('.oven-in').first().click();
  await expect(rows.first().getByRole('timer')).toBeVisible();
  await expect(rows.first()).toHaveClass(/bake-done/, { timeout: 10_000 });
  for (let i = 0; i < 3; i++) await expectNoOverlap(rows.nth(i));
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(393);
  await page.screenshot({ path: 'test-results/oven-iphone16.png' });
});
