import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
export function verifyPassword(password: string, stored: string) { const [salt, hash] = stored.split(':'); const computed = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return expected.length === computed.length && timingSafeEqual(expected, computed); }
const root = process.env.DATA_DIRECTORY || join(process.cwd(), '.local');
mkdirSync(root, { recursive: true });
const globalDb = globalThis as unknown as { cubixtopDb?: DatabaseSync };
export const db = globalDb.cubixtopDb ?? new DatabaseSync(join(root, 'domains.sqlite'));
globalDb.cubixtopDb = db;
db.exec(`PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS checkouts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), domain TEXT NOT NULL, quote REAL, status TEXT NOT NULL DEFAULT 'pending_payment', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,domain));
CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL, expires INTEGER NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS admin_notes (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, note TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_activity (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS admin_activity_date_idx ON admin_activity(created_at);`);
db.exec(`CREATE TABLE IF NOT EXISTS payment_attempts (
 id TEXT PRIMARY KEY, checkout_id TEXT NOT NULL REFERENCES checkouts(id), provider TEXT NOT NULL,
 config_key TEXT NOT NULL, gateway_order_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
 amount_inr REAL NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(provider,gateway_order_id));
 CREATE INDEX IF NOT EXISTS payment_checkout_idx ON payment_attempts(checkout_id);`);
const columns = db.prepare('PRAGMA table_info(users)').all() as {name:string}[];
if (!columns.some(column=>column.name==='email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
for (const name of ['phone','address','city','state','postal_code','country']) if (!columns.some(column=>column.name===name)) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`); }
  catch(error) { if (!(error instanceof Error) || !error.message.includes('duplicate column')) throw error; }
}
const checkoutColumns=db.prepare('PRAGMA table_info(checkouts)').all() as {name:string}[];
for(const [name,type] of [['cashfree_order_id','TEXT'],['payment_session_id','TEXT'],['amount_inr','REAL'],['contact','TEXT'],['registrar_reference','TEXT'],['failure_reason','TEXT']] as const)if(!checkoutColumns.some(column=>column.name===name))try{db.exec(`ALTER TABLE checkouts ADD COLUMN ${name} ${type}`);}catch(error){if(!(error instanceof Error)||!error.message.includes('duplicate column'))throw error;}
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cubixtop.com').trim().toLowerCase();
const configuredAdminPassword = process.env.ADMIN_PASSWORD;
const existingAdmin = db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail) as {id:string}|undefined;
if (existingAdmin && configuredAdminPassword) {
  db.prepare("UPDATE users SET name='Administrator',password=?,role='admin',email_verified=1 WHERE id=?").run(hashPassword(configuredAdminPassword),existingAdmin.id);
} else if (!existingAdmin) {
  const password = configuredAdminPassword || randomBytes(18).toString('base64url');
  const created = db.prepare('INSERT OR IGNORE INTO users(id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), adminEmail, 'Administrator', hashPassword(password), 'admin', new Date().toISOString());
  if (created.changes && !configuredAdminPassword && !existsSync(join(root, 'admin-credentials.txt'))) writeFileSync(join(root, 'admin-credentials.txt'), `Admin login: ${adminEmail}\nPassword: ${password}\nKeep this file private.\n`, { mode: 0o600 });
}
export type User = { id: string; email: string; name: string; role: string; email_verified?: number };
export type Checkout = { id:string;user_id:string;domain:string;quote:number|null;status:string;created_at:string;updated_at:string;cashfree_order_id?:string|null;payment_session_id?:string|null;amount_inr?:number|null;contact?:string|null;registrar_reference?:string|null;failure_reason?:string|null };
