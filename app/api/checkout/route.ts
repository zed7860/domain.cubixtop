import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {db,type Checkout} from '@/lib/db';
import {checkOrigin,errorResponse,HttpError,rateLimit,requireUser} from '@/lib/auth';
import {NameSiloRegistrar,normalizeDomain} from '@/lib/registrar';
import {getUsdInrRate} from '@/lib/currency';
import {createPayment,getPaymentConfig} from '@/lib/payment-gateways';
import {writePrivateSetting} from '@/lib/settings';
export const runtime='nodejs';
const schema=z.object({domain:z.string(),years:z.number().int().min(1).max(10).default(1),phone:z.string().regex(/^\d{10}$/),fn:z.string().trim().min(1).max(32),ln:z.string().trim().min(1).max(32),ad:z.string().trim().min(3).max(128),cy:z.string().trim().min(1).max(64),st:z.string().trim().min(1).max(64),zp:z.string().trim().min(3).max(16),ct:z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)});
export async function POST(req:Request){try{
 checkOrigin(req);const user=await requireUser();rateLimit('checkout:'+user.id,8);
 const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(parsed.error.issues[0].message);
 const config=getPaymentConfig();if(!config)throw new HttpError('Payments are not configured yet. Please contact support.',503);
 const domain=normalizeDomain(parsed.data.domain),quote=await new NameSiloRegistrar().search(domain,parsed.data.years);
 if(!quote.verified||quote.available!==true||quote.price===null)throw new HttpError('Live availability and price must be confirmed before payment.',409);
 const {rate}=await getUsdInrRate(),markup=Number(process.env.DEFAULT_MARKUP_PERCENT||25);
 const amount=Math.round(quote.price*rate*(1+(Number.isFinite(markup)?markup:25)/100)*100)/100;
 if(!Number.isFinite(amount)||amount<=0)throw new HttpError('A valid payment amount could not be calculated.',503);
 const {fn,ln,ad,cy,st,zp,ct,phone,years}=parsed.data,contact={fn,ln,ad,cy,st,zp,ct,em:user.email,ph:phone,years};
 const orderId='cubix_'+randomUUID().replaceAll('-',''),now=new Date().toISOString(),configKey='payment-attempt-'+orderId;
 let id:string;
 db.exec('BEGIN IMMEDIATE');
 try{
  const existing=db.prepare('SELECT * FROM checkouts WHERE user_id=? AND domain=?').get(user.id,domain) as Checkout|undefined;
  if(existing&&['active','payment_pending','provisioning','manual_review'].includes(existing.status))throw new HttpError('An order for this domain already exists. Check its payment status in your dashboard before retrying.',409);
  id=existing?.id||randomUUID();writePrivateSetting(configKey,config);
  db.prepare(`INSERT INTO checkouts(id,user_id,domain,quote,status,created_at,updated_at,amount_inr,contact) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,domain) DO UPDATE SET quote=excluded.quote,status=excluded.status,updated_at=excluded.updated_at,amount_inr=excluded.amount_inr,contact=excluded.contact,failure_reason=NULL,cashfree_order_id=NULL,payment_session_id=NULL`).run(id,user.id,domain,quote.price,'payment_pending',now,now,amount,JSON.stringify(contact));
  db.prepare('INSERT INTO payment_attempts(id,checkout_id,provider,config_key,amount_inr,created_at,gateway_order_id) VALUES(?,?,?,?,?,?,?)').run(orderId,id,config.provider,configKey,amount,now,config.provider==='razorpay'?null:orderId);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 try{
  const payment=await createPayment(config,{orderId,amount,customerId:user.id,name:`${fn} ${ln}`,firstName:fn,email:user.email,phone,domain});
  writePrivateSetting('payment-launch-'+orderId,payment);
  db.prepare('UPDATE payment_attempts SET gateway_order_id=? WHERE id=?').run(payment.gatewayOrderId||orderId,orderId);
  if(config.provider==='cashfree')db.prepare('UPDATE checkouts SET cashfree_order_id=?,payment_session_id=? WHERE id=?').run(orderId,payment.paymentSessionId||null,id);
  return Response.json(payment);
 }catch{
  db.prepare("UPDATE checkouts SET status='payment_failed',failure_reason='Gateway checkout could not be created',updated_at=? WHERE id=? AND status='payment_pending'").run(new Date().toISOString(),id);
  db.prepare("UPDATE payment_attempts SET status='creation_failed' WHERE id=? AND status='pending'").run(orderId);
  throw new HttpError('The gateway could not prepare checkout. Check merchant settings or try again.',502);
 }
}catch(error){return errorResponse(error);}}
