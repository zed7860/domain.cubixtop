import {test,expect} from '@playwright/test';
import {readApiResponse} from '../lib/api-response';

test('empty, truncated, HTML and unexpected API responses produce useful errors',async()=>{
 for(const [response,expected] of [[new Response('',{status:500}),'empty response (HTTP 500)'],[new Response(''),'empty response'],[new Response('{"error":'),'unreadable response'],[new Response('<html>Proxy failed</html>',{status:502}),'unreadable response (HTTP 502)'],[Response.json(null),'incomplete response'],[Response.json([]),'incomplete response'],[Response.json({}),'incomplete response'],[new Response('',{status:401}),'session has expired']] as const){await expect(readApiResponse(response)).rejects.toThrow(expected);}
 expect(await readApiResponse(Response.json({error:'Email or password is incorrect.'},{status:401}))).toEqual({error:'Email or password is incorrect.'});
 expect(await readApiResponse(Response.json({ok:true}))).toEqual({ok:true});
});

test('login, admin settings and password forms recover from empty responses without browser errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().setExtraHTTPHeaders({'x-forwarded-for':'192.0.2.70'});
 await page.goto('/login');
 await page.route('**/api/auth',route=>route.request().method()==='POST'?route.fulfill({status:500,body:''}):route.continue());
 await page.getByLabel('Email address').fill('admin@cubixtop.com');await page.getByLabel('Password',{exact:true}).fill('Test-Admin-Password-123456');await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('main').getByRole('alert')).toContainText('empty response (HTTP 500)');await expect(page.locator('form').getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await page.unroute('**/api/auth');
 expect((await page.request.post('/api/auth',{data:{action:'login',email:'admin@cubixtop.com',password:'Test-Admin-Password-123456'}})).status()).toBe(200);
 await page.goto('/admin?section=integrations');
 const payment=page.locator('.settings-card').filter({has:page.getByRole('heading',{name:'Payment gateways',exact:true})});
 await page.route('**/api/admin/payments',route=>route.fulfill({status:502,body:''}));
 await payment.getByLabel('Payment gateway',{exact:true}).selectOption('cashfree');await payment.getByLabel('Cashfree App ID',{exact:true}).fill('fixture-app');await payment.getByLabel('Cashfree Secret key',{exact:true}).fill('fixture-secret');await payment.getByRole('button',{name:'Save and select gateway'}).click();await expect(payment.getByRole('alert')).toContainText('empty response (HTTP 502)');await expect(payment.getByRole('button',{name:'Save and select gateway'})).toBeEnabled();
 const registrar=page.locator('.settings-card').filter({has:page.getByRole('heading',{name:'Registrar integration',exact:true})});await page.route('**/api/admin/registrar',route=>route.fulfill({status:200,body:''}));await registrar.getByLabel('API key / access token').fill('fixture-registrar-key');await registrar.getByRole('button',{name:'Validate and save integration'}).click();await expect(registrar.getByRole('alert')).toContainText('empty response');
 await page.route('**/api/password',route=>route.fulfill({status:502,body:'<html>Gateway error</html>'}));await page.goto('/forgot-password');await page.getByLabel('Email address').fill('customer@example.com');await page.getByRole('button',{name:'Send reset link'}).click();await expect(page.locator('main').getByRole('alert')).toContainText('unreadable response (HTTP 502)');
 await page.goto('/reset-password?token=fixture');await page.getByLabel('New password').fill('Replacement-Test-Password-123456');await page.getByLabel('Confirm password',{exact:true}).fill('Replacement-Test-Password-123456');await page.getByRole('button',{name:'Update password'}).click();await expect(page.locator('main').getByRole('alert')).toContainText('unreadable response');
 expect(errors).toEqual([]);
});
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

test('authentication initialization failures return JSON and preserve the server diagnostic',async({playwright})=>{
 const root=mkdtempSync(join(process.cwd(),'.local','test-init-failure-')),blocked=join(root,'not-a-directory');writeFileSync(blocked,'fixture');
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3005'],{cwd:process.cwd(),env:{...process.env,DATA_DIRECTORY:blocked},stdio:['ignore','ignore','pipe']});
 let logs='';child.stderr.on('data',data=>{logs+=String(data);});
 const context=await playwright.request.newContext({baseURL:'http://127.0.0.1:3005'});
 try{
  let ready=false;
  for(let index=0;index<100;index++){try{const response=await context.get('/api/auth',{timeout:500});expect(response.status()).toBe(503);expect(response.headers()['content-type']).toContain('application/json');expect(await response.json()).toMatchObject({error:expect.stringContaining('server storage')});ready=true;break;}catch(error){if(child.exitCode!==null)throw new Error(logs||String(error));await new Promise(resolve=>setTimeout(resolve,50));}}
  expect(ready).toBe(true);
  const response=await context.post('/api/auth',{data:{action:'login',email:'fixture@example.invalid',password:'Fixture-Password-123456'}});expect(response.status()).toBe(503);expect((await response.json()).error).toContain('Sign-in service is unavailable');expect(logs).toContain('Authentication service initialization failed');
 }finally{await context.dispose();if(child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;}}
});

