import {db,type Checkout} from '@/lib/db';
import {verifyCashfreeWebhook,getCashfreeOrder} from '@/lib/cashfree';
import {attemptConfig,findPaymentAttempt,reconcilePayment,settleCheckout} from '@/lib/payment-orders';
export const runtime='nodejs';
export async function POST(req:Request){try{
 const raw=await req.text();if(raw.length>100000)return Response.json({error:'Payload too large'},{status:413});
 let payload;try{payload=JSON.parse(raw);}catch{return Response.json({error:'Invalid payload'},{status:400});}
 const orderId=payload?.data?.order?.order_id;if(typeof orderId!=='string')return Response.json({error:'Missing order'},{status:400});
 const attempt=findPaymentAttempt(orderId,'cashfree');
 const secret=attempt?attemptConfig(attempt).credentials.secretKey:undefined;
 if(!verifyCashfreeWebhook(raw,req.headers.get('x-webhook-timestamp')||'',req.headers.get('x-webhook-signature')||'',secret))return Response.json({error:'Invalid signature'},{status:401});
 if(attempt)await reconcilePayment(attempt);
 else{const order=db.prepare('SELECT * FROM checkouts WHERE cashfree_order_id=?').get(orderId) as Checkout|undefined;if(order){const remote=await getCashfreeOrder(orderId);await settleCheckout(order,{status:remote.order_status==='PAID'?'PAID':'PENDING',amount:remote.order_amount,currency:remote.order_currency});}}
 return Response.json({ok:true});
}catch{return Response.json({error:'Payment verification temporarily unavailable'},{status:503});}}
