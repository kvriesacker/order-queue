import { expect, test } from '@playwright/test';

// Nothing listens on this port, so the app never reaches a public broker during tests.
const START = '?broker=ws://127.0.0.1:9#/';

test('the app can be installed and opens without a connection', async ({ page, context, request }) => {
  await page.goto(START);
  await expect(page.getByRole('heading', { name: 'Start a new queue' })).toBeVisible();

  // An install manifest with a name, standalone display and the icons it names.
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe('Pizza queue');
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
  }

  // Once the app is saved on the device, it opens offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start a new queue' })).toBeVisible();
  await page.getByRole('button', { name: 'Start queue' }).click();
  await expect(page).toHaveURL(/#\/q\/\w+$/);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
  await context.setOffline(false);
});
