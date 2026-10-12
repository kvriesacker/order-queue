import { expect, test, type Page } from '@playwright/test';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('the customer screen follows the order as it is taken', async ({ page, context }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await tab(page, 'Orders').click();

  // The order taker opens the customer screen in a second window.
  const [screen] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Customer screen ↗' }).click(),
  ]);
  await screen.waitForLoadState();
  await expect(screen.getByText('Next customer')).toBeVisible();
  await expect(screen.locator('.qr svg')).toHaveCount(0);

  // While the order is taken, the customer sees it and can already scan the QR code.
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.locator('.menu-item', { hasText: 'Funghi' }).click();
  await page.locator('input[name=customer]').fill('Anna');
  const lines = screen.locator('.os-lines li');
  await expect(lines).toHaveText([/2× Margherita/, /1× Funghi/]);
  await expect(screen.locator('.os-name')).toHaveText('Anna');
  await expect(screen.getByText('Scan me to follow your order')).toBeVisible();
  await expect(screen.locator('.qr svg')).toBeVisible();
  // Removing a pizza shows at once.
  await page.getByRole('button', { name: 'Remove this pizza' }).last().click();
  await expect(lines).toHaveText([/2× Margherita/]);

  // Sent: the number and time show, and the QR code stays...
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
  await expect(screen.locator('.os-number')).toHaveText('1');
  await expect(screen.locator('.os-pizzas:not(.os-paid)')).toHaveText('2× Margherita');
  await expect(screen.locator('.qr svg')).toBeVisible();

  // ...until the order taker hides it, and can show it again.
  await page.getByRole('button', { name: 'Hide QR code' }).click();
  await expect(screen.locator('.qr svg')).toHaveCount(0);
  await expect(screen.locator('.os-number')).toHaveText('1');
  await page.getByRole('button', { name: 'Show QR code' }).click();
  await expect(screen.locator('.qr svg')).toBeVisible();

  // The customer has gone: Next customer clears the screen before the next order starts.
  await page.locator('.sent').getByRole('button', { name: 'Next customer' }).click();
  await expect(screen.getByText('Next customer')).toBeVisible();
  await expect(screen.locator('.qr svg')).toHaveCount(0);
  await expect(screen.locator('.os-number')).toHaveCount(0);
  await expect(page.locator('.sent')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Open orders/ })).toContainText('1');

  // The next customer's order takes over the screen.
  await page.locator('.menu-item', { hasText: 'Diavola' }).click();
  await expect(lines).toHaveText([/1× Diavola/]);
  await expect(screen.locator('.qr svg')).toBeVisible();

  const width = await screen.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(screen.viewportSize()!.width);
});

test('the QR code shown while ordering is for the order that gets sent', async ({ page, context }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await tab(page, 'Orders').click();
  const queueId = page.url().split('/q/')[1].split('/')[0];
  const [screen] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Customer screen ↗' }).click(),
  ]);
  await screen.waitForLoadState();
  // Listen in on what the Orders tab tells the screen.
  await screen.evaluate((id) => {
    const w = window as unknown as { lastDraft: { orderId: string; pizzas: unknown[] } };
    new BroadcastChannel(`pizza-queue-draft-${id}`).onmessage = (e) => (w.lastDraft = e.data);
  }, queueId);
  await page.locator('.menu-item', { hasText: 'Hawaii' }).click();
  await expect(screen.locator('.qr svg')).toBeVisible();
  const drafted = await screen.evaluate(
    () => (window as unknown as { lastDraft: { orderId: string } }).lastDraft.orderId,
  );

  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(page.getByText(/Order #1 sent/)).toBeVisible();
  const sent = await page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem(`pizza-queue:copy:${id}`)!);
    return state.orders[0].id as string;
  }, queueId);
  expect(sent).toBe(drafted);

  // The QR code opens that order in the customer's own follow app, never in this staff app.
  await expect(screen.locator('.qr')).toHaveAttribute(
    'data-link',
    `https://kvriesacker.github.io/order-follow/?emulator=127.0.0.1#/${sent}`,
  );
});

test('an order link from before the follow app opens that order in the follow app', async ({ page }) => {
  await page.route('https://kvriesacker.github.io/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Follow app</p>' }),
  );
  await page.goto('/?emulator=127.0.0.1#/track/abc123');
  await expect(page).toHaveURL('https://kvriesacker.github.io/order-follow/?emulator=127.0.0.1#/abc123');
  await expect(page.getByText('Follow app')).toBeVisible();
});

test('the customer screen lists the pizzas and warns when they are almost sold out', async ({ page, context }) => {
  await page.goto(START);
  await page.getByLabel(/Pizzas available in total/).fill('8');
  await page.getByLabel('Maximum Margherita').fill('2');
  await page.getByLabel('Maximum Funghi').fill('10');
  await page.getByRole('button', { name: 'Start queue' }).click();
  await tab(page, 'Orders').click();
  const [screen] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Customer screen ↗' }).click(),
  ]);
  await screen.waitForLoadState();
  const item = (name: string) => screen.locator('.os-menu li', { hasText: name });

  // Waiting for the next customer: every pizza on sale, the ones with few left marked.
  await expect(screen.getByText('Next customer')).toBeVisible();
  await expect(item('Margherita')).toContainText('Only 2 left');
  await expect(item('Funghi')).toBeVisible();
  await expect(item('Funghi').locator('.os-left')).toHaveCount(0);
  await expect(screen.locator('.os-total-left')).toHaveCount(0);

  // While ordering, it counts what's in the order: the customer sees what they can still add.
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(item('Margherita')).toContainText('Only 1 left');
  await page.locator('.menu-item', { hasText: 'Funghi' }).click();
  await page.locator('.menu-item', { hasText: 'Funghi' }).click();
  await expect(screen.locator('.os-total-left')).toHaveText(/Only 5 pizzas left after this order/);
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(item('Margherita').locator('.os-left')).toHaveText('Sold out');
  await expect(screen.locator('.os-total-left')).toHaveText(/Only 4 pizzas left after this order/);

  // Once sent, the screen is about the order; the list is back for the next customer.
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await expect(screen.locator('.os-number')).toHaveText('1');
  await expect(screen.locator('.os-menu')).toHaveCount(0);
  await page.locator('.sent').getByRole('button', { name: 'Next customer' }).click();
  await expect(item('Margherita').locator('.os-left')).toHaveText('Sold out');
  await expect(screen.locator('.os-total-left')).toHaveText(/^\s*Only 4 pizzas left\s*$/);

  const width = await screen.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(screen.viewportSize()!.width);
});
