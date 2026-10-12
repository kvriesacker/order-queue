import { expect, test } from '@playwright/test';
import { PASSWORD } from './password';

// These devices start without a language picked, as a new phone or tablet would.
test.use({ storageState: { cookies: [], origins: [] } });
const START = '?emulator=127.0.0.1#/';

test('the app speaks Dutch by default, and each device can switch', async ({ page }) => {
  await page.goto(START);
  await expect(page.getByRole('button', { name: 'Wachtrij starten' })).toBeVisible();
  await page.getByLabel('Wachtwoord van de wachtrij').fill(PASSWORD);
  await page.getByRole('button', { name: 'Wachtrij starten' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Bestellingen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');

  // Switched to English, it stays English after a reload.
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(nav.getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
  await page.reload();
  await expect(nav.getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'NL', exact: true }).click();
  await expect(nav.getByRole('link', { name: 'Keuken' })).toBeVisible();
});

test("devices that join and customer screens follow the queue's language from Settings", async ({ page, browser }) => {
  await page.goto(START);
  await page.getByLabel('Wachtwoord van de wachtrij').fill(PASSWORD);
  await page.getByRole('button', { name: 'Wachtrij starten' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const id = page.url().split('/q/')[1];
  await expect(page.getByText('Verbonden', { exact: true })).toBeVisible({ timeout: 20_000 });

  // In Settings the queue is set to English for everyone who joins.
  await page.getByRole('navigation').getByRole('link', { name: 'Instellingen' }).click();
  await page.getByLabel('Taal voor toestellen die meedoen').selectOption('en');
  // This device was never switched, so it follows too; it can still pick Dutch for itself.
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'NL', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Instellingen', exact: true })).toBeVisible();

  // A new device joining is in English.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/?emulator=127.0.0.1#/q/${id}/kitchen`);
  // Before it has the password it doesn't know the queue's language yet.
  await other.getByLabel('Wachtwoord van de wachtrij').fill(PASSWORD);
  await other.getByRole('button', { name: 'Deelnemen' }).click();
  await expect(other.getByRole('navigation').getByRole('link', { name: 'Kitchen', exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // The customer screen speaks the queue's language, not the Dutch this device picked...
  const screen = await page.context().newPage();
  await screen.goto(`/?emulator=127.0.0.1#/q/${id}/order-screen`);
  await expect(screen.getByText('Next customer')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Instellingen', exact: true })).toBeVisible();

  // ...and changes along when the queue goes back to Dutch.
  await page.getByLabel('Taal voor toestellen die meedoen').selectOption('nl');
  await expect(screen.getByText('Volgende klant')).toBeVisible({ timeout: 20_000 });
  await expect(other.getByRole('navigation').getByRole('link', { name: 'Keuken' })).toBeVisible({ timeout: 20_000 });
});
