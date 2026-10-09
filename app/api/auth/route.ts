export const runtime = 'nodejs';
import { databaseReady } from '@/lib/db';

async function unavailable(error:unknown){
  // Keep initialization failures in the server log, never in a browser response.
  console.error('Authentication service initialization failed:', error);
  return Response.json({error:'Sign-in service is unavailable. The website administrator must check server storage and hosting configuration.'},{status:503,headers:{'Cache-Control':'no-store'}});
}
export async function GET(){
  try{await databaseReady();const handlers=await import('@/lib/auth-handlers');return await handlers.GET();}
  catch(error){return unavailable(error);}
}
export async function POST(req:Request){
  try{await databaseReady();const handlers=await import('@/lib/auth-handlers');return await handlers.POST(req);}
  catch(error){return unavailable(error);}
}
