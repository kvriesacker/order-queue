import { expect, test } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

test('share link shows a QR code for other staff and copies the link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(START);
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  const id = page.url().split('/').pop()!;

  await page.getByRole('button', { name: 'Share link' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite your team' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.share-qr svg')).toBeVisible();
  await expect(dialog.locator('.share-link')).toContainText(`#/q/${id}`);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(dialog.getByRole('button', { name: '✓ Link copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`#/q/${id}`);
  expect(copied).toBe(await dialog.locator('.share-link').innerText());

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Share link' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});
