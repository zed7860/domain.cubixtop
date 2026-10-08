import {z} from 'zod';
import {checkOrigin,errorResponse,HttpError,rateLimit,requireUser} from '@/lib/auth';
import {paymentCatalog,paymentProviders} from '@/lib/payment-catalog';
import {getPaymentConfig,publicPaymentSettings,savePaymentConfig,validatePaymentConfig} from '@/lib/payment-gateways';
import {recordAdminActivity} from '@/lib/admin';
import type {PaymentConfig} from '@/lib/payment-catalog';
import {writePrivateSetting} from '@/lib/settings';
const schema=z.object({provider:z.enum(paymentProviders),environment:z.enum(['sandbox','production']),credentials:z.record(z.string(),z.string().trim().max(300)).default({}),activateOnly:z.boolean().default(false)});
export async function GET(){try{await requireUser(true);return Response.json(publicPaymentSettings());}catch(error){return errorResponse(error);}}
export async function POST(req:Request){try{
 checkOrigin(req);const user=await requireUser(true);rateLimit('admin-payments:'+user.id,10);
 const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError('Select a supported gateway, environment and valid credentials.');
 const {provider,environment,credentials,activateOnly}=parsed.data;
 let config:PaymentConfig={provider,environment,credentials};
 if(activateOnly){const existing=getPaymentConfig(provider);if(!existing)throw new HttpError('Save this gateway’s credentials first.');config=existing;}
 for(const field of paymentCatalog[provider].fields)if(!config.credentials[field.key])throw new HttpError(`${field.label} is required.`);
 if(provider==='paytm'&&Buffer.byteLength(config.credentials.merchantKey)!==16)throw new HttpError('Paytm merchant key must be exactly 16 bytes.');
 if(provider==='razorpay'&&!config.credentials.keyId.startsWith(config.environment==='sandbox'?'rzp_test_':'rzp_live_'))throw new HttpError('Razorpay Key ID does not match the selected environment.');
 if(config.environment==='production'){const site=process.env.NEXT_PUBLIC_SITE_URL;if(!site||!site.startsWith('https://'))throw new HttpError('Set NEXT_PUBLIC_SITE_URL to the public HTTPS website URL before enabling live payments.');}
 let validation:Awaited<ReturnType<typeof validatePaymentConfig>>;try{validation=await validatePaymentConfig(config);}catch{if(activateOnly){writePrivateSetting('payment-'+provider,{...config,connection:{verified:false,checkedAt:new Date().toISOString(),scope:'api'}});return Response.json({...publicPaymentSettings(),error:'Connection failed. Check saved credentials, environment and merchant API access.'},{status:502});}throw new HttpError('Connection failed. Check all gateway credentials, the selected environment and merchant API access.',502);}
 // Hosted gateways retain payment-based proof only when rechecking the same saved credentials.
 const provenPayment=activateOnly&&config.connection?.verified&&config.connection.scope==='payment';
 if(!provenPayment)config={...config,connection:{verified:validation.verified,checkedAt:new Date().toISOString(),scope:'api'}};
 savePaymentConfig(config);recordAdminActivity(user.id,'payment_settings_updated',null,`${paymentCatalog[provider].name} selected in ${config.environment}; ${config.connection?.verified?'connection verified':'verification pending'}`);return Response.json({...publicPaymentSettings(),verified:config.connection?.verified===true,message:provenPayment?`Successfully connected to ${paymentCatalog[provider].name} (${config.environment}). These saved credentials were verified by a payment.`:validation.message});
}catch(error){return errorResponse(error);}}
