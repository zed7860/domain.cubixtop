import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { db, hashPassword, verifyPassword, type User } from '@/lib/db';
import { currentUser, createSession, tokenHash, checkOrigin, rateLimit, HttpError, errorResponse, newAuthToken } from '@/lib/auth';
import { emailReady, sendCubixtopEmail } from '@/lib/email';
import { authErrorMessage, supabaseAuth, supabaseAuthEnabled } from '@/lib/supabase-auth';
export const runtime='nodejs';
export async function GET() { return Response.json({user:await currentUser()},{headers:{'Cache-Control':'no-store'}}); }
const credentials=z.object({email:z.email().max(254).transform(v=>v.trim().toLowerCase()),password:z.string().min(12,'Use at least 12 characters.').max(128),name:z.string().trim().min(2).max(80).optional(),action:z.enum(['login','signup'])});
export async function POST(req:Request) {
 try {
  checkOrigin(req); rateLimit('auth-global',60); rateLimit('auth:'+ (req.headers.get('x-forwarded-for') || 'local'),12);
  const body=await req.json();
  if(body.action==='logout') {const jar=await cookies();const token=jar.get('cubixtop_session')?.value;if(token)(await db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token)));jar.delete('cubixtop_session');return Response.json({ok:true});}
  const parsed=credentials.safeParse(body);if(!parsed.success)throw new HttpError(parsed.error.issues[0].message);
  const {email,password,name,action}=parsed.data;
  let user=(await db.prepare('SELECT * FROM users WHERE email=?').get(email)) as (User & {password:string})|undefined;
  const adminEmail=(process.env.ADMIN_EMAIL||'admin@cubixtop.com').trim().toLowerCase();
  if(action==='login'&&email===adminEmail){
   if(!process.env.ADMIN_PASSWORD||password!==process.env.ADMIN_PASSWORD)throw new HttpError('Email or password is incorrect.',401);
   if(!user||user.role!=='admin')throw new HttpError('Administrator account is not initialized.',503);
   await createSession(user.id);
   return Response.json({user:{id:user.id,email:user.email,name:user.name,role:user.role}});
  }
  if(supabaseAuthEnabled()){
   const auth=supabaseAuth();
   if(action==='signup'){
    if(!name)throw new HttpError('Your name is required.');
    if(email===adminEmail)throw new HttpError('This email cannot be used. Sign in or use another email.');
    const base=(process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin).replace(/\/$/,'');
    const {data,error}=await auth.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:`${base}/verify`}});
    if(error)throw new HttpError(authErrorMessage(error.message),400);
    if(!data.user)throw new HttpError('Account creation could not be completed.',502);
    await db.prepare(`INSERT INTO users(id,email,name,password,role,created_at,email_verified) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name`).run(data.user.id,email,name,'supabase-auth','customer',new Date().toISOString(),data.user.email_confirmed_at?1:0);
    user=(await db.prepare('SELECT * FROM users WHERE email=?').get(email)) as User & {password:string};
    if(data.session)await createSession(user.id);
    return Response.json({user:{id:user.id,email:user.email,name:user.name,role:user.role},requiresVerification:!data.session});
   }
   const {data,error}=await auth.auth.signInWithPassword({email,password});
   if(error||!data.user)throw new HttpError(authErrorMessage(error?.message||''),401);
   const authName=String(data.user.user_metadata?.full_name||email.split('@')[0]).slice(0,80);
   await db.prepare(`INSERT INTO users(id,email,name,password,role,created_at,email_verified) VALUES (?,?,?,?,?,?,1) ON CONFLICT(email) DO UPDATE SET email_verified=1`).run(data.user.id,email,authName,'supabase-auth','customer',new Date().toISOString());
   user=(await db.prepare('SELECT * FROM users WHERE email=?').get(email)) as User & {password:string};
   await createSession(user.id);
   return Response.json({user:{id:user.id,email:user.email,name:user.name,role:user.role}});
  }
  if(action==='signup') {
   if(!name)throw new HttpError('Your name is required.');
   if(user)throw new HttpError('This email cannot be used. Sign in or use another email.');
   const id=randomUUID();(await db.prepare('INSERT INTO users(id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').run(id,email,name,hashPassword(password),'customer',new Date().toISOString()));
   user={id,email,name,role:'customer',password:''};
   if(emailReady()){
    const token=await newAuthToken(id,'verify',24*60*60*1000);
    const base=(process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin).replace(/\/$/,'');
    try{await sendCubixtopEmail(email,'Welcome to Cubixtop Domain','Welcome to Cubixtop Domain',`Hi ${name},\n\nThanks for joining Cubixtop Domain. Your account is ready, and we’re glad to help bring your next idea online.\n\nSearch for your perfect domain, review pricing before you pay, and manage your domain orders and account details in one secure workspace.\n\nPlease verify your registered email address using the button below. This verification link is valid for 24 hours.\n\nYour account email: ${email}\nSign in and visit your dashboard: ${base}/dashboard\n\nKeep your password private. If you ever forget it, choose “Forgot password?” on the sign-in page to request a secure reset link.\n\nNeed help? Contact info@cubixtop.com.\n\nWelcome aboard,\nThe Cubixtop team`,{label:'Verify my email',url:`${base}/verify?token=${token}`});}
    catch{await db.prepare('DELETE FROM auth_tokens WHERE token=?').run(tokenHash(token));console.error('Signup welcome email could not be delivered. The account was created; email verification can be requested from Account.');}
   }
  }else if(!user || !verifyPassword(password,user.password)) throw new HttpError('Email or password is incorrect.',401);
  await createSession(user.id);
  return Response.json({user:{id:user.id,email:user.email,name:user.name,role:user.role}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:'Invalid JSON request.'},{status:400});return errorResponse(error);}
}

