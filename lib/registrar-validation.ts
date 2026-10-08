import { HttpError } from './auth';
export async function validateRegistrarCredentials(apiKey:string){
 const url=new URL('https://www.namesilo.com/api/checkRegisterAvailability');url.search=new URLSearchParams({version:'1',type:'json',key:apiKey,domains:'cubixtop-integration-check.com'}).toString();
 let response:Response,data:unknown;
 try{response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});data=await response.json();}catch{throw new HttpError('Connection could not be checked. Try again or check registrar access and network settings.',502);}
 const reply=(data as {reply?:{code?:unknown}}|null)?.reply;
 if(!response.ok||Number(reply?.code)!==300)throw new HttpError('Connection failed. Check your NameSilo API key, reseller permissions and allowed server IP.',400);
 return true;
}
