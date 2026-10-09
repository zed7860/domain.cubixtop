import AdminRefresh from './admin-refresh';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users, Globe2, Wallet, CircleAlert, ArrowUpRight, Cable, ShieldCheck, Clock3, Search } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getRegistrarSettings } from '@/lib/settings';
import { publicPaymentSettings } from '@/lib/payment-gateways';
import RegisteredUsers from './registered-users';
import PaymentSettings from './payment-settings';
import RegistrarSettings from './registrar-settings';
import Readiness from './readiness';
import AdminRecords from './admin-records';
export const dynamic = 'force-dynamic';
type Filters = {section?:string;q?:string;search?:string;status?:string;page?:string;purchased?:string};
const sections = ['overview','customers','orders','payments','review','integrations','security','activity'];
const titles:Record<string,[string,string]> = {
  overview:['Business control center','A clear view of your customers, domains and operations.'],
  customers:['Customer directory','Find every registered account and open its complete profile.'],
  orders:['Domain operations','Track registrations, investigate failures and find customer orders.'],
  payments:['Payment center','Inspect payment attempts across your merchant gateways.'],
  review:['Review queue','Focus on the orders that need your attention.'],
  integrations:['Service integrations','Connect your registrar and configure customer checkout.'],
  security:['Launch & security','Check your production setup and account security.'],
  activity:['Admin activity','Recorded customer support actions and integration changes.'],
};
export default async function Admin({searchParams}:{searchParams:Promise<Filters>}) {
  const user = await currentUser();
  if(!user) redirect('/login?next=/admin');
  if(user.role!=='admin') redirect('/dashboard');
  const filters=await searchParams;
  const text=(value:unknown)=>typeof value==='string'?value.trim().slice(0,254):'';
  const section=sections.includes(text(filters.section))?text(filters.section):filters.q!==undefined?'customers':'overview';
  const page=Math.max(1,Math.min(1000000,Number.parseInt(text(filters.page)||'1',10)||1));
  const stats=(await db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(status='active'),0) active,
    COALESCE(SUM(CASE WHEN status='active' THEN amount_inr ELSE 0 END),0) active_value,
    COALESCE(SUM(status='payment_pending' OR status='pending_payment'),0) pending,
    COALESCE(SUM(status IN ('manual_review','payment_failed') OR (failure_reason IS NOT NULL AND status!='sandbox_paid')),0) review FROM checkouts WHERE status!='cancelled'`).get()) as {total:number;active:number;active_value:number;pending:number;review:number};
  const customers=(await db.prepare("SELECT COUNT(*) total,COALESCE(SUM(email_verified=0),0) unverified FROM users WHERE role='customer'").get()) as {total:number;unverified:number};
  const payment=(await publicPaymentSettings()),registrar=(await getRegistrarSettings());
  const metrics=[['Registered customers',customers.total,'All customer accounts',Users,'customers'],['Active domains',stats.active,'Confirmed registrations',Globe2,'orders'],['Active order value',new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(stats.active_value),'Order totals · before costs',Wallet,'payments'],['Needs attention',stats.review,'Failed or review required',CircleAlert,'review']] as const;
  const days=Array.from({length:7},(_,index)=>new Date(Date.now()-(6-index)*86400000).toISOString().slice(0,10));
  const daily=(await db.prepare('SELECT substr(created_at,1,10) day,COUNT(*) total FROM checkouts WHERE created_at>=? AND status!=\'cancelled\' GROUP BY day').all(days[0])) as {day:string;total:number}[];
  const bars=days.map(day=>({day,total:daily.find(row=>row.day===day)?.total||0})),max=Math.max(1,...bars.map(bar=>bar.total));
  const recent=(await db.prepare('SELECT c.domain,c.user_id,c.status,c.updated_at,u.email FROM checkouts c JOIN users u ON u.id=c.user_id WHERE c.status!=\'cancelled\' ORDER BY c.updated_at DESC LIMIT 5').all()) as {domain:string;user_id:string;status:string;updated_at:string;email:string}[];
  return <main className="admin-page"><div className="admin-page-top"><div><span className="eyebrow">WORKSPACE / {section.toUpperCase()}</span><h1>{titles[section][0]}</h1><p className="muted">{titles[section][1]}</p></div><div className="admin-top-actions"><span className="badge"><ShieldCheck size={13}/> Admin access</span><AdminRefresh/></div></div>
    {section==='overview'&&<><div className="admin-metrics">{metrics.map(([label,value,caption,Icon,target])=><Link className="card metric-card" key={label} href={`/admin?section=${target}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={20}/></span></div><strong>{value}</strong><small>{caption}</small></Link>)}</div><div className="admin-overview-grid"><section className="card"><div className="section-heading"><div><h2>Registration activity</h2><p className="muted">New domain orders · last 7 days (UTC)</p></div><span className="badge">{stats.total} total orders</span></div><div className="activity-chart" role="img" aria-label={bars.map(bar=>`${bar.day}: ${bar.total} orders`).join(', ')}>{bars.map(bar=><div className="chart-column" key={bar.day}><span>{bar.total}</span><div className="chart-track"><div style={{height:`${bar.total/max*100}%`}}/></div><small>{bar.day.slice(5)}</small></div>)}</div></section><section className="card attention-card"><span className="eyebrow">YOUR NEXT ACTIONS</span><h2>Keep things moving.</h2><Link href="/admin?section=review"><span><CircleAlert size={18}/>Orders needing review</span><b>{stats.review}</b></Link><Link href="/admin?section=orders&status=awaiting_payment"><span><Clock3 size={18}/>Awaiting payment</span><b>{stats.pending}</b></Link><Link href="/admin?section=customers"><span><Users size={18}/>Unverified customers</span><b>{customers.unverified}</b></Link><Link href="/admin?section=integrations"><span><Cable size={18}/>Payment gateway</span><b>{payment.active||'Set up'}</b></Link><Link className="btn" href="/admin?section=security">Check launch setup <ArrowUpRight size={16}/></Link></section></div><section className="card"><div className="section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Domain orders</h2></div><Link className="text-link" href="/admin?section=orders">View all orders ↗</Link></div><div className="recent-orders">{recent.map(order=><Link key={order.domain+order.user_id} href={`/admin/users/${order.user_id}`}><span className="recent-order-icon"><Globe2 size={19}/></span><span><strong>{order.domain}</strong><small>{order.email}</small></span><span className={`order-status status-${order.status}`}>{order.status.replaceAll('_',' ')}</span></Link>)}</div>{!recent.length&&<div className="records-empty"><Globe2 size={30}/><h3>Your first order starts here.</h3><p className="muted">New customer orders will appear here automatically.</p><Link className="btn2" href="/">Visit storefront</Link></div>}</section><RegisteredUsers query={text(filters.q)} page={page}/></>}
    {section==='customers'&&<RegisteredUsers query={text(filters.q)} page={page} purchased={filters.purchased==='1'}/>}
    {(section==='orders'||section==='payments'||section==='review')&&<AdminRecords kind={section} query={text(filters.search)} status={text(filters.status)} page={page}/>}
    {section==='integrations'&&<><div className="integration-summary"><span><Cable size={18}/>Registrar: {registrar?'NameSilo configured':process.env.NAMESILO_API_KEY?'NameSilo environment key':'Needs setup'}</span><span><Wallet size={18}/>Checkout: {payment.active||'Needs setup'}</span></div><div className="integration-grid"><RegistrarSettings configured={Boolean(registrar||process.env.NAMESILO_API_KEY)} provider={registrar?.provider||'namesilo'} verifiedAt={registrar?.verifiedAt}/><PaymentSettings initial={payment} siteUrl={(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'')}/></div></>}
    {section==='security'&&<><Readiness/><div className="admin-security-grid"><section className="card"><ShieldCheck className="security-icon" size={28}/><h2>Your admin account</h2><p className="muted">Manage your password and review your account details.</p><Link className="btn2" href="/account">Account security ↗</Link></section><section className="card"><Search className="security-icon" size={28}/><h2>Customer session control</h2><p className="muted">Open a customer profile to add a private support note or sign out their active sessions.</p><Link className="btn2" href="/admin?section=customers">Find a customer ↗</Link></section></div><div className="notice"><strong>Hosting readiness</strong><p>Accounts, orders and saved credentials currently require one persistent Node.js server. A managed database and stable encryption key are needed before a Vercel or Netlify production launch.</p></div></>}
    {section==='activity'&&<AdminActivity page={page}/>}
  </main>;
}
async function AdminActivity({page}:{page:number}) {
  const total=((await db.prepare('SELECT COUNT(*) total FROM admin_activity').get()) as {total:number}).total;
  const pages=Math.max(1,Math.ceil(total/30)),current=Math.min(page,pages);
  const rows=(await db.prepare('SELECT a.id,a.action,a.target_id,a.detail,a.created_at,u.email actor FROM admin_activity a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id LIMIT 30 OFFSET ?').all((current-1)*30)) as {id:string;action:string;target_id:string|null;detail:string;created_at:string;actor:string|null}[];
  return <section className="card"><h2>Admin activity log</h2><p className="muted">Customer notes, session revocations and integration changes recorded since this feature was enabled.</p><div className="table-scroll"><table className="table"><thead><tr><th>Action</th><th>Administrator</th><th>Details</th><th>Date (UTC)</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.action.replaceAll('_',' ')}</td><td>{row.actor||'Former administrator'}</td><td>{row.detail}{row.target_id&&<><br/><Link className="text-link" href={`/admin/users/${row.target_id}`}>View customer</Link></>}</td><td>{row.created_at}</td></tr>)}</tbody></table></div>{!rows.length&&<p className="muted">No admin actions recorded yet.</p>}<div className="user-pagination"><span>Page {current} of {pages} · {total} actions</span><div>{current>1&&<Link className="btn2" href={`/admin?section=activity&page=${current-1}`}>Previous</Link>}{current<pages&&<Link className="btn2" href={`/admin?section=activity&page=${current+1}`}>Next</Link>}</div></div></section>;
}





