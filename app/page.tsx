"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Globe2, Search, ShieldCheck, Sparkles, Server, LockKeyhole } from "lucide-react";
import type { DomainQuote } from "@/lib/registrar";
import {addCartItem} from '@/lib/cart';
const extensions = [[".com", "The classic for every idea"], [".in", "Made for India's next big thing"], [".co.in", "Your business, closer to home"], [".org", "Give your mission a home"], [".net", "Connect something great"], [".io", "Built for bold technology"]];
export default function Home() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<DomainQuote | null>(null);
  const [results, setResults] = useState<DomainQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fallbackDomain, setFallbackDomain] = useState("");
  const [currency,setCurrency]=useState<'USD'|'INR'>('INR');
  const [exchangeRate,setExchangeRate]=useState<number|null>(null);
  const [added,setAdded]=useState<string[]>([]);
  const requestId = useRef(0);
  async function search(value = q) {
    const id = ++requestId.current;
    setLoading(true); setError(""); setResult(null); setResults([]); setFallbackDomain("");
    try {
      const response = await fetch("/api/domains/search?q=" + encodeURIComponent(value));
      const data = await response.json();
      if (!response.ok) { if (id === requestId.current && data.domain) setFallbackDomain(data.domain); throw new Error(data.error || "Search failed. Please try again."); }
      if (id === requestId.current) { setResult(data); setResults(Array.isArray(data.results)?data.results:[data]); setExchangeRate(Number(data.exchangeRate)||null); }
    } catch (error) { if (id === requestId.current) setError((error as Error).message); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  return <main>
    <section className="hero wrap">
      <div className="hero-inner"><div className="hero-copy">
      <div className="badge"><Sparkles size={14} /> YOUR NEXT CHAPTER STARTS HERE</div>
      <h1>Big ideas.<br /><span>A domain to match.</span></h1>
      <p>Find your place online with Cubixtop.<br />Search, register and manage your domain from one Cubixtop account.</p>
      <div className="search-tools"><span>Show prices in</span><div className="currency-toggle" role="group" aria-label="Currency"><button type="button" className={currency==='INR'?'active':''} onClick={()=>setCurrency('INR')}>₹ INR</button><button type="button" className={currency==='USD'?'active':''} onClick={()=>setCurrency('USD')}>$ USD</button></div></div>
      <form className="search" onSubmit={e => { e.preventDefault(); search(); }}>
        <Search className="search-icon" size={22} />
        <input aria-label="Domain name" value={q} onChange={e => setQ(e.target.value)} placeholder="Your next big idea.com" required maxLength={253} />
        <button className="btn" disabled={loading}>{loading ? "Checking…" : "Find my domain"}<ArrowUpRight size={18} /></button>
      </form>
      <div className="search-note">Secure registration · Private account · Dedicated support</div>
      </div><div className="hero-art" aria-hidden="true"><div className="orbit"/><div className="server-stack">{[0,1,2].map(item=><div className="server-unit" key={item}><Server size={32}/><span/><i/></div>)}</div><div className="art-label top"><Globe2 size={20}/> Your idea, online.</div><div className="art-label bottom"><LockKeyhole size={20}/> One secure workspace</div></div></div>
      <div aria-live="polite">{error && <div className="card result"><div><p className="error" role="alert">{error}</p>{fallbackDomain && <Link className="btn" href={"/checkout?domain=" + encodeURIComponent(fallbackDomain)}>Continue with {fallbackDomain} ↗</Link>}</div></div>}
      {result && <div className="search-results">{results.map((item,index)=><div className="card result" key={item.domain}><div><span className="eyebrow">{index===0?'YOUR DOMAIN':'POPULAR ALTERNATIVE'}</span><h2>{item.domain}</h2><p className="muted">{item.available === null ? (index===0?"Continue to confirm current availability and pricing.":"Availability pending") : item.available ? "Available — make it yours today" : "Already registered"}</p></div><div>{item.price !== null && <div className="price">{currency==='INR'&&exchangeRate?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(item.price*exchangeRate):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(item.price)} <small>{currency} / first year</small></div>}{item.available!==false&&<div className="result-actions"><button className="btn2" onClick={()=>{addCartItem({domain:item.domain,priceUsd:item.price,currency:'USD'});setAdded(values=>[...new Set([...values,item.domain])]);}}>{added.includes(item.domain)?'Added to cart ✓':'Add to cart'}</button><Link className="btn" href={"/checkout?domain=" + encodeURIComponent(item.domain)+"&currency="+currency}>{index===0?'Buy now':`Choose ${item.domain}`}<ArrowUpRight size={18} /></Link></div>}<small className="muted">{item.available===false?'Try another extension':currency==='INR'?'Converted using the current market rate':'Final INR total shown before payment'}</small></div></div>)}</div>}
      </div>
    </section>
    <section id="extensions" className="wrap section"><div className="section-heading"><div><span className="eyebrow">FIND YOUR FIT</span><h2 className="title">One idea. Endless possibilities.</h2></div><span className="muted">Popular extensions</span></div><div className="grid">{extensions.map(([ext, description]) => <button className="card extension" key={ext} disabled={loading} onClick={() => { const value = (q.trim().split(".")[0] || "yourbusiness") + ext; setQ(value); search(value); }}><div><h3>{ext}</h3><ArrowUpRight size={20} /></div><p className="muted">{description}</p><span>Explore this extension</span></button>)}</div></section>
    <section className="wrap section"><div className="feature-band"><Globe2 size={38} /><div><span className="eyebrow">FROM IDEA TO ONLINE</span><h2>A clear path to your new domain.</h2><p className="muted">Search, create your account, review your order and manage everything from one workspace.</p></div><ShieldCheck size={38} /></div></section>
  </main>;
}




