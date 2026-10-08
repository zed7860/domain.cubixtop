"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from './theme-toggle';
import CartLink from './cart-link';
type User={name:string;email:string;role:string};
export default function AccountNav(){const[user,setUser]=useState<User|null>(null);useEffect(()=>{fetch('/api/auth').then(r=>r.json()).then(d=>setUser(d.user)).catch(()=>{});},[]);async function logout(){await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});location.href='/';}return <div className="links"><Link href="/">Domains</Link><a href="https://cubixtop.com" rel="noopener">Web development ↗</a><Link href="/dashboard">My domains</Link>{user?.role==='admin'&&<Link href="/admin">Admin</Link>}{user?<><Link href="/account">Account</Link><button className="btn2" onClick={logout}>Sign out</button></>:<Link className="btn" href="/login">Sign in ↗</Link>}<CartLink/><ThemeToggle/></div>;}


