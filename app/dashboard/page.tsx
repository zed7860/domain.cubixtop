import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { db, type Checkout } from '@/lib/db';
import DomainList from './domain-list';
export const dynamic='force-dynamic';
export default async function Dashboard(){const user=await currentUser();if(!user)redirect('/login?next=/dashboard');const orders=db.prepare('SELECT c.id,c.domain,c.quote,c.status,c.created_at,(SELECT p.id FROM payment_attempts p WHERE p.checkout_id=c.id ORDER BY p.rowid DESC LIMIT 1) payment_order_id FROM checkouts c WHERE c.user_id=? AND c.status!=\'cancelled\' ORDER BY c.updated_at DESC').all(user.id) as unknown as Checkout[];return <main className="wrap section"><div className="section-heading"><div><span className="eyebrow">YOUR DOMAIN WORKSPACE</span><h1 className="title">Welcome, {user.name}.</h1><p className="muted">Your Cubixtop domain orders, all in one place.</p></div><Link className="btn" href="/">Find another domain ↗</Link></div>{!user.email_verified&&<div className="notice">Please verify your email address to receive important account and domain updates from info@cubixtop.com.</div>}<DomainList initialOrders={orders.map(order=>({...order}))}/></main>;}



