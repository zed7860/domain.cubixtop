import {db,type Checkout} from './db';
import {readPrivateSetting} from './settings';
import type {PaymentConfig,PaymentProvider} from './payment-catalog';
import {getCashfreeSettings} from './settings';
import {verifyRemotePayment,type VerifiedPayment,recordVerifiedPaymentConnection} from './payment-gateways';
import {NameSiloRegistrar} from './registrar';
import {sendCubixtopEmail} from './email';

export type PaymentAttempt={id:string;checkout_id:string;provider:PaymentProvider;config_key:string;gateway_order_id:string|null;status:string;amount_inr:number};
export function findPaymentAttempt(id:string,provider?:PaymentProvider){return db.prepare(provider?'SELECT * FROM payment_attempts WHERE provider=? AND (id=? OR gateway_order_id=?)':'SELECT * FROM payment_attempts WHERE id=? OR gateway_order_id=?').get(...(provider?[provider,id,id]:[id,id])) as PaymentAttempt|undefined;}
export function attemptConfig(attempt:PaymentAttempt){const config=readPrivateSetting<PaymentConfig>(attempt.config_key);if(!config)throw new Error('Payment configuration is unavailable.');return config;}
export async function settleCheckout(order:Checkout,payment:VerifiedPayment,attempt?:PaymentAttempt){
 const now=new Date().toISOString();
 if(payment.status!=='PAID'){
  // A single failed payment event must not close an order which allows another payment attempt.
  if(payment.status==='FAILED')db.prepare("UPDATE checkouts SET status='payment_failed',updated_at=? WHERE id=? AND status='payment_pending'").run(now,order.id);
  return;
 }
 if(attempt)db.prepare("UPDATE payment_attempts SET status='paid' WHERE id=?").run(attempt.id);
 if(!Number.isFinite(payment.amount)||!order.amount_inr||Math.round(payment.amount!*100)!==Math.round(order.amount_inr*100)||payment.currency!=='INR'){
  db.prepare("UPDATE checkouts SET status='manual_review',failure_reason='Payment amount or currency mismatch',updated_at=? WHERE id=? AND status NOT IN ('active','provisioning')").run(now,order.id);return;
 }
 // Claim in one statement: callbacks, webhooks and polling may arrive concurrently.
 const cancelled=db.prepare("UPDATE checkouts SET status='manual_review',failure_reason='Payment received after order cancellation; review with the merchant before registration or refund',updated_at=? WHERE id=? AND status='cancelled'").run(now,order.id);
 if(cancelled.changes){if(attempt)db.prepare("UPDATE payment_attempts SET status='manual_review' WHERE id=?").run(attempt.id);return;}
 const claimed=db.prepare("UPDATE checkouts SET status='provisioning',updated_at=? WHERE id=? AND status IN ('payment_pending','payment_failed')").run(now,order.id);
 if(!claimed.changes)return;
 // Sandbox payments must never buy a real domain from the registrar.
 const environment=attempt?attemptConfig(attempt).environment:getCashfreeSettings()?.environment;
 if(environment!=='production'){
  db.prepare("UPDATE checkouts SET status='sandbox_paid',failure_reason='Sandbox payment verified; no live domain was registered',updated_at=? WHERE id=?").run(now,order.id);return;
 }
 try{
  const contact=JSON.parse(order.contact||'{}');
  const result=await new NameSiloRegistrar().register({domain:order.domain,years:Number(contact.years||1),contact});
  db.prepare("UPDATE checkouts SET status='active',registrar_reference=?,failure_reason=NULL,updated_at=? WHERE id=?").run(result.reference,new Date().toISOString(),order.id);
 }catch(error){db.prepare("UPDATE checkouts SET status='manual_review',failure_reason=?,updated_at=? WHERE id=?").run((error as Error).message.slice(0,300),new Date().toISOString(),order.id);return;}
 const user=db.prepare('SELECT email FROM users WHERE id=?').get(order.user_id) as {email:string}|undefined;
 // Email delivery failure must not change a successfully provisioned domain.
 if(user)try{await sendCubixtopEmail(user.email,'Your domain is active',`${order.domain} is now active`,'Your domain registration completed successfully. Sign in to your Cubixtop account for order details.');}catch{console.error('Domain activation email could not be delivered.');}
}
export async function reconcilePayment(attempt:PaymentAttempt){
 if(!attempt.gateway_order_id)throw new Error('Checkout preparation is still pending.');
 const payment=await verifyRemotePayment(attemptConfig(attempt),attempt.gateway_order_id);
 if(payment.status==='PAID'&&payment.currency==='INR'&&Number.isFinite(payment.amount)&&Math.round(payment.amount!*100)===Math.round(attempt.amount_inr*100))recordVerifiedPaymentConnection(attemptConfig(attempt));
 const order=db.prepare('SELECT * FROM checkouts WHERE id=?').get(attempt.checkout_id) as Checkout|undefined;
 if(!order)throw new Error('Order unavailable.');
 // A late success for a replaced attempt must be reviewed, never register with new contact/amount.
 const latest=db.prepare('SELECT id FROM payment_attempts WHERE checkout_id=? ORDER BY rowid DESC LIMIT 1').get(order.id) as {id:string}|undefined;
 if(latest?.id!==attempt.id){if(payment.status==='PAID'){
  db.prepare("UPDATE payment_attempts SET status='manual_review' WHERE id=?").run(attempt.id);
  db.prepare("UPDATE checkouts SET status=CASE WHEN status IN ('active','provisioning') THEN status ELSE 'manual_review' END,failure_reason='Payment received for an older checkout attempt; review for duplicate payment',updated_at=? WHERE id=?").run(new Date().toISOString(),order.id);
 }return payment;}
 await settleCheckout(order,payment,attempt);return payment;
}
