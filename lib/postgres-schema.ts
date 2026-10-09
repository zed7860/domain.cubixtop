// A private schema keeps this app's tables separate from existing Supabase tables.
export const postgresSchema=`
CREATE SCHEMA IF NOT EXISTS cubixtop;
REVOKE ALL ON SCHEMA cubixtop FROM PUBLIC;
CREATE TABLE IF NOT EXISTS cubixtop.users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created_at TEXT NOT NULL,email_verified INTEGER NOT NULL DEFAULT 0,phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS cubixtop.sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES cubixtop.users(id),expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cubixtop.checkouts (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES cubixtop.users(id),domain TEXT NOT NULL,quote DOUBLE PRECISION,status TEXT NOT NULL DEFAULT 'pending_payment',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,cashfree_order_id TEXT,payment_session_id TEXT,amount_inr DOUBLE PRECISION,contact TEXT,registrar_reference TEXT,failure_reason TEXT,UNIQUE(user_id,domain));
CREATE TABLE IF NOT EXISTS cubixtop.auth_tokens (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES cubixtop.users(id) ON DELETE CASCADE,purpose TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cubixtop.settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cubixtop.admin_notes (user_id TEXT PRIMARY KEY REFERENCES cubixtop.users(id) ON DELETE CASCADE,note TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES cubixtop.users(id),updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cubixtop.admin_activity (id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,detail TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS admin_activity_date_idx ON cubixtop.admin_activity(created_at);
CREATE TABLE IF NOT EXISTS cubixtop.payment_attempts (id TEXT PRIMARY KEY,checkout_id TEXT NOT NULL REFERENCES cubixtop.checkouts(id),provider TEXT NOT NULL,config_key TEXT NOT NULL,gateway_order_id TEXT,status TEXT NOT NULL DEFAULT 'pending',amount_inr DOUBLE PRECISION NOT NULL,created_at TEXT NOT NULL,rowid BIGINT GENERATED ALWAYS AS IDENTITY,UNIQUE(provider,gateway_order_id));
CREATE INDEX IF NOT EXISTS payment_checkout_idx ON cubixtop.payment_attempts(checkout_id);
REVOKE ALL ON ALL TABLES IN SCHEMA cubixtop FROM PUBLIC;
`;
