const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),localPath=path.join(root,'.env.local');
const keyPath=path.join(root,'.local','settings.key');
let key=process.env.SETTINGS_ENCRYPTION_KEY;
if(!key){key=fs.existsSync(keyPath)?fs.readFileSync(keyPath).toString('hex'):crypto.randomBytes(32).toString('hex');}
if(!/^[a-f\d]{64}$/i.test(key))throw new Error('The encryption key must contain 64 hexadecimal characters.');
const values={
 NEXT_PUBLIC_SITE_URL:'https://domain.cubixtop.com',
 DATABASE_URL:process.env.DATABASE_URL||process.env.SUPABASE_DB_URL||process.env.POSTGRES_URL||'',
 NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL||'',
 NEXT_PUBLIC_SUPABASE_ANON_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'',
 SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY||'',
 SETTINGS_ENCRYPTION_KEY:key,
 ADMIN_EMAIL:process.env.ADMIN_EMAIL||'admin@cubixtop.com',ADMIN_PASSWORD:process.env.ADMIN_PASSWORD||'',
 COOKIE_SECURE:'true',EMAIL_FROM:process.env.EMAIL_FROM||'Cubixtop <info@cubixtop.com>',
 SMTP_HOST:process.env.SMTP_HOST||'smtp.zoho.in',SMTP_PORT:process.env.SMTP_PORT||'587',
 SMTP_SECURE:process.env.SMTP_SECURE||'false',SMTP_USER:process.env.SMTP_USER||'info@cubixtop.com',SMTP_PASSWORD:process.env.SMTP_PASSWORD||'',
 NAMESILO_API_KEY:process.env.NAMESILO_API_KEY||'',DEFAULT_MARKUP_PERCENT:process.env.DEFAULT_MARKUP_PERCENT||'25',
};
// JSON-quoted dotenv values preserve spaces and # characters in existing secrets.
const content='# Private Vercel Production environment — never commit this file.\n# DATABASE_URL: Supabase Connect > Transaction pooler, with the database password filled in.\n'+Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n';
const destination=path.join(root,'.env.vercel');fs.writeFileSync(destination,content,{mode:0o600});
let local=fs.readFileSync(localPath,'utf8');
if(!/^SETTINGS_ENCRYPTION_KEY=/m.test(local))local+='\nSETTINGS_ENCRYPTION_KEY='+key+'\n';
else local=local.replace(/^SETTINGS_ENCRYPTION_KEY=.*$/m,'SETTINGS_ENCRYPTION_KEY='+key);
fs.writeFileSync(localPath,local,{mode:0o600});
console.log('Created private .env.vercel with existing SMTP, Supabase and administrator settings.');
console.log(values.DATABASE_URL?'DATABASE_URL is configured.':'DATABASE_URL is still missing; fill it before uploading.');
