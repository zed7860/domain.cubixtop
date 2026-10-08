import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import Razorpay from 'razorpay';
import PaytmChecksum from 'paytmchecksum';
import {createCashfreeOrder,getCashfreeOrder,validateCashfreeSettings} from './cashfree';
import {getCashfreeSettings,readPrivateSetting,writePrivateSetting} from './settings';
import {paymentCatalog,type PaymentConfig,type PaymentLaunch,type PaymentProvider} from './payment-catalog';

export function getPaymentConfig(provider?:PaymentProvider):PaymentConfig|null {
  const active=readPrivateSetting<PaymentProvider>('payment-active');
  const selected=provider||active||'cashfree';
  const saved=readPrivateSetting<PaymentConfig>('payment-'+selected);
  if(saved)return saved;
  if(selected==='cashfree'){const legacy=getCashfreeSettings();if(legacy)return {provider:selected,environment:legacy.environment,credentials:{appId:legacy.appId,secretKey:legacy.secretKey}};}
  return null;
}
export function savePaymentConfig(config:PaymentConfig){writePrivateSetting('payment-'+config.provider,config);writePrivateSetting('payment-active',config.provider);}
export function publicPaymentSettings(){return {active:getPaymentConfig()?.provider||null,gateways:Object.keys(paymentCatalog).map(key=>{const provider=key as PaymentProvider,config=getPaymentConfig(provider);return {provider,configured:Boolean(config),environment:config?.environment||'sandbox',verified:config?.connection?.verified===true,verifiedAt:config?.connection?.verified?config.connection.checkedAt:null,verificationScope:config?.connection?.scope||null};})};}
export const sha512=(value:string)=>createHash('sha512').update(value).digest('hex');
export function equalSignature(expected:string,received:string){const a=Buffer.from(expected),b=Buffer.from(received);return a.length===b.length&&timingSafeEqual(a,b);}
export function razorpaySignature(orderId:string,paymentId:string,signature:string,secret:string){return equalSignature(createHmac('sha256',secret).update(orderId+'|'+paymentId).digest('hex'),signature);}
export function hostedHash(fields:Record<string,string>,salt:string){return sha512([fields.key,fields.txnid,fields.amount,fields.productinfo,fields.firstname,fields.email,...Array.from({length:10},(_,i)=>fields['udf'+(i+1)]||''),salt].join('|'));}
export function hostedResponseValid(fields:Record<string,string>,salt:string){const values=[salt,fields.status,...Array.from({length:10},(_,i)=>fields['udf'+(10-i)]||''),fields.email,fields.firstname,fields.productinfo,fields.amount,fields.txnid,fields.key];const extra=fields.additionalCharges||fields.additional_charges;if(extra)values.unshift(extra);return equalSignature(sha512(values.join('|')),fields.hash||'');}
const cashfreeConfig=(c:PaymentConfig)=>({appId:c.credentials.appId,secretKey:c.credentials.secretKey,environment:c.environment});
export const paytmBase=(c:PaymentConfig)=>c.environment==='production'?'https://secure.paytmpayments.com':'https://securestage.paytmpayments.com';
const easeBase=(c:PaymentConfig,dashboard=false)=>`https://${c.environment==='production'?'':'test'}${dashboard?'dashboard':'pay'}.easebuzz.in`;
async function request(url:string,init:RequestInit={}){const response=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Payment gateway request failed. Check your merchant settings or try again.');return response.json();}
const formRequest=(url:string,fields:Record<string,string>)=>request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString()});
async function paytmRequest(c:PaymentConfig,path:string,body:Record<string,unknown>){const serialized=JSON.stringify(body),signature=await PaytmChecksum.generateSignature(serialized,c.credentials.merchantKey);const result=await request(paytmBase(c)+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,head:{signature}})});if(!result.body||!result.head?.signature||!PaytmChecksum.verifySignature(JSON.stringify(result.body),c.credentials.merchantKey,result.head.signature))throw new Error('Paytm response signature could not be verified.');return result.body;}
export async function validatePaymentConfig(c:PaymentConfig):Promise<{verified:boolean;message:string}>{
  if(c.provider==='cashfree'){await validateCashfreeSettings(cashfreeConfig(c));return {verified:true,message:`Successfully connected to Cashfree (${c.environment}). API credentials verified. Configure and test your webhook before launch.`};}
  if(c.provider==='razorpay'){const result=await new Razorpay({key_id:c.credentials.keyId,key_secret:c.credentials.keySecret}).orders.all({count:1});if(result.entity!=='collection'||!Array.isArray(result.items))throw new Error('Razorpay returned an invalid authentication response.');return {verified:true,message:`Successfully connected to Razorpay (${c.environment}). API credentials verified. The webhook secret must also be tested with a signed payment notification.`};}
  if(c.provider==='paytm'){const orderId='cubix_configuration_check';const data=await paytmRequest(c,'/v3/order/status',{mid:c.credentials.mid,orderId});const code=String(data.resultInfo?.resultCode);if(!((code==='331'&&data.resultInfo?.resultStatus==='NO_RECORD_FOUND')||(code==='334'&&data.resultInfo?.resultStatus==='TXN_FAILURE'))||data.mid&&data.mid!==c.credentials.mid||data.orderId&&data.orderId!==orderId)throw new Error('Paytm did not validate the merchant configuration.');return {verified:true,message:`Successfully connected to Paytm (${c.environment}). Merchant ID and signed API credentials verified. Test your website name and checkout callback with a sandbox payment.`};}
  // Hosted gateways have no common credential-only validation endpoint. Do not create a charge to test a configuration.
  return {verified:false,message:'Settings saved — connection verification pending. Complete a sandbox payment to verify the merchant key and salt before going live.'};
}
function credentialFingerprint(c:PaymentConfig){return createHash('sha256').update(JSON.stringify([c.provider,c.environment,Object.entries(c.credentials).sort(([a],[b])=>a.localeCompare(b))])).digest('hex');}
export function recordVerifiedPaymentConnection(c:PaymentConfig){const current=getPaymentConfig(c.provider);if(!current||credentialFingerprint(current)!==credentialFingerprint(c))return;writePrivateSetting('payment-'+c.provider,{...current,connection:{verified:true,checkedAt:new Date().toISOString(),scope:'payment'}});}
export type PaymentInput={orderId:string;amount:number;customerId:string;name:string;firstName:string;email:string;phone:string;domain:string};
export async function createPayment(c:PaymentConfig,input:PaymentInput):Promise<PaymentLaunch>{
 const launch:PaymentLaunch={provider:c.provider,orderId:input.orderId,amount:input.amount,currency:'INR',mode:c.environment};
 const site=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
 const callback=`${site}/api/payments/${c.provider}/callback`;
 if(c.provider==='cashfree'){const data=await createCashfreeOrder(input,cashfreeConfig(c));return {...launch,gatewayOrderId:data.order_id,paymentSessionId:data.payment_session_id};}
 if(c.provider==='razorpay'){const data=await new Razorpay({key_id:c.credentials.keyId,key_secret:c.credentials.keySecret}).orders.create({amount:Math.round(input.amount*100),currency:'INR',receipt:input.orderId,notes:{domain:input.domain}});return {...launch,gatewayOrderId:data.id,keyId:c.credentials.keyId};}
 if(c.provider==='paytm'){const data=await paytmRequest(c,`/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(c.credentials.mid)}&orderId=${input.orderId}`,{requestType:'Payment',mid:c.credentials.mid,websiteName:c.credentials.websiteName,orderId:input.orderId,callbackUrl:callback,txnAmount:{value:input.amount.toFixed(2),currency:'INR'},userInfo:{custId:input.customerId.replaceAll('-',''),email:input.email,mobile:input.phone,firstName:input.firstName}});if(!data.txnToken)throw new Error('Paytm could not initiate checkout. Verify merchant settings.');return {...launch,gatewayOrderId:input.orderId,mid:c.credentials.mid,token:data.txnToken};}
 const fields:Record<string,string>={key:c.credentials.merchantKey,txnid:input.orderId,amount:input.amount.toFixed(2),productinfo:'Domain registration: '+input.domain,firstname:input.firstName,email:input.email,phone:input.phone,surl:callback,furl:callback};
 fields.hash=hostedHash(fields,c.credentials.salt);
 if(c.provider==='payu')return {...launch,gatewayOrderId:input.orderId,formAction:c.environment==='production'?'https://secure.payu.in/_payment':'https://test.payu.in/_payment',fields};
 const data=await formRequest(easeBase(c)+'/payment/initiateLink',fields);if(Number(data.status)!==1||typeof data.data!=='string')throw new Error('Easebuzz could not initiate checkout. Verify merchant settings.');return {...launch,gatewayOrderId:input.orderId,redirectUrl:easeBase(c)+'/pay/'+encodeURIComponent(data.data)};
}
export type VerifiedPayment={status:'PAID'|'PENDING'|'FAILED';amount?:number;currency?:string};
export async function verifyRemotePayment(c:PaymentConfig,orderId:string):Promise<VerifiedPayment>{
 if(c.provider==='cashfree'){const data=await getCashfreeOrder(orderId,cashfreeConfig(c));return {status:data.order_status==='PAID'?'PAID':['EXPIRED','TERMINATED'].includes(data.order_status)?'FAILED':'PENDING',amount:Number(data.order_amount),currency:data.order_currency};}
 if(c.provider==='razorpay'){const api=new Razorpay({key_id:c.credentials.keyId,key_secret:c.credentials.keySecret}),data=await api.orders.fetch(orderId);return {status:data.status==='paid'?'PAID':'PENDING',amount:Number(data.amount_paid)/100,currency:data.currency};}
 if(c.provider==='paytm'){const data=await paytmRequest(c,'/v3/order/status',{mid:c.credentials.mid,orderId});if(data.orderId&&data.orderId!==orderId||data.mid&&data.mid!==c.credentials.mid)throw new Error('Paytm returned a different order.');return {status:data.resultInfo?.resultStatus==='TXN_SUCCESS'?'PAID':data.resultInfo?.resultStatus==='TXN_FAILURE'?'FAILED':'PENDING',amount:Number(data.txnAmount),currency:'INR'};}
 if(c.provider==='payu'){const data=await formRequest(c.environment==='production'?'https://info.payu.in/merchant/postservice.php?form=2':'https://test.payu.in/merchant/postservice?form=2',{key:c.credentials.merchantKey,command:'verify_payment',var1:orderId,hash:sha512([c.credentials.merchantKey,'verify_payment',orderId,c.credentials.salt].join('|'))});const detail=data.transaction_details?.[orderId];if(!detail)return {status:'PENDING'};return {status:detail.status==='success'&&detail.unmappedstatus==='captured'?'PAID':detail.status==='failure'?'FAILED':'PENDING',amount:Number(detail.transaction_amount??detail.amt??detail.amount),currency:'INR'};}
 const data=await formRequest(easeBase(c,true)+'/transaction/v2/retrieve',{key:c.credentials.merchantKey,txnid:orderId,hash:sha512([c.credentials.merchantKey,orderId,c.credentials.salt].join('|'))});const detail=Array.isArray(data.msg)?data.msg[0]:Array.isArray(data.data)?data.data[0]:data.msg||data.data;if(!detail||typeof detail!=='object')return {status:'PENDING'};if(detail.txnid!==orderId)throw new Error('Easebuzz returned a different order.');return {status:detail.status==='success'?'PAID':detail.status==='failure'?'FAILED':'PENDING',amount:Number(detail.amount),currency:'INR'};
}
