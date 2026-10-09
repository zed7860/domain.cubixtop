import CheckOrderPayment from './check-order-payment';
import Link from 'next/link';
import { db } from '@/lib/db';
import CancelOrder from '../cancel-order';
const statuses = ['active','pending_payment','payment_pending','payment_failed','sandbox_paid','manual_review','provisioning','cancelled'];
type Order = {id:string;user_id:string;domain:string;email:string;status:string;amount_inr:number|null;failure_reason:string|null;updated_at:string};
type Payment = {id:string;user_id:string;domain:string;email:string;provider:string;status:string;amount_inr:number;gateway_order_id:string|null;created_at:string};
const money = (value:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value);
export default async function AdminRecords({ kind, query, status, page }: { kind:'orders'|'payments'|'review';query:string;status:string;page:number }) {
  const pattern = '%' + query.replace(/[\\%_]/g, value => '\\'+value) + '%';
  const payments = kind === 'payments';
  const statusOptions = payments ? ['pending','paid','manual_review'] : ['awaiting_payment',...statuses];
  const selected = statusOptions.includes(status) ? status : '';
  const source = payments ? 'payment_attempts p JOIN checkouts c ON c.id=p.checkout_id JOIN users u ON u.id=c.user_id' : 'checkouts c JOIN users u ON u.id=c.user_id';
  const clauses = ["(c.domain LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"];
  if(selected!=='cancelled')clauses.push("c.status!='cancelled'");
  const args: (string|number)[] = [pattern,pattern];
  if(kind === 'review') clauses.push("(c.status IN ('manual_review','payment_failed') OR (c.failure_reason IS NOT NULL AND c.status != 'sandbox_paid'))");
  if(selected==='awaiting_payment') clauses.push("c.status IN ('payment_pending','pending_payment')");
  else if(selected){clauses.push(`${payments?'p':'c'}.status=?`);args.push(selected);}
  const where = clauses.join(' AND ');
  const total = ((await db.prepare(`SELECT COUNT(*) total FROM ${source} WHERE ${where}`).get(...args)) as {total:number}).total;
  const pages = Math.max(1,Math.ceil(total/20)), current = Math.min(page,pages);
  const columns = payments ? 'p.id,c.user_id,c.domain,u.email,p.provider,p.status,p.amount_inr,p.gateway_order_id,p.created_at' : 'c.id,c.user_id,c.domain,u.email,c.status,c.amount_inr,c.failure_reason,c.updated_at';
  const rows = (await db.prepare(`SELECT ${columns} FROM ${source} WHERE ${where} ORDER BY ${payments?'p.created_at DESC,p.id':'c.updated_at DESC,c.id'} DESC LIMIT 20 OFFSET ?`).all(...args,(current-1)*20)) as (Order & Payment)[];
  const href = (value:number) => '/admin?' + new URLSearchParams({section:kind,search:query,status:selected,page:String(value)});
  return <section className="card records-card"><div className="section-heading"><div><h2>{payments?'Payment attempts':'Domain orders'}</h2><p className="muted">{kind==='review'?'Orders needing investigation. Open the customer profile to review context.':payments?'Gateway attempts and amounts, separate from completed registrations.':'Search orders, inspect their status and open the customer profile.'}</p></div><a className="btn2" href={`/api/admin/export?kind=${payments?'payments':'orders'}`}>Export CSV</a></div><form className="record-filters" action="/admin"><input type="hidden" name="section" value={kind}/><label>Search domain or email<input name="search" defaultValue={query} maxLength={254} placeholder="Domain or customer email"/></label><label>Order status<select name="status" aria-label={payments?'Payment status':'Order status'} defaultValue={selected}><option value="">All statuses</option>{statusOptions.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label><button className="btn">Apply filters</button>{(query||selected)&&<Link className="btn2" href={`/admin?section=${kind}`}>Clear filters</Link>}</form><div className="table-scroll"><table className="table"><thead><tr><th>Domain / customer</th>{payments&&<th>Gateway</th>}<th>Status</th><th>Amount (INR)</th><th>{payments?'Gateway order':'Updated (UTC)'}</th><th>Actions</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.domain}</strong><br/><span className="muted">{row.email}</span>{!payments&&row.failure_reason&&<p className="record-review">{row.failure_reason}</p>}</td>{payments&&<td>{row.provider}</td>}<td><span className={`order-status status-${row.status}`}>{row.status.replaceAll('_',' ')}</span></td><td>{row.amount_inr==null?'—':money(row.amount_inr)}</td><td>{payments?(row.gateway_order_id||'Not assigned'):row.updated_at.slice(0,10)}</td><td><Link className="btn2" href={`/admin/users/${row.user_id}`}>View customer</Link>{!payments&&row.amount_inr!=null&&<CheckOrderPayment id={row.id}/>} { !payments&&['pending_payment','payment_pending','payment_failed'].includes(row.status)&&<CancelOrder id={row.id} domain={row.domain}/>}</td></tr>)}</tbody></table></div>{!rows.length&&<div className="records-empty"><h3>{kind==='review'?'You’re all caught up.':'No matching records.'}</h3><p className="muted">{kind==='review'?'No orders currently need review.':'Try another search or clear your filters.'}</p></div>}<div className="user-pagination"><span className="muted">{total} records · Page {current} of {pages}</span><div>{current>1&&<Link className="btn2" href={href(current-1)}>Previous</Link>}{current<pages&&<Link className="btn2" href={href(current+1)}>Next</Link>}</div></div></section>;
}




