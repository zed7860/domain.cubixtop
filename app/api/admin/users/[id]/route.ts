import { checkOrigin, requireUser, rateLimit, HttpError, errorResponse, newAuthToken } from '@/lib/auth';
import { db, hashPassword } from '@/lib/db';
import { recordAdminActivity } from '@/lib/admin';
import { parseProfile,updateProfile } from '@/lib/user-profile';
import { emailReady,sendCubixtopEmail } from '@/lib/email';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    checkOrigin(req);const admin=await requireUser(true);rateLimit('admin-user:'+admin.id,20);
    const {id}=await params;const user=db.prepare('SELECT id,email,role FROM users WHERE id=?').get(id) as {id:string;email:string;role:string}|undefined;
    if(!user)throw new HttpError('User not found.',404);
    const body=await req.json();
    if(!body||typeof body!=='object')throw new HttpError('Invalid request.');
    if(['update_profile','reset_password','send_password_reset'].includes(body.action)) {
      if(user.role==='admin')throw new HttpError('Manage administrator profile and password from their own account settings.',403);
      if(body.action==='update_profile'){
        const profile=parseProfile(body);let changed=false;
        db.exec('BEGIN IMMEDIATE');try{changed=updateProfile(id,profile);recordAdminActivity(admin.id,'customer_profile_updated',id,`Updated profile for ${profile.email}${changed?'; email verification cleared and sessions revoked':''}`);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        return Response.json({message:changed?'Customer profile saved. Email verification was cleared and all sessions were signed out.':'Customer profile saved.'});
      }
      if(body.action==='reset_password'){
        if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new HttpError('Replacement password must be 12 to 128 characters.');
        const hash=hashPassword(body.password);
        db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM auth_tokens WHERE user_id=?').run(id);recordAdminActivity(admin.id,'customer_password_reset',id,`Reset password and revoked sessions for ${user.email}`);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        return Response.json({message:'Replacement password saved. Customer sessions and old reset links were invalidated.'});
      }
      if(!emailReady())throw new HttpError('SMTP email delivery must be configured before sending password reset emails.',503);
      const token=newAuthToken(id,'reset',30*60*1000),base=(process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin).replace(/\/$/,'');
      try{await sendCubixtopEmail(user.email,'Reset your Cubixtop password','Reset your password','An administrator requested this reset link. It expires in 30 minutes.',{label:'Reset password',url:`${base}/reset-password?token=${token}`});}catch{db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset'").run(id);throw new HttpError('Reset email could not be delivered. Check SMTP settings.',502);}
      recordAdminActivity(admin.id,'password_reset_email_sent',id,`Sent password reset email to ${user.email}`);
      return Response.json({message:'Password reset email sent. The link expires in 30 minutes.'});
    }
    if(body.action==='save_note'){
      if(typeof body.note!=='string'||body.note.length>4000)throw new HttpError('Support notes must be at most 4000 characters.');
      db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO admin_notes(user_id,note,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(id,body.note.trim(),admin.id,new Date().toISOString());recordAdminActivity(admin.id,'support_note_updated',id,`Updated support note for ${user.email}`);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return Response.json({message:'Private support note saved.'});
    }
    if(body.action==='revoke_sessions'){
      if(user.role==='admin')throw new HttpError('Administrator sessions cannot be revoked here.',403);
      db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);recordAdminActivity(admin.id,'customer_sessions_revoked',id,`Signed out all sessions for ${user.email}`);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return Response.json({message:'Customer signed out of all sessions.'});
    }
    throw new HttpError('Unsupported admin action.');
  }catch(error){return errorResponse(error);}
}
