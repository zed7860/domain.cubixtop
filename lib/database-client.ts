import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { storageConfiguration } from './storage-config';
import { Pool, types, type PoolClient } from 'pg';
import { postgresSql } from './postgres-sql';

const transactions = new AsyncLocalStorage<Transaction>();
const postgresTransactions = new AsyncLocalStorage<PoolClient>();
let postgresPool: Pool | undefined;
types.setTypeParser(20,Number);
types.setTypeParser(1700,Number);
function isPostgres(){return storageConfiguration().provider==='postgres';}
function pool(){
 if(!postgresPool){
  const url=storageConfiguration().url!;
  const parsed=new URL(url),local=['localhost','127.0.0.1','::1'].includes(parsed.hostname);
  // pg verifies the certificate. Do not disable TLS verification.
  parsed.searchParams.delete('sslmode');
  postgresPool=new Pool({connectionString:parsed.toString(),ssl:local?false:{rejectUnauthorized:true},max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
  postgresPool.on('error',()=>console.error('PostgreSQL pool connection failed.'));
 }
 return postgresPool;
}
async function postgresExecute(sql:string,args:InValue[]=[]){
 const result=await (postgresTransactions.getStore()||pool()).query(postgresSql(sql),args);
 return {rows:result.rows as Record<string,unknown>[],rowsAffected:result.rowCount||0,lastInsertRowid:undefined,columns:result.fields.map(field=>field.name)};
}
let client: Client | undefined;
let localQueue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (process.env.TURSO_DATABASE_URL || transactions.getStore()) return work();
  const result = localQueue.then(work, work);
  localQueue = result.catch(() => {});
  return result;
}
function connection() {
  if (client) return client;
  const {url,authToken} = storageConfiguration();
  const root = process.env.DATA_DIRECTORY || join(process.cwd(), '.local');
  if (!url) mkdirSync(root, { recursive: true });
  client = createClient({ url: url || pathToFileURL(join(root, 'domains.sqlite')).href, authToken, intMode: 'number' });
  return client;
}
async function execute(sql: string, args: InValue[] = []) {
  if(isPostgres())return postgresExecute(sql,args);
  return exclusive(() => (transactions.getStore() || connection()).execute({ sql, args }));
}
export const store = {
  prepare(sql: string) {
    return {
      async get(...args: InValue[]): Promise<Record<string, unknown> | undefined> { return (await execute(sql, args)).rows[0] as unknown as Record<string, unknown> | undefined; },
      async all(...args: InValue[]): Promise<Record<string, unknown>[]> { return (await execute(sql, args)).rows as unknown as Record<string, unknown>[]; },
      async run(...args: InValue[]) { const result = await execute(sql, args); return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid }; },
      async columns() { return (await execute(sql)).columns.map(name => ({ name })); },
    };
  },
  async exec(sql: string) { if(isPostgres()){await (postgresTransactions.getStore()||pool()).query(sql);return;}await exclusive(() => connection().executeMultiple(sql)); },
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if(isPostgres()){
      if(postgresTransactions.getStore())return work();
      const client=await pool().connect();
      try{await client.query('BEGIN');const result=await postgresTransactions.run(client,work);await client.query('COMMIT');return result;}
      catch(error){await client.query('ROLLBACK');throw error;}
      finally{client.release();}
    }
    if (transactions.getStore()) return work();
    return exclusive(async () => {
    const transaction = await connection().transaction('write');
    try {
      const result = await transactions.run(transaction, work);
      await transaction.commit();
      return result;
    } catch (error) { await transaction.rollback(); throw error; }
    finally { transaction.close(); }
    });
  },
};
