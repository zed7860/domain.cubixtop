import {z} from 'zod';
import {db} from '@/lib/db';
import {checkOrigin,errorResponse,HttpError,rateLimit,requireUser} from '@/lib/auth';
import {razorpaySignature} from '@/lib/payment-gateways';
import {attemptConfig,findPaymentAttempt,reconcilePayment} from '@/lib/payment-orders';
const schema=z.object({orderId:z.string(),razorpay_order_id:z.string(),razorpay_payment_id:z.string(),razorpay_signature:z.string()});
export async function POST(req:Request){try{
 checkOrigin(req);const user=await requireUser();rateLimit('razorpay-verify:'+user.id,20);
 const data=schema.parse(await req.json()),attempt=(await findPaymentAttempt(data.orderId,'razorpay'));
 if(!attempt||!(await db.prepare('SELECT id FROM checkouts WHERE id=? AND user_id=?').get(attempt.checkout_id,user.id)))throw new HttpError('Order not found.',404);
 if(attempt.gateway_order_id!==data.razorpay_order_id||!razorpaySignature(attempt.gateway_order_id,data.razorpay_payment_id,data.razorpay_signature,(await attemptConfig(attempt)).credentials.keySecret))throw new HttpError('Invalid payment signature.',401);
 const payment=await reconcilePayment(attempt);return Response.json({ok:true,paymentStatus:payment.status});
}catch(error){return errorResponse(error);}}
