// Builds index.json for the dist branch from the working tree at --commit.
//   node scripts/build-index.mjs --commit <sha> --out <dir> [--previous <index.json>]
// Exits 0 with "unchanged" on stdout when entries and catalog match the previous index, so CI can skip the push.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { listEntries, readEntry, readJson, schemaErrors, validateIndex } from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    commit: { type: 'string' },
    out: { type: 'string' },
    previous: { type: 'string' },
  },
});
if (!/^[0-9a-f]{40}$/.test(args.commit ?? '') || !args.out) {
  console.error('usage: build-index.mjs --commit <sha> --out <dir> [--previous <index.json>]');
  process.exit(2);
}

const previous = args.previous
  ? JSON.parse(await readFile(args.previous, 'utf8').catch(() => 'null'))
  : null;
const before = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
const official = new Set((await readJson('catalog/trust.json')).official);

const entries = [];
for (const ref of await listEntries()) {
  const { entry, problems } = await readEntry(ref);
  if (!entry || problems.length) {
    console.error(`${ref.dir}: ${problems.join('; ')}`);
    process.exit(1);
  }
  const old = before.get(entry.id);
  let history = old?.history ?? [];
  if (old && old.version !== entry.version)
    history = [{ version: old.version, commit: previous.commit }, ...history].slice(0, 5);
  entries.push({
    ...entry,
    trust: official.has(entry.id) ? 'official' : 'community',
    ...(history.length && { history }),
  });
}

const index = {
  schemaVersion: 1,
  name: 'Wevir',
  generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  sequence: (previous?.sequence ?? 0) + 1,
  commit: args.commit,
  categories: await readJson('catalog/categories.json'),
  featured: await readJson('catalog/featured.json'),
  entries,
};
if (!validateIndex(index)) {
  console.error(schemaErrors(validateIndex).join('\n'));
  process.exit(1);
}

// Entry files are read by commit, so an unchanged catalog keeps pointing at the old commit.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (
  previous &&
  same(previous.categories, index.categories) &&
  same(previous.featured, index.featured) &&
  same(
    previous.entries.map((e) => ({ ...e, history: undefined })),
    index.entries.map((e) => ({ ...e, history: undefined })),
  )
) {
  console.log('unchanged');
  process.exit(0);
}

await writeFile(path.join(args.out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`index.json: sequence ${index.sequence}, ${entries.length} entries`);
