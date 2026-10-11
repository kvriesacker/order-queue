import { expect, test, type Page } from '@playwright/test';

// Nothing listens on this port, so the app never reaches a public broker during tests.
const START = '?broker=ws://127.0.0.1:9#/';

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
    const state = JSON.parse(localStorage.getItem(`pizza-queue:host:${id}`)!);
    return state.orders[0].id as string;
  }, queueId);
  expect(sent).toBe(drafted);

  // The phone page for that id is the order's own page (it waits for the order to show up).
  const phone = await context.newPage();
  await phone.goto(`/?broker=ws://127.0.0.1:9#/track/${sent}`);
  await expect(phone.locator('.track')).toBeVisible();
});
