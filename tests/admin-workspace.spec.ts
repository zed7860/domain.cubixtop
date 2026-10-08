import { test, expect } from '@playwright/test';

test('admin workspace navigation, filters, exports, support notes and session controls work', async ({ page, playwright, request }) => {
  test.setTimeout(60000);
  // Model independent clients so this test does not consume other tests' per-IP login quota.
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.25' });
  const email = `workspace-${Date.now()}@example.com`;
  const customer = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3003', extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.26' } });
  const signup = await customer.post('/api/auth', { data: { action: 'signup', name: '=Workspace Customer', email, password: 'Workspace-Password-123456' } });
  expect(signup.status()).toBe(200);
  const { user } = await signup.json();
  const endpoint = `/api/admin/users/${user.id}`;
  try {
    expect((await request.get('/api/admin/export?kind=customers')).status()).toBe(401);
    expect((await customer.get('/api/admin/export?kind=customers')).status()).toBe(403);
    expect((await customer.post(endpoint, { data: { action: 'save_note', note: 'forbidden' } })).status()).toBe(403);
    expect((await customer.post('/api/orders', { data: { domain: 'workspace-customer.com' } })).status()).toBe(200);
    const login = await page.request.post('/api/auth', { data: { action: 'login', email: 'admin@cubixtop.com', password: 'Test-Admin-Password-123456' } });
    expect(login.status()).toBe(200);
    await page.goto('/admin');
    await expect(page.locator('.admin-metrics')).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const section of ['overview', 'customers', 'orders', 'payments', 'review', 'integrations', 'security', 'activity']) {
        await page.goto(`/admin?section=${section}`);
        await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${section} at ${width}px`).toBeTruthy();
        if (width === 1440 && section === 'overview') await page.screenshot({ path: '.local/admin-overview-desktop.png', fullPage: true });
        if (width === 320 && section === 'overview') await page.screenshot({ path: '.local/admin-overview-mobile.png', fullPage: true });
      }
    }
    await page.evaluate(() => localStorage.setItem('cubixtop-theme', 'dark'));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const section of ['overview', 'customers', 'orders', 'payments', 'review', 'integrations', 'security', 'activity']) {
      await page.goto(`/admin?section=${section}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${section}, dark mode`).toBeTruthy();
    }
    await page.goto('/admin?section=orders');
    await page.getByLabel('Search domain or email').fill('workspace-customer.com');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('.records-card tbody tr')).toHaveCount(1);
    await page.getByLabel('Order status', { exact: true }).selectOption('active');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('No matching records.')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Order status', { exact: true })).toHaveValue('active');
    const csv = await page.request.get('/api/admin/export?kind=customers');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-disposition']).toContain('attachment');
    const body = await csv.text();
    expect(body).toContain(email);
    expect(body).toContain("'=Workspace Customer");
    expect(body).not.toContain('password');
    expect((await page.request.get('/api/admin/export?kind=__proto__')).status()).toBe(400);
    for (const kind of ['orders','payments']) expect((await page.request.get(`/api/admin/export?kind=${kind}`)).status()).toBe(200);
    expect((await page.request.post(endpoint, { data: { action: 'save_note', note: 'x'.repeat(4001) } })).status()).toBe(400);
    expect((await page.request.post(endpoint, { headers: { Origin: 'https://attacker.invalid' }, data: { action: 'revoke_sessions' } })).status()).toBe(403);
    await page.goto(`/admin/users/${user.id}`);
    await page.getByLabel('Private support note').fill('Follow up on this customer’s domain order.');
    await page.getByRole('button', { name: 'Save support note' }).click();
    await expect(page.getByRole('status')).toContainText('saved');
    await page.reload();
    await expect(page.getByLabel('Private support note')).toHaveValue('Follow up on this customer’s domain order.');
    await page.getByRole('button', { name: 'Sign out all sessions' }).click();
    await page.getByRole('button', { name: 'Confirm sign out' }).click();
    await expect(page.getByRole('status')).toContainText('signed out');
    expect((await customer.get('/api/orders')).status()).toBe(401);
    await page.goto('/admin?section=activity');
    await expect(page.locator('main')).toContainText('support note updated');
    await expect(page.locator('main')).toContainText('customer sessions revoked');
    await expect(page.locator('main')).toContainText(email);
  } finally { await customer.dispose(); }
});
