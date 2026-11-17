import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PROVIDERS } from '../lib/mail/profiles.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const selected = process.argv.slice(2);
const ids = selected.length ? [...new Set(selected)] : Object.keys(PROVIDERS);
for (const id of ids) {
  if (!Object.hasOwn(PROVIDERS, id)) throw new Error(`Unknown mail plugin: ${id}`);
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'plugins', id, 'wevir-plugin.json'), 'utf8'));
  if (manifest.id !== id) throw new Error(`Manifest ID mismatch: ${id}`);
}

const digest = data => createHash('sha256').update(data).digest('hex');
const groups = [ids.filter(id => id !== 'fastmail'), ids.filter(id => id === 'fastmail')].filter(group => group.length);
for (const group of groups) {
  const fastmail = group[0] === 'fastmail';
  const temporary = await mkdtemp(path.join(tmpdir(), 'wevir-mail-build-'));
  try {
    const entryPoints = Object.fromEntries(['index', 'imap', 'mime', 'smtp'].map(name => [name, `lib/mail/${name}.mjs`]));
    if (fastmail) Object.assign(entryPoints, { index: 'lib/fastmail/index.mjs', calendar: 'lib/fastmail/calendar.mjs', contacts: 'lib/fastmail/contacts.mjs' });
    const result = await build({
      absWorkingDir: ROOT,
      entryPoints,
      outdir: temporary, outExtension: { '.js': '.mjs' },
      bundle: true, splitting: true, platform: 'node', format: 'esm', target: 'node22',
      minify: true, legalComments: 'linked', metafile: true,
      banner: { js: "import { createRequire as __mailRequire } from 'node:module'; const require = __mailRequire(import.meta.url);" },
    });
    const packages = new Map();
    for (const output of Object.values(result.metafile.outputs)) {
      for (const dependency of output.imports) {
        if (dependency.external && !isBuiltin(dependency.path)) throw new Error(`Unbundled runtime dependency: ${dependency.path}`);
      }
    }
    for (const input of Object.keys(result.metafile.inputs)) {
      if (!input.includes('node_modules/')) continue;
      let dir = path.dirname(path.resolve(ROOT, input));
      while (dir !== ROOT) {
        let pkg;
        try { pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (pkg?.name && pkg?.version) { packages.set(`${pkg.name}@${pkg.version}`, { dir, pkg }); break; }
        dir = path.dirname(dir);
      }
    }
    const notices = [];
    for (const [name, { dir, pkg }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
      const files = (await readdir(dir)).filter(f => /^(licen[cs]e|copying|notice)(?:[.\-]|$)/i.test(f));
      if (!files.length) throw new Error(`Missing redistribution license: ${name}`);
      const texts = [];
      for (const file of files.sort()) {
        if ((await stat(path.join(dir, file))).isFile()) texts.push(`${file}\n${await readFile(path.join(dir, file), 'utf8')}`);
      }
      notices.push(`${name} (${pkg.license ?? 'see license'})\n${texts.join('\n')}\n`);
    }
    await writeFile(path.join(temporary, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n------------------------------------------------------------\n\n'));
    const sources = {};
    for (const directory of ['lib/mail', ...(fastmail ? ['lib/fastmail'] : [])]) {
      for (const name of (await readdir(path.join(ROOT, directory))).filter(n => n.endsWith('.mjs')).sort()) {
        sources[`${directory}/${name}`] = digest(await readFile(path.join(ROOT, directory, name)));
      }
    }
    for (const id of group) {
      await writeFile(path.join(temporary, 'build-info.json'), `${JSON.stringify({
        runtime: 'Wevir Mail 1.0.0', plugin: id, command: `npm run build:mail -- ${id}`,
        sources, lockfile: { path: 'package-lock.json', sha256: digest(await readFile(path.join(ROOT, 'package-lock.json'))) },
        packages: [...packages.keys()].sort(),
      }, null, 2)}\n`);
      const destination = path.join(ROOT, 'plugins', id, 'server');
      await rm(destination, { recursive: true, force: true });
      await mkdir(destination, { recursive: true });
      await cp(temporary, destination, { recursive: true });
      const files = await readdir(path.join(ROOT, 'plugins', id), { recursive: true, withFileTypes: true });
      let total = 0, count = 0;
      for (const file of files) {
        if (file.isDirectory()) continue;
        if (!file.isFile()) throw new Error(`${id}: non-regular file ${file.name}`);
        const size = (await stat(path.join(file.parentPath ?? file.path, file.name))).size;
        if (size > 1024 * 1024) throw new Error(`${id}: file exceeds 1 MiB: ${file.name}`);
        total += size; count++;
      }
      if (total > 8 * 1024 * 1024 || count > 200) throw new Error(`${id}: entry exceeds marketplace size limits`);
      console.log(`${id}: ${count} files, ${total} bytes; bundled ${packages.size} licensed packages`);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
