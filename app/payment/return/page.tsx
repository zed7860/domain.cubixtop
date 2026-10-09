"use client";
import { readApiResponse } from '@/lib/api-response';
import {useEffect,useState} from 'react';
import Link from 'next/link';
type Status={domain?:string;status?:string;paymentStatus?:string;error?:string};
export default function PaymentReturn(){
 const [state,setState]=useState<Status>({});
 useEffect(()=>{const id=new URLSearchParams(location.search).get('order_id');let stopped=false,timer:ReturnType<typeof setTimeout>,count=0;async function check(){try{const response=await fetch('/api/payments/status?order_id='+encodeURIComponent(id||''),{cache:'no-store'}),data=await readApiResponse(response);if(stopped)return;setState(response.ok?data:{error:data.error});if(response.ok&&!['active','sandbox_paid','manual_review','payment_failed','cancelled'].includes(data.status)&&++count<8)timer=setTimeout(check,4000);}catch{if(!stopped)setState({error:'Payment status could not be checked. Use your dashboard to check again.'});}}void check();return()=>{stopped=true;clearTimeout(timer);};},[]);
 const title=state.error?'We could not verify this payment.':state.status==='cancelled'?'This order was cancelled.':state.status==='active'?'Your domain is active.':state.status==='sandbox_paid'?'Sandbox payment verified.':state.status==='manual_review'?'Your order needs a support review.':state.status==='payment_failed'?'Payment was unsuccessful.':state.paymentStatus==='PAID'?'Payment received.':'Payment is being confirmed.';
 const detail=state.error||(state.status==='cancelled'?'This unpaid order was removed from your pending list. Check with support if a payment was made.':state.status==='active'?`${state.domain} is registered. You can now manage its DNS from your dashboard.`:state.status==='sandbox_paid'?'Your test payment completed successfully. No live domain was purchased.':state.status==='manual_review'?'Contact info@cubixtop.com with your order details before making another payment.':state.status==='payment_failed'?'Check your orders for payment details and checkout options.':state.paymentStatus==='PAID'?`${state.domain||'Your domain'} is being registered. We’ll email you when it is active.`:'Check your dashboard before making another payment. Confirmation may take a moment.');
 return <main className="wrap section"><div className="auth-card card"><span className="eyebrow">PAYMENT STATUS</span><h1>{title}</h1><p className="muted" role="status">{detail}</p><Link className="btn" href="/dashboard">View my orders</Link></div></main>;
}


