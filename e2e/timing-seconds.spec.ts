import { expect, test } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

test('phase times are set in minutes and seconds; ready times stay in minutes', async ({ page }) => {
  await page.goto(START);
  const time = (phase: string) => [page.getByLabel(`${phase} minutes`), page.getByLabel(`${phase} seconds`)];
  const expectTime = async (phase: string, min: string, sec: string) => {
    const [m, s] = time(phase);
    await expect(m).toHaveValue(min);
    await expect(s).toHaveValue(sec);
  };
  const setTime = async (phase: string, min: string, sec: string) => {
    const [m, s] = time(phase);
    await m.fill(min);
    await s.fill(sec);
  };
  // The defaults, in minutes and seconds (two boxes each).
  await expectTime('Prepare', '3', '0');
  await expectTime('Bake', '8', '0');
  await expectTime('Counter', '2', '0');
  await expect(page.getByText('per pizza in the kitchen')).toBeVisible();
  await setTime('Prepare', '2', '30');
  await setTime('Bake', '7', '35');
  await setTime('Counter', '0', '45');
  // Seconds above 59 aren't taken.
  await page.getByLabel('Counter seconds').fill('75');
  await page.getByLabel('Counter seconds').fill('45');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  // Settings show the same seconds and say what the estimate uses, in minutes.
  await page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true }).click();
  await expectTime('Prepare', '2', '30');
  await expectTime('Bake', '7', '35');
  await expectTime('Counter', '0', '45');
  await expect(page.getByText(/prepare 2\.5 min per pizza, bake 7\.6 min, counter 0\.8 min/)).toBeVisible();

  // Changed later in Settings, to the second.
  await setTime('Bake', '8', '20');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expectTime('Bake', '8', '20');
  await page.locator('app-timing-editor').screenshot({ path: `test-results/timing-min-sec-${test.info().project.name}.png` });

  // An order's ready time is a clock time to the minute.
  await page.getByRole('navigation').getByRole('link', { name: 'Orders', exact: true }).click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await page.getByRole('button', { name: 'Send to kitchen' }).click();
  await page.getByRole('button', { name: /Open orders/ }).click();
  await expect(page.locator('app-eta').first()).toContainText(/≈ \d{1,2}:\d{2}(\s?[AP]M)? · \d+ min/);
});
