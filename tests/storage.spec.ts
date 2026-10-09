import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { storageConfiguration } from '../lib/storage-config';
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

test('database configuration ignores unrelated admin and merchant encryption settings',()=>{
 const keys=['VERCEL','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','ADMIN_PASSWORD','SETTINGS_ENCRYPTION_KEY'] as const;
 const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.VERCEL='1';process.env.TURSO_DATABASE_URL='libsql://fixture.example';process.env.TURSO_AUTH_TOKEN='fixture-token';
  delete process.env.ADMIN_PASSWORD;process.env.SETTINGS_ENCRYPTION_KEY='invalid';
  expect(storageConfiguration()).toEqual({url:'libsql://fixture.example',authToken:'fixture-token'});
  delete process.env.TURSO_AUTH_TOKEN;
  expect(()=>storageConfiguration()).toThrow('TURSO_AUTH_TOKEN');
  process.env.TURSO_DATABASE_URL='file:/tmp/accounts.sqlite';
  expect(()=>storageConfiguration()).toThrow('database URL is invalid');
 }finally{for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});

test('Vercel refuses a local database fallback without writing account storage', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import {storageConfiguration} from './lib/storage-config.ts';
    try { storageConfiguration(); process.exit(1); }
    catch (error) { if (error.code !== 'DATABASE_NOT_CONFIGURED') throw error; }
  `], { cwd: process.cwd(), env: { ...process.env, VERCEL: '1', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8' });
  expect(child.status, child.stderr).toBe(0);
});
