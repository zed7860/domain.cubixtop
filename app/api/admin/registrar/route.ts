import {validateRegistrarCredentials} from '@/lib/registrar-validation';
import {recordAdminActivity} from '@/lib/admin';
import {z} from 'zod';
import {checkOrigin,errorResponse,HttpError,rateLimit,requireUser} from '@/lib/auth';
import {saveRegistrarSettings,getRegistrarSettings} from '@/lib/settings';
const schema=z.object({provider:z.enum(['namesilo','godaddy','opensrs']).default('namesilo'),apiKey:z.string().trim().min(8).max(500).optional(),useSaved:z.boolean().default(false)});
export async function POST(req:Request){try{
  checkOrigin(req);const user=await requireUser(true);rateLimit('admin-registrar:'+user.id,5);
  const parsed=schema.safeParse(await req.json());if(!parsed.success)throw new HttpError(parsed.error.issues[0].message);
  if(parsed.data.provider!=='namesilo')throw new HttpError('This reseller connector requires its own contract and credentials before it can be connected.',409);
  const apiKey=parsed.data.useSaved?(getRegistrarSettings()?.credentials.apiKey||process.env.NAMESILO_API_KEY):parsed.data.apiKey;
  if(!apiKey)throw new HttpError('Enter a NameSilo API key or save one before testing the connection.');
  try{await validateRegistrarCredentials(apiKey);}catch(error){if(parsed.data.useSaved){const saved=getRegistrarSettings();if(saved)saveRegistrarSettings({...saved,verifiedAt:undefined});}throw error;}
  const verifiedAt=new Date().toISOString();
  saveRegistrarSettings({provider:'namesilo',credentials:{apiKey},verifiedAt});
  recordAdminActivity(user.id,'registrar_settings_updated',null,'NameSilo API successfully connected');
  return Response.json({ok:true,verified:true,verifiedAt,message:'Successfully connected to NameSilo. API credentials verified and saved securely.'});
}catch(error){return errorResponse(error);}}

