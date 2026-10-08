import {test,expect} from '@playwright/test';
import Razorpay from 'razorpay';
import PaytmChecksum from 'paytmchecksum';
import {validatePaymentConfig,savePaymentConfig,publicPaymentSettings,recordVerifiedPaymentConnection} from '../lib/payment-gateways';
import {validateRegistrarCredentials} from '../lib/registrar-validation';
import type {PaymentConfig} from '../lib/payment-catalog';
const config=(provider:PaymentConfig['provider']):PaymentConfig=>({provider,environment:'sandbox',credentials:{appId:'fixture-app',secretKey:'fixture-secret',keyId:'rzp_test_fixture',keySecret:'fixture-secret',webhookSecret:'fixture-webhook',mid:'fixture-mid',merchantKey:'1234567890123456',websiteName:'WEBSTAGING',salt:'fixture-salt'}});

test('API authentication rejects failed, ambiguous and malformed responses',async()=>{
 const originalFetch=globalThis.fetch,prototype=Razorpay.prototype as unknown as {addResources:()=>void},originalResources=prototype.addResources;
 try{
  for(const response of [new Response('Not Found',{status:404}),Response.json({message:'invalid credentials'},{status:401}),Response.json({unexpected:true}),Response.json({code:'not_found',type:'invalid_request_error'},{status:404})]){
   globalThis.fetch=async()=>response;await expect(validatePaymentConfig(config('cashfree'))).rejects.toThrow();
  }
  globalThis.fetch=async()=>Response.json({code:'order_not_found',type:'invalid_request_error'},{status:404});expect(await validatePaymentConfig(config('cashfree'))).toMatchObject({verified:true,message:expect.stringContaining('Successfully connected')});
  prototype.addResources=function(this:object){Object.assign(this,{orders:{all:async()=>({entity:'collection',count:0,items:[]})}});};expect(await validatePaymentConfig(config('razorpay'))).toMatchObject({verified:true});
  prototype.addResources=function(this:object){Object.assign(this,{orders:{all:async()=>({unexpected:true})}});};await expect(validatePaymentConfig(config('razorpay'))).rejects.toThrow();
  for(const [resultCode,resultStatus,valid] of [['331','NO_RECORD_FOUND',true],['334','TXN_FAILURE',true],['335','TXN_FAILURE',false],['501','TXN_FAILURE',false],['','NO_RECORD_FOUND',false]] as const){const body={resultInfo:{resultCode,resultStatus},mid:'fixture-mid'};const signature=await PaytmChecksum.generateSignature(JSON.stringify(body),'1234567890123456');globalThis.fetch=async()=>Response.json({body,head:{signature}});if(valid)expect(await validatePaymentConfig(config('paytm'))).toMatchObject({verified:true});else await expect(validatePaymentConfig(config('paytm'))).rejects.toThrow();}
  globalThis.fetch=async()=>{throw new Error('Hosted credential-only validation must not initiate a payment.');};for(const provider of ['payu','easebuzz'] as const)expect(await validatePaymentConfig(config(provider))).toMatchObject({verified:false,message:expect.stringContaining('verification pending')});
  for(const data of [{reply:{code:200}},{reply:{detail:'success'}},{unexpected:true},null]){globalThis.fetch=async()=>Response.json(data);await expect(validateRegistrarCredentials('fixture-registrar-key')).rejects.toThrow();}
  globalThis.fetch=async()=>Response.json({reply:{code:300,detail:'success'}});expect(await validateRegistrarCredentials('fixture-registrar-key')).toBe(true);
 }finally{globalThis.fetch=originalFetch;prototype.addResources=originalResources;}
});

test('verification metadata survives reload and proof cannot transfer to replacement credentials',()=>{
 const saved=config('easebuzz');savePaymentConfig(saved);expect(publicPaymentSettings().gateways.find(g=>g.provider==='easebuzz')).toMatchObject({configured:true,verified:false});recordVerifiedPaymentConnection(saved);expect(publicPaymentSettings().gateways.find(g=>g.provider==='easebuzz')).toMatchObject({verified:true,verificationScope:'payment',verifiedAt:expect.any(String)});
 const replacement={...saved,credentials:{...saved.credentials,salt:'replacement-fixture-salt'}};savePaymentConfig(replacement);recordVerifiedPaymentConnection(saved);expect(publicPaymentSettings().gateways.find(g=>g.provider==='easebuzz')).toMatchObject({verified:false,verifiedAt:null});expect(JSON.stringify(publicPaymentSettings())).not.toContain('replacement-fixture-salt');
});

test('setup forms show verified success and clear it when saved-connection authentication fails',async({page})=>{
 await page.context().setExtraHTTPHeaders({'x-forwarded-for':'192.0.2.60'});
 expect((await page.request.post('/api/auth',{data:{action:'login',email:'admin@cubixtop.com',password:'Test-Admin-Password-123456'}})).status()).toBe(200);
 await page.goto('/admin?section=integrations');
 const registrar=page.locator('.settings-card').filter({has:page.getByRole('heading',{name:'Registrar integration',exact:true})});
 await page.route('**/api/admin/registrar',route=>{const data=route.request().postDataJSON();return data.useSaved?route.fulfill({status:400,json:{error:'Connection failed. Check your NameSilo API key.'}}):route.fulfill({json:{ok:true,verified:true,verifiedAt:new Date().toISOString(),message:'Successfully connected to NameSilo. API credentials verified and saved securely.'}});});
 await registrar.getByLabel('API key / access token').fill('fixture-registrar-key');await registrar.getByRole('button',{name:'Validate and save integration'}).click();await expect(registrar.getByRole('status')).toContainText('Successfully connected');await expect(registrar.locator('.status-dot')).toHaveText('Successfully connected');await registrar.getByRole('button',{name:'Test saved reseller connection'}).click();await expect(registrar.getByRole('alert')).toContainText('Connection failed');await expect(registrar.locator('.status-dot')).not.toHaveText('Successfully connected');
 const gateway=page.locator('.settings-card').filter({has:page.getByRole('heading',{name:'Payment gateways',exact:true})});
 const summary={active:'cashfree',gateways:[{provider:'cashfree',configured:true,environment:'sandbox',verified:true,verifiedAt:new Date().toISOString(),verificationScope:'api'}]};
 await page.route('**/api/admin/payments',route=>{const data=route.request().postDataJSON();return data.activateOnly?route.fulfill({status:502,json:{...summary,gateways:[{...summary.gateways[0],verified:false,verifiedAt:null}],error:'Connection failed. Check saved credentials.'}}):route.fulfill({json:{...summary,message:'Successfully connected to Cashfree (sandbox). API credentials verified.'}});});
 await gateway.getByLabel('Payment gateway',{exact:true}).selectOption('cashfree');await gateway.getByLabel('Cashfree App ID',{exact:true}).fill('fixture-app');await gateway.getByLabel('Cashfree Secret key',{exact:true}).fill('fixture-secret');await gateway.getByRole('button',{name:'Save and select gateway'}).click();await expect(gateway.getByRole('status')).toContainText('Successfully connected');await expect(gateway.locator('.status-dot')).toHaveText('Successfully connected');await gateway.getByRole('button',{name:'Test saved Cashfree connection (sandbox)'}).click();await expect(gateway.getByRole('alert')).toContainText('Connection failed');await expect(gateway.locator('.status-dot')).toHaveText('Saved · verification pending');
});
