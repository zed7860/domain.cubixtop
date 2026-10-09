import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const transactions = new AsyncLocalStorage<Transaction>();
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
  const url = process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL && (!url || !/^(libsql|https):\/\//.test(url))) {
    throw new Error('Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for persistent Vercel storage.');
  }
  if (url && !process.env.TURSO_AUTH_TOKEN) throw new Error('TURSO_AUTH_TOKEN is required for the remote database.');
  const root = process.env.DATA_DIRECTORY || join(process.cwd(), '.local');
  if (!url) mkdirSync(root, { recursive: true });
  client = createClient({ url: url || pathToFileURL(join(root, 'domains.sqlite')).href, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
  return client;
}
async function execute(sql: string, args: InValue[] = []) {
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
  async exec(sql: string) { await exclusive(() => connection().executeMultiple(sql)); },
  async transaction<T>(work: () => Promise<T>): Promise<T> {
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
