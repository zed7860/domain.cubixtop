import { test, expect } from '@playwright/test';

test('brand navigation puts web development last and supports keyboard closing', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    await expect(page.locator('.links > :last-child')).toHaveText('Web development');
    const open = page.getByRole('button', {name:'Open navigation'});
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('nav a').last()).toHaveText(/Web development/);
    await expect(open).toHaveAttribute('aria-expanded','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(open).toBeFocused();
    await open.click();
    await dialog.getByRole('link',{name:/Help & support/}).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  }
});
