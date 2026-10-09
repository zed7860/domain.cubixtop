import { test, expect } from '@playwright/test';

test('brand navigation puts web development last and supports keyboard closing', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    await expect(page.locator('.links > a')).toHaveCount(1);
    await expect(page.locator('.links > a')).toHaveText('Sign in ↗');
    const open = page.getByRole('button', {name:'Open navigation'});
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link',{name:/My domains/})).toHaveCount(0);
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

test('signed-in customers see their domains and account only inside the menu',async({page})=>{
  let signedIn=true;
  await page.route('**/api/auth',route=>{
    if(route.request().method()==='POST'){signedIn=false;return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{user:signedIn?{name:'Customer',email:'customer@example.invalid',role:'customer'}:null}});
  });
  await page.goto('/');
  await expect(page.locator('.links > a')).toHaveCount(0);
  await expect(page.getByRole('link',{name:/My domains/})).toHaveCount(0);
  await page.getByRole('button',{name:'Open navigation'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('link',{name:/My domains/})).toBeVisible();
  await expect(dialog.getByRole('link',{name:/Account/})).toBeVisible();
  await expect(dialog.getByRole('link',{name:/Admin/})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.locator('.links > a')).toHaveText('Sign in ↗');
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(dialog.getByRole('link',{name:/My domains/})).toHaveCount(0);
});
