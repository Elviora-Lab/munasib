import { expect, test } from '@playwright/test';

import { sql } from './helpers';

test.describe.configure({ mode: 'serial' });

test('homepage renders the Munasib hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Everything your home runs on',
  );
  await expect(page.getByRole('link', { name: /shop best sellers/i })).toBeVisible();
});

test('header search routes to the search page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search products' }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Find what you need');
});

test('catalog renders product cards with prices', async ({ page }) => {
  await page.goto('/products');
  const cards = page.locator('article[data-track="product"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(
    cards
      .first()
      .getByText(/Rs\s?[\d,.]+/)
      .first(),
  ).toBeVisible();
});

test('guest can add to cart from the PDP', async ({ page }) => {
  // Pick a product that definitely has purchasable stock.
  const slug = sql(`
    SELECT p.slug FROM products p
    JOIN product_variants v ON v.product_id = p.id
    WHERE p.is_active AND v.is_active AND v.stock_quantity > 0
    ORDER BY p.created_at DESC LIMIT 1`);
  expect(slug).not.toBe('');

  await page.goto(`/products/${slug}`);
  const addButton = page.getByRole('button', { name: /add to cart/i });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  // Success feedback: toast + ember count badge on the cart trigger.
  await expect(page.getByText('Added to cart').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('header button[aria-label^="Open cart"] span').first()).toHaveText(
    /[1-9]/,
    { timeout: 20_000 },
  );
});

test('promo code chip copies WELCOME10', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const chip = page.getByRole('button', { name: /WELCOME10/ }).first();
  await chip.click();
  await expect(chip.getByText('Copied')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe('WELCOME10');
});

test('offer ticker deep-links to the savings ladder', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'See how Spend & Save works' }).click();
  await expect(page).toHaveURL(/#savings/);
  await expect(page.getByText('Bigger basket, bigger discount.')).toBeVisible();
});

test('bestseller ledger shows honest rank stamps', async ({ page }) => {
  await page.goto('/');
  const ledger = page.getByText('The bestseller ledger');
  await ledger.scrollIntoViewIfNeeded();
  await expect(page.getByText('01', { exact: true }).first()).toBeVisible();
});
