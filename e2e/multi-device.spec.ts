import { expect, test, type Browser, type Page } from '@playwright/test';

// Several devices (each its own browser, as on separate phones and tablets) working on one
// queue through the local test broker started by the Playwright config.
const BROKER = '?broker=ws://127.0.0.1:8884';
// Takeovers wait for the host's absence to be noticed and for competing claims.
test.setTimeout(150_000);
// Syncing doesn't depend on screen size, so these run once (desktop) to keep the deploy quick.
test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'Runs on desktop only'));

async function device(browser: Browser, path = '') {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  if (path) await page.goto(`/${BROKER}#${path}`);
  return page;
}

async function startQueue(browser: Browser) {
  const host = await device(browser, '/');
  await host.getByRole('button', { name: 'Start queue' }).click();
  await expect(host).toHaveURL(/#\/q\/\w+$/);
  await expect(host.getByText(/Hosting/)).toBeVisible();
  const id = host.url().split('/q/')[1];
  return { host, id };
}

/** Opens a station on a new device and waits until it has the queue. */
async function join(browser: Browser, id: string, station: string) {
  const page = await device(browser, `/q/${id}/${station}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 });
  // Staff devices keep a copy of the queue once it arrives; only then can they take over.
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

function stationOrder(page: Page, number: number) {
  return page.locator('.kitchen-order', { has: page.locator('.num', { hasText: `#${number}` }) });
}

async function markAll(page: Page, number: number, button: 'Prepared' | 'Baked') {
  const card = stationOrder(page, number);
  const buttons = card.getByRole('button', { name: button, exact: true });
  await expect(buttons.first()).toBeVisible();
  for (let n = await buttons.count(); n > 0; n--) {
    // A tap that lands while the list redraws (a change from another device arriving) can
    // miss, as on a real screen; tap again then.
    await expect(async () => {
      if ((await buttons.count()) === n) await buttons.first().click({ timeout: 2000 });
      await expect(buttons).toHaveCount(n - 1, { timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  }
}

test('orders, kitchen, oven and counter on separate devices work on one queue', async ({ browser }) => {
  const { host, id } = await startQueue(browser);
  await host.goto(`/${BROKER}#/q/${id}/counter`);
  const orders = await join(browser, id, 'take');
  const orders2 = await join(browser, id, 'take');
  const kitchen = await join(browser, id, 'kitchen');
  const oven = await join(browser, id, 'oven');
  await expect(host.getByText('Hosting · 4 devices')).toBeVisible({ timeout: 20_000 });

  // Two order takers at once still get different numbers.
  await Promise.all([order(orders, ['Margherita', 'Funghi'], 'Anna'), order(orders2, ['Diavola'], 'Bram')]);
  await expect(orders.locator('.sent')).toContainText(/Order #\d sent/);
  await expect(orders2.locator('.sent')).toContainText(/Order #\d sent/);
  const numbers = [
    Number((await orders.locator('.sent strong').first().innerText()).replace('#', '')),
    Number((await orders2.locator('.sent strong').first().innerText()).replace('#', '')),
  ].sort();
  expect(numbers).toEqual([1, 2]);
  const anna = numbers[0] === 1 && (await orders.locator('.sent strong').first().innerText()) === '#1' ? 1 : 2;

  // The kitchen gets both orders and prepares Anna's.
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(2);
  await markAll(kitchen, anna, 'Prepared');
  await expect(stationOrder(kitchen, anna)).toHaveCount(0);

  // The oven bakes it, then the counter calls it.
  await markAll(oven, anna, 'Baked');
  const card = host.locator('app-order-card', { hasText: `#${anna}` });
  await card.getByRole('button', { name: 'Ready for customer' }).click();

  // Every device sees the same queue.
  await orders.getByRole('button', { name: /Open orders/ }).click();
  await expect(orders.locator('.open-orders app-order-card', { hasText: `#${anna}` })).toContainText(/ready/i);
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(1);
  await expect(oven.locator('.kitchen-order')).toHaveCount(0);
});

test('when the host is gone, another device takes over and the work goes on', async ({ browser }) => {
  const { host, id } = await startQueue(browser);
  const hostContext = host.context();
  const orders = await join(browser, id, 'take');
  const kitchen = await join(browser, id, 'kitchen');
  const oven = await join(browser, id, 'oven');
  await order(orders, ['Margherita'], 'Anna');
  await expect(orders.locator('.sent')).toContainText('Order #1 sent');
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(1);

  // The host's tab closes: the others notice and offer to take over.
  await host.close();
  for (const page of [orders, kitchen, oven]) {
    await expect(page.getByText(/host is offline/)).toBeVisible({ timeout: 20_000 });
  }

  // The kitchen takes over.
  await kitchen.getByRole('button', { name: 'Become host' }).click();
  await expect(kitchen.getByText('This tab holds the queue')).toBeVisible({ timeout: 20_000 });
  for (const page of [orders, oven]) {
    await expect(page.getByText(/host is offline/)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Become host' })).toHaveCount(0);
  }

  // Work goes on with the new host: numbers continue and every station follows.
  await order(orders, ['Funghi'], 'Bram');
  await expect(orders.locator('.sent')).toContainText('Order #2 sent', { timeout: 20_000 });
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(2);
  await markAll(kitchen, 2, 'Prepared');
  await expect(stationOrder(oven, 2)).toBeVisible();
  await markAll(oven, 2, 'Baked');

  // The old host comes back: it follows the new host instead of overwriting the queue.
  const back = await hostContext.newPage();
  await back.goto(`/${BROKER}#/q/${id}/kitchen`);
  await expect(back.locator('.kitchen-order')).toHaveCount(1, { timeout: 20_000 });
  await expect(stationOrder(back, 1)).toBeVisible();
  await expect(back.getByText('This tab holds the queue')).toHaveCount(0);
  await expect(kitchen.getByText('This tab holds the queue')).toBeVisible();
  await order(orders, ['Diavola'], 'Chris');
  await expect(orders.locator('.sent')).toContainText('Order #3 sent', { timeout: 20_000 });
  await expect(back.locator('.kitchen-order')).toHaveCount(2);
});

test('two devices pressing "Become host" at once end up with exactly one host', async ({ browser }) => {
  const { host, id } = await startQueue(browser);
  const a = await join(browser, id, 'kitchen');
  const b = await join(browser, id, 'oven');
  await host.close();
  for (const page of [a, b]) await expect(page.getByText(/host is offline/)).toBeVisible({ timeout: 20_000 });
  await Promise.all([
    a.getByRole('button', { name: 'Become host' }).click(),
    b.getByRole('button', { name: 'Become host' }).click(),
  ]);
  await expect(async () => {
    const hosts = [
      await a.getByText('This tab holds the queue').count(),
      await b.getByText('This tab holds the queue').count(),
    ];
    expect(hosts.reduce((x, y) => x + y)).toBe(1);
  }).toPass({ timeout: 20_000 });
  // The other one follows the winner.
  for (const page of [a, b]) await expect(page.getByText(/host is offline/)).toBeHidden({ timeout: 20_000 });
});

test('a host that loses its connection and comes back after a takeover follows the new host', async ({
  browser,
}) => {
  const { host, id } = await startQueue(browser);
  const orders = await join(browser, id, 'take');
  const kitchen = await join(browser, id, 'kitchen');
  await order(orders, ['Margherita'], 'Anna');
  await expect(orders.locator('.sent')).toContainText('Order #1 sent');
  await host.getByRole('navigation').getByRole('link', { name: 'Orders', exact: true }).click();

  // The host's wifi drops while its tab stays open, and it keeps taking orders.
  await host.context().setOffline(true);
  await order(host, ['Hawaii'], 'Olivia');
  await expect(host.locator('.sent')).toContainText('Order #2 sent');

  // The others notice once the host has been silent for a while, and the kitchen takes over.
  await expect(kitchen.getByText(/host is offline/)).toBeVisible({ timeout: 90_000 });
  await kitchen.getByRole('button', { name: 'Become host' }).click();
  await expect(kitchen.getByText('This tab holds the queue')).toBeVisible({ timeout: 20_000 });
  await order(orders, ['Funghi'], 'Bram');
  await expect(orders.locator('.sent')).toContainText('Order #2 sent', { timeout: 20_000 });

  // Its connection comes back: it follows the new host, and the order it took offline isn't
  // lost but gets the next number.
  await host.context().setOffline(false);
  await expect(host.getByText('This tab holds the queue')).toHaveCount(0, { timeout: 30_000 });
  await expect(host.locator('.sent')).toContainText('Order #3 sent', { timeout: 30_000 });
  await expect(kitchen.getByText('This tab holds the queue')).toBeVisible();
  await expect(kitchen.locator('.kitchen-order')).toHaveCount(3);
  await expect(stationOrder(kitchen, 3)).toContainText('Olivia');
  await order(orders, ['Diavola'], 'Chris');
  await expect(orders.locator('.sent')).toContainText('Order #4 sent', { timeout: 20_000 });
  await host.getByRole('navigation').getByRole('link', { name: 'Kitchen', exact: true }).click();
  await expect(host.locator('.kitchen-order')).toHaveCount(4);
});

test('the host reloading its page does not make the others offer to take over', async ({ browser }) => {
  const { host, id } = await startQueue(browser);
  const kitchen = await join(browser, id, 'kitchen');
  await host.reload();
  await expect(host.getByText(/Hosting/)).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await expect(kitchen.getByRole('button', { name: 'Become host' })).toHaveCount(0);
    await kitchen.waitForTimeout(1000);
  }
  await expect(kitchen.getByText('Connected', { exact: true })).toBeVisible();
});
