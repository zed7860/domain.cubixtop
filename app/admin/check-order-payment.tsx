"use client";
import { readApiResponse } from '@/lib/api-response';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function CheckOrderPayment({id}:{id:string}){const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const router=useRouter();async function check(){setBusy(true);setError('');setMessage('');try{const response=await fetch(`/api/orders/${id}/check-payment`,{method:'POST'}),data=await readApiResponse(response);if(!response.ok)throw new Error(data.error);setMessage(data.message);router.refresh();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}return <div className="cancel-order"><button className="btn2" onClick={check} disabled={busy}>{busy?'Checking gateway…':'Check payment status'}</button>{message&&<p className="fine-print" role="status">{message}</p>}{error&&<p className="error fine-print" role="alert">{error}</p>}</div>;}

