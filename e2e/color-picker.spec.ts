import { expect, test, type Locator, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

/** The picker must be big enough to tap, and nothing may cover it. */
async function expectUsable(picker: Locator) {
  const box = (await picker.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  expect(box.height).toBeGreaterThanOrEqual(32);
  const onTop = await picker.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  });
  expect(onTop).toBe(true);
}

async function startQueue(page: Page) {
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
}

async function order(page: Page, pizza: string) {
  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: pizza }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #\d+ sent/)).toBeVisible();
}

/** A tab in the top bar. */
function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

function chip(page: Page, pizza: string) {
  return page.locator('.chip', { hasText: pizza }).first();
}

test('the color pickers on the start page are big enough to use', async ({ page }) => {
  await page.goto(START);
  const pickers = page.locator('.menu-editor input[type=color]');
  await expect(pickers).toHaveCount(10);
  await pickers.first().scrollIntoViewIfNeeded();
  await expectUsable(pickers.first());
  const newPizza = page.getByLabel('Color for the new pizza');
  await newPizza.scrollIntoViewIfNeeded();
  await expectUsable(newPizza);
});

test('a color picked at the start shows in the kitchen and at the oven', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('Color for Margherita').fill('#00a000');
  await startQueue(page);
  await order(page, 'Margherita');
  await expect(page.locator('.menu-item', { hasText: 'Margherita' })).toHaveCSS(
    'border-left-color',
    'rgb(0, 160, 0)',
  );

  await tab(page, 'Kitchen').click();
  await expect(chip(page, 'Margherita')).toHaveCSS('background-color', 'rgb(0, 160, 0)');
  await page.getByRole('button', { name: 'Prepared' }).first().click();

  await tab(page, 'Oven').click();
  await expect(chip(page, 'Margherita')).toHaveCSS('background-color', 'rgb(0, 160, 0)');
});

test('a color changed in Settings is saved and used for new orders', async ({ page }) => {
  await page.goto(START);
  await startQueue(page);
  await tab(page, 'Settings').click();
  const picker = page.getByLabel('Color for Funghi');
  await picker.scrollIntoViewIfNeeded();
  await expectUsable(picker);
  await picker.fill('#0000ff');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  // Still there after a reload: it was saved with the queue.
  await page.reload();
  await expect(page.getByLabel('Color for Funghi')).toHaveValue('#0000ff');

  await order(page, 'Funghi');
  await tab(page, 'Kitchen').click();
  await expect(chip(page, 'Funghi')).toHaveCSS('background-color', 'rgb(0, 0, 255)');
});

test('a new pizza keeps the color picked for it', async ({ page }) => {
  await page.goto(START);
  await page.getByPlaceholder('Add a pizza…').fill('Salmone');
  await page.getByLabel('Color for the new pizza').fill('#ff00ff');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Color for Salmone')).toHaveValue('#ff00ff');
  await startQueue(page);
  await order(page, 'Salmone');
  await tab(page, 'Kitchen').click();
  await expect(chip(page, 'Salmone')).toHaveCSS('background-color', 'rgb(255, 0, 255)');
});
