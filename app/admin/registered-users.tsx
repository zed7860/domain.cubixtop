import Link from 'next/link';
import { db } from '@/lib/db';

type Account = { id: string; name: string; email: string; role: string; created_at: string; email_verified: number; order_count: number; active_domains: number };
export default function RegisteredUsers({ query, page, purchased=false }: { query: string; page: number; purchased?:boolean }) {
  const pattern = '%' + query.replace(/[\\%_]/g, value => '\\' + value) + '%';
  const where = "WHERE (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')" + (purchased ? " AND EXISTS (SELECT 1 FROM checkouts c WHERE c.user_id=u.id AND c.status='active')" : '');
  const total = (db.prepare(`SELECT COUNT(*) total FROM users u ${where}`).get(pattern, pattern) as { total: number }).total;
  const pages = Math.max(1, Math.ceil(total / 20));
  const current = Math.min(page, pages);
  const accounts = db.prepare(`SELECT u.id,u.name,u.email,u.role,u.created_at,u.email_verified,
    (SELECT COUNT(*) FROM checkouts c WHERE c.user_id=u.id AND c.status!='cancelled') order_count,
    (SELECT COUNT(*) FROM checkouts c WHERE c.user_id=u.id AND c.status='active') active_domains
    FROM users u ${where} ORDER BY u.created_at DESC,u.id LIMIT 20 OFFSET ?`).all(pattern, pattern, (current - 1) * 20) as Account[];
  const href = (value: number) => '/admin?' + new URLSearchParams({ section: 'customers', q: query, page: String(value), purchased:purchased?'1':'0' }) + '#registered-users';
  return <section className="card admin-users" id="registered-users">
    <div className="customer-view-tabs"><Link className={!purchased?'selected':''} href="/admin?section=customers">All accounts</Link><Link className={purchased?'selected':''} href="/admin?section=customers&purchased=1">Customers with active domains</Link></div>
    <div className="section-heading"><div><span className="eyebrow">CUSTOMER DIRECTORY</span><h2>Registered users</h2><p className="muted">{purchased?'Customers with at least one confirmed domain registration.':'Every registered account, including users who have not placed an order.'}</p></div><span className="badge">{total} {query ? 'matching' : 'registered'} accounts</span></div>
    <form className="user-search" action="/admin" method="get"><input type="hidden" name="section" value="customers"/><input type="hidden" name="purchased" value={purchased?'1':'0'}/><label htmlFor="user-query">Search users by name or email</label><div><input id="user-query" name="q" defaultValue={query} maxLength={254} placeholder="Name or email address"/><button className="btn">Search users</button>{query && <Link className="btn2" href="/admin?section=customers#registered-users">Clear</Link>}<a className="btn2" href="/api/admin/export?kind=customers">Export customers CSV</a></div></form>
    <div className="table-scroll"><table className="table"><thead><tr><th>Name / email</th><th>Role</th><th>Email status</th><th>Joined</th><th>Orders / active domains</th><th>Profile</th></tr></thead><tbody>{accounts.map(account => <tr key={account.id}><td><strong>{account.name}</strong><br/><span className="muted">{account.email}</span></td><td>{account.role}</td><td>{account.email_verified ? 'Verified' : 'Not verified'}</td><td>{account.created_at.slice(0,10)}</td><td>{account.order_count} / {account.active_domains}</td><td><Link className="btn2" href={`/admin/users/${account.id}`} aria-label={`View profile for ${account.email}`}>View profile</Link></td></tr>)}</tbody></table></div>
    {!accounts.length && <p className="muted">{query ? 'No users match this search.' : 'No registered users yet.'}</p>}
    <div className="user-pagination"><span className="muted">Page {current} of {pages} · {total} accounts</span><div>{current > 1 && <Link className="btn2" href={href(current - 1)}>Previous</Link>}{current < pages && <Link className="btn2" href={href(current + 1)}>Next</Link>}</div></div>
  </section>;
}


