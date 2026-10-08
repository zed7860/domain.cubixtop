import { db } from './db';
import { randomUUID } from 'node:crypto';
export function recordAdminActivity(actorId: string, action: string, targetId: string | null, detail: string) {
  db.prepare('INSERT INTO admin_activity(id,actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), actorId, action, targetId, detail, new Date().toISOString());
}
export function csvValue(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
