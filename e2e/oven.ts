import { expect, type Locator } from '@playwright/test';

/**
 * The oven's first step: puts `count` pizzas waiting in an order card (or a list of them) in
 * the oven, so they get their Baked button. With one oven the button is "In the oven".
 */
export async function putInOven(where: Locator, count?: number): Promise<void> {
  const buttons = where.getByRole('button', { name: /^In (the oven|oven \d+)$/ });
  await expect(buttons.first()).toBeVisible({ timeout: 20_000 });
  const total = await buttons.count();
  for (let left = total; left > total - (count ?? total); left--) {
    await expect(async () => {
      if ((await buttons.count()) === left) await buttons.first().click({ timeout: 2000 });
      await expect(buttons).toHaveCount(left - 1, { timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  }
}
