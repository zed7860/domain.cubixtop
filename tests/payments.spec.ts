import {test,expect} from '@playwright/test';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import Razorpay from 'razorpay';
import PaytmChecksum from 'paytmchecksum';
import {createPayment,hostedHash,hostedResponseValid,razorpaySignature,verifyRemotePayment,publicPaymentSettings} from '../lib/payment-gateways';
import {paymentProviders,type PaymentConfig} from '../lib/payment-catalog';
import {db,type Checkout} from '../lib/db';
import {readPrivateSetting,writePrivateSetting} from '../lib/settings';
import {attemptConfig,reconcilePayment,settleCheckout,type PaymentAttempt} from '../lib/payment-orders';
import {NameSiloRegistrar} from '../lib/registrar';

const input={orderId:'cubix_fixture',amount:123.45,customerId:'customer_fixture',name:'Test Customer',firstName:'Test',email:'payment@example.invalid',phone:'9999999999',domain:'fixture.example.com'};
const config=(provider:PaymentConfig['provider'],environment:PaymentConfig['environment']='sandbox'):PaymentConfig=>({provider,environment,credentials:{appId:'fixture-app',secretKey:'fixture-secret',keyId:'rzp_test_fixture',keySecret:'fixture-secret',webhookSecret:'webhook-fixture',mid:'fixture-mid',merchantKey:'1234567890123456',websiteName:'WEBSTAGING',salt:'fixture-salt'}});

test('gateway hashes reject altered orders, amounts and response payloads',()=>{
 const fields={key:'key',txnid:'txn',amount:'123.45',productinfo:'Domain',firstname:'Test',email:'a@example.invalid'};
 expect(hostedHash(fields,'salt')).toBe(createHash('sha512').update('key|txn|123.45|Domain|Test|a@example.invalid|||||||||||salt').digest('hex'));
 const response={...fields,status:'success',hash:createHash('sha512').update('salt|success|||||||||||a@example.invalid|Test|Domain|123.45|txn|key').digest('hex')};
 expect(hostedResponseValid(response,'salt')).toBe(true);expect(hostedResponseValid({...response,amount:'1.00'},'salt')).toBe(false);
 const signature=createHmac('sha256','secret').update('order|payment').digest('hex');
 expect(razorpaySignature('order','payment',signature,'secret')).toBe(true);expect(razorpaySignature('other','payment',signature,'secret')).toBe(false);
});

test('all five gateway adapters initiate and verify payments using merchant API responses',async()=>{
 const original=globalThis.fetch,prototype=Razorpay.prototype as unknown as {addResources:()=>void},addResources=prototype.addResources;
 prototype.addResources=function(this:object){Object.assign(this,{orders:{create:async(body:{amount:number;currency:string})=>{expect(body).toMatchObject({amount:12345,currency:'INR'});return {id:'order_fixture'};},fetch:async()=>({status:'paid',amount_paid:12345,currency:'INR'})}});};
 try{
  for(const provider of paymentProviders){const c=config(provider);
   globalThis.fetch=async(url,init)=>{
    const path=String(url);
    if(provider==='cashfree')return Response.json(init?.method==='POST'?{order_id:input.orderId,payment_session_id:'session_fixture'}:{order_status:'PAID',order_amount:123.45,order_currency:'INR'});
    if(provider==='paytm'){
     const request=JSON.parse(String(init?.body));expect(PaytmChecksum.verifySignature(JSON.stringify(request.body),c.credentials.merchantKey,request.head.signature)).toBe(true);
     const body=path.includes('initiateTransaction')?{txnToken:'token_fixture'}:{orderId:input.orderId,mid:c.credentials.mid,resultInfo:{resultStatus:'TXN_SUCCESS'},txnAmount:'123.45'};
     return Response.json({body,head:{signature:await PaytmChecksum.generateSignature(JSON.stringify(body),c.credentials.merchantKey)}});
    }
    const fields=Object.fromEntries(new URLSearchParams(String(init?.body)));
    if(provider==='payu'){expect(fields.command).toBe('verify_payment');expect(fields.hash).toBe(createHash('sha512').update(c.credentials.merchantKey+'|verify_payment|'+input.orderId+'|'+c.credentials.salt).digest('hex'));return Response.json({transaction_details:{[input.orderId]:{status:'success',unmappedstatus:'captured',transaction_amount:'123.45'}}});}
    if(path.includes('initiateLink')){expect(fields.hash).toBe(hostedHash(fields,c.credentials.salt));return Response.json({status:1,data:'access_fixture'});}
    return Response.json({status:true,msg:[{txnid:input.orderId,status:'success',amount:'123.45'}]});
   };
   const launch=await createPayment(c,input);expect(launch).toMatchObject({provider,amount:123.45,currency:'INR'});
   expect(JSON.stringify(launch)).not.toContain(c.credentials.salt);expect(JSON.stringify(launch)).not.toContain(c.credentials.secretKey);
   expect(await verifyRemotePayment(c,launch.gatewayOrderId!)).toEqual({status:'PAID',amount:123.45,currency:'INR'});
  }
 }finally{globalThis.fetch=original;prototype.addResources=addResources;}
});

test('Paytm verification fails closed for an unsigned or mismatched merchant response',async()=>{
 const original=globalThis.fetch,c=config('paytm');try{
  globalThis.fetch=async()=>Response.json({body:{resultInfo:{resultStatus:'TXN_SUCCESS'},txnAmount:'123.45'}});
  await expect(verifyRemotePayment(c,input.orderId)).rejects.toThrow('signature');
  const body={orderId:'different_order',mid:c.credentials.mid,resultInfo:{resultStatus:'TXN_SUCCESS'},txnAmount:'123.45'};
  globalThis.fetch=async()=>Response.json({body,head:{signature:await PaytmChecksum.generateSignature(JSON.stringify(body),c.credentials.merchantKey)}});
  await expect(verifyRemotePayment(c,input.orderId)).rejects.toThrow('different order');
 }finally{globalThis.fetch=original;}
});

test('sandbox success, amount mismatch, immutable credentials and concurrent delivery are safe',async()=>{
 const userId=randomUUID(),orderId=randomUUID(),attemptId='cubix_'+randomUUID().replaceAll('-',''),key='test-config-'+attemptId;
 const now=new Date().toISOString(),originalRegister=NameSiloRegistrar.prototype.register;
 let registrations=0;NameSiloRegistrar.prototype.register=async()=>{registrations++;return {reference:'fixture-registration',code:300,amount:10};};
 db.prepare('INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)').run(userId,userId+'@example.invalid','Test','unused',now);
 db.prepare('INSERT INTO checkouts(id,user_id,domain,status,amount_inr,contact,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(orderId,userId,orderId+'.com','payment_pending',123.45,'{}',now,now);
 writePrivateSetting(key,config('cashfree'));
 db.prepare('INSERT INTO payment_attempts(id,checkout_id,provider,config_key,gateway_order_id,amount_inr,created_at) VALUES(?,?,?,?,?,?,?)').run(attemptId,orderId,'cashfree',key,attemptId,123.45,now);
 const order=()=>db.prepare('SELECT * FROM checkouts WHERE id=?').get(orderId) as Checkout,attempt=db.prepare('SELECT * FROM payment_attempts WHERE id=?').get(attemptId) as PaymentAttempt;
 try{
  const stored=db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string};expect(stored.value).not.toContain('fixture-secret');expect(attemptConfig(attempt).credentials.secretKey).toBe('fixture-secret');
  expect(JSON.stringify(publicPaymentSettings())).not.toContain('fixture-secret');
  await settleCheckout(order(),{status:'PAID',amount:1,currency:'INR'},attempt);expect(order().status).toBe('manual_review');expect(registrations).toBe(0);
  db.prepare("UPDATE checkouts SET status='payment_pending' WHERE id=?").run(orderId);
  await Promise.all([settleCheckout(order(),{status:'PAID',amount:123.45,currency:'INR'},attempt),settleCheckout(order(),{status:'PAID',amount:123.45,currency:'INR'},attempt)]);
  expect(order().status).toBe('sandbox_paid');expect(registrations).toBe(0);
  db.prepare("UPDATE checkouts SET status='payment_pending' WHERE id=?").run(orderId);
  writePrivateSetting(key,config('cashfree','production'));
  // Avoid an email in this isolated test; provisioning itself must run once.
  const smtp=process.env.SMTP_HOST;process.env.SMTP_HOST='';
  try{await Promise.all([settleCheckout(order(),{status:'PAID',amount:123.45,currency:'INR'},attempt),settleCheckout(order(),{status:'PAID',amount:123.45,currency:'INR'},attempt)]);}finally{if(smtp===undefined)delete process.env.SMTP_HOST;else process.env.SMTP_HOST=smtp;}
  expect(order().status).toBe('active');expect(registrations).toBe(1);
 }finally{NameSiloRegistrar.prototype.register=originalRegister;db.prepare('DELETE FROM payment_attempts WHERE checkout_id=?').run(orderId);db.prepare('DELETE FROM checkouts WHERE id=?').run(orderId);db.prepare('DELETE FROM users WHERE id=?').run(userId);db.prepare('DELETE FROM settings WHERE key=?').run(key);}
});

test('admin selection shows each gateway’s own fields and never exposes saved secrets',async({page})=>{
 await page.goto('/login?next=/admin');await page.getByLabel('Email address').fill('admin@cubixtop.com');await page.getByLabel('Password',{exact:true}).fill('Test-Admin-Password-123456');await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('link',{name:'Integrations',exact:true}).click();await expect(page.getByRole('heading',{name:'Payment gateways'})).toBeVisible();
 for(const [provider,label] of [['cashfree','Cashfree App ID'],['razorpay','Razorpay Key ID'],['paytm','Paytm Merchant ID (MID)'],['payu','PayU / PayUMoney Merchant salt'],['easebuzz','Easebuzz Merchant salt']]){await page.getByLabel('Payment gateway',{exact:true}).selectOption(provider);await expect(page.getByLabel(label,{exact:true})).toBeVisible();}
 await page.getByLabel('Easebuzz Merchant key',{exact:true}).fill('fixture-key');await page.getByLabel('Easebuzz Merchant salt',{exact:true}).fill('fixture-salt');await page.getByRole('button',{name:'Save and select gateway'}).click();await expect(page.getByRole('status')).toContainText('sandbox payment');
 const response=await page.request.get('/api/admin/payments');expect(response.ok()).toBe(true);expect(await response.text()).not.toContain('fixture-salt');
 await page.reload();await expect(page.getByLabel('Easebuzz Merchant salt',{exact:true})).toHaveValue('');
});

test('anonymous gateway setup and unsigned webhooks cannot change payment state',async({request})=>{
 expect((await request.get('/api/admin/payments')).status()).toBe(401);
 expect((await request.post('/api/admin/payments',{data:{provider:'payu',environment:'production',credentials:{}}})).status()).toBe(401);
 expect((await request.post('/api/payments/razorpay/webhook',{data:{event:'order.paid',payload:{order:{entity:{id:'forged'}}}}})).status()).toBe(401);
 expect((await request.post('/api/payments/cashfree/webhook',{data:{data:{order:{order_id:'forged'},payment:{payment_status:'SUCCESS'}}}})).status()).toBe(401);
 expect((await request.post('/api/payments/resume',{data:{orderId:'forged'}})).status()).toBe(401);
});

test('checkout loads each selected gateway and completes its browser handoff',async({page})=>{
 const response=await page.request.post('/api/auth',{data:{action:'signup',name:'Gateway Customer',email:'gateways-'+Date.now()+'@example.invalid',password:'Gateway-Test-Password-12345'}});expect(response.ok()).toBe(true);
 await page.route('https://sdk.cashfree.com/js/v3/cashfree.js',route=>route.fulfill({contentType:'application/javascript',body:`window.Cashfree=function(){return {checkout:async function(options){if(options.paymentSessionId!=='session_fixture')throw Error('Wrong session');location.assign('/payment/return?order_id=cubix_fixture');}}};`}));
 await page.route('https://checkout.razorpay.com/v1/checkout.js',route=>route.fulfill({contentType:'application/javascript',body:`window.Razorpay=function(options){if(options.order_id!=='order_fixture'||options.amount!==12345)throw Error('Wrong order');this.on=function(){};this.open=function(){options.handler({razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:'signature_fixture'});};};`}));
 await page.route('https://securestage.paytmpayments.com/merchantpgpui/checkoutjs/merchants/fixture-mid.js',route=>route.fulfill({contentType:'application/javascript',body:`window.Paytm={CheckoutJS:{init:async function(options){if(options.data.token!=='token_fixture')throw Error('Wrong token');},invoke:function(){location.assign('/payment/return?order_id=cubix_fixture');}}};`}));
 await page.route('**/api/payments/razorpay/verify',async route=>{expect(route.request().postDataJSON()).toMatchObject({orderId:'cubix_fixture',razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture'});await route.fulfill({json:{ok:true,paymentStatus:'PAID'}});});
 await page.route('**/api/payments/status?*',route=>route.fulfill({json:{domain:input.domain,status:'sandbox_paid',paymentStatus:'PAID'}}));
 await page.route('https://test.payu.in/_payment',async route=>{expect(route.request().method()).toBe('POST');expect(new URLSearchParams(route.request().postData()||'').get('hash')).toBe('hash_fixture');await route.fulfill({contentType:'text/html',body:'<h1>PayU test checkout</h1>'});});
 await page.route('https://testpay.easebuzz.in/pay/access_fixture',route=>route.fulfill({contentType:'text/html',body:'<h1>Easebuzz test checkout</h1>'}));
 for(const provider of paymentProviders){
  await page.route('**/api/checkout',route=>route.fulfill({json:{provider,orderId:'cubix_fixture',amount:123.45,currency:'INR',mode:'sandbox',paymentSessionId:'session_fixture',gatewayOrderId:'order_fixture',keyId:'rzp_test_fixture',mid:'fixture-mid',token:'token_fixture',...(provider==='payu'?{formAction:'https://test.payu.in/_payment',fields:{key:'fixture',txnid:'cubix_fixture',hash:'hash_fixture'}}:{}),...(provider==='easebuzz'?{redirectUrl:'https://testpay.easebuzz.in/pay/access_fixture'}:{})}}));
  await page.goto('/checkout?domain='+input.domain);
  for(const [label,value] of [['First name','Test'],['Last name','Customer'],['Address','Test address'],['City','Bengaluru'],['State / province','Karnataka'],['Postal code','560001'],['Mobile number','9999999999']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByRole('button',{name:'Pay securely'}).click();
  if(provider==='payu')await expect(page.getByRole('heading',{name:'PayU test checkout'})).toBeVisible();
  else if(provider==='easebuzz')await expect(page.getByRole('heading',{name:'Easebuzz test checkout'})).toBeVisible();
  else await expect(page.getByRole('heading',{name:'Sandbox payment verified.'})).toBeVisible();
  await page.unroute('**/api/checkout');
 }
});

