// Checks every entry and the catalog. With --base <ref> it also checks a pull request against that ref:
// versions must go up, and contributors other than the maintainers may only touch plugins/ and skills/. The
// upstream-sync bot (--sync-bot <login>) may also update catalog/entries/<id>.json of the entries it changes.
//   node scripts/validate.mjs [--base origin/main] [--author <login>] [--sync-bot <login>]
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { checkRepository, ENTRY_ID, ROOT, versionAt } from './lib.mjs';

const { values: args } = parseArgs({
  options: { base: { type: 'string' }, author: { type: 'string' }, 'sync-bot': { type: 'string' } },
});
const problems = [];
const report = (where, message) => problems.push(`${where}: ${message}`);
const git = (...argv) => execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8' });

const { ids, problems: found } = await checkRepository();
problems.push(...found);

function maintainers() {
  return readFile(path.join(ROOT, '.github/CODEOWNERS'), 'utf8').then((text) => {
    const line = text.split('\n').find((l) => l.trim().startsWith('* '));
    return new Set((line?.match(/@[\w-]+/g) ?? []).map((o) => o.slice(1).toLowerCase()));
  });
}

if (args.base) {
  const changed = git('diff', '--name-only', `${args.base}...HEAD`).split('\n').filter(Boolean);
  const isMaintainer = args.author && (await maintainers()).has(args.author.toLowerCase());
  const isSyncBot = Boolean(args.author && args['sync-bot'] && args.author === args['sync-bot']);
  const dirs = new Set();
  for (const file of changed) {
    const [type, id] = file.split('/');
    if ((type === 'plugins' || type === 'skills') && id && file.split('/').length > 2) {
      dirs.add(`${type}/${id}`);
    }
  }
  const touched = new Set([...dirs].map((dir) => dir.split('/')[1]));
  for (const file of changed) {
    const [type, id] = file.split('/');
    if ((type === 'plugins' || type === 'skills') && id && file.split('/').length > 2) continue;
    const synced = isSyncBot && touched.has(/^catalog\/entries\/([^/]+)\.json$/.exec(file)?.[1]);
    if (!isMaintainer && !synced)
      report(file, 'only maintainers can change files outside plugins/<id>/ and skills/<name>/');
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
