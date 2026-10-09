"use client";
import {useState} from 'react';
import Link from 'next/link';
import {readApiResponse} from '@/lib/api-response';
export default function ForgotPassword(){
 const[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');setMessage('');setBusy(true);const data=new FormData(event.currentTarget);try{const response=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request',email:data.get('email')})}),body=await readApiResponse(response);if(!response.ok)throw new Error(body.error||'The reset link could not be requested.');setMessage(body.message);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <main className="wrap section"><div className="auth-card card"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Reset your password.</h1><p className="muted">Enter your registered email address. We’ll send a secure link that expires in 2 hours and works only once.</p><form className="form" onSubmit={submit}><label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required/></label><button className="btn" disabled={busy}>{busy?'Requesting…':'Send reset link'}</button></form>{message&&<p className="notice" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}<p><Link className="text-link" href="/login">Back to sign in</Link></p></div></main>;
}
