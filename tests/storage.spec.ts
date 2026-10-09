import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { db } from '../lib/db';

test('a failed transaction rolls back settings and keeps concurrent requests isolated', async () => {
  const key = 'transaction-fixture-' + randomUUID();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const transaction = db.transaction(async () => {
    await db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key, 'fixture', new Date().toISOString());
    started();
    await gate;
    throw new Error('Fixture rollback');
  });
  // Attach the rejection assertion before releasing the transaction.
  const rejected = expect(transaction).rejects.toThrow('Fixture rollback');
  await entered;
  const outsideRead = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  release();
  await rejected;
  expect(await outsideRead).toBeUndefined();
  await db.transaction(async () => {
    await db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key, 'committed', new Date().toISOString());
  });
  expect(await db.prepare('SELECT value FROM settings WHERE key=?').get(key)).toMatchObject({ value: 'committed' });
  await db.prepare('DELETE FROM settings WHERE key=?').run(key);
});

test('Vercel refuses a local database fallback without writing account storage', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import {store} from './lib/database-client.ts';
    try { await store.prepare('SELECT 1').get(); process.exit(1); }
    catch (error) { if (!error.message.includes('persistent Vercel storage')) throw error; }
  `], { cwd: process.cwd(), env: { ...process.env, VERCEL: '1', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8' });
  expect(child.status, child.stderr).toBe(0);
});
