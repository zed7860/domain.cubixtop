"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@supabase/supabase-js';
import {readApiResponse} from '@/lib/api-response';

export default function Verify(){const[state,setState]=useState('Verifying your email…');useEffect(()=>{async function verify(){const token=new URLSearchParams(location.search).get('token'),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(url&&key&&!token){const client=createClient(url,key);const {data,error}=await client.auth.getSession();setState(!error&&data.session?'Email verified. You can now sign in to Cubixtop.':'Open the newest verification link from your email, or sign in if you are already verified.');await client.auth.signOut();return;}const response=await fetch('/api/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}),body=await readApiResponse(response);setState(response.ok?'Email verified. Your Cubixtop account is ready.':body.error);}verify().catch(()=>setState('Verification could not be completed.'));},[]);return <main className="wrap section"><div className="auth-card card"><span className="eyebrow">EMAIL VERIFICATION</span><h1>{state}</h1><Link className="btn" href="/login">Sign in</Link></div></main>}
