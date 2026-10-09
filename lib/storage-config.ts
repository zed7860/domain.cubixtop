export class StorageConfigurationError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code=code; }
}

export function storageConfiguration() {
  if(process.env.DATABASE_PROVIDER==='sqlite'&&!process.env.VERCEL)return {provider:'local' as const,url:undefined,authToken:undefined};
  const postgresUrl=(process.env.DATABASE_URL||process.env.SUPABASE_DB_URL||process.env.POSTGRES_URL)?.trim();
  if(postgresUrl){
    try{const parsed=new URL(postgresUrl);if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||!parsed.password||postgresUrl.includes('[YOUR-PASSWORD]'))throw new Error();}
    catch{throw new StorageConfigurationError('DATABASE_URL must be the Supabase PostgreSQL connection string with its database password filled in. Use Supabase Connect → Transaction pooler.','SUPABASE_CONNECTION_INVALID');}
    return {provider:'postgres' as const,url:postgresUrl,authToken:undefined};
  }
  if(process.env.VERCEL&&(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL))throw new StorageConfigurationError('Supabase is configured, but its PostgreSQL connection string is missing. Set DATABASE_URL from Supabase Connect → Transaction pooler in Vercel Production and redeploy. Supabase API keys are not database passwords.','SUPABASE_CONNECTION_MISSING');
  const url=process.env.TURSO_DATABASE_URL?.trim();
  const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
  if(process.env.VERCEL&&!url)throw new StorageConfigurationError('Sign-in is unavailable because the production database is not configured. Set DATABASE_URL from Supabase Connect → Transaction pooler in Vercel Production environment variables, then redeploy.','DATABASE_NOT_CONFIGURED');
  if(url&&!/^(libsql|https):\/\//.test(url))throw new StorageConfigurationError('The database URL is invalid. TURSO_DATABASE_URL must be a remote libsql:// or https:// URL. Correct it in Vercel and redeploy.','DATABASE_URL_INVALID');
  if(url&&!authToken)throw new StorageConfigurationError('The database access token is missing. Set TURSO_AUTH_TOKEN in Vercel Production environment variables, then redeploy.','DATABASE_TOKEN_MISSING');
  return {provider:url?'libsql' as const:'local' as const,url,authToken};
}
