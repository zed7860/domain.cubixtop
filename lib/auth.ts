import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { db, type User } from './db';
export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export const PASSWORD_RESET_TTL_MS = 2 * 60 * 60 * 1000;
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get('cubixtop_session')?.value;
  if (!token) return null;
  return (await db.prepare('SELECT u.id,u.email,u.name,u.role,u.email_verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(tokenHash(token), Date.now())) as User | undefined || null;
}
export async function requireUser(admin = false) { const user = await currentUser(); if (!user) throw new HttpError('Please sign in.', 401); if (admin && user.role !== 'admin') throw new HttpError('Administrator access required.', 403); return user; }
export async function createSession(userId: string) { const token = randomBytes(32).toString('hex'); (await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())); (await db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token), userId, Date.now()+7*86400000)); (await cookies()).set('cubixtop_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:7*86400}); }
export class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function checkOrigin(req: Request) { const origin = req.headers.get('origin'); const url = new URL(req.url); const requestOrigin = `${url.protocol}//${req.headers.get('host') || url.host}`; if (origin && origin !== requestOrigin && origin !== process.env.NEXT_PUBLIC_SITE_URL) throw new HttpError('Request origin is not allowed.', 403); }
const buckets = new Map<string,{count:number;reset:number}>();
export function rateLimit(key:string,limit=30) { const now=Date.now(); if(buckets.size>5000) for(const [key,value] of buckets) if(value.reset<now)buckets.delete(key); const value=buckets.get(key); if(!value || value.reset<now) {buckets.set(key,{count:1,reset:now+60000});return;} if(++value.count>limit) throw new HttpError('Too many requests. Try again in a minute.',429); }
export function errorResponse(error: unknown) { if(error instanceof HttpError) return Response.json({error:error.message},{status:error.status}); return Response.json({error:'The request could not be completed. Please try again or contact support.'},{status:500}); }
export async function newAuthToken(userId:string,purpose:string,ttlMs:number){const raw=randomBytes(32).toString('hex');await db.transaction(async()=>{await db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND purpose=?').run(userId,purpose);await db.prepare('INSERT INTO auth_tokens VALUES (?,?,?,?)').run(tokenHash(raw),userId,purpose,Date.now()+ttlMs);});return raw;}
