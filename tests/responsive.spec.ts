import { test, expect } from '@playwright/test';

test('public pages and domain results fit phones, tablets and desktops in both themes', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/domains/search?*', route => route.fulfill({ json: {
    domain: 'responsive-example.com', available: true, price: 12, currency: 'USD', exchangeRate: 84,
    results: [{ domain: 'responsive-example.com', available: true, price: 12, currency: 'USD' }],
  } }));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.goto('/');
      await page.evaluate(value => {
        localStorage.setItem('cubixtop-theme', value);
      }, theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const toggle = page.getByRole('button', { name: `Switch to ${theme === 'light' ? 'night' : 'day'} mode` });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveText('');
      await page.getByRole('textbox', { name: 'Domain name' }).fill('responsive-example.com');
      await page.getByRole('button', { name: 'Find my domain' }).click();
      await expect(page.getByRole('heading', { name: 'responsive-example.com' })).toBeVisible();
      await page.getByRole('button', { name: '$ USD' }).click();
      await expect(page.locator('.price')).toContainText('$12.00');
      await page.getByRole('button', { name: '₹ INR' }).click();
      await expect(page.locator('.price')).toContainText('1,008');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (width === 390 || width === 1440) await page.screenshot({ path: `.local/home-${width}-${theme}.png`, fullPage: true });
      for (const path of ['/login', '/cart', '/help', '/terms', '/privacy', '/forgot-password', '/reset-password', '/verify', '/checkout?domain=responsive-example.com']) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path}, ${width}px, ${theme}`).toBeTruthy();
      }
    }
  }
  expect(errors).toEqual([]);
});
