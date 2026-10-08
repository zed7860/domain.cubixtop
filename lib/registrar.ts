import { domainToASCII } from "node:url";
import {getRegistrarSettings} from './settings';

function nameSiloKey(){const saved=getRegistrarSettings();return saved?.provider==='namesilo'?saved.credentials.apiKey:process.env.NAMESILO_API_KEY;}

export function normalizeDomain(value: string): string {
  let domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) throw new Error("Enter a domain name.");
  if (!domain.includes(".")) domain += ".com";
  if (/[\s?#@:\\]/.test(domain)) throw new Error("Enter a valid domain name.");
  domain = domainToASCII(domain);
  const labels = domain.split(".");
  if (domain.length > 253 || labels.length < 2 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/^[a-z]{2,63}$|^xn--[a-z0-9-]+$/.test(labels.at(-1)!)) {
    throw new Error("Enter a valid domain, such as yourbusiness.com.");
  }
  return domain;
}

export function purchaseUrl(domain: string) {
  const url = new URL("https://www.namesilo.com/domain/search-domains");
  url.searchParams.set("query", normalizeDomain(domain));
  return url.toString();
}

export type DomainQuote = { domain: string; available: boolean | null; price: number | null; currency: "USD"; provider: "namesilo"; verified: boolean; purchaseUrl: string };
export type DnsRecord={record_id:string;type:string;host:string;value:string;ttl:string;distance:string};

function asArray<T>(value:T|T[]|null|undefined):T[]{return value==null?[]:Array.isArray(value)?value:[value];}
function domainValue(value:unknown):string{return typeof value==='string'?value:typeof value==='object'&&value!==null&&'domain' in value?String((value as {domain:unknown}).domain):'';}

export class NameSiloRegistrar {
  async search(domain: string, years = 1): Promise<DomainQuote> {
    return (await this.searchMany([domain],years))[0];
  }
  async searchMany(domains:string[],years=1):Promise<DomainQuote[]>{
    const normalized=[...new Set(domains.map(normalizeDomain))];
    const quotes=normalized.map(domain=>({domain,available:null,price:null,currency:'USD' as const,provider:'namesilo' as const,verified:false,purchaseUrl:purchaseUrl(domain)}));
    const key = nameSiloKey();
    if (!key) return quotes;
    const url = new URL("https://www.namesilo.com/api/checkRegisterAvailability");
    url.search = new URLSearchParams({ version: "1", type: "json", key, domains: normalized.join(','), years:String(Math.max(1,Math.min(10,years))) }).toString();
    let response: Response;
    try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000), headers:{Accept:'application/json','User-Agent':'Cubixtop-Domains/1.0'} }); }
    catch { throw new Error("NameSilo search is temporarily unavailable. Please try again."); }
    if (!response.ok) throw new Error("NameSilo search is temporarily unavailable.");
    const data = await response.json();
    const reply = data.reply;
    if (!reply || Number(reply.code) !== 300) throw new Error("NameSilo could not verify availability. Check the server API configuration.");
    const available=asArray(reply.available?.domain??reply.available);
    const unavailable=asArray(reply.unavailable?.domain??reply.unavailable).map(domainValue);
    if(!available.length&&!unavailable.length)throw new Error("NameSilo returned an inconclusive result. Please try again.");
    return quotes.map(quote=>{const match=available.find((item:unknown)=>domainValue(item)===quote.domain) as {price?:unknown}|undefined;if(!match&&!unavailable.includes(quote.domain))return quote;const price=Number(match?.price);return {...quote,available:Boolean(match),verified:true,price:match&&Number.isFinite(price)&&price>0?price:null};});
  }
  async register(input:{domain:string;years:number;contact:{fn:string;ln:string;ad:string;cy:string;st:string;zp:string;ct:string;em:string;ph:string}}){const key=nameSiloKey();if(!key)throw new Error('Registrar API is not configured.');const url=new URL('https://www.namesilo.com/api/registerDomain');url.search=new URLSearchParams({version:'1',type:'json',key,domain:normalizeDomain(input.domain),years:String(input.years),private:'1',auto_renew:'0',portfolio:'Cubixtop Customers',...input.contact}).toString();const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'Cubixtop-Domains/1.0'}});const data=await response.json().catch(()=>null);const code=Number(data?.reply?.code);if(!response.ok||![300,301,302].includes(code))throw new Error(data?.reply?.detail||'Registrar did not confirm registration.');return {code,reference:String(data.reply.domain||input.domain),amount:Number(data.reply.order_amount||0)};}
  private async api(operation:string,params:Record<string,string>){const key=nameSiloKey();if(!key)throw new Error('Domain management is not configured.');const url=new URL(`https://www.namesilo.com/api/${operation}`);url.search=new URLSearchParams({version:'1',type:'json',key,...params}).toString();const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'Cubixtop-Domains/1.0'}});const data=await response.json().catch(()=>null);if(!response.ok||Number(data?.reply?.code)!==300)throw new Error(data?.reply?.detail||'The domain update could not be completed.');return data.reply;}
  async listDns(domain:string):Promise<DnsRecord[]>{const reply=await this.api('dnsListRecords',{domain:normalizeDomain(domain)});return asArray(reply.resource_record) as DnsRecord[];}
  async addDns(domain:string,record:{type:string;host:string;value:string;ttl:number;distance:number}){return this.api('dnsAddRecord',{domain:normalizeDomain(domain),rrtype:record.type,rrhost:record.host==='@'?'':record.host,rrvalue:record.value,rrttl:String(record.ttl),rrdistance:String(record.distance)});}
  async updateDns(domain:string,record:{id:string;host:string;value:string;ttl:number;distance:number}){return this.api('dnsUpdateRecord',{domain:normalizeDomain(domain),rrid:record.id,rrhost:record.host==='@'?'':record.host,rrvalue:record.value,rrttl:String(record.ttl),rrdistance:String(record.distance)});}
  async deleteDns(domain:string,id:string){return this.api('dnsDeleteRecord',{domain:normalizeDomain(domain),rrid:id});}
}

