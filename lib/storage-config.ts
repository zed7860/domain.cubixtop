export class StorageConfigurationError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code=code; }
}

export function storageConfiguration() {
  const url=process.env.TURSO_DATABASE_URL?.trim();
  const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
  if(process.env.VERCEL&&!url)throw new StorageConfigurationError('Sign-in is unavailable because the production database is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel Production environment variables, then redeploy.','DATABASE_NOT_CONFIGURED');
  if(url&&!/^(libsql|https):\/\//.test(url))throw new StorageConfigurationError('The database URL is invalid. TURSO_DATABASE_URL must be a remote libsql:// or https:// URL. Correct it in Vercel and redeploy.','DATABASE_URL_INVALID');
  if(url&&!authToken)throw new StorageConfigurationError('The database access token is missing. Set TURSO_AUTH_TOKEN in Vercel Production environment variables, then redeploy.','DATABASE_TOKEN_MISSING');
  return {url,authToken};
}
