import { createClient } from '@supabase/supabase-js';
import { HttpError } from './auth';

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() };
}

export function supabaseAuthEnabled() { return process.env.DATABASE_PROVIDER !== 'sqlite' && process.env.AUTH_PROVIDER !== 'local' && configuration() !== null; }

export function supabaseAuth() {
  const config = configuration();
  if (!config) throw new HttpError('Supabase Auth is not configured.', 503);
  return createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function supabaseAdmin() {
  const config = configuration();
  if (!config?.serviceRoleKey) throw new HttpError('Supabase Auth administration is not configured.', 503);
  return createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function authErrorMessage(message: string) {
  const value = message.toLowerCase();
  if (value.includes('invalid login')) return 'Email or password is incorrect.';
  if (value.includes('email not confirmed')) return 'Confirm your email address before signing in.';
  if (value.includes('already registered') || value.includes('already been registered')) return 'This email cannot be used. Sign in or use another email.';
  return message || 'Authentication could not be completed. Please try again.';
}
