import {test,expect} from '@playwright/test';
import {spawn,spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {postgresSchema} from '../lib/postgres-schema';
import {postgresSql} from '../lib/postgres-sql';

test('PostgreSQL schema preserves relational integrity and parameterized payment claims',async()=>{
 const database=new PGlite();
 try{
  await database.exec(postgresSchema);
  const query=(sql:string,args:unknown[]=[])=>database.query(postgresSql(sql),args);
  await query('INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',['user','sql@example.invalid',"O'Reilly",'fixture','2026-10-09']);
  await query('INSERT INTO checkouts(id,user_id,domain,created_at,updated_at,status) VALUES(?,?,?,?,?,?)',['order','user','example.com','2026-10-09','2026-10-09','payment_pending']);
  const claimed=await query("UPDATE checkouts SET status='provisioning' WHERE id=? AND status IN ('payment_pending','payment_failed')",['order']);
  expect(claimed.affectedRows).toBe(1);
  const replay=await query("UPDATE checkouts SET status='provisioning' WHERE id=? AND status IN ('payment_pending','payment_failed')",['order']);
  expect(replay.affectedRows).toBe(0);
  expect((await query("SELECT name FROM users WHERE email LIKE ?",['SQL@%'])).rows).toEqual([{name:"O'Reilly"}]);
  expect((await query("SELECT '?' AS literal,email FROM users WHERE id=?",['user'])).rows).toEqual([{literal:'?',email:'sql@example.invalid'}]);
  await database.exec('BEGIN');
  await query('DELETE FROM checkouts WHERE id=?',['order']);
  await database.exec('ROLLBACK');
  expect((await query('SELECT id FROM checkouts WHERE id=?',['order'])).rows).toEqual([{id:'order'}]);
  await expect(query('DELETE FROM users WHERE id=?',['user'])).rejects.toThrow();
 }finally{await database.close();}
});

test('SQLite migration preserves accounts, password hashes and domain orders in PostgreSQL',()=>{
 const root=mkdtempSync(join(process.cwd(),'.local','test-migration-')),preload=join(root,'migration.cjs');
 const sqlite=new DatabaseSync(join(root,'domains.sqlite'));
 sqlite.exec(`CREATE TABLE users(id TEXT,email TEXT,name TEXT,password TEXT,role TEXT,created_at TEXT);CREATE TABLE checkouts(id TEXT,user_id TEXT,domain TEXT,status TEXT,created_at TEXT,updated_at TEXT);INSERT INTO users VALUES('existing-user','existing@example.invalid','Existing Customer','fixture-hash','customer','2026-10-09');INSERT INTO checkouts VALUES('existing-order','existing-user','existing-domain.com','active','2026-10-09','2026-10-09');`);
 sqlite.close();
 writeFileSync(preload,`const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();async function query(sql,args=[]){const result=!args.length&&sql.includes(';')?(await db.exec(sql)).at(-1):await db.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows?.length||0};}require('pg').Pool=class{async connect(){return {query,release(){}};}async end(){const users=await db.query('SELECT password FROM cubixtop.users');const orders=await db.query('SELECT domain FROM cubixtop.checkouts');if(users.rows[0]?.password!=='fixture-hash'||orders.rows[0]?.domain!=='existing-domain.com')throw new Error('Imported records changed');await db.close();}};`);
 const result=spawnSync(process.execPath,['--require',preload,'scripts/migrate-supabase.cjs'],{cwd:process.cwd(),env:{...process.env,DATA_DIRECTORY:root,DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:5432/fixture'},encoding:'utf8',timeout:20000});
 expect(result.status,result.stderr).toBe(0);
 expect(result.stdout).toContain('users: 1 imported');expect(result.stdout).toContain('checkouts: 1 imported');
});

test('PostgreSQL-backed production server supports login, profiles, orders and admin exports',async({page,playwright})=>{
 test.setTimeout(60000);
 const root=mkdtempSync(join(process.cwd(),'.local','test-postgres-')),preload=join(root,'postgres.cjs'),base='http://127.0.0.1:3008';
 writeFileSync(preload,`const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();let tail=Promise.resolve();async function lock(){let release;const next=new Promise(r=>release=r);const previous=tail;tail=previous.then(()=>next);await previous;return release;}async function query(sql,args=[]){if(sql.includes('pg_advisory_xact_lock'))return {rows:[],fields:[],rowCount:0};let result;if(!args.length&&sql.includes(';'))result=(await db.exec(sql)).at(-1);else result=await db.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows?.length||0};}require('pg').Pool=class {on(){return this;}async query(sql,args){const release=await lock();try{return await query(sql,args);}finally{release();}}async connect(){const release=await lock();return {query,release};}};`);
 const child=spawn(process.execPath,['--require',preload,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3008'],{cwd:process.cwd(),env:{...process.env,DATABASE_PROVIDER:'postgres',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:5432/fixture',SUPABASE_DB_URL:'',POSTGRES_URL:'',TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:'',DATA_DIRECTORY:root,SETTINGS_ENCRYPTION_KEY:'1'.repeat(64),NEXT_PUBLIC_SITE_URL:base,ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD:'Postgres-Admin-Password-123456',COOKIE_SECURE:'false',SMTP_HOST:'',NAMESILO_API_KEY:''},stdio:['ignore','ignore','pipe']});
 let logs='';child.stderr.on('data',data=>logs+=String(data));
 const customer=await playwright.request.newContext({baseURL:base});
 try{
  await expect.poll(async()=>{try{return (await customer.get('/api/auth',{timeout:1000})).status();}catch{return 0;}},{timeout:20000,message:logs}).toBe(200);
  const signup=await customer.post('/api/auth',{data:{action:'signup',name:'Postgres Customer',email:'pg-customer@example.invalid',password:'Postgres-Customer-Password-123456'}});
  expect(signup.status(),logs).toBe(200);
  const user=(await signup.json()).user;
  const order=await customer.post('/api/orders',{data:{domain:'postgres-fixture.com'}});
  expect(order.status(),await order.text()).toBe(200);
  expect((await (await customer.get('/api/orders')).json()).orders).toHaveLength(1);
  expect((await customer.post('/api/account/profile',{data:{name:'Updated Customer',email:user.email,phone:'9999999999',address:'Fixture address',city:'Bengaluru',state:'Karnataka',postal_code:'560001',country:'IN'}})).status()).toBe(200);
  const login=await page.request.post(base+'/api/auth',{data:{action:'login',email:'admin@example.invalid',password:'Postgres-Admin-Password-123456'}});
  expect(login.status(),logs).toBe(200);
  const overview=await page.goto(base+'/admin');
  expect(overview?.status(),logs).toBe(200);
  await expect(page.getByRole('heading',{name:'Business control center',exact:true})).toBeVisible();
  const exported=await page.request.get(base+'/api/admin/export?kind=customers');
  expect(exported.status(),await exported.text()).toBe(200);
  expect(await exported.text()).toContain('Updated Customer');
  await page.goto(base+'/admin?section=customers&q=PG-CUSTOMER');
  await expect(page.getByText('pg-customer@example.invalid',{exact:true})).toBeVisible();
  const settings=await page.request.post(base+'/api/admin/payments',{data:{provider:'easebuzz',environment:'sandbox',credentials:{merchantKey:'fixture-merchant-key',salt:'fixture-merchant-salt'}}});
  expect(settings.status(),await settings.text()).toBe(200);
  const publicSettings=await page.request.get(base+'/api/admin/payments');
  expect(await publicSettings.text()).not.toContain('fixture-merchant-salt');
  for(const section of ['orders','payments','review','integrations','security','activity']){
   const response=await page.goto(base+'/admin?section='+section);
   expect(response?.status(),logs).toBe(200);
   await expect(page.locator('main')).toBeVisible();
  }
  await page.goto(base+'/admin');
  await page.screenshot({path:'.local/supabase-test-admin.png',fullPage:true});
 }finally{
  await customer.dispose();
  if(child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;}
 }
});
