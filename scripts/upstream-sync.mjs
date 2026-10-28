// Checks every entry with an upstream and opens or updates one pull request per changed entry (branch sync/<id>,
// label upstream-sync plus risk labels). Problems open or update an issue "upstream: <id>", which is closed once the
// entry syncs again. Never merges.
//   node scripts/upstream-sync.mjs [--entry <id>]... [--check]
// --check only reports what is out of date and changes nothing. Otherwise it needs a clean checkout of the base
// branch, GH_TOKEN and GITHUB_REPOSITORY; TOKEN_KIND=app marks a GitHub App token (its pull requests trigger the
// validate workflow), anything else is the workflow's own token.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, readCatalog } from './lib.mjs';
import { compareText, isCurrent, latestUpstream, syncEntry } from './upstream.mjs';

const { values: args } = parseArgs({
  options: {
    entry: { type: 'string', multiple: true },
    check: { type: 'boolean' },
  },
});
const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const base = process.env.BASE_BRANCH || 'main';
const viaApp = process.env.TOKEN_KIND === 'app';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const LABEL = 'upstream-sync';
const RISK_LABELS = {
  'risk:connector': 'Connector commands, arguments or addresses changed, or a connector was added',
  'risk:inputs': 'Inputs added, removed or changed secret',
  'risk:license': 'Upstream license file or SPDX changed',
  'risk:exec': 'New executable files, scripts or binaries',
  'risk:size': 'Size grew by more than 50% or crossed a limit',
};

const git = (...argv) => execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8' });

const catalog = await readCatalog();
if (catalog.problems.length) {
  console.error(catalog.problems.join('\n'));
  process.exit(1);
}
const targets = [...catalog.entries].filter(([, meta]) => meta.upstream);
for (const id of args.entry ?? []) {
  if (!targets.some(([key]) => key === id)) {
    console.error(`${id}: no catalog/entries/${id}.json with an upstream`);
    process.exit(2);
  }
}
const selected = args.entry?.length ? targets.filter(([id]) => args.entry.includes(id)) : targets;

if (!selected.length) console.log('no entries with an upstream');
if (args.check) {
  let stale = 0;
  for (const [id, { upstream }] of selected) {
    try {
      const latest = await latestUpstream(upstream, { token });
      if (isCurrent(upstream, latest)) console.log(`${id}: up to date`);
      else {
        stale++;
        console.log(`${id}: ${upstream.version ?? upstream.commit ?? '(new)'} → ${latest.version ?? latest.commit}`);
      }
    } catch (error) {
      stale++;
      console.log(`${id}: ✗ ${error.message}`);
    }
  }
  process.exit(stale ? 1 : 0);
}

if (!token || !repo) {
  console.error('GH_TOKEN and GITHUB_REPOSITORY are required (or use --check)');
  process.exit(2);
}
if (git('status', '--porcelain').trim()) {
  console.error('the working tree must be clean');
  process.exit(2);
}

async function api(method, url, body) {
  const res = await fetch(`${apiBase}${url}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wevir-upstream-sync',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const error = new Error(`${method} ${url}: HTTP ${res.status} ${await res.text()}`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

async function ensureLabels(names) {
  for (const name of names) {
    try {
      await api('POST', `/repos/${repo}/labels`, {
        name,
        color: name === LABEL ? '0e8a16' : 'd93f0b',
        description: RISK_LABELS[name] ?? 'Pull requests and issues from upstream-sync',
      });
    } catch (error) {
      if (error.status !== 422) throw error; // 422: it exists already
    }
  }
}

/** Open issues of this workflow, by title. */
async function openIssues() {
  const issues = new Map();
  for (let page = 1; page <= 10; page++) {
    const batch = await api('GET', `/repos/${repo}/issues?state=open&labels=${LABEL}&per_page=100&page=${page}`);
    for (const issue of batch) if (!issue.pull_request) issues.set(issue.title, issue);
    if (batch.length < 100) break;
  }
  return issues;
}

const issues = await openIssues();
const issueTitle = (id) => `upstream: ${id}`;

async function reportProblem(id, message) {
  const body = [
    `upstream-sync could not sync \`${id}\`; no pull request was opened.`,
    '',
    '```',
    message,
    '```',
    '',
    'This issue closes itself once the entry syncs again.',
  ].join('\n');
  const issue = issues.get(issueTitle(id));
  if (issue) {
    if (issue.body !== body) await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { body });
    console.log(`${id}: ✗ ${message} (issue #${issue.number})`);
    return;
  }
  await ensureLabels([LABEL]);
  const created = await api('POST', `/repos/${repo}/issues`, { title: issueTitle(id), body, labels: [LABEL] });
  console.log(`${id}: ✗ ${message} (opened issue #${created.number})`);
}

async function resolveProblem(id, note) {
  const issue = issues.get(issueTitle(id));
  if (!issue) return;
  await api('POST', `/repos/${repo}/issues/${issue.number}/comments`, { body: `Resolved: ${note}` });
  await api('PATCH', `/repos/${repo}/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
  console.log(`${id}: closed issue #${issue.number}`);
}

const owner = repo.split('/')[0];
const findPull = async (branch) =>
  (await api('GET', `/repos/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`))[0];

function validate() {
  const run = spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: ROOT, encoding: 'utf8' });
  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim() };
}

function pullBody(id, upstream, result, marker, check) {
  const { from, to, risks, ignored, patches } = result;
  const lines = [
    `Upstream changed for \`${id}\`. Review it like any contribution before merging; this pull request is never merged automatically.`,
    '',
    `- Upstream: ${compareText(upstream, from, to)}`,
    `- Upstream version: ${from.upstreamVersion ?? '(none)'} → ${to.upstreamVersion ?? '(none)'}`,
    `- Entry version: ${from.version ?? '(new)'} → ${to.version}${result.digestChanged ? '' : ' (files unchanged)'}`,
  ];
  if (result.moved) lines.push(`- Moved from \`${result.moved}/\` to \`${result.ref.dir}/\` (same id)`);
  if (patches.length) lines.push(`- Patches applied: ${patches.join(', ')}`);
  if (ignored.length) lines.push(`- Left out (not available in Wevir): ${ignored.join(', ')}`);
  lines.push('', '### Risks', '');
  if (risks.length) for (const r of risks) lines.push(`- \`${r.label}\`: ${r.detail}`);
  else lines.push('None of the risk rules matched.');
  lines.push('', `### validate ${check.ok ? '✓' : '✗'}`, '');
  if (!viaApp)
    lines.push(
      'Opened with the workflow token, so the validate workflow does not run on this pull request; this is its result at the time of the sync.',
      '',
    );
  lines.push('```', check.output || '(no output)', '```', '', marker);
  return lines.join('\n');
}

const pushUrl = `https://x-access-token:${token}@github.com/${repo}.git`;
let failures = 0;
git('fetch', '--quiet', 'origin', base);

for (const [id, meta] of selected) {
  const { upstream } = meta;
  const branch = `sync/${id}`;
  let workDir;
  try {
    const latest = await latestUpstream(upstream, { token });
    if (isCurrent(upstream, latest)) {
      console.log(`${id}: up to date`);
      await resolveProblem(id, 'the entry matches its upstream.');
      continue;
    }
    const target = latest.commit ?? latest.version;
    const marker = `<!-- upstream-sync: ${id} ${target} -->`;
    const open = await findPull(branch);
    if (open?.body?.includes(marker)) {
      console.log(`${id}: #${open.number} already proposes ${target}`);
      await resolveProblem(id, `#${open.number} proposes the update.`);
      continue;
    }

    git('checkout', '--quiet', '-B', branch, `origin/${base}`);
    workDir = await mkdtemp(path.join(tmpdir(), `upstream-${id}-`));
    const result = await syncEntry({ id, meta, latest, workDir });
    if (!git('status', '--porcelain').trim()) {
      console.log(`${id}: nothing changed`);
      continue;
    }
    const check = validate();
    git('add', '-A', '--', result.ref.dir, ...(result.moved ? [result.moved] : []), `catalog/entries/${id}.json`);
    const title = `Sync ${id} with upstream ${result.to.upstreamVersion ?? target.slice(0, 12)}`;
    git(
      '-c',
      'user.name=wevir-upstream-sync',
      '-c',
      'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit',
      '--quiet',
      '-m',
      title,
    );
    git('push', '--quiet', '--force', pushUrl, `HEAD:refs/heads/${branch}`);

    const body = pullBody(id, upstream, result, marker, check);
    const pull = open
      ? await api('PATCH', `/repos/${repo}/pulls/${open.number}`, { title, body })
      : await api('POST', `/repos/${repo}/pulls`, { title, body, head: branch, base });
    const labels = [LABEL, ...result.risks.map((r) => r.label)];
    await ensureLabels(labels);
    // Replaces the labels, so risks that went away since the last sync are dropped.
    await api('PUT', `/repos/${repo}/issues/${pull.number}/labels`, { labels });
    console.log(`${id}: ${open ? 'updated' : 'opened'} #${pull.number} (${labels.join(', ')})`);
    await resolveProblem(id, `#${pull.number} proposes the update.`);
  } catch (error) {
    try {
      await reportProblem(id, error.message);
    } catch (reportError) {
      failures++;
      console.error(`${id}: ${error.message}\n  and the issue could not be written: ${reportError.message}`);
    }
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    git('checkout', '--quiet', '--force', '--detach', `origin/${base}`);
    git('clean', '--quiet', '-fd', '--', 'plugins', 'skills', 'catalog');
  }
}
process.exit(failures ? 1 : 0);
