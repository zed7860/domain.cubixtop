import { db,type Checkout } from '@/lib/db';
import { checkOrigin,requireUser,rateLimit,HttpError,errorResponse } from '@/lib/auth';
import { reconcilePayment,type PaymentAttempt } from '@/lib/payment-orders';
import { recordAdminActivity } from '@/lib/admin';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
  checkOrigin(req);const user=await requireUser();rateLimit('cancel-order:'+user.id,15);const {id}=await params;
  const order=(await db.prepare('SELECT * FROM checkouts WHERE id=?').get(id)) as Checkout|undefined;
  if(!order||(user.role!=='admin'&&order.user_id!==user.id))throw new HttpError('Order not found.',404);
  if(order.status==='cancelled')return Response.json({message:'Order already cancelled.'});
  if(!['pending_payment','payment_pending','payment_failed'].includes(order.status))throw new HttpError('Only unpaid orders can be cancelled. Paid and registration orders require support review.',409);
  const attempts=(await db.prepare('SELECT id,checkout_id,provider,config_key,gateway_order_id,status,amount_inr FROM payment_attempts WHERE checkout_id=? ORDER BY rowid DESC').all(id)) as PaymentAttempt[];
  if(attempts.some(attempt=>['paid','manual_review'].includes(attempt.status)))throw new HttpError('Payment records require review; this order cannot be cancelled.',409);
  for(const attempt of attempts){if(attempt.status==='creation_failed')continue;if(!attempt.gateway_order_id)throw new HttpError('Checkout is still being prepared. Try again shortly.',409);try{const remote=await reconcilePayment(attempt);if(remote.status==='PAID')throw new HttpError('Payment was received. The order cannot be cancelled.',409);}catch(error){if(error instanceof HttpError)throw error;throw new HttpError('Payment status could not be verified. Check the payment before cancelling.',502);}}
  if(!attempts.length&&order.cashfree_order_id)throw new HttpError('This older payment must be reviewed by support before cancellation.',409);
  await db.transaction(async () => {const updated=(await db.prepare("UPDATE checkouts SET status='cancelled',failure_reason=NULL,updated_at=? WHERE id=? AND status IN ('pending_payment','payment_pending','payment_failed') AND NOT EXISTS (SELECT 1 FROM payment_attempts WHERE checkout_id=? AND status IN ('paid','manual_review'))").run(new Date().toISOString(),id,id));if(!updated.changes)throw new HttpError('The order changed or a payment was received. Refresh and review it.',409);if(user.role==='admin')(await recordAdminActivity(user.id,'unpaid_order_cancelled',order.user_id,`Cancelled unpaid order for ${order.domain}`));});
  return Response.json({message:'Unpaid order cancelled.'});
}catch(error){return errorResponse(error);}}
