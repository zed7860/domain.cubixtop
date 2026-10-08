import { db } from '@/lib/db';import { errorResponse, HttpError, tokenHash } from '@/lib/auth';
export const runtime='nodejs';
export async function POST(req:Request){try{const body=await req.json();if(typeof body.token!=='string')throw new HttpError('Invalid verification link.');const row=db.prepare("SELECT user_id FROM auth_tokens WHERE token=? AND purpose='verify' AND expires>?").get(tokenHash(body.token),Date.now()) as {user_id:string}|undefined;if(!row)throw new HttpError('This verification link is invalid or expired.');db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);return Response.json({ok:true});}catch(error){return errorResponse(error);}}

