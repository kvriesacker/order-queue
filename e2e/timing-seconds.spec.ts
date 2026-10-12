import { expect, test } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

test('phase times are set in seconds; ready times stay in minutes', async ({ page }) => {
  await page.goto(START);
  const prepare = page.getByLabel(/^Prepare/);
  const bake = page.getByLabel(/^Bake/);
  const counter = page.getByLabel(/^Counter/);
  // The defaults, in seconds.
  await expect(prepare).toHaveValue('180');
  await expect(bake).toHaveValue('480');
  await expect(counter).toHaveValue('120');
  await expect(page.getByText('seconds per pizza in the kitchen')).toBeVisible();
  await prepare.fill('150');
  await bake.fill('455');
  await counter.fill('45');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  // Settings show the same seconds and say what the estimate uses, in minutes.
  await page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel(/^Prepare/)).toHaveValue('150');
  await expect(page.getByLabel(/^Bake/)).toHaveValue('455');
  await expect(page.getByLabel(/^Counter/)).toHaveValue('45');
  await expect(page.getByText(/prepare 2\.5 min per pizza, bake 7\.6 min, counter 0\.8 min/)).toBeVisible();

  // Changed later in Settings, to the second.
  await page.getByLabel(/^Bake/).fill('500');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Bake/)).toHaveValue('500');

  // An order's ready time is a clock time to the minute.
  await page.getByRole('navigation').getByRole('link', { name: 'Orders', exact: true }).click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await page.getByRole('button', { name: /Open orders/ }).click();
  await expect(page.locator('app-eta').first()).toContainText(/≈ \d{1,2}:\d{2}(\s?[AP]M)? · \d+ min/);
});
