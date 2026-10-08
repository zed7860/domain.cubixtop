import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import AdminSidebar from './admin-sidebar';
export const metadata = { title: 'Administration', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') redirect('/dashboard');
  return <div className="admin-shell"><AdminSidebar name={user.name}/><div className="admin-content">{children}</div></div>;
}
