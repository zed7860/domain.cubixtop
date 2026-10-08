import VerificationButton from './verification-button';
import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AccountForm from './account-form';
import ProfileEditor from './profile-editor';
import { readProfile } from '@/lib/user-profile';
export const dynamic='force-dynamic';
export default async function Account(){const user=await currentUser();if(!user)redirect('/login?next=/account');return <main className="wrap section"><span className="eyebrow">ACCOUNT SETTINGS</span><h1 className="title">Your account</h1><p className="muted">{user.name} · {user.email}</p>{!user.email_verified&&<VerificationButton/>}<ProfileEditor profile={readProfile(user.id)}/><AccountForm admin={user.role==='admin'}/></main>;}


