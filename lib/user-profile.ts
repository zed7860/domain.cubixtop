import { z } from 'zod';
import { db } from './db';
import { HttpError } from './auth';
export const profileSchema = z.object({
  name:z.string().trim().min(2,'Enter a name of at least 2 characters.').max(80),
  email:z.email().max(254).transform(value=>value.trim().toLowerCase()),
  phone:z.string().trim().max(20).regex(/^$|^\+?[0-9 ()-]{7,20}$/,'Enter a valid mobile number.'),
  address:z.string().trim().max(200),city:z.string().trim().max(80),state:z.string().trim().max(80),
  postal_code:z.string().trim().max(20),country:z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/,'Use a two-letter country code such as IN.'),
});
export type EditableProfile = z.infer<typeof profileSchema>;
export function readProfile(id:string) {
  const row=db.prepare('SELECT name,email,phone,address,city,state,postal_code,country FROM users WHERE id=?').get(id) as EditableProfile;
  return {...row};
}
export function parseProfile(value:unknown){const parsed=profileSchema.safeParse(value);if(!parsed.success)throw new HttpError(parsed.error.issues[0].message);return parsed.data;}
export function updateProfile(id:string,profile:EditableProfile){
  const current=db.prepare('SELECT email FROM users WHERE id=?').get(id) as {email:string}|undefined;
  if(!current)throw new HttpError('Account not found.',404);
  if(db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(profile.email,id))throw new HttpError('This email is already used by another account.',409);
  const changed=profile.email!==current.email;
  db.prepare('UPDATE users SET name=?,email=?,phone=?,address=?,city=?,state=?,postal_code=?,country=?,email_verified=CASE WHEN email!=? THEN 0 ELSE email_verified END WHERE id=?').run(profile.name,profile.email,profile.phone,profile.address,profile.city,profile.state,profile.postal_code,profile.country,profile.email,id);
  if(changed){db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM auth_tokens WHERE user_id=?').run(id);}
  return changed;
}
