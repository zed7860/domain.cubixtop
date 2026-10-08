import PaytmChecksum from 'paytmchecksum';
import {paymentProviders,type PaymentProvider} from '@/lib/payment-catalog';
import {hostedResponseValid} from '@/lib/payment-gateways';
import {attemptConfig,findPaymentAttempt,reconcilePayment} from '@/lib/payment-orders';
export const runtime='nodejs';
export async function POST(req:Request,{params}:{params:Promise<{provider:string}>}){try{
 const {provider}=await params;if(!paymentProviders.includes(provider as PaymentProvider)||!['paytm','payu','easebuzz'].includes(provider))return Response.json({error:'Unsupported callback'},{status:404});
 const raw=await req.text();if(raw.length>100000)return Response.json({error:'Payload too large'},{status:413});
 const fields=Object.fromEntries(new URLSearchParams(raw)),id=fields.ORDERID||fields.txnid;
 const attempt=id?findPaymentAttempt(id,provider as PaymentProvider):undefined;if(!attempt)return Response.json({error:'Order not found'},{status:404});
 const config=attemptConfig(attempt);
 const valid=provider==='paytm'?fields.MID===config.credentials.mid&&PaytmChecksum.verifySignature({...fields},config.credentials.merchantKey,fields.CHECKSUMHASH||''):fields.key===config.credentials.merchantKey&&hostedResponseValid(fields,config.credentials.salt);
 if(!valid)return Response.json({error:'Invalid signature'},{status:401});
 await reconcilePayment(attempt);
 const site=process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin;
 return Response.redirect(new URL('/payment/return?order_id='+encodeURIComponent(attempt.id),site),303);
}catch{return Response.json({error:'Payment verification temporarily unavailable. Check your order from the dashboard.'},{status:503});}}
