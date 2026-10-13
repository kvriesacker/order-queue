import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './password';

// The local Firebase emulator started by the Playwright config, never the real project.
const START = '?emulator=127.0.0.1#/';

function tab(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

test('the host sets the quick picks for pizza notes; with none only the free text is left', async ({ page }) => {
  await page.goto(START);
  // The standard picks to start with; remove them all.
  const editor = page.locator('app-quick-notes-editor');
  await expect(editor.locator('li.note-chip')).toHaveCount(6);
  await expect(editor).toContainText('Extra cheese');
  const removes = editor.getByRole('button', { name: /^Remove option/ });
  for (let left = 6; left > 0; left--) {
    await removes.first().click();
    await expect(removes).toHaveCount(left - 1);
  }
  await expect(editor).toContainText('No options: only the free text note per pizza.');
  await page.getByLabel('Queue password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);

  await tab(page, 'Orders').click();
  await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(page.locator('.line-note')).toBeVisible();
  await expect(page.locator('.quick-notes')).toHaveCount(0);

  // Added later in Settings, they show up when taking orders.
  await tab(page, 'Settings').click();
  const settings = page.locator('app-quick-notes-editor');
  for (const option of ['Half ham', 'Extra pikant']) {
    await settings.getByLabel('New option').fill(option);
    await settings.getByLabel('New option').press('Enter');
  }
  // Doubles are left out.
  await settings.getByLabel('New option').fill('half HAM');
  await settings.getByRole('button', { name: '+ Add option' }).click();
  await expect(settings.locator('li.note-chip')).toHaveText([/Half ham/, /Extra pikant/]);
  await settings.screenshot({ path: `test-results/quick-notes-settings-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await tab(page, 'Orders').click();
  // The pizza may still be in the order being taken; add it if not.
  if (!(await page.locator('.line-note').count())) await page.locator('.menu-item', { hasText: 'Margherita' }).click();
  await expect(page.locator('.line-note')).toHaveCount(1);
  const chips = page.locator('.quick-notes .note-chip');
  await expect(chips).toHaveText(['Half ham', 'Extra pikant']);
  await chips.filter({ hasText: 'Extra pikant' }).click();
  await chips.filter({ hasText: 'Half ham' }).click();
  await expect(page.locator('.line-note')).toHaveValue('Extra pikant, Half ham');
  await page.screenshot({ path: `test-results/quick-notes-${test.info().project.name}.png` });
  await chips.filter({ hasText: 'Extra pikant' }).click();
  await expect(page.locator('.line-note')).toHaveValue('Half ham');
});
