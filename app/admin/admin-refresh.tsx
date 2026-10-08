"use client";
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
export default function AdminRefresh(){const router=useRouter();const[pending,startTransition]=useTransition();return <button className="btn2" type="button" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}><RefreshCw size={16}/>{pending?'Refreshing…':'Refresh'}</button>;}
