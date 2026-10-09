import {createHmac} from 'node:crypto';
import {equalSignature,getPaymentConfig} from '@/lib/payment-gateways';
import {attemptConfig,findPaymentAttempt,reconcilePayment} from '@/lib/payment-orders';
export const runtime='nodejs';
export async function POST(req:Request){try{
 const raw=await req.text();if(raw.length>100000)return Response.json({error:'Payload too large'},{status:413});
 let payload;try{payload=JSON.parse(raw);}catch{return Response.json({error:'Invalid payload'},{status:400});}
 const orderId=payload?.payload?.payment?.entity?.order_id||payload?.payload?.order?.entity?.id;
 const attempt=typeof orderId==='string'?(await findPaymentAttempt(orderId,'razorpay')):undefined;
 const config=attempt?(await attemptConfig(attempt)):(await getPaymentConfig('razorpay'));
 if(!config||!equalSignature(createHmac('sha256',config.credentials.webhookSecret).update(raw).digest('hex'),req.headers.get('x-razorpay-signature')||''))return Response.json({error:'Invalid signature'},{status:401});
 if(attempt&&['order.paid','payment.captured'].includes(payload.event))await reconcilePayment(attempt);
 return Response.json({ok:true});
}catch{return Response.json({error:'Payment verification temporarily unavailable'},{status:503});}}
