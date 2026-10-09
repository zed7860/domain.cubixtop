const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'cubixtop-vercel.zip');
const included = ['app', 'lib', 'public', 'scripts', 'tests', '.env.example', '.gitignore', '.nvmrc', 'DEPLOYMENT.md', 'README.md', 'next-env.d.ts', 'next.config.ts', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', 'vercel.json'];
for (const item of included) if (!fs.existsSync(path.join(root, item))) throw new Error(`Missing source: ${item}`);
// A portable ZIP writer and explicit allowlist exclude private/generated files.
const entries = [];
function collect(relative) {
  const absolute = path.join(root, relative), stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks are excluded: ${relative}`);
  if (stat.isDirectory()) for (const name of fs.readdirSync(absolute)) collect(path.join(relative, name));
  else entries.push({ name: relative.split(path.sep).join('/'), data: fs.readFileSync(absolute) });
}
included.forEach(collect);
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [], central = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name), data = deflateRawSync(entry.data), crc = crc32(entry.data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18); header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); header.copy(record, 6, 4, 30);
  record.writeUInt32LE(offset, 42); central.push(record, name);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(destination, Buffer.concat([...local, directory, end]));
console.log(`Created ${destination}`);
