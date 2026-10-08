import {POST as configurePayment} from '../payments/route';
import {errorResponse} from '@/lib/auth';
// Keep the previous setup endpoint compatible with the unified settings validation.
export async function POST(req:Request){try{
 const data=await req.json();
 return configurePayment(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({provider:'cashfree',environment:data.environment,credentials:{appId:data.appId,secretKey:data.secretKey}})}));
}catch(error){return errorResponse(error);}}
