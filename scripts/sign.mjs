// Signs <dir>/index.json with the ed25519 key in $MARKET_SIGNING_KEY (PKCS#8 PEM) and writes index.json.sig
// (base64). Refuses keys whose public half is not listed in keys/, so a wrong secret fails here, not in clients.
//   node scripts/sign.mjs <dir>
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const dir = process.argv[2];
const pem = process.env.MARKET_SIGNING_KEY;
if (!dir || !pem) {
  console.error('usage: MARKET_SIGNING_KEY=<pem> sign.mjs <dir>');
  process.exit(2);
}
const key = createPrivateKey(pem);
const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
const keysDir = path.join(ROOT, 'keys');
const known = await Promise.all(
  (await readdir(keysDir))
    .filter((f) => f.endsWith('.pub'))
    .map((f) => readFile(path.join(keysDir, f), 'utf8').then((t) => t.trim())),
);
if (!known.includes(publicKey)) {
  console.error('MARKET_SIGNING_KEY does not match any key in keys/');
  process.exit(1);
}
const index = await readFile(path.join(dir, 'index.json'));
await writeFile(path.join(dir, 'index.json.sig'), `${sign(null, index, key).toString('base64')}\n`);
console.log('index.json.sig written');
