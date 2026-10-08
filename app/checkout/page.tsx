import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { normalizeDomain, NameSiloRegistrar, type DomainQuote } from '@/lib/registrar';
import CheckoutClient from './checkout-client';
export const dynamic='force-dynamic';
export default async function Checkout({searchParams}:{searchParams:Promise<{domain?:string}>}){const params=await searchParams;let domain:string;try{domain=normalizeDomain(params.domain||'');}catch{return <main className="wrap section"><h1>Choose your domain first.</h1><Link className="btn" href="/">Search domains</Link></main>;}const user=await currentUser();let quote:DomainQuote|null=null;let searchError='';try{quote=await new NameSiloRegistrar().search(domain);}catch{searchError='Live search is temporarily unavailable. Please try again shortly.';}return <main className="wrap section"><Link className="muted" href="/">← Back to search</Link><h2 className="title">Make your idea official.</h2><CheckoutClient domain={domain} quote={quote} searchError={searchError} signedIn={Boolean(user)}/></main>;}

