import { randomUUID } from 'node:crypto';
import { db, type Checkout } from '@/lib/db';
import { requireUser, checkOrigin, rateLimit, HttpError, errorResponse } from '@/lib/auth';
import { normalizeDomain, purchaseUrl, NameSiloRegistrar } from '@/lib/registrar';
export const runtime='nodejs';
export async function GET() {try{const user=await requireUser();return Response.json({orders:db.prepare('SELECT id,domain,quote,status,created_at,updated_at FROM checkouts WHERE user_id=? AND status!=\'cancelled\' ORDER BY created_at DESC').all(user.id)},{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
export async function POST(req:Request) {
 try{
  checkOrigin(req);const user=await requireUser();rateLimit('orders:'+user.id,20);
  const body=await req.json();if(typeof body.domain!=='string')throw new HttpError('Domain is required.');
  let domain:string;try{domain=normalizeDomain(body.domain);}catch{throw new HttpError('Invalid domain name.');}
  let quote:number|null=null;
  try{const result=await new NameSiloRegistrar().search(domain);if(result.available===false)throw new HttpError('This domain is registered. Search for another name.');quote=result.price;}catch(error){if(error instanceof HttpError)throw error;}
  const now=new Date().toISOString();
  db.prepare('INSERT INTO checkouts(id,user_id,domain,quote,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,domain) DO UPDATE SET quote=excluded.quote,updated_at=excluded.updated_at').run(randomUUID(),user.id,domain,quote,'pending_payment',now,now);
  const order=db.prepare('SELECT id,domain,quote,status,created_at FROM checkouts WHERE user_id=? AND domain=?').get(user.id,domain);
  return Response.json({order,checkoutUrl:purchaseUrl(domain)});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:'Invalid JSON.'},{status:400});return errorResponse(error);}
}



