import { expect, test } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

test('past queues can be removed from the start page', async ({ page }) => {
  for (const name of ['Friday market', 'Saturday party']) {
    await page.goto(START);
    await page.getByLabel('Shop name').fill(name);
    await page.getByLabel('Queue password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Start queue' }).click();
    await expect(page).toHaveURL(/#\/q\/\w+$/);
  }
  await page.goto(START);
  const rows = page.locator('.queue-row');
  await expect(rows).toHaveCount(2);

  // Changing your mind keeps it.
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Remove Friday market' }).click();
  await expect(rows).toHaveCount(2);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove Friday market' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Saturday party');

  // Gone for good on this device, orders and statistics included.
  await page.reload();
  await expect(rows).toHaveCount(1);
  const left = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /^pizza-queue:(host|copy|archive):/.test(k)),
  );
  expect(left).toHaveLength(1);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove Saturday party' }).click();
  await expect(page.getByRole('heading', { name: 'Your queues' })).toHaveCount(0);
});
