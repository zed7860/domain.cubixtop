"use client";
import { readApiResponse } from '@/lib/api-response';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle } from 'lucide-react';
export default function CancelOrder({id,domain}:{id:string;domain:string}){
  const[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
  async function cancel(){setBusy(true);setError('');try{const response=await fetch(`/api/orders/${id}/cancel`,{method:'POST'}),data=await readApiResponse(response);if(!response.ok)throw new Error(data.error);router.refresh();setConfirm(false);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  return <div className="cancel-order">{confirm?<><p className="fine-print">Cancel the unpaid order for {domain}? It will leave the pending lists; history is retained.</p><button className="btn2" disabled={busy} onClick={cancel}>{busy?'Checking…':'Confirm cancellation'}</button><button className="btn2" disabled={busy} onClick={()=>setConfirm(false)}>Keep order</button></>:<button className="btn2" onClick={()=>setConfirm(true)} aria-label={`Cancel unpaid order for ${domain}`}><XCircle size={15}/>Cancel unpaid order</button>}{error&&<p className="error fine-print" role="alert">{error}</p>}</div>;
}

