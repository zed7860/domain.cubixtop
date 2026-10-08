"use client";
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Users, Globe2, CreditCard, CircleAlert, Cable, ShieldCheck, ArrowUpRight, Activity } from 'lucide-react';
const items = [
  ['overview','Overview',LayoutDashboard],['customers','Customers',Users],['orders','Domain orders',Globe2],['payments','Payments',CreditCard],['review','Review queue',CircleAlert],['integrations','Integrations',Cable],['security','Launch & security',ShieldCheck],['activity','Admin activity',Activity],
] as const;
export default function AdminSidebar({ name }: { name: string }) {
  const params = useSearchParams(), path = usePathname();
  const selected = path.includes('/users/') ? 'customers' : params.get('section') || (params.has('q') ? 'customers' : 'overview');
  return <aside className="admin-sidebar"><Link href="/admin" className="admin-workspace"><span className="workspace-mark">C</span><span><strong>Cubixtop</strong><small>ADMIN WORKSPACE</small></span></Link><span className="sidebar-caption">MANAGE YOUR BUSINESS</span><nav aria-label="Admin navigation">{items.map(([key,label,Icon]) => <Link key={key} href={key === 'overview' ? '/admin' : `/admin?section=${key}`} className={selected === key ? 'selected' : ''} aria-current={selected === key ? 'page' : undefined}><Icon size={18}/>{label}</Link>)}</nav><div className="sidebar-help"><ShieldCheck size={22}/><strong>Private workspace</strong><p>Customer and business tools for administrators.</p><Link href="/" >View storefront <ArrowUpRight size={15}/></Link></div><div className="sidebar-account"><span className="admin-avatar">{name.slice(0,1)}</span><div><strong>{name}</strong><small>Administrator</small></div></div></aside>;
}
