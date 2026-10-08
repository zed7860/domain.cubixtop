import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { db, hashPassword, verifyPassword, type User } from '@/lib/db';
import { currentUser, createSession, tokenHash, checkOrigin, rateLimit, HttpError, errorResponse, newAuthToken } from '@/lib/auth';
import { emailReady, sendCubixtopEmail } from '@/lib/email';
export const runtime='nodejs';
export async function GET() { return Response.json({user:await currentUser()},{headers:{'Cache-Control':'no-store'}}); }
const credentials=z.object({email:z.email().max(254).transform(v=>v.trim().toLowerCase()),password:z.string().min(12,'Use at least 12 characters.').max(128),name:z.string().trim().min(2).max(80).optional(),action:z.enum(['login','signup'])});
export async function POST(req:Request) {
 try {
  checkOrigin(req); rateLimit('auth-global',60); rateLimit('auth:'+ (req.headers.get('x-forwarded-for') || 'local'),12);
  const body=await req.json();
  if(body.action==='logout') {const jar=await cookies();const token=jar.get('cubixtop_session')?.value;if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token));jar.delete('cubixtop_session');return Response.json({ok:true});}
  const parsed=credentials.safeParse(body);if(!parsed.success)throw new HttpError(parsed.error.issues[0].message);
  const {email,password,name,action}=parsed.data;
  let user=db.prepare('SELECT * FROM users WHERE email=?').get(email) as (User & {password:string})|undefined;
  if(action==='signup') {
   if(!name)throw new HttpError('Your name is required.');
   if(user)throw new HttpError('This email cannot be used. Sign in or use another email.');
   const id=randomUUID();db.prepare('INSERT INTO users(id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').run(id,email,name,hashPassword(password),'customer',new Date().toISOString());
   user={id,email,name,role:'customer',password:''};
   if(emailReady()){const token=newAuthToken(id,'verify',24*60*60*1000);const base=process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin;await sendCubixtopEmail(email,'Verify your Cubixtop account','Verify your email','Confirm this email address to finish setting up your Cubixtop Domains account.',{label:'Verify email',url:`${base}/verify?token=${token}`});}
  }else if(!user || !verifyPassword(password,user.password)) throw new HttpError('Email or password is incorrect.',401);
  await createSession(user.id);
  return Response.json({user:{id:user.id,email:user.email,name:user.name,role:user.role}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:'Invalid JSON request.'},{status:400});return errorResponse(error);}
}

