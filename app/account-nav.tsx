"use client";
import { readApiResponse } from '@/lib/api-response';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, X } from 'lucide-react';
import ThemeToggle from './theme-toggle';
import CartLink from './cart-link';
type User={name:string;email:string;role:string};
export default function AccountNav(){
 const [user,setUser]=useState<User|null>(null),[open,setOpen]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),pathname=usePathname();
 useEffect(()=>{fetch('/api/auth').then(r=>readApiResponse(r)).then(d=>setUser(d.user)).catch(()=>{});},[]);
 useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[open]);
 function close(){dialog.current?.close();setOpen(false);}
 function show(){dialog.current?.showModal();setOpen(true);}
 async function logout(){const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});if(response.ok)location.href='/';}
 const items=[{href:'/',label:'Domains'},...(user?[{href:'/dashboard',label:'My domains'},{href:'/account',label:'Account'}]:[{href:'/login',label:'Sign in'}]),...(user?.role==='admin'?[{href:'/admin',label:'Admin'}]:[]),{href:'/help',label:'Help & support'},{href:'https://www.cubixtop.com',label:'Web development'}];
 return <><div className="links">
  {!user&&<Link className="btn" href="/login">Sign in ↗</Link>}
  <button type="button" className="hamburger-control" aria-label="Open navigation" aria-expanded={open} aria-controls="full-navigation" onClick={show}><span>Menu</span><span className="hamburger-lines" aria-hidden="true"><i/><i/></span></button>
 </div><dialog ref={dialog} id="full-navigation" className="navigation-dialog" aria-labelledby="navigation-title" onClose={()=>setOpen(false)}>
  <div className="navigation-top"><span id="navigation-title">CUBIXTOP · DOMAINS</span><button className="navigation-close" type="button" aria-label="Close navigation" onClick={close}>Close <X size={22}/></button></div>
  <nav aria-label="Main navigation">{items.map((item,index)=><Link key={item.href} href={item.href} onClick={close} aria-current={pathname===item.href?'page':undefined}><small>{String(index+1).padStart(2,'0')}</small><span>{item.label}</span><ArrowUpRight size={26}/></Link>)}</nav>
  <div className="navigation-tools"><span onClick={close}><CartLink/></span><ThemeToggle/>{user&&<button className="btn2" onClick={logout}>Sign out</button>}</div>
  <div className="navigation-footer"><p>Technology. Infrastructure.<br/>Your next idea, online.</p><a href="mailto:info@cubixtop.com">info@cubixtop.com</a></div>
 </dialog></>;
}



