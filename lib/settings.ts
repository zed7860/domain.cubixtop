import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {db} from './db';

const dataRoot=process.env.DATA_DIRECTORY||join(process.cwd(),'.local');
const keyPath=join(dataRoot,'settings.key');
function encryptionKey(){if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32),{mode:0o600});return readFileSync(keyPath);}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64url')).join('.');}
function decrypt(value:string){const [iv,tag,data]=value.split('.').map(part=>Buffer.from(part,'base64url'));const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');}
export function readPrivateSetting<T>(key:string):T|null{const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined;return row?JSON.parse(decrypt(row.value)) as T:null;}
export function writePrivateSetting(key:string,value:unknown){db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,encrypt(JSON.stringify(value)),new Date().toISOString());}
export type CashfreeSettings={appId:string;secretKey:string;environment:'sandbox'|'production'};
export function getCashfreeSettings():CashfreeSettings|null{const row=db.prepare("SELECT value FROM settings WHERE key='cashfree'").get() as {value:string}|undefined;if(!row)return null;try{return JSON.parse(decrypt(row.value));}catch{return null;}}
export function saveCashfreeSettings(value:CashfreeSettings){db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('cashfree',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(encrypt(JSON.stringify(value)),new Date().toISOString());}
export type RegistrarProvider='namesilo'|'godaddy'|'opensrs';
export type RegistrarSettings={provider:RegistrarProvider;credentials:Record<string,string>;verifiedAt?:string};
export function getRegistrarSettings():RegistrarSettings|null{const row=db.prepare("SELECT value FROM settings WHERE key='registrar'").get() as {value:string}|undefined;if(!row)return null;try{return JSON.parse(decrypt(row.value));}catch{return null;}}
export function saveRegistrarSettings(value:RegistrarSettings){db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('registrar',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(encrypt(JSON.stringify(value)),new Date().toISOString());}
