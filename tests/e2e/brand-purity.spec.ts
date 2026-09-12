import { expect, test } from '@playwright/test';

/**
 * The rebrand contract: no visitor-facing chrome or static page may mention
 * the legacy brand or read like a cosmetics store. Product DATA (names,
 * reviews) is excluded on catalog pages — it turns over with the catalog
 * import — so those pages are checked on their chrome only.
 */
const LEGACY = /elviora|kitchenly|cosmetic|makeup|lipstick|mascara|eyeliner|skincare|\bbeauty\b/i;

const STATIC_PAGES = [
  '/about',
  '/faq',
  '/shipping',
  '/contact',
  '/terms',
  '/privacy',
  '/accessibility',
  '/careers',
  '/press',
  '/login',
];

for (const path of STATIC_PAGES) {
  test(`no legacy/cosmetics copy on ${path}`, async ({ page }) => {
    await page.goto(path);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(LEGACY);
  });
}

test('home chrome is fully Munasib-branded', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Munasib/);
  const header = await page.locator('header').first().innerText();
  const footer = await page.locator('footer').first().innerText();
  expect(header + '\n' + footer).not.toMatch(LEGACY);
  expect(footer).toContain('Munasib');
});

test('catalog chrome is fully Munasib-branded', async ({ page }) => {
  await page.goto('/products');
  const header = await page.locator('header').first().innerText();
  const footer = await page.locator('footer').first().innerText();
  expect(header + '\n' + footer).not.toMatch(LEGACY);
});
