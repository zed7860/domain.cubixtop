import {db,type Checkout} from '@/lib/db';
import {getCashfreeOrder} from '@/lib/cashfree';
import {errorResponse,HttpError,rateLimit,requireUser} from '@/lib/auth';
import {findPaymentAttempt,reconcilePayment,settleCheckout} from '@/lib/payment-orders';
export const runtime='nodejs';
export async function GET(req:Request){try{
 const user=await requireUser();rateLimit('payment-status:'+user.id,30);
 const orderId=new URL(req.url).searchParams.get('order_id');if(!orderId)throw new HttpError('Order required.');
 const attempt=findPaymentAttempt(orderId);
 const order=(attempt?db.prepare('SELECT * FROM checkouts WHERE id=? AND user_id=?').get(attempt.checkout_id,user.id):db.prepare('SELECT * FROM checkouts WHERE cashfree_order_id=? AND user_id=?').get(orderId,user.id)) as Checkout|undefined;
 if(!order)throw new HttpError('Order not found.',404);
 let paymentStatus='PENDING';
 if(['active','sandbox_paid','provisioning'].includes(order.status))paymentStatus='PAID';
 else if(attempt){const remote=await reconcilePayment(attempt);paymentStatus=remote.status;}
 else{const remote=await getCashfreeOrder(orderId);paymentStatus=remote.order_status;await settleCheckout(order,{status:remote.order_status==='PAID'?'PAID':'PENDING',amount:remote.order_amount,currency:remote.order_currency});}
 const updated=db.prepare('SELECT status FROM checkouts WHERE id=?').get(order.id) as {status:string};
 return Response.json({domain:order.domain,status:updated.status,paymentStatus,provider:attempt?.provider||'cashfree',sandbox:updated.status==='sandbox_paid'});
}catch(error){return errorResponse(error);}}
