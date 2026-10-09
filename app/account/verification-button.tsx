"use client";
import { readApiResponse } from '@/lib/api-response';
import {useState} from 'react';
export default function VerificationButton(){const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');async function send(){setBusy(true);setMessage('');setError('');try{const response=await fetch('/api/account/verification',{method:'POST'}),data=await readApiResponse(response);if(!response.ok)throw new Error(data.error);setMessage(data.message);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}return <div className="notice"><p>Your current email address has not been verified.</p><button className="btn2" disabled={busy} onClick={send}>{busy?'Sending…':'Send verification email'}</button>{message&&<p role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}</div>;}

