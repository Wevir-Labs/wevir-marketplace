// Creates a new ed25519 signing key. The private key goes to <file> (mode 0600) and never into this repo;
// the public key (base64 SPKI DER) goes to keys/<name>.pub and into the Wevir client.
//   node scripts/keygen.mjs <private-key-file> <name>
import { generateKeyPairSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const [file, name] = process.argv.slice(2);
if (!file || !/^[\w-]+$/.test(name ?? '')) {
  console.error('usage: keygen.mjs <private-key-file> <name>');
  process.exit(2);
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
await writeFile(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
await writeFile(path.join(ROOT, 'keys', `${name}.pub`), `${spki}\n`, { flag: 'wx' });
console.log(spki);
