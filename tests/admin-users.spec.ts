import { test, expect } from '@playwright/test';

test('admin can find all registered users and inspect profiles; customers cannot access profiles', async ({ page, playwright, request }) => {
  const email = `profile-${Date.now()}@example.com`;
  const password = 'Profile-Test-Password-123456';
  const customer = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3003' });
  try {
    const signup = await customer.post('/api/auth', { data: { action: 'signup', name: 'Profile Customer', email, password } });
    expect(signup.status()).toBe(200);
    const { user } = await signup.json();
    const path = `/admin/users/${user.id}`;
    const anonymous = await request.get(path, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers().location).toContain('/login');
    const forbidden = await customer.get(path, { maxRedirects: 0 });
    expect(forbidden.status()).toBe(307);
    expect(forbidden.headers().location).toBe('/dashboard');
    await page.goto('/login?next=/admin');
    await page.getByLabel('Email address').fill('admin@cubixtop.com');
    await page.getByLabel('Password', { exact: true }).fill('Test-Admin-Password-123456');
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Registered users', exact: true })).toBeVisible();
    await page.getByLabel('Search users by name or email').fill(email);
    await page.getByRole('button', { name: 'Search users', exact: true }).click();
    await expect(page.locator('.admin-users tbody tr')).toHaveCount(1);
    await expect(page.locator('.admin-users tbody')).toContainText('0 / 0');
    await page.getByRole('link', { name: `View profile for ${email}` }).click();
    await expect(page.getByRole('heading', { name: 'Profile Customer', exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText(email);
    await expect(page.locator('main')).toContainText('Phone and address have not been collected.');
    await expect(page.locator('main')).not.toContainText(password);
    expect(await customer.post('/api/orders', { data: { domain: 'profile-customer.com' } }).then(response => response.status())).toBe(200);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'profile-customer.com', exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText('Registrant contact details have not been provided.');
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.goto(`/admin?q=${encodeURIComponent(email)}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.goto(path);
    }
    await page.goto('/admin?q=no-such-user-profile');
    await expect(page.getByText('No users match this search.')).toBeVisible();
    await page.goto('/admin/users/no-such-user');
    await expect(page.getByText('This page could not be found.')).toBeVisible();
  } finally { await customer.dispose(); }
});
