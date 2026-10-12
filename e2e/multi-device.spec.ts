import { expect, test, type Browser, type Page } from '@playwright/test';
import { ENGLISH } from '../playwright.config';

// Several devices (each its own browser, as on separate phones and tablets) working on one
// queue through the local Firebase emulator started by the Playwright config.
const EMULATOR = '?emulator=127.0.0.1';
test.setTimeout(120_000);
// Syncing doesn't depend on screen size, so these run once (desktop) to keep the deploy quick.
test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'Runs on desktop only'));

async function device(browser: Browser, path = '') {
  const context = await browser.newContext({ storageState: ENGLISH });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  if (path) await page.goto(`/${EMULATOR}#${path}`);
  return page;
}

async function startQueue(browser: Browser, maxPizzas = 0) {
  const first = await device(browser, '/');
  if (maxPizzas) await first.getByLabel(/Pizzas available in total/).fill(String(maxPizzas));
  await first.getByRole('button', { name: 'Start queue' }).click();
  await expect(first).toHaveURL(/#\/q\/\w+$/);
  await expect(first.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  const id = first.url().split('/q/')[1];
  return { first, id };
}

/** Opens a station on a new device and waits until it has the queue. */
async function join(browser: Browser, id: string, station: string) {
  const page = await device(browser, `/q/${id}/${station}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => page.evaluate((id) => !!localStorage.getItem(`pizza-queue:copy:${id}`), id))
    .toBe(true);
  return page;
}

async function order(page: Page, pizzas: string[], customer: string) {
  for (const p of pizzas) await page.locator('.menu-item', { hasText: p }).click();
  await page.locator('input[name=customer]').fill(customer);
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
}

async function sentNumber(page: Page) {
  await expect(page.locator('.sent strong').first()).toHaveText(/#\d+/, { timeout: 20_000 });
  return Number((await page.locator('.sent strong').first().innerText()).replace('#', ''));
}

function stationOrder(page: Page, number: number) {
  return page.locator('.kitchen-order', { has: page.locator('.num', { hasText: `#${number}` }) });
}

async function markAll(page: Page, number: number, button: 'Prepared' | 'Baked', online = true) {
  const card = stationOrder(page, number);
  const buttons = card.getByRole('button', { name: button, exact: true });
  await expect(buttons.first()).toBeVisible({ timeout: 20_000 });
  for (let n = await buttons.count(); n > 0; n--) {
    // A tap that lands while the list redraws (a change from another device arriving) can
    // miss, as on a real screen; tap again then.
    await expect(async () => {
      if ((await buttons.count()) === n) await buttons.first().click({ timeout: 2000 });
      await expect(buttons).toHaveCount(n - 1, { timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  }
  if (online) await saved(page);
}

/** Waits until a device's own changes are saved online (it shows them straight away). */
async function saved(page: Page) {
  await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('orders, kitchen, oven and counter on separate devices work on one queue', async ({ browser }) => {
  const { first, id } = await startQueue(browser);
  await first.goto(`/${EMULATOR}#/q/${id}/counter`);
  const orders = await join(browser, id, 'take');
  const orders2 = await join(browser, id, 'take');
  const kitchen = await join(browser, id, 'kitchen');
  const oven = await join(browser, id, 'oven');

  // Two order takers at once still get different numbers.
  await Promise.all([order(orders, ['Margherita', 'Funghi'], 'Anna'), order(orders2, ['Diavola'], 'Bram')]);
  const anna = await sentNumber(orders);
  const bram = await sentNumber(orders2);
  expect([anna, bram].sort()).toEqual([1, 2]);

  // The kitchen gets both orders and prepares Anna's.
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(2);
  await markAll(kitchen, anna, 'Prepared');
  await expect(stationOrder(kitchen, anna)).toHaveCount(0);

  // The oven bakes it, then the counter calls it.
  await markAll(oven, anna, 'Baked');
  const card = first.locator('app-order-card', { hasText: `#${anna}` });
  await card.getByRole('button', { name: 'Ready for customer' }).click();

  // Every device sees the same queue.
  await orders.getByRole('button', { name: /Open orders/ }).click();
  await expect(orders.locator('.open-orders app-order-card', { hasText: `#${anna}` })).toContainText(/ready/i);
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(1);
  await expect(oven.locator('.kitchen-order')).toHaveCount(0);
});

test('no device has to stay open: the one that started the queue can leave', async ({ browser }) => {
  const { first, id } = await startQueue(browser);
  const firstContext = first.context();
  const orders = await join(browser, id, 'take');
  const kitchen = await join(browser, id, 'kitchen');
  const oven = await join(browser, id, 'oven');
  await order(orders, ['Margherita'], 'Anna');
  expect(await sentNumber(orders)).toBe(1);

  // The device that started the queue closes; nobody is asked to take over.
  await first.close();
  await expect(kitchen.getByRole('button', { name: 'Become host' })).toHaveCount(0);

  // Work goes on: numbers continue and every station follows.
  await order(orders, ['Funghi'], 'Bram');
  await expect(orders.locator('.sent strong').first()).toHaveText('#2', { timeout: 20_000 });
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(2);
  await markAll(kitchen, 2, 'Prepared');
  await expect(stationOrder(oven, 2)).toBeVisible();
  await markAll(oven, 2, 'Baked');

  // Settings can be changed from any device now, and apply everywhere.
  await kitchen.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();
  await kitchen.getByLabel('Price per pizza').fill('12');
  await kitchen.getByRole('button', { name: 'Save settings' }).click();
  await expect(kitchen.getByText('Saved.')).toBeVisible();
  await orders.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(orders.locator('.totals')).toContainText('1 × €12.00', { timeout: 20_000 });

  // It comes back later and has everything.
  const back = await firstContext.newPage();
  await back.goto(`/${EMULATOR}#/q/${id}/kitchen`);
  await expect(back.locator('.kitchen-order')).toHaveCount(1, { timeout: 20_000 });
  await expect(stationOrder(back, 1)).toBeVisible();
  await order(orders, [], 'Chris');
  await expect(orders.locator('.sent strong').first()).toHaveText('#3', { timeout: 20_000 });
  await expect(back.locator('.kitchen-order')).toHaveCount(2);
});

test('a device without internet keeps working and catches up when it is back', async ({ browser }) => {
  const { first, id } = await startQueue(browser);
  await first.goto(`/${EMULATOR}#/q/${id}/take`);
  const orders = await join(browser, id, 'take');
  const kitchen = await join(browser, id, 'kitchen');
  const oven = await join(browser, id, 'oven');
  await order(orders, ['Margherita'], 'Anna');
  expect(await sentNumber(orders)).toBe(1);
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(1);

  // The order taker's and the kitchen's wifi drop.
  await orders.context().setOffline(true);
  await kitchen.context().setOffline(true);
  await expect(orders.getByText('No internet connection')).toBeVisible();

  // The order taker takes an order: it waits for a number. The kitchen prepares Anna's.
  await order(orders, ['Hawaii'], 'Olivia');
  await expect(orders.getByText('Sending order…')).toBeVisible();
  await markAll(kitchen, 1, 'Prepared', false);

  // Meanwhile another order taker that's online goes first.
  await order(first, ['Funghi'], 'Bram');
  expect(await sentNumber(first)).toBe(2);
  await expect(stationOrder(oven, 1)).toHaveCount(0);

  // Back online: the waiting order gets the next number, the kitchen's taps arrive, and
  // nothing is lost.
  await orders.context().setOffline(false);
  await kitchen.context().setOffline(false);
  expect(await sentNumber(orders)).toBe(3);
  await expect(stationOrder(oven, 1)).toBeVisible({ timeout: 20_000 });
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(2);
  await expect(stationOrder(kitchen, 3)).toContainText('Olivia');
});

test('an order taken without internet is kept when the page is reloaded', async ({ browser }) => {
  const { first, id } = await startQueue(browser);
  await first.goto(`/${EMULATOR}#/q/${id}/take`);
  const kitchen = await join(browser, id, 'kitchen');
  await first.context().setOffline(true);
  await order(first, ['Margherita'], 'Anna');
  await expect(first.getByText('Sending order…')).toBeVisible();
  // The tab is closed before the connection is back; the order waits on the device.
  const context = first.context();
  await first.close();
  await context.setOffline(false);
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(0);
  const again = await context.newPage();
  await again.goto(`/${EMULATOR}#/q/${id}/take`);
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(1, { timeout: 20_000 });
  await expect(stationOrder(kitchen, 1)).toContainText('Anna');
});

test('two order takers together cannot sell more pizzas than there are', async ({ browser }) => {
  const { first, id } = await startQueue(browser, 3);
  await first.goto(`/${EMULATOR}#/q/${id}/take`);
  const other = await join(browser, id, 'take');
  await expect(other.getByText('3 pizzas left')).toBeVisible();
  // Both fill in an order and send it at the same moment.
  for (const [page, pizzas] of [[first, ['Margherita', 'Funghi']], [other, ['Diavola', 'Hawaii']]] as const) {
    for (const p of pizzas) await page.locator('.menu-item', { hasText: p }).click();
  }
  await Promise.all([first, other].map((p) => p.getByRole('button', { name: 'Send to kitchen' }).click()));
  // One of them gets the order in; the other is told and gets its order back to fix.
  await expect(async () => {
    const sent =
      (await first.locator('.sent:not(.refused):not(.pending)').count()) +
      (await other.locator('.sent:not(.refused):not(.pending)').count());
    const refused =
      (await first.locator('.sent.refused').count()) + (await other.locator('.sent.refused').count());
    expect([sent, refused]).toEqual([1, 1]);
  }).toPass({ timeout: 20_000 });
  for (const page of [first, other]) await expect(page.getByText('1 pizza left', { exact: true })).toBeVisible();
});

test("a customer's phone follows the order as the stations work on it", async ({ browser }) => {
  const { first, id } = await startQueue(browser);
  await first.goto(`/${EMULATOR}#/q/${id}/take`);
  const kitchen = await join(browser, id, 'kitchen');
  const oven = await join(browser, id, 'oven');
  await order(first, ['Margherita'], 'Anna');
  expect(await sentNumber(first)).toBe(1);
  const orderId = await first.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem(`pizza-queue:copy:${id}`)!);
    return state.orders[0].id as string;
  }, id);

  // The customer's phone isn't staff: it only gets the tracking link.
  const phone = await device(browser, `/track/${orderId}`);
  await expect(phone.locator('.track')).toContainText('Anna', { timeout: 20_000 });
  await markAll(kitchen, 1, 'Prepared');
  await markAll(oven, 1, 'Baked');
  await first.getByRole('navigation').getByRole('link', { name: 'Counter' }).click();
  await first
    .locator('app-order-card', { hasText: '#1' })
    .getByRole('button', { name: 'Ready for customer' })
    .click();
  await expect(phone.locator('.track')).toHaveClass(/is-ready/, { timeout: 20_000 });
  const copies = await phone.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':copy:')));
  expect(copies).toEqual([]);
});
