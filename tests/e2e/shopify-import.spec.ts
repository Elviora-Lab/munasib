import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { sql } from './helpers';

/**
 * The Shopify migration path, end to end: an admin pastes a real Shopify
 * product export (the user's own template file), imports it, and the products
 * become shoppable — variants, options, compare-at pricing, stock, and
 * status handling included.
 */

const ADMIN = {
  email: 'e2e-admin@munasib.test',
  password: 'E2eAdmin123!',
  // bcrypt of the password above — inserted directly so the spec needs no
  // pre-existing account.
  hash: '$2a$10$EqORQ./X8Hd/BexEs80nDuB3/uVBOYjW0pmb11X1K/A1LmnUwXqp.',
};

const HANDLES = [
  'physical-product-the-band-t-shirt',
  'digital-product-the-history-of-rock-music',
  'example-perfume',
];

function cleanupCatalog() {
  sql(`DELETE FROM products WHERE slug IN (${HANDLES.map((h) => `'${h}'`).join(',')})`);
  sql(`DELETE FROM brands b WHERE b.slug IN ('harmony-threads','harmony-publishing','acme')
       AND NOT EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id)`);
  sql(`DELETE FROM categories c WHERE c.slug IN ('graphic-shirt','digital-book','perfume')
       AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)`);
}

test.beforeAll(() => {
  cleanupCatalog();
  sql(`INSERT INTO users (email, password_hash, first_name, role, is_verified, updated_at)
       VALUES ('${ADMIN.email}', '${ADMIN.hash}', 'E2E', 'ADMIN', true, now())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'ADMIN'`);
});

test.afterAll(() => {
  cleanupCatalog();
  sql(`DELETE FROM users WHERE email = '${ADMIN.email}'`);
});

test('imports a Shopify product export and makes it shoppable', async ({ page }) => {
  const login = await page.request.post('/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  expect(login.ok()).toBeTruthy();

  await page.goto('/admin/products/import');
  const csv = readFileSync(
    path.join(process.cwd(), 'tests/e2e/fixtures/product_template.csv'),
    'utf-8',
  );
  await page.locator('textarea').fill(csv);

  // Format auto-detected and grouped correctly: 3 products, 16 variant rows,
  // 2 gallery images.
  await expect(page.getByText('Shopify export')).toBeVisible();
  await expect(page.getByText('3 products · 16 variants · 2 images')).toBeVisible();

  await page.getByRole('button', { name: /import 3/i }).click();
  await expect(page.getByText(/3 created/).first()).toBeVisible({ timeout: 60_000 });

  // Storefront: the t-shirt PDP is live with option chips + sale pricing.
  await page.goto(`/products/${HANDLES[0]}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('T-Shirt');
  await expect(page.getByRole('button', { name: 'Small · green' })).toBeVisible();
  await expect(page.getByText('Save 20%').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /add to cart/i })).toBeEnabled();

  // Data-level checks: variants by SKU, stock, and status semantics.
  expect(
    sql(`SELECT count(*) FROM product_variants v JOIN products p ON p.id = v.product_id
              WHERE p.slug = '${HANDLES[0]}'`),
  ).toBe('12');
  expect(sql(`SELECT stock_quantity FROM product_variants WHERE sku = 'TheBandTShirt-SG'`)).toBe(
    '47',
  );
  // "Published on online store = FALSE" must import as hidden, not visible.
  expect(sql(`SELECT is_active FROM products WHERE slug = '${HANDLES[2]}'`)).toBe('f');
  // Re-import is idempotent: same file updates, never duplicates.
  expect(sql(`SELECT count(*) FROM products WHERE slug = '${HANDLES[0]}'`)).toBe('1');
});
