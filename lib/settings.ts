import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {db} from './db';
import {storageConfiguration} from './storage-config';

const dataRoot=process.env.DATA_DIRECTORY||join(process.cwd(),'.local');
const keyPath=join(dataRoot,'settings.key');
function encryptionKey(){
 const configured=process.env.SETTINGS_ENCRYPTION_KEY;
 if(configured){if(!/^[a-fA-F0-9]{64}$/.test(configured))throw new Error('SETTINGS_ENCRYPTION_KEY must be 64 hexadecimal characters.');return Buffer.from(configured,'hex');}
 if(process.env.VERCEL||storageConfiguration().provider!=='local')throw new Error('SETTINGS_ENCRYPTION_KEY is required for hosted storage.');
 mkdirSync(dataRoot,{recursive:true});
 if(!existsSync(keyPath)){try{writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
 const key=readFileSync(keyPath);if(key.length!==32)throw new Error('The local settings key must contain 32 bytes.');return key;
}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64url')).join('.');}
function decrypt(value:string){const [iv,tag,data]=value.split('.').map(part=>Buffer.from(part,'base64url'));const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');}
export async function readPrivateSetting<T>(key:string):Promise<T|null>{const row=(await db.prepare('SELECT value FROM settings WHERE key=?').get(key)) as {value:string}|undefined;return row?JSON.parse(decrypt(row.value)) as T:null;}
export async function writePrivateSetting(key:string,value:unknown){(await db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,encrypt(JSON.stringify(value)),new Date().toISOString()));}
export type CashfreeSettings={appId:string;secretKey:string;environment:'sandbox'|'production'};
export async function getCashfreeSettings():Promise<CashfreeSettings|null>{const row=(await db.prepare("SELECT value FROM settings WHERE key='cashfree'").get()) as {value:string}|undefined;if(!row)return null;try{return JSON.parse(decrypt(row.value));}catch{return null;}}
export async function saveCashfreeSettings(value:CashfreeSettings){(await db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('cashfree',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(encrypt(JSON.stringify(value)),new Date().toISOString()));}
export type RegistrarProvider='namesilo'|'godaddy'|'opensrs';
export type RegistrarSettings={provider:RegistrarProvider;credentials:Record<string,string>;verifiedAt?:string};
export async function getRegistrarSettings():Promise<RegistrarSettings|null>{const row=(await db.prepare("SELECT value FROM settings WHERE key='registrar'").get()) as {value:string}|undefined;if(!row)return null;try{return JSON.parse(decrypt(row.value));}catch{return null;}}
export async function saveRegistrarSettings(value:RegistrarSettings){(await db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('registrar',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(encrypt(JSON.stringify(value)),new Date().toISOString()));}
