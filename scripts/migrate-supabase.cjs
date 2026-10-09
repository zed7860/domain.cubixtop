const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
const {Pool}=require('pg');
async function main(){
 const connectionString=process.env.DATABASE_URL||process.env.SUPABASE_DB_URL||process.env.POSTGRES_URL;
 if(!connectionString)throw new Error('Add the Supabase transaction-pooler DATABASE_URL to .env.local first.');
 const url=new URL(connectionString);url.searchParams.delete('sslmode');
 const source=path.resolve(process.env.DATA_DIRECTORY||'.local','domains.sqlite');
 if(!fs.existsSync(source))throw new Error('The local application SQLite database is missing.');
 const sqlite=new DatabaseSync(source,{readOnly:true});
 const pool=new Pool({connectionString:url.toString(),ssl:['localhost','127.0.0.1'].includes(url.hostname)?false:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000});
 const client=await pool.connect();
 try{
  sqlite.exec('BEGIN');await client.query('BEGIN');
  const {postgresSchema}=await import(pathToFileURL(path.join(__dirname,'..','lib','postgres-schema.ts')).href);
  await client.query(postgresSchema);
  const tables=['users','checkouts','settings','payment_attempts','admin_notes','admin_activity'];
  const users=sqlite.prepare('SELECT * FROM users ORDER BY created_at').all(),ids=new Map();
  for(const user of users){
   const existing=await client.query('SELECT id FROM cubixtop.users WHERE email=$1',[user.email]);
   ids.set(user.id,existing.rows[0]?.id||user.id);
  }
  for(const table of tables){
   const exists=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);if(!exists)continue;
   const available=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='cubixtop' AND table_name=$1",[table])).rows.map(row=>row.column_name);
   const rows=table==='users'?users:sqlite.prepare(`SELECT * FROM ${table}${table==='payment_attempts'?' ORDER BY rowid':''}`).all();
   let copied=0;
   for(const original of rows){
    const row={...original};
    if(table==='users'){row.id=ids.get(row.id);}
    for(const key of ['user_id','updated_by','actor_id'])if(row[key]&&ids.has(row[key]))row[key]=ids.get(row[key]);
    const columns=Object.keys(row).filter(column=>available.includes(column)&&column!=='rowid');
    const quoted=columns.map(column=>'"'+column.replaceAll('"','""')+'"');
    const result=await client.query(`INSERT INTO cubixtop.${table}(${quoted.join(',')}) VALUES(${columns.map((_,index)=>'$'+(index+1)).join(',')}) ON CONFLICT DO NOTHING`,columns.map(column=>row[column]));
    copied+=result.rowCount||0;
   }
   console.log(table+': '+copied+' imported, '+(rows.length-copied)+' existing records retained.');
  }
  await client.query('COMMIT');sqlite.exec('COMMIT');
  console.log('Migration completed. Existing passwords and orders are preserved; browser sessions and reset tokens were not copied. Keep the original SETTINGS_ENCRYPTION_KEY.');
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{sqlite.close();client.release();await pool.end();}
}
main().catch(error=>{console.error('Supabase migration failed:',error.code||error.message);process.exitCode=1;});
