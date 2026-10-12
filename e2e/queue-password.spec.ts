import { expect, test } from '@playwright/test';
import { ENGLISH } from '../playwright.config';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

test('a queue needs a password to start', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page.getByText('Choose a queue password of at least 4 characters.')).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByLabel('Queue password').fill('abc');
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page.getByText('Choose a queue password of at least 4 characters.')).toBeVisible();
});

test('staff with only the link must give the password before they see anything', async ({ page, browser }) => {
  await page.goto(START);
  await page.locator('input[name=name]').fill('Napoli');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  const id = page.url().split('/q/')[1];

  // The share dialog reminds who starts it that the team needs the password too.
  await page.getByRole('button', { name: 'Share link' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('They also need the queue password:');
  await expect(dialog.getByText(PASSWORD)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Show password' }).click();
  await expect(dialog.getByText(PASSWORD)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  const other = await (await browser.newContext({ storageState: ENGLISH })).newPage();
  for (const path of [`/q/${id}/kitchen`, `/q/${id}/display`, `/q/${id}/order-screen`]) {
    await other.goto(`/${START.split('#')[0]}#${path}`);
    await expect(other.getByRole('heading', { name: 'This queue has a password' })).toBeVisible({ timeout: 20_000 });
    await expect(other.getByText('Napoli')).toHaveCount(0);
    await expect(other.getByRole('navigation')).toHaveCount(0);
  }

  await other.getByLabel('Queue password').fill('wrong-one');
  await other.getByRole('button', { name: 'Join' }).click();
  await expect(other.getByText('That password isn’t right. Try again.')).toBeVisible({ timeout: 20_000 });
  await other.getByLabel('Queue password').fill(PASSWORD);
  await other.getByRole('button', { name: 'Join' }).click();
  await expect(other.getByText('Next customer')).toBeVisible({ timeout: 20_000 });
  await expect(other.getByText('Napoli')).toBeVisible();

  // The device remembers it: the kitchen opens straight away.
  await other.goto(`/${START.split('#')[0]}#/q/${id}/kitchen`);
  await expect(other.getByRole('navigation').getByRole('link', { name: 'Kitchen', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(other.getByRole('heading', { name: 'This queue has a password' })).toHaveCount(0);
});
