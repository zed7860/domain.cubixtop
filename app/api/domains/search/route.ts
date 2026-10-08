import { NextRequest, NextResponse } from 'next/server';
import { NameSiloRegistrar, normalizeDomain } from '@/lib/registrar';
import { rateLimit, HttpError, errorResponse } from '@/lib/auth';
import {getUsdInrRate} from '@/lib/currency';
export const runtime='nodejs';
export async function GET(req:NextRequest) {
 try{rateLimit('search-global',120);rateLimit('search:'+ (req.headers.get('x-forwarded-for')||'local'),30);let domain:string;try{domain=normalizeDomain(req.nextUrl.searchParams.get('q')||'');}catch(error){throw new HttpError((error as Error).message);}
 try{const label=domain.split('.')[0];const suggestions=[domain,...['com','in','co.in','org','net','io'].map(tld=>`${label}.${tld}`)];const [quotes,exchange]=await Promise.all([new NameSiloRegistrar().searchMany(suggestions),getUsdInrRate()]);const markup=Number(process.env.DEFAULT_MARKUP_PERCENT||25);const multiplier=1+(Number.isFinite(markup)?markup:25)/100;const results=quotes.map(({purchaseUrl,provider,...quote})=>{void purchaseUrl;void provider;return {...quote,price:quote.price===null?null:Math.round(quote.price*multiplier*100)/100};});return NextResponse.json({...results[0],results,exchangeRate:exchange.rate,rateUpdatedAt:exchange.updatedAt},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Live domain search is temporarily unavailable. Please try again shortly.',domain},{status:502});}
 }catch(error){return errorResponse(error);}
}

