import CheckOrderPayment from '../../check-order-payment';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db, type Checkout } from '@/lib/db';
import CustomerTools from '../../customer-tools';
import ProfileEditor from '@/app/account/profile-editor';
import PasswordResetTools from '../../password-reset-tools';
import CancelOrder from '@/app/cancel-order';
import { readProfile } from '@/lib/user-profile';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'User profile', robots: { index: false, follow: false } };
type Profile = { id: string; name: string; email: string; role: string; created_at: string; email_verified: number };
type Payment = { id: string; domain: string; provider: string; gateway_order_id: string | null; status: string; amount_inr: number; created_at: string };
function contactDetails(raw: string | null | undefined): [string, string][] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return [['fn','First name'],['ln','Last name'],['em','Registrant email'],['ph','Phone'],['ad','Address'],['cy','City'],['st','State / province'],['zp','Postal code'],['ct','Country'],['years','Registration term (years)']].map(([key,label]) => [label, typeof value[key] === 'string' || typeof value[key] === 'number' ? String(value[key]) : 'Not provided']);
  } catch { return []; }
}
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
export default async function UserProfile({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentUser();
  const { id } = await params;
  if (!viewer) redirect('/login?next=' + encodeURIComponent('/admin/users/' + id));
  if (viewer.role !== 'admin') redirect('/dashboard');
  const account = db.prepare('SELECT id,name,email,role,created_at,email_verified FROM users WHERE id=?').get(id) as Profile | undefined;
  if (!account) notFound();
  const profile=readProfile(id);
  const note = db.prepare('SELECT note FROM admin_notes WHERE user_id=?').get(id) as {note:string}|undefined;
  const sessions = (db.prepare('SELECT COUNT(*) total FROM sessions WHERE user_id=? AND expires>?').get(id,Date.now()) as {total:number}).total;
  const orders = db.prepare('SELECT id,user_id,domain,quote,status,created_at,updated_at,amount_inr,contact,registrar_reference,failure_reason FROM checkouts WHERE user_id=? ORDER BY created_at DESC,id').all(id) as Checkout[];
  const payments = db.prepare('SELECT p.id,c.domain,p.provider,p.gateway_order_id,p.status,p.amount_inr,p.created_at FROM payment_attempts p JOIN checkouts c ON c.id=p.checkout_id WHERE c.user_id=? ORDER BY p.created_at DESC,p.id').all(id) as Payment[];
  return <main className="wrap section"><Link className="text-link" href="/admin#registered-users">← Back to registered users</Link><div className="section-heading"><div><span className="eyebrow">REGISTERED ACCOUNT</span><h1 className="title">{account.name}</h1><p className="muted">{account.email}</p></div><span className="badge">{account.role}</span></div>
    <section className="card"><h2>Account profile</h2><dl className="profile-details">{[['Account ID',account.id],['Full name',account.name],['Email address',account.email],['Role',account.role],['Email verification',account.email_verified ? 'Verified' : 'Not verified'],['Registered on (UTC)',account.created_at],['Domain orders',String(orders.filter(order=>order.status!=='cancelled').length)],['Mobile number',profile.phone||'Not provided'],['Address',profile.address||'Not provided'],['City',profile.city||'Not provided'],['State / province',profile.state||'Not provided'],['Postal code',profile.postal_code||'Not provided'],['Country',profile.country||'Not provided'],['Active domains',String(orders.filter(order => order.status === 'active').length)]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    {account.role!=='admin'&&<><ProfileEditor profile={profile} userId={id}/><PasswordResetTools userId={id}/></>}
    <CustomerTools id={id} email={account.email} role={account.role} initialNote={note?.note||''} sessions={sessions}/>
    <section className="profile-section"><h2>Domains and registrant profiles</h2><p className="muted">Contact details are supplied during checkout and may differ between domains.</p><div className="domain-list">{orders.map(order => { const details = contactDetails(order.contact); return <article className="card" key={order.id}><div className="section-heading"><h3>{order.domain}</h3><span className="badge">{order.status.replaceAll('_',' ')}</span></div><dl className="profile-details">{[['Order ID',order.id],['Created on (UTC)',order.created_at],['Updated on (UTC)',order.updated_at],['Quoted price (USD)',order.quote === null ? 'Not available' : '$' + order.quote.toFixed(2)],['Order amount (INR)',order.amount_inr == null ? 'Not available' : money(order.amount_inr)],['Registrar reference',order.registrar_reference || 'Not available'],...details].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{!details.length && <p className="muted">Registrant contact details have not been provided.</p>}{order.failure_reason && <p className="notice">Review: {order.failure_reason}</p>}{order.amount_inr!=null&&<CheckOrderPayment id={order.id}/>}{['pending_payment','payment_pending','payment_failed'].includes(order.status)&&<CancelOrder id={order.id} domain={order.domain}/>}</article>; })}</div>{!orders.length && <div className="card"><p className="muted">This user has not placed any domain orders. Phone and address have not been collected.</p></div>}</section>
    <section className="card profile-section"><h2>Payment history</h2><div className="table-scroll"><table className="table"><thead><tr><th>Domain</th><th>Provider</th><th>Status</th><th>Amount</th><th>Gateway order</th><th>Created (UTC)</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td>{payment.domain}</td><td>{payment.provider}</td><td>{payment.status.replaceAll('_',' ')}</td><td>{money(payment.amount_inr)}</td><td>{payment.gateway_order_id || 'Not available'}</td><td>{payment.created_at.slice(0,10)}</td></tr>)}</tbody></table></div>{!payments.length && <p className="muted">No payment attempts recorded.</p>}</section>
  </main>;
}


