import {test,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {db,type Checkout} from '../lib/db';
import {settleCheckout} from '../lib/payment-orders';

function testServerDb(){const root=process.env.TEST_SERVER_DATA_DIRECTORY;if(!root||!resolve(root).startsWith(resolve('.local')+require('node:path').sep)||!root.includes('test-'))throw new Error('Isolated test-server database required.');return new DatabaseSync(join(root,'domains.sqlite'));}

test('cancelled orders leave pending lists; paid orders stay protected and purchasers remain visible',async({page,playwright,request})=>{
 await page.context().setExtraHTTPHeaders({'x-forwarded-for':'192.0.2.40'});
 const customer=await playwright.request.newContext({baseURL:'http://127.0.0.1:3003',extraHTTPHeaders:{'x-forwarded-for':'192.0.2.41'}});
 const other=await playwright.request.newContext({baseURL:'http://127.0.0.1:3003',extraHTTPHeaders:{'x-forwarded-for':'192.0.2.42'}});
 const email=`cancel-${Date.now()}@example.com`,password='Cancel-Password-123456';
 try{
  const signup=await customer.post('/api/auth',{data:{action:'signup',name:'Cancellation Customer',email,password}});expect(signup.status()).toBe(200);const{user}=await signup.json();
  expect((await other.post('/api/auth',{data:{action:'signup',name:'Other Customer',email:'other-'+email,password}})).status()).toBe(200);
  const {order}=await(await customer.post('/api/orders',{data:{domain:'cancel-pending.com'}})).json();
  const endpoint=`/api/orders/${order.id}/cancel`;
  expect((await request.post(endpoint)).status()).toBe(401);
  expect((await other.post(endpoint)).status()).toBe(404);
  expect((await customer.post(endpoint,{headers:{Origin:'https://attacker.invalid'}})).status()).toBe(403);
  const login=await page.request.post('/api/auth',{data:{action:'login',email:'admin@cubixtop.com',password:'Test-Admin-Password-123456'}});expect(login.status()).toBe(200);
  await page.goto(`/admin?section=orders&search=${encodeURIComponent(email)}`);
  await page.getByRole('button',{name:'Cancel unpaid order for cancel-pending.com',exact:true}).click();
  await page.getByRole('button',{name:'Confirm cancellation'}).click();
  await expect(page.getByText('No matching records.')).toBeVisible();
  expect((await(await customer.get('/api/orders')).json()).orders).toHaveLength(0);
  const browserLogin=await page.request.post('/api/auth',{data:{action:'login',email,password}});expect(browserLogin.status()).toBe(200);
  await page.goto('/dashboard');await expect(page.getByRole('heading',{name:'cancel-pending.com',exact:true})).toHaveCount(0);
  const {order:second}=await(await customer.post('/api/orders',{data:{domain:'customer-cancel.com'}})).json();
  await page.goto('/dashboard');await page.getByRole('button',{name:'Cancel unpaid order for customer-cancel.com',exact:true}).click();await page.getByRole('button',{name:'Confirm cancellation'}).click();await expect(page.getByRole('heading',{name:'customer-cancel.com',exact:true})).toHaveCount(0);
  expect((await customer.post(`/api/orders/${second.id}/cancel`)).status()).toBe(200);
  const fixture=testServerDb();const now=new Date().toISOString();const protectedIds:string[]=[];
  try{for(const status of ['active','manual_review','provisioning','sandbox_paid']){const id=randomUUID();protectedIds.push(id);fixture.prepare('INSERT INTO checkouts(id,user_id,domain,status,created_at,updated_at,amount_inr) VALUES(?,?,?,?,?,?,?)').run(id,user.id,`${status.replaceAll('_','-')}-protected.com`,status,now,now,500);}
   const paidId=randomUUID();fixture.prepare('INSERT INTO checkouts(id,user_id,domain,status,created_at,updated_at,amount_inr) VALUES(?,?,?,?,?,?,?)').run(paidId,user.id,'paid-pending-protected.com','payment_pending',now,now,500);fixture.prepare('INSERT INTO payment_attempts(id,checkout_id,provider,config_key,status,amount_inr,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),paidId,'cashfree','fixture-no-credentials','paid',500,now);protectedIds.push(paidId);
  }finally{fixture.close();}
  for(const id of protectedIds)expect((await customer.post(`/api/orders/${id}/cancel`)).status()).toBe(409);
  expect((await customer.post(`/api/orders/${order.id}/check-payment`)).status()).toBe(409);
  expect((await other.post(`/api/orders/${order.id}/check-payment`)).status()).toBe(404);
  await page.request.post('/api/auth',{data:{action:'login',email:'admin@cubixtop.com',password:'Test-Admin-Password-123456'}});
  await page.goto(`/admin?section=customers&purchased=1&q=${encodeURIComponent(email)}`);await expect(page.locator('.admin-users tbody')).toContainText(email);
  await page.goto(`/admin?section=orders&status=cancelled&search=${encodeURIComponent(email)}`);await expect(page.locator('.records-card tbody')).toContainText('cancel-pending.com');
 }finally{await customer.dispose();await other.dispose();}
});

test('admin and customer profile edits persist; email changes and password resets revoke sessions',async({page,playwright})=>{
 await page.context().setExtraHTTPHeaders({'x-forwarded-for':'192.0.2.50'});
 const customer=await playwright.request.newContext({baseURL:'http://127.0.0.1:3003',extraHTTPHeaders:{'x-forwarded-for':'192.0.2.51'}});
 const email=`editing-${Date.now()}@example.com`,password='Editing-Password-123456',replacement='Replacement-Editing-123456';
 const profile={name:'Edited Customer',email,phone:'+91 9876543210',address:'12 Example Road',city:'Bengaluru',state:'Karnataka',postal_code:'560001',country:'IN'};
 try{
  const signup=await customer.post('/api/auth',{data:{action:'signup',name:'Editing Customer',email,password}});expect(signup.status()).toBe(200);const{user}=await signup.json();
  const endpoint=`/api/admin/users/${user.id}`;
  expect((await customer.post(endpoint,{data:{action:'update_profile',...profile}})).status()).toBe(403);
  const login=await page.request.post('/api/auth',{data:{action:'login',email:'admin@cubixtop.com',password:'Test-Admin-Password-123456'}});expect(login.status()).toBe(200);
  await page.goto(`/admin/users/${user.id}`);
  await page.getByLabel('Full name',{exact:true}).fill(profile.name);await page.getByLabel('Mobile number',{exact:true}).fill(profile.phone);await page.getByLabel('Address',{exact:true}).fill(profile.address);await page.getByLabel('City',{exact:true}).fill(profile.city);await page.getByLabel('State / province',{exact:true}).fill(profile.state);await page.getByLabel('Postal code',{exact:true}).fill(profile.postal_code);await page.getByLabel('Country code',{exact:true}).fill('IN');await page.getByRole('button',{name:'Save profile changes'}).click();await expect(page.getByRole('status').filter({hasText:'Customer profile saved'})).toBeVisible();await page.reload();await expect(page.getByLabel('Mobile number',{exact:true})).toHaveValue(profile.phone);
  const changedEmail='changed-'+email;await page.getByLabel('Email address',{exact:true}).fill(changedEmail);await page.getByRole('button',{name:'Save profile changes'}).click();await expect(page.getByRole('status').filter({hasText:'verification was cleared'})).toBeVisible();expect((await customer.get('/api/orders')).status()).toBe(401);
  expect((await customer.post('/api/auth',{data:{action:'login',email:changedEmail,password}})).status()).toBe(200);
  await page.getByLabel('Replacement password',{exact:true}).fill(replacement);await page.getByLabel('Confirm replacement password',{exact:true}).fill(replacement);await page.getByLabel('I intend to replace this customer’s password and sign them out.').check();await page.getByRole('button',{name:'Set replacement password'}).click();await expect(page.getByRole('status').filter({hasText:'Replacement password saved'})).toBeVisible();expect((await customer.get('/api/orders')).status()).toBe(401);
  expect((await customer.post('/api/auth',{data:{action:'login',email:changedEmail,password}})).status()).toBe(401);expect((await customer.post('/api/auth',{data:{action:'login',email:changedEmail,password:replacement}})).status()).toBe(200);
  expect((await page.request.post(endpoint,{data:{action:'reset_password',password:'short'}})).status()).toBe(400);
  expect((await page.request.post(endpoint,{data:{action:'send_password_reset'}})).status()).toBe(503);
  expect((await page.request.post(endpoint,{data:{action:'update_profile',...profile,email:'admin@cubixtop.com'}})).status()).toBe(409);
  const own={...profile,email:changedEmail,name:'Self Updated Customer'};
  expect((await customer.post('/api/account/profile',{data:own})).status()).toBe(200);
  expect((await customer.post('/api/account/profile',{data:{...own,email:'self-'+email,currentPassword:'wrong'}})).status()).toBe(401);
  expect((await customer.post('/api/account/profile',{data:{...own,email:'self-'+email,currentPassword:replacement}})).status()).toBe(200);
  expect((await(await customer.get('/api/auth')).json()).user.email).toBe('self-'+email);
  const fixture=testServerDb();try{const saved=fixture.prepare('SELECT name,phone,email_verified FROM users WHERE id=?').get(user.id);expect(saved).toMatchObject({name:'Self Updated Customer',phone:profile.phone,email_verified:0});}finally{fixture.close();}
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(`/admin/users/${user.id}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
  await expect(page.locator('main')).not.toContainText(replacement);
 }finally{await customer.dispose();}
});

test('payment received after cancellation is retained for review and cannot provision a domain',async()=>{
 const id=randomUUID(),userId=randomUUID(),now=new Date().toISOString();(await db.prepare('INSERT INTO users(id,email,name,password,role,created_at) VALUES(?,?,?,?,?,?)').run(userId,`${userId}@example.invalid`,'Cancelled Fixture','unused','customer',now));(await db.prepare('INSERT INTO checkouts(id,user_id,domain,status,amount_inr,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,userId,`${id}.com`,'cancelled',100,now,now));const attemptId=randomUUID();(await db.prepare('INSERT INTO payment_attempts(id,checkout_id,provider,config_key,status,amount_inr,created_at) VALUES(?,?,?,?,?,?,?)').run(attemptId,id,'cashfree','not-used','pending',100,now));const order=(await db.prepare('SELECT * FROM checkouts WHERE id=?').get(id)) as Checkout;
 await settleCheckout(order,{status:'PAID',amount:100,currency:'INR'},{id:attemptId,checkout_id:id,provider:'cashfree',config_key:'not-used',gateway_order_id:'fixture',status:'pending',amount_inr:100});
 expect((await db.prepare('SELECT status,failure_reason FROM checkouts WHERE id=?').get(id))).toMatchObject({status:'manual_review',failure_reason:expect.stringContaining('after order cancellation')});expect((await db.prepare('SELECT status FROM payment_attempts WHERE id=?').get(attemptId))).toMatchObject({status:'manual_review'});
});

