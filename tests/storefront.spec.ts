import { test, expect } from '@playwright/test';
import { NameSiloRegistrar, normalizeDomain } from '../lib/registrar';
import { verifyCashfreeWebhook } from '../lib/cashfree';
import { createHmac } from 'node:crypto';

test('registrar parsing rejects ambiguous and failed responses without simulated availability',async()=>{
 const originalFetch=globalThis.fetch;const originalKey=process.env.NAMESILO_API_KEY;
 process.env.NAMESILO_API_KEY='fixture-not-a-live-key';
 try{
  expect(normalizeDomain('HTTPS://Example.COM/path')).toBe('example.com');
  for(const input of ['','bad..com','bad name.com','example.com?foo=1'])expect(()=>normalizeDomain(input)).toThrow();
  globalThis.fetch=async()=>Response.json({reply:{code:300,available:[{domain:'example.com',price:17.29}]}});
  expect(await new NameSiloRegistrar().search('example.com')).toMatchObject({available:true,price:17.29,verified:true,currency:'USD'});
  globalThis.fetch=async()=>Response.json({reply:{code:300,available:{domain:{domain:'example.com',price:17.29}}}});
  expect(await new NameSiloRegistrar().search('example.com')).toMatchObject({available:true,price:17.29,verified:true});
  globalThis.fetch=async()=>Response.json({reply:{code:300,unavailable:['example.com']}});
  expect(await new NameSiloRegistrar().search('example.com')).toMatchObject({available:false,price:null,verified:true});
  globalThis.fetch=async()=>Response.json({reply:{code:300}});
  await expect(new NameSiloRegistrar().search('example.com')).rejects.toThrow();
  globalThis.fetch=async()=>new Response('Temporarily Unavailable',{status:500});
  await expect(new NameSiloRegistrar().search('example.com')).rejects.toThrow();
 }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.NAMESILO_API_KEY;else process.env.NAMESILO_API_KEY=originalKey;}
});

test('Cashfree webhook signatures are verified from the untouched raw payload',async ()=>{const secret='test-secret',raw='{"data":{"order":{"order_id":"cubix_test"}}}',timestamp='1791360000';const signature=createHmac('sha256',secret).update(timestamp+raw).digest('base64');expect((await verifyCashfreeWebhook(raw,timestamp,signature,secret))).toBeTruthy();expect((await verifyCashfreeWebhook(raw+' ',timestamp,signature,secret))).toBeFalsy();});

test('upstream outage still offers an honest hosted checkout path',async({page})=>{
 await page.route('**/api/domains/search?*',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'NameSilo live search is temporarily unavailable.',domain:'outage-example.com'})}));
 await page.goto('/');await page.getByRole('textbox',{name:'Domain name'}).fill('outage-example.com');await page.getByRole('button',{name:'Find my domain'}).click();
 await expect(page.locator('main').getByRole('alert')).toContainText('temporarily unavailable');
 await page.getByRole('link',{name:'Continue with outage-example.com'}).click();
 await expect(page.getByRole('heading',{name:'outage-example.com'})).toBeVisible();
 await expect(page.getByText('Availability pending',{exact:true})).toBeVisible();
});

test('customer search, signup, checkout handoff and dashboard work on desktop and mobile',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Open navigation'}).click();
 await expect(page.getByRole('link',{name:/Web development/})).toHaveAttribute('href','https://www.cubixtop.com');
 await page.getByRole('button',{name:'Switch to night mode'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'Switch to day mode'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'Close navigation'}).click();
 await page.getByRole('textbox',{name:'Domain name'}).fill('test-cubixtop-example.com');
 await page.getByRole('button',{name:'Find my domain'}).click();
 await expect(page.getByRole('heading',{name:'test-cubixtop-example.com'})).toBeVisible();
 await expect(page.getByText('Continue to confirm current availability and pricing.')).toBeVisible();
 await page.getByRole('button',{name:'Add to cart'}).first().click();
 await page.getByRole('button',{name:'Open navigation'}).click();
 await expect(page.getByRole('link',{name:'Cart with 1 domains'})).toBeVisible();
 await page.getByRole('link',{name:'Cart with 1 domains'}).click();
 await expect(page.getByRole('heading',{name:'test-cubixtop-example.com'})).toBeVisible();
 await page.getByRole('button',{name:'Remove'}).click();
 await expect(page.getByText('Your cart is ready for a great name.')).toBeVisible();
 await page.goto('/');
 await page.getByRole('textbox',{name:'Domain name'}).fill('test-cubixtop-example.com');
 await page.getByRole('button',{name:'Find my domain'}).click();
 await page.getByRole('link',{name:'Buy now'}).click();
 await page.getByRole('button',{name:'Sign in to continue'}).click();
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByLabel('Your name').fill('Browser Customer');
 await page.getByLabel('Email address').fill('browser-'+Date.now()+'@example.com');
 await page.getByLabel('Password',{exact:true}).fill('Customer-Password-123456');
 await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page).toHaveURL(/\/checkout\?domain=/);
 await expect(page.getByRole('button',{name:'Pay securely'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 for(const path of ['/','/dashboard','/account','/checkout?domain=test-cubixtop-example.com']){await page.goto(path);await expect(page.locator('main')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();}
 await page.screenshot({path:'.local/mobile-checkout.png',fullPage:true});
});

test('ownership, admin protection, idempotent checkouts, CSRF and account lifecycle',async({playwright,request})=>{
 expect((await request.get('/api/orders')).status()).toBe(401);
 expect((await request.get('/api/domains/example.com/dns')).status()).toBe(401);
 expect((await request.post('/api/checkout',{data:{domain:'example.com'}})).status()).toBe(401);
 expect((await request.get('/api/domains/search?q=bad..com')).status()).toBe(400);
 const a=await playwright.request.newContext({baseURL:'http://127.0.0.1:3003'});
 const b=await playwright.request.newContext({baseURL:'http://127.0.0.1:3003'});
 const email='api-'+Date.now()+'@example.com';const password='Customer-Password-123456';
 expect((await a.post('/api/auth',{data:{action:'signup',name:'Customer A',email,password}})).status()).toBe(200);
 expect((await b.post('/api/auth',{data:{action:'signup',name:'Customer B',email:'b-'+email,password}})).status()).toBe(200);
 const payload={domain:'test-checkout-example.com'};
 const first=await (await a.post('/api/orders',{data:payload})).json();
 const second=await (await a.post('/api/orders',{data:payload})).json();
 expect(first.order.id).toBe(second.order.id);
 expect(first.order.domain).toBe('test-checkout-example.com');
 expect((await (await b.get('/api/orders')).json()).orders).toHaveLength(0);
 expect((await a.post('/api/orders',{data:payload,headers:{Origin:'https://attacker.invalid'}})).status()).toBe(403);
 const forbidden=await a.get('/admin',{maxRedirects:0});expect(forbidden.status()).toBe(307);expect(forbidden.headers().location).toBe('/dashboard');
 expect((await a.post('/api/account',{data:{action:'change_password',password,newPassword:'Replacement-Password-123456'}})).status()).toBe(200);
 expect((await a.post('/api/auth',{data:{action:'logout'}})).status()).toBe(200);
 expect((await a.get('/api/orders')).status()).toBe(401);
 expect((await a.post('/api/auth',{data:{action:'login',email,password}})).status()).toBe(401);
 expect((await a.post('/api/auth',{data:{action:'login',email,password:'Replacement-Password-123456'}})).status()).toBe(200);
 expect((await a.post('/api/account',{data:{action:'delete_account',password:'Replacement-Password-123456'}})).status()).toBe(200);
 expect((await a.get('/api/orders')).status()).toBe(401);
 await a.dispose();await b.dispose();
});

test('admin overview requires administrator session',async({page})=>{
 await page.goto('/admin');await expect(page).toHaveURL(/\/login/);
 await page.getByLabel('Email address').fill('admin@cubixtop.com');
 await page.getByLabel('Password',{exact:true}).fill('Test-Admin-Password-123456');
 await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Business control center'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Domain orders',level:2})).toBeVisible();
});

