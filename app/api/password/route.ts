import { z } from 'zod';
import { db, hashPassword } from '@/lib/db';
import { checkOrigin, errorResponse, HttpError, newAuthToken, PASSWORD_RESET_TTL_MS, rateLimit, tokenHash } from '@/lib/auth';
import { emailReady, sendCubixtopEmail } from '@/lib/email';
export const runtime='nodejs';
const emailSchema=z.email().max(254);
export async function POST(req:Request){
 try{
  checkOrigin(req);
  rateLimit('password:'+(req.headers.get('x-forwarded-for')||'local'),5);
  const body=await req.json();
  if(!body||typeof body!=='object')throw new HttpError('Invalid request.');
  if(body.action==='request'){
   const parsed=emailSchema.safeParse(typeof body.email==='string'?body.email.trim().toLowerCase():body.email);
   if(!parsed.success)throw new HttpError('Enter a valid email address.');
   if(!emailReady())throw new HttpError('Email delivery is temporarily unavailable. Please contact support.',503);
   const user=await db.prepare('SELECT id,email FROM users WHERE email=?').get(parsed.data) as {id:string;email:string}|undefined;
   if(user){
    const token=await newAuthToken(user.id,'reset',PASSWORD_RESET_TTL_MS);
    const base=(process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin).replace(/\/$/,'');
    try{
     await sendCubixtopEmail(user.email,'Reset your Cubixtop Domain password','Reset your password','We received a request to reset your Cubixtop Domain password.\n\nUse the button below to choose a new password. This secure link expires in 2 hours and can be used only once. Requesting another link invalidates the previous one.\n\nIf you did not request this reset, you can ignore this email. Your password will stay the same. Never share this link with anyone.\n\nNeed help? Contact info@cubixtop.com.',{label:'Reset password',url:`${base}/reset-password?token=${token}`});
    }catch{
     await db.prepare('DELETE FROM auth_tokens WHERE token=?').run(tokenHash(token));
     console.error('Password reset email could not be delivered. Check SMTP configuration.');
     throw new HttpError('The reset email could not be delivered. Please try again later or contact support.',502);
    }
   }
   return Response.json({ok:true,message:'If an account exists for this email, a password reset link has been sent. It expires in 2 hours and works only once. Check your inbox and spam folder.'});
  }
  if(body.action==='reset'){
   if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new HttpError('This reset link is invalid or expired. Request a new link.');
   if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new HttpError('Choose a password of 12 to 128 characters.');
   const hash=hashPassword(body.password);
   await db.transaction(async()=>{
    const row=await db.prepare("SELECT user_id FROM auth_tokens WHERE token=? AND purpose='reset' AND expires>?").get(tokenHash(body.token),Date.now()) as {user_id:string}|undefined;
    if(!row)throw new HttpError('This reset link is invalid, expired or already used. Request a new link.');
    await db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,row.user_id);
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
    await db.prepare('DELETE FROM auth_tokens WHERE user_id=?').run(row.user_id);
   });
   return Response.json({ok:true,message:'Your password has been updated. Sign in with your new password.'});
  }
  throw new HttpError('Unknown action.');
 }catch(error){return errorResponse(error);}
}
