import {db} from '@/lib/db';
import {checkOrigin,errorResponse,HttpError,rateLimit,requireUser} from '@/lib/auth';
import {findPaymentAttempt,reconcilePayment} from '@/lib/payment-orders';
import {readPrivateSetting} from '@/lib/settings';
import type {PaymentLaunch} from '@/lib/payment-catalog';
export async function POST(req:Request){try{
 checkOrigin(req);const user=await requireUser();rateLimit('payment-resume:'+user.id,10);
 const {orderId}=await req.json();if(typeof orderId!=='string')throw new HttpError('Order required.');
 const attempt=(await findPaymentAttempt(orderId));if(!attempt)throw new HttpError('Order not found.',404);
 const order=(await db.prepare('SELECT status FROM checkouts WHERE id=? AND user_id=?').get(attempt.checkout_id,user.id)) as {status:string}|undefined;
 if(!order)throw new HttpError('Order not found.',404);if(order.status==='cancelled')throw new HttpError('This order was cancelled. Start a new checkout if you still want this domain.',409);
 const latest=(await db.prepare('SELECT id FROM payment_attempts WHERE checkout_id=? ORDER BY rowid DESC LIMIT 1').get(attempt.checkout_id)) as {id:string};
 if(latest.id!==attempt.id||['manual_review','active','provisioning','sandbox_paid'].includes(order.status))return Response.json({returnUrl:'/payment/return?order_id='+encodeURIComponent(orderId)});
 const remote=await reconcilePayment(attempt);
 if(remote.status==='PAID')return Response.json({returnUrl:'/payment/return?order_id='+encodeURIComponent(orderId)});
 if(remote.status==='FAILED')throw new HttpError('This checkout has ended. Open a new checkout from your domain order.',409);
 const launch=(await readPrivateSetting<PaymentLaunch>('payment-launch-'+attempt.id));if(!launch)throw new HttpError('Checkout is not available. Please contact support.',409);
 return Response.json(launch);
}catch(error){return errorResponse(error);}}

