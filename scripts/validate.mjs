// Checks every entry and the catalog. With --base <ref> it also checks a pull request against that ref:
// versions must go up, and contributors other than the maintainers may only touch plugins/ and skills/.
//   node scripts/validate.mjs [--base origin/main] [--author <login>]
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { ENTRY_ID, listEntries, MANIFEST, parseSkill, ROOT, readEntry, readJson } from './lib.mjs';

const { values: args } = parseArgs({
  options: { base: { type: 'string' }, author: { type: 'string' } },
});
const problems = [];
const report = (where, message) => problems.push(`${where}: ${message}`);
const git = (...argv) => execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8' });

const categories = await readJson('catalog/categories.json');
const categoryIds = new Set(categories.map((c) => c.id));
const ids = new Map();
for (const ref of await listEntries()) {
  const { entry, problems: found } = await readEntry(ref);
  for (const message of found) report(ref.dir, message);
  if (!entry) continue;
  if (ids.has(entry.id)) report(ref.dir, `id "${entry.id}" is also used by ${ids.get(entry.id)}`);
  ids.set(entry.id, ref.dir);
  if (entry.category && !categoryIds.has(entry.category))
    report(ref.dir, `unknown category "${entry.category}" (see catalog/categories.json)`);
  if (!semver.valid(entry.version)) report(ref.dir, `version "${entry.version}" is not semver`);
}

for (const group of await readJson('catalog/featured.json')) {
  for (const id of group.entries) {
    if (!ids.has(id)) report('catalog/featured.json', `unknown entry "${id}" in ${group.id}`);
  }
}
for (const id of (await readJson('catalog/trust.json')).official) {
  if (!ids.has(id)) report('catalog/trust.json', `unknown entry "${id}"`);
}

/** Version an entry had at `ref`, or null when it did not exist there. */
function versionAt(ref, dir) {
  const [type] = dir.split('/');
  const file = type === 'plugins' ? `${dir}/${MANIFEST}` : `${dir}/SKILL.md`;
  let text;
  try {
    text = git('show', `${ref}:${file}`);
  } catch {
    return null;
  }
  if (type === 'plugins') {
    try {
      return JSON.parse(text).version ?? null;
    } catch {
      return null;
    }
  }
  const skill = parseSkill(text);
  return typeof skill === 'string' ? null : (skill.metadata.version ?? '1.0.0');
}

function maintainers() {
  return readFile(path.join(ROOT, '.github/CODEOWNERS'), 'utf8').then((text) => {
    const line = text.split('\n').find((l) => l.trim().startsWith('* '));
    return new Set((line?.match(/@[\w-]+/g) ?? []).map((o) => o.slice(1).toLowerCase()));
  });
}

if (args.base) {
  const changed = git('diff', '--name-only', `${args.base}...HEAD`).split('\n').filter(Boolean);
  const isMaintainer = args.author && (await maintainers()).has(args.author.toLowerCase());
  const dirs = new Set();
  for (const file of changed) {
    const [type, id] = file.split('/');
    if ((type === 'plugins' || type === 'skills') && id && file.split('/').length > 2) {
      dirs.add(`${type}/${id}`);
    } else if (!isMaintainer) {
      report(file, 'only maintainers can change files outside plugins/<id>/ and skills/<name>/');
    }
  }
  for (const dir of dirs) {
    const [type, id] = dir.split('/');
    if (!ENTRY_ID.test(id)) continue;
    const before = versionAt(args.base, dir);
    const now = ids.get(id) === dir ? versionAt('HEAD', dir) : null;
    if (now === null) {
      if (before !== null && !isMaintainer) report(dir, 'only maintainers can remove an entry');
      continue;
    }
    // Skill submissions without metadata.version are updated by content, so their version may stay.
    if (before !== null && type === 'plugins' && !semver.gt(now, before))
      report(dir, `version must be greater than ${before} (now ${now})`);
    if (before !== null && type === 'skills' && semver.lt(now, before))
      report(dir, `version must not go down from ${before} (now ${now})`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`✓ ${ids.size} entr${ids.size === 1 ? 'y' : 'ies'} valid.`);
