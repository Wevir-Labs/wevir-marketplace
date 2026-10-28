import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  catalogEntry,
  checkRepository,
  digestOf,
  expandFeatured,
  indexUpstream,
  listedTimes,
  listEntries,
  ROOT,
  readCatalog,
  readEntry,
  resolveCategory,
  unpinnedPackage,
  upstreamUrl,
  validateIndex,
  versionAt,
} from './lib.mjs';
import {
  compareRisks,
  globToRegExp,
  isCurrent,
  latestUpstream,
  pickTag,
  repinArgs,
  syncEntry,
} from './upstream.mjs';

let root;
const put = async (rel, content) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
};
const manifest = (extra = {}) =>
  JSON.stringify({ schemaVersion: 1, id: 'notes', name: 'Notes', version: '1.0.0', ...extra });
const skill = (name, description = 'Does things') => `---\nname: ${name}\ndescription: ${description}\n---\n\nBody\n`;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'wevir-market-'));
});
after(() => rm(root, { recursive: true, force: true }));

describe('readEntry', () => {
  it('describes a plugin with a connector and a skill', async () => {
    await put(
      'plugins/notes/wevir-plugin.json',
      manifest({
        category: 'productivity',
        connectors: {
          api: { transport: 'stdio', command: 'npx', args: ['-y', '@acme/notes-mcp@1.2.3', '${input:TOKEN}'] },
        },
        inputs: [{ key: 'TOKEN', label: 'Token', secret: true, required: true }],
      }),
    );
    await put('plugins/notes/README.md', '# Notes\n');
    await put('plugins/notes/skills/jot/SKILL.md', skill('jot'));
    const { entry, problems } = await readEntry({ type: 'plugins', id: 'notes', dir: 'plugins/notes' }, root);
    assert.deepEqual(problems, []);
    assert.equal(entry.kind, 'plugin');
    assert.equal(entry.category, 'productivity');
    assert.deepEqual(
      entry.files.map((f) => f.path),
      ['README.md', 'skills/jot/SKILL.md', 'wevir-plugin.json'],
    );
    assert.equal(entry.digest, digestOf(entry.files));
    assert.deepEqual(entry.contents.skills, [{ name: 'jot', description: 'Does things' }]);
  });

  it('infers mcp and skill kinds', async () => {
    await put(
      'plugins/remote/wevir-plugin.json',
      manifest({ id: 'remote', connectors: { api: { transport: 'http', url: 'https://example.com/mcp' } } }),
    );
    await put('plugins/remote/README.md', '# Remote\n');
    await put('skills/pdf/SKILL.md', skill('pdf'));
    const mcp = await readEntry({ type: 'plugins', id: 'remote', dir: 'plugins/remote' }, root);
    const single = await readEntry({ type: 'skills', id: 'pdf', dir: 'skills/pdf' }, root);
    assert.equal(mcp.entry.kind, 'mcp');
    assert.equal(single.entry.kind, 'skill');
    assert.equal(single.entry.version, '1.0.0');
  });

  it('rejects secrets, unpinned packages, undeclared inputs and links', async () => {
    await put(
      'plugins/bad/wevir-plugin.json',
      manifest({
        id: 'bad',
        connectors: { api: { transport: 'stdio', command: 'npx', args: ['some-mcp', '${input:MISSING}'] } },
      }),
    );
    await put('plugins/bad/README.md', `token ghp_${'a'.repeat(36)}\n`);
    await symlink('/etc/hosts', path.join(root, 'plugins/bad/hosts'));
    const { problems } = await readEntry({ type: 'plugins', id: 'bad', dir: 'plugins/bad' }, root);
    const text = problems.join('\n');
    assert.match(text, /secret/);
    assert.match(text, /pin an exact version/);
    assert.match(text, /MISSING/);
    assert.match(text, /symbolic links/);
  });

  it('requires the manifest id and SKILL.md name to match the directory', async () => {
    await put('plugins/other/wevir-plugin.json', manifest({ id: 'notes' }));
    await put('plugins/other/README.md', '#\n');
    await put('plugins/other/skills/a/SKILL.md', skill('a'));
    await put('skills/wrong/SKILL.md', skill('right'));
    const plugin = await readEntry({ type: 'plugins', id: 'other', dir: 'plugins/other' }, root);
    const single = await readEntry({ type: 'skills', id: 'wrong', dir: 'skills/wrong' }, root);
    assert.match(plugin.problems.join(), /must match the directory name/);
    assert.match(single.problems.join(), /must match the directory name/);
  });

  it('lists entries of both types', async () => {
    const ids = (await listEntries(root)).map((e) => e.dir);
    assert.ok(ids.includes('plugins/notes') && ids.includes('skills/pdf'));
  });
});

describe('unpinnedPackage', () => {
  it('accepts exact versions', () => {
    assert.equal(unpinnedPackage('npx', ['-y', '@scope/pkg@1.2.3']), null);
    assert.equal(unpinnedPackage('uvx', ['mcp-server-fetch==2025.4.7']), null);
    assert.equal(unpinnedPackage('pnpm', ['dlx', 'pkg@0.1.0-beta.2']), null);
    assert.equal(unpinnedPackage('node', ['server.mjs']), null);
  });
  it('rejects ranges, latest and bare names', () => {
    assert.ok(unpinnedPackage('npx', ['-y', 'pkg']));
    assert.ok(unpinnedPackage('npx', ['pkg@latest']));
    assert.ok(unpinnedPackage('npx', ['pkg@^1.2.0']));
    assert.ok(unpinnedPackage('uvx', ['mcp-server-fetch']));
  });
});

// --- Catalog: categories, listing time, featured groups, verification ---

const gitIn = (cwd, ...argv) =>
  execFileSync('git', argv, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
const commitAt = (cwd, message, time) =>
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_DATE: time,
      GIT_COMMITTER_DATE: time,
    },
  });

/** A marketplace checkout in a temp dir with the real categories and empty catalog. */
async function market() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wevir-market-repo-'));
  const write = async (rel, content) => {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  };
  await write('catalog/categories.json', await readFile(path.join(ROOT, 'catalog/categories.json'), 'utf8'));
  await write('catalog/featured.json', []);
  return { dir, write };
}
const plugin = (id, extra = {}) => ({
  // Written the way sync writes manifests, so a sync does not change the size by reformatting.
  [`plugins/${id}/wevir-plugin.json`]: `${JSON.stringify(
    {
      schemaVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      connectors: { api: { transport: 'http', url: `https://example.com/${id}` } },
      ...extra,
    },
    null,
    2,
  )}\n`,
  [`plugins/${id}/README.md`]: `# ${id}\n`,
});

describe('catalog', () => {
  it('categories come from the catalog, then the manifest, then other', async () => {
    assert.equal(resolveCategory({ category: 'finance' }, 'productivity'), 'finance');
    assert.equal(resolveCategory({}, 'productivity'), 'productivity');
    assert.equal(resolveCategory(undefined, undefined), 'other');
    const { entry } = await readEntry({ type: 'plugins', id: 'notes', dir: 'plugins/notes' }, root);
    const listedAt = '2026-10-21T08:00:00Z';
    assert.equal(catalogEntry(entry, { listedAt }).category, 'productivity');
    assert.equal(catalogEntry(entry, { catalog: { category: 'writing' }, listedAt }).category, 'writing');
    const { entry: bare } = await readEntry({ type: 'plugins', id: 'remote', dir: 'plugins/remote' }, root);
    assert.equal(catalogEntry(bare, { listedAt }).category, 'other');
  });

  it('checks categories, catalog ids, verification and upstream licenses', async () => {
    const { dir, write } = await market();
    for (const [rel, content] of Object.entries({
      ...plugin('alpha', { category: 'not-a-category' }),
      ...plugin('beta', { category: 'not-a-category' }),
      ...plugin('gamma'),
    }))
      await write(rel, content);
    await write('catalog/entries/beta.json', { category: 'finance', verification: { level: 'official', since: '2026-10' } });
    await write('catalog/entries/gamma.json', {
      category: 'nope',
      upstream: { repo: 'https://github.com/acme/gamma', track: 'branch:main', format: 'wevir', license: 'MIT' },
    });
    await write('catalog/entries/ghost.json', {});
    await write('catalog/entries/delta.json', { verification: { level: 'verified', since: '2026-10' } });
    await write('catalog/featured.json', [
      { id: 'popular', name: { en: 'Popular' }, entries: ['alpha', 'missing'] },
      { id: 'new', name: { en: 'New' }, auto: 'recent', limit: 0 },
    ]);
    const { problems } = await checkRepository(dir);
    const text = problems.join('\n');
    assert.match(text, /plugins\/alpha: unknown category "not-a-category"/);
    assert.doesNotMatch(text, /plugins\/beta: unknown category/, 'the catalog overrides the suggestion');
    assert.match(text, /gamma\.json: unknown category "nope"/);
    assert.match(text, /plugins\/gamma: entries with an upstream must keep its LICENSE file/);
    assert.match(text, /ghost\.json: no entry "ghost"/);
    assert.match(text, /delta\.json\/verification must have required property 'publisher'/);
    assert.match(text, /popular: unknown entry "missing"/);
    assert.match(text, /new: limit must be an integer/);
    await rm(dir, { recursive: true, force: true });
  });

  it('accepts official without a publisher and validates the index fields', async () => {
    const { entries, problems } = await (async () => {
      const { dir, write } = await market();
      await write('catalog/entries/a.json', { verification: { level: 'official', since: '2026-10' } });
      await write('catalog/entries/b.json', {
        verification: { level: 'verified', publisher: 'Notion Labs', since: '2026-10', note: { en: 'Hi' } },
        upstream: { package: 'npm:@notionhq/notion-mcp-server', version: '2.4.0', license: 'MIT' },
      });
      await write('catalog/entries/c.json', { upstream: { package: 'npm:x', repo: 'https://github.com/a/b', license: 'MIT' } });
      const result = await readCatalog(dir);
      await rm(dir, { recursive: true, force: true });
      return result;
    })();
    assert.deepEqual([...entries.keys()], ['a', 'b']);
    assert.match(problems.join(), /c\.json/);
    assert.deepEqual(indexUpstream(entries.get('b').upstream), {
      url: 'https://www.npmjs.com/package/@notionhq/notion-mcp-server',
      version: '2.4.0',
      license: 'MIT',
    });
    assert.equal(
      upstreamUrl({ repo: 'https://github.com/anthropics/skills.git', path: 'skills/pdf', commit: 'a'.repeat(40) }),
      `https://github.com/anthropics/skills/tree/${'a'.repeat(40)}/skills/pdf`,
    );
    assert.equal(upstreamUrl({ repo: 'https://example.org/x/y', path: 'sub' }), 'https://example.org/x/y');

    await put(
      'plugins/linked/wevir-plugin.json',
      manifest({
        id: 'linked',
        examples: ['Summarize my notes'],
        i18n: { 'zh-CN': { description: '笔记', examples: ['总结我的笔记'] } },
        privacyPolicy: 'https://example.com/privacy',
        termsOfService: 'https://example.com/terms',
        connectors: { api: { transport: 'http', url: 'https://example.com/mcp' } },
      }),
    );
    await put('plugins/linked/README.md', '#\n');
    const { entry, problems: found } = await readEntry({ type: 'plugins', id: 'linked', dir: 'plugins/linked' }, root);
    assert.deepEqual(found, []);
    const indexed = catalogEntry(entry, {
      catalog: { ...entries.get('b'), upstream: { repo: 'https://github.com/a/b', commit: 'b'.repeat(40), license: 'MIT', track: 'branch:main', format: 'wevir' } },
      listedAt: '2026-10-21T08:00:00Z',
    });
    assert.deepEqual(indexed.links, { privacy: 'https://example.com/privacy', terms: 'https://example.com/terms' });
    assert.deepEqual(indexed.examples, ['Summarize my notes']);
    assert.deepEqual(indexed.upstream, { url: 'https://github.com/a/b', commit: 'b'.repeat(40), license: 'MIT' });
    const index = {
      schemaVersion: 1,
      name: 'Wevir',
      generatedAt: '2026-10-21T08:00:00Z',
      sequence: 1,
      commit: 'c'.repeat(40),
      categories: [{ id: 'other', name: { en: 'Other' } }],
      featured: [{ id: 'new', name: { en: 'New' }, entries: ['linked'] }],
      entries: [indexed],
    };
    assert.ok(validateIndex(index), JSON.stringify(validateIndex.errors));
    assert.ok(!validateIndex({ ...index, entries: [{ ...indexed, trust: 'official' }] }), 'trust is gone');
  });

  it('dates entries by their first commit on the first-parent history and fills automatic groups', async () => {
    const { dir, write } = await market();
    gitIn(dir, 'init', '-q', '-b', 'main');
    for (const [rel, content] of Object.entries(plugin('old'))) await write(rel, content);
    gitIn(dir, 'add', '-A');
    commitAt(dir, 'old', '2026-01-02T03:04:05+08:00');
    // A later change to the same entry does not move its listing time.
    await write('plugins/old/extra.md', 'x');
    gitIn(dir, 'add', '-A');
    commitAt(dir, 'edit', '2026-05-01T00:00:00Z');
    // An entry merged from a branch counts from the merge, not from the branch commit.
    gitIn(dir, 'checkout', '-q', '-b', 'pr');
    for (const [rel, content] of Object.entries(plugin('merged'))) await write(rel, content);
    gitIn(dir, 'add', '-A');
    commitAt(dir, 'merged', '2026-03-01T00:00:00Z');
    gitIn(dir, 'checkout', '-q', 'main');
    execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'merge', 'pr'], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e', GIT_COMMITTER_DATE: '2026-06-01T00:00:00Z', GIT_AUTHOR_DATE: '2026-06-01T00:00:00Z' },
    });
    const head = gitIn(dir, 'rev-parse', 'HEAD').trim();
    const times = listedTimes(head, dir);
    assert.equal(times.get('plugins/old'), '2026-01-01T19:04:05Z');
    assert.equal(times.get('plugins/merged'), '2026-06-01T00:00:00Z');
    await rm(dir, { recursive: true, force: true });

    const entries = [
      { id: 'a', listedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', listedAt: '2026-03-01T00:00:00Z' },
      { id: 'c', listedAt: '2026-03-01T00:00:00Z' },
      { id: 'd', listedAt: '2026-02-01T00:00:00Z' },
    ];
    assert.deepEqual(
      expandFeatured(
        [
          { id: 'popular', name: { en: 'Popular' }, entries: ['d'] },
          { id: 'new', name: { en: 'New' }, auto: 'recent', limit: 3 },
        ],
        entries,
      ),
      [
        { id: 'popular', name: { en: 'Popular' }, entries: ['d'] },
        { id: 'new', name: { en: 'New' }, entries: ['b', 'c', 'd'] },
      ],
    );
  });
});

describe('versionAt', () => {
  it('reads versions at a ref and stays quiet about entries that are new', async () => {
    const m = await market();
    gitIn(m.dir, 'init', '-q', '-b', 'main');
    for (const [rel, content] of Object.entries(plugin('old'))) await m.write(rel, content);
    await m.write('skills/plain/SKILL.md', skill('plain'));
    gitIn(m.dir, 'add', '-A');
    gitIn(m.dir, 'commit', '-q', '-m', 'base');
    assert.equal(versionAt('HEAD', 'plugins/old', m.dir), '1.0.0');
    assert.equal(versionAt('HEAD', 'skills/plain', m.dir), '1.0.0');
    assert.equal(versionAt('HEAD', 'plugins/new', m.dir), null);
    // git prints "fatal: path … does not exist in 'HEAD'" for the missing file unless versionAt silences it.
    const lib = path.join(ROOT, 'scripts/lib.mjs');
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `import { versionAt } from ${JSON.stringify(lib)}; console.log(versionAt('HEAD', 'plugins/new', ${JSON.stringify(m.dir)}));`],
      { encoding: 'utf8' },
    );
    assert.equal(run.stdout, 'null\n');
    assert.equal(run.stderr, '');
    await rm(m.dir, { recursive: true, force: true });
  });
});

// --- Upstream sync, against local git repositories ---

/** A git repository in a temp dir that plays the upstream; `commit(files)` returns the new sha. */
async function upstreamRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wevir-upstream-'));
  gitIn(dir, 'init', '-q', '-b', 'main');
  const commit = async (files, message = 'change') => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      if (content === null) await rm(abs, { force: true });
      else {
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, content);
      }
    }
    gitIn(dir, 'add', '-A');
    gitIn(dir, 'commit', '-q', '-m', message);
    return gitIn(dir, 'rev-parse', 'HEAD').trim();
  };
  return { dir, url: `file://${dir}`, commit };
}

/** Runs syncEntry for `meta` in the marketplace `m` with a fresh work dir. */
async function sync(m, id, meta) {
  const latest = await latestUpstream(meta.upstream);
  const workDir = await mkdtemp(path.join(tmpdir(), 'wevir-sync-'));
  try {
    return await syncEntry({ id, meta, latest, workDir, root: m.dir });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
const readText = (dir, rel) => readFile(path.join(dir, rel), 'utf8');
const fileExists = (dir, rel) => readFile(path.join(dir, rel)).then(() => true, () => false);

describe('upstream', () => {
  it('finds the newest commit of a branch and the newest stable tag', async () => {
    const up = await upstreamRepo();
    const first = await up.commit({ 'a.txt': '1' });
    gitIn(up.dir, 'tag', 'v1.2.0');
    await up.commit({ 'a.txt': '2' });
    gitIn(up.dir, 'tag', '-a', '-m', 'annotated', 'v1.10.0');
    const tagged = gitIn(up.dir, 'rev-parse', 'HEAD').trim();
    const head = await up.commit({ 'a.txt': '3' });
    gitIn(up.dir, 'tag', 'v2.0.0-beta.1');
    assert.deepEqual(await latestUpstream({ repo: up.url, track: 'branch:main' }), { commit: head, ref: 'main' });
    assert.deepEqual(await latestUpstream({ repo: up.url, track: 'tag:v*' }), {
      commit: tagged,
      ref: 'v1.10.0',
      version: '1.10.0',
    });
    assert.notEqual(first, tagged);
    await assert.rejects(latestUpstream({ repo: up.url, track: 'branch:gone' }), /no branch gone/);
    await assert.rejects(latestUpstream({ repo: up.url, track: 'tag:release-*' }), /no tag matching/);
    assert.equal(pickTag(['v1.0.0', 'v1.0.0-rc.1', 'other'], 'v*'), 'v1.0.0');
    assert.ok(globToRegExp('docs/**').test('docs/a/b.md'));
    assert.ok(!globToRegExp('*.md').test('a/b.md'));
    await rm(up.dir, { recursive: true, force: true });
  });

  it('reads releases and registries through fetch', async () => {
    const responses = {
      'https://api.github.com/repos/acme/tool': { archived: false },
      'https://api.github.com/repos/acme/tool/releases?per_page=30': [
        { tag_name: 'v3.0.0-rc.1', prerelease: true },
        { tag_name: 'v2.0.0', draft: true },
        { tag_name: 'v1.5.0' },
      ],
      'https://api.github.com/repos/acme/old': { archived: true },
      'https://registry.npmjs.org/@acme%2Fmcp': { 'dist-tags': { latest: '2.0.0-next.1' }, versions: { '1.9.0': {}, '1.10.0': {}, '2.0.0-next.1': {} } },
      'https://registry.npmjs.org/@acme%2Fmcp/1.10.0': { license: 'Apache-2.0' },
      'https://pypi.org/pypi/acme-mcp/json': { info: { version: '0.4.1', license_expression: 'MIT' } },
    };
    const fetch = async (url) => ({
      ok: url in responses,
      status: url in responses ? 200 : 404,
      json: async () => responses[url],
    });
    assert.deepEqual(await latestUpstream({ package: 'npm:@acme/mcp' }, { fetch }), { version: '1.10.0', license: 'Apache-2.0' });
    assert.deepEqual(await latestUpstream({ package: 'pypi:acme-mcp' }, { fetch }), { version: '0.4.1', license: 'MIT' });
    await assert.rejects(latestUpstream({ package: 'npm:missing' }, { fetch }), /not found/);
    await assert.rejects(latestUpstream({ repo: 'https://github.com/acme/old', track: 'branch:main' }, { fetch }), /archived/);
    await assert.rejects(latestUpstream({ repo: 'https://github.com/acme/gone', track: 'release' }, { fetch }), /not found/);
    // The release's tag is then resolved with ls-remote, which needs the network; stop before that.
    const releaseFetch = async (url) => {
      if (url.endsWith('/releases?per_page=30')) throw new Error(`picked from ${JSON.stringify(responses[url].find((r) => !r.draft && !r.prerelease))}`);
      return fetch(url);
    };
    await assert.rejects(latestUpstream({ repo: 'https://github.com/acme/tool', track: 'release' }, { fetch: releaseFetch }), /v1\.5\.0/);
  });

  it('converts a Claude plugin: skills and MCP only, plugin root swapped, license from the repository root', async () => {
    const up = await upstreamRepo();
    await up.commit({
      LICENSE: 'MIT License\n',
      'plugins/notes/.claude-plugin/plugin.json': JSON.stringify({
        name: 'Notes',
        version: '0.3.0',
        description: 'Take notes',
        author: { name: 'Acme', url: 'https://acme.example' },
        license: 'MIT',
        keywords: ['notes'],
        hooks: './config/hooks.json',
        mcpServers: {
          notes: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server/index.js'], env: { HOME_DIR: '${CLAUDE_PLUGIN_ROOT}' } },
          remote: { type: 'http', url: 'https://mcp.acme.example/mcp' },
        },
      }),
      'plugins/notes/server/index.js': 'console.log(1)\n',
      'plugins/notes/skills/jot/SKILL.md': skill('jot'),
      'plugins/notes/commands/hello.md': '# hi\n',
      'plugins/notes/config/hooks.json': '{}',
      'plugins/notes/README.md': '# Notes\n',
    });
    const m = await market();
    await m.write('catalog/patches/notes/001-readme.patch', [
      'diff --git a/plugins/notes/README.md b/plugins/notes/README.md',
      '--- a/plugins/notes/README.md',
      '+++ b/plugins/notes/README.md',
      '@@ -1 +1,2 @@',
      ' # Notes',
      '+Patched for Wevir.',
      '',
    ].join('\n'));
    await m.write('plugins/notes/README.zh-CN.md', '# 笔记\n');
    const meta = {
      category: 'productivity',
      upstream: {
        repo: up.url,
        path: 'plugins/notes',
        track: 'branch:main',
        format: 'claude',
        license: 'MIT',
        keep: ['README.zh-CN.md'],
        overlay: { i18n: { 'zh-CN': { description: '记笔记' } }, examples: ['Write down my ideas'] },
      },
    };
    const result = await sync(m, 'notes', meta);
    const written = JSON.parse(await readText(m.dir, 'plugins/notes/wevir-plugin.json'));
    assert.equal(written.id, 'notes');
    assert.equal(written.version, '0.3.0', 'a new entry starts at the upstream version');
    assert.deepEqual(written.connectors.notes, {
      transport: 'stdio',
      command: 'node',
      args: ['${pluginDir}/server/index.js'],
      env: { HOME_DIR: '${pluginDir}' },
    });
    assert.deepEqual(written.connectors.remote, { transport: 'http', url: 'https://mcp.acme.example/mcp' });
    assert.deepEqual(written.i18n, { 'zh-CN': { description: '记笔记' } });
    assert.deepEqual(written.examples, ['Write down my ideas']);
    assert.deepEqual(result.ignored, ['commands', 'hooks']);
    assert.ok(!(await fileExists(m.dir, 'plugins/notes/commands/hello.md')));
    assert.ok(!(await fileExists(m.dir, 'plugins/notes/config/hooks.json')));
    assert.ok(!(await fileExists(m.dir, 'plugins/notes/.claude-plugin/plugin.json')));
    assert.equal(await readText(m.dir, 'plugins/notes/LICENSE'), 'MIT License\n');
    assert.equal(await readText(m.dir, 'plugins/notes/README.md'), '# Notes\nPatched for Wevir.\n');
    assert.equal(await readText(m.dir, 'plugins/notes/README.zh-CN.md'), '# 笔记\n');
    assert.deepEqual(result.patches, ['001-readme.patch']);
    assert.deepEqual(result.problems, []);
    assert.deepEqual(
      result.risks.map((r) => r.label),
      ['risk:connector', 'risk:license', 'risk:exec'],
      'everything is new for a new entry',
    );
    const saved = JSON.parse(await readText(m.dir, 'catalog/entries/notes.json'));
    assert.equal(saved.upstream.commit, gitIn(up.dir, 'rev-parse', 'HEAD').trim());
    assert.equal(saved.upstream.version, '0.3.0');
    assert.equal(saved.category, 'productivity');

    // Second sync: upstream deletes a file and changes the server; the patch digit goes up.
    await up.commit({
      'plugins/notes/skills/jot/SKILL.md': null,
      'plugins/notes/skills/plan/SKILL.md': skill('plan'),
      'plugins/notes/.claude-plugin/plugin.json': JSON.stringify({
        name: 'Notes',
        version: '0.4.0',
        mcpServers: { notes: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server/main.js'] } },
      }),
    });
    const again = await sync(m, 'notes', saved);
    const next = JSON.parse(await readText(m.dir, 'plugins/notes/wevir-plugin.json'));
    assert.equal(next.version, '0.3.1');
    assert.ok(!(await fileExists(m.dir, 'plugins/notes/skills/jot/SKILL.md')), 'upstream deletions are applied');
    assert.ok(await fileExists(m.dir, 'plugins/notes/skills/plan/SKILL.md'));
    assert.deepEqual(again.risks.map((r) => r.label), ['risk:connector']);
    assert.equal(again.from.version, '0.3.0');
    assert.equal(again.to.upstreamVersion, '0.4.0');
    await rm(up.dir, { recursive: true, force: true });
    await rm(m.dir, { recursive: true, force: true });
  });

  it('converts a Codex plugin with interface metadata and a .mcp.json file', async () => {
    const up = await upstreamRepo();
    await up.commit({
      'LICENSE.md': 'Apache\n',
      '.codex-plugin/plugin.json': JSON.stringify({
        name: 'code-tools',
        version: 'not-semver',
        skills: ['./a-skills/', './b-skills'],
        apps: './.app.json',
        interface: { displayName: 'Code Tools', developerName: 'Acme', logo: './logo.svg', websiteUrl: 'https://acme.example' },
      }),
      '.mcp.json': JSON.stringify({ mcpServers: { tools: { command: '${PLUGIN_ROOT}/bin/tools', args: ['--stdio'] } } }),
      '.app.json': '{}',
      'logo.svg': '<svg/>',
      'bin/tools': '#!/bin/sh\n',
      'a-skills/one/SKILL.md': skill('one'),
      'b-skills/two/SKILL.md': skill('two'),
      'README.md': '# Tools\n',
    });
    const m = await market();
    const meta = { upstream: { repo: up.url, track: 'branch:main', format: 'codex', license: 'Apache-2.0' } };
    const result = await sync(m, 'code-tools', meta);
    const written = JSON.parse(await readText(m.dir, 'plugins/code-tools/wevir-plugin.json'));
    assert.equal(written.name, 'Code Tools');
    assert.equal(written.version, '1.0.0');
    assert.deepEqual(written.author, { name: 'Acme' });
    assert.equal(written.homepage, 'https://acme.example');
    assert.equal(written.icon, './logo.svg');
    assert.deepEqual(written.connectors.tools, { transport: 'stdio', command: '${pluginDir}/bin/tools', args: ['--stdio'] });
    assert.ok(await fileExists(m.dir, 'plugins/code-tools/skills/a-skills/one/SKILL.md'), 'several skill paths move under skills/');
    assert.ok(await fileExists(m.dir, 'plugins/code-tools/skills/b-skills/two/SKILL.md'));
    assert.ok(!(await fileExists(m.dir, 'plugins/code-tools/.mcp.json')));
    assert.ok(!(await fileExists(m.dir, 'plugins/code-tools/.app.json')));
    assert.deepEqual(result.ignored, ['apps']);
    assert.deepEqual(result.problems, []);
    await rm(up.dir, { recursive: true, force: true });
    await rm(m.dir, { recursive: true, force: true });
  });

  it('moves a skill in the plugin root to skills/<name>/ with the resources it mentions', async () => {
    const up = await upstreamRepo();
    await up.commit({
      LICENSE: 'MIT\n',
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'tidy', version: '2.0.0', skills: ['./'] }),
      'SKILL.md': `---\nname: tidy\ndescription: Tidies text\n---\n\nSee references/rules.md and run ./assets/check.txt.\n`,
      'references/rules.md': '# Rules\n',
      'assets/check.txt': 'ok\n',
      'scripts/release.py': 'print(1)\n',
      'README.md': '# Tidy\n',
    });
    const m = await market();
    const result = await sync(m, 'tidy', { upstream: { repo: up.url, track: 'branch:main', format: 'claude', license: 'MIT' } });
    const written = JSON.parse(await readText(m.dir, 'plugins/tidy/wevir-plugin.json'));
    assert.equal(written.skills, undefined, 'skills/ is the default');
    assert.ok(await fileExists(m.dir, 'plugins/tidy/skills/tidy/SKILL.md'));
    assert.ok(await fileExists(m.dir, 'plugins/tidy/skills/tidy/references/rules.md'));
    assert.ok(await fileExists(m.dir, 'plugins/tidy/skills/tidy/assets/check.txt'));
    assert.ok(!(await fileExists(m.dir, 'plugins/tidy/SKILL.md')));
    assert.ok(!(await fileExists(m.dir, 'plugins/tidy/references/rules.md')));
    assert.ok(await fileExists(m.dir, 'plugins/tidy/scripts/release.py'), 'directories the skill does not mention stay');
    assert.ok(!(await fileExists(m.dir, 'plugins/tidy/skills/tidy/scripts/release.py')));
    assert.deepEqual(result.problems, []);
    const { entry } = await readEntry({ type: 'plugins', id: 'tidy', dir: 'plugins/tidy' }, m.dir);
    assert.deepEqual(entry.contents.skills, [{ name: 'tidy', description: 'Tidies text' }]);
    assert.equal(entry.kind, 'skill');

    // A root SKILL.md next to the default skills/ directory: both end up under skills/.
    await up.commit({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'tidy', version: '2.1.0' }),
      'skills/polish/SKILL.md': skill('polish'),
    });
    const saved = JSON.parse(await readText(m.dir, 'catalog/entries/tidy.json'));
    await sync(m, 'tidy', saved);
    assert.ok(await fileExists(m.dir, 'plugins/tidy/skills/tidy/SKILL.md'));
    assert.ok(await fileExists(m.dir, 'plugins/tidy/skills/polish/SKILL.md'));
    assert.ok(!(await fileExists(m.dir, 'plugins/tidy/skills/skills/polish/SKILL.md')));

    // The root skill's name must not collide with a skill directory, and must be usable as one.
    await up.commit({ 'skills/tidy/SKILL.md': skill('tidy') });
    await assert.rejects(sync(m, 'tidy', saved), /skills\/tidy exists upstream besides the root SKILL\.md/);
    await up.commit({ 'skills/tidy/SKILL.md': null, 'SKILL.md': skill('../evil') });
    await assert.rejects(sync(m, 'tidy', saved), /cannot be a directory name/);
    await rm(up.dir, { recursive: true, force: true });
    await rm(m.dir, { recursive: true, force: true });
  });

  it('copies Wevir plugins as they are and puts skills under skills/', async () => {
    const up = await upstreamRepo();
    await up.commit({
      'NOTICE': 'Notice\n',
      'COPYING': 'GPL\n',
      'wevir/wevir-plugin.json': JSON.stringify({
        schemaVersion: 1,
        id: 'wv',
        name: 'Wv',
        version: '5.0.0',
        license: 'GPL-3.0-only',
        connectors: { api: { transport: 'http', url: 'https://example.com/mcp' } },
      }),
      'wevir/README.md': '#\n',
      'skills/pdf/SKILL.md': `---\nname: pdf\ndescription: PDFs\nmetadata:\n  version: 2.1.0\n---\nBody\n`,
      'skills/pdf/LICENSE.txt': 'skill license\n',
    });
    const m = await market();
    const wv = await sync(m, 'wv', { upstream: { repo: up.url, path: 'wevir', track: 'branch:main', format: 'wevir', license: 'GPL-3.0-only' } });
    assert.equal(JSON.parse(await readText(m.dir, 'plugins/wv/wevir-plugin.json')).version, '5.0.0');
    assert.ok(await fileExists(m.dir, 'plugins/wv/NOTICE'));
    assert.ok(await fileExists(m.dir, 'plugins/wv/COPYING'));
    assert.equal(wv.to.upstreamVersion, '5.0.0');

    const pdf = await sync(m, 'pdf', { upstream: { repo: up.url, path: 'skills/pdf', track: 'branch:main', format: 'skill', license: 'Apache-2.0' } });
    assert.equal(pdf.ref.dir, 'skills/pdf');
    assert.equal(pdf.to.version, '2.1.0');
    assert.ok(!(await fileExists(m.dir, 'skills/pdf/NOTICE')), 'the skill has its own license file');
    assert.deepEqual(pdf.problems, []);

    await assert.rejects(
      sync(m, 'other', { upstream: { repo: up.url, path: 'skills/pdf', track: 'branch:main', format: 'skill', license: 'MIT' } }),
      /named "pdf", not "other"/,
    );
    await assert.rejects(
      sync(m, 'gone', { upstream: { repo: up.url, path: 'nowhere', track: 'branch:main', format: 'skill', license: 'MIT' } }),
      /nowhere is missing/,
    );
    await rm(up.dir, { recursive: true, force: true });
    await rm(m.dir, { recursive: true, force: true });
  });

  it('repins package versions in connector commands', async () => {
    assert.deepEqual(repinArgs(['-y', '@acme/mcp@1.0.0', '--flag'], 'npm:@acme/mcp', '1.2.0'), {
      args: ['-y', '@acme/mcp@1.2.0', '--flag'],
      changed: 1,
    });
    assert.deepEqual(repinArgs(['--from=acme-mcp[cli]==0.1.0', 'acme'], 'pypi:acme-mcp', '0.2.0').args, ['--from=acme-mcp[cli]==0.2.0', 'acme']);
    assert.equal(repinArgs(['@acme/mcp-extra@1.0.0'], 'npm:@acme/mcp', '2.0.0').changed, 0);

    const m = await market();
    for (const [rel, content] of Object.entries(
      plugin('pkg', {
        connectors: { api: { transport: 'stdio', command: 'npx', args: ['-y', '@acme/mcp@1.0.0'] } },
      }),
    ))
      await m.write(rel, content);
    await m.write('plugins/pkg/LICENSE', 'MIT\n');
    const meta = { upstream: { package: 'npm:@acme/mcp', version: '1.0.0', license: 'MIT' } };
    const workDir = await mkdtemp(path.join(tmpdir(), 'wevir-sync-'));
    const result = await syncEntry({ id: 'pkg', meta, latest: { version: '1.1.0', license: 'Apache-2.0' }, workDir, root: m.dir });
    const written = JSON.parse(await readText(m.dir, 'plugins/pkg/wevir-plugin.json'));
    assert.deepEqual(written.connectors.api.args, ['-y', '@acme/mcp@1.1.0']);
    assert.equal(written.version, '1.0.1');
    assert.deepEqual(result.risks.map((r) => r.label), ['risk:connector', 'risk:license']);
    const saved = JSON.parse(await readText(m.dir, 'catalog/entries/pkg.json'));
    assert.deepEqual(saved.upstream, { package: 'npm:@acme/mcp', version: '1.1.0', license: 'Apache-2.0' });
    assert.ok(isCurrent(saved.upstream, { version: '1.1.0' }));
    await rm(workDir, { recursive: true, force: true });
    await rm(m.dir, { recursive: true, force: true });
  });

  it('fails when a patch no longer applies', async () => {
    const up = await upstreamRepo();
    await up.commit({ 'LICENSE': 'MIT\n', 'SKILL.md': skill('tidy'), 'notes.md': 'one\n' });
    const m = await market();
    await m.write('catalog/patches/tidy/001.patch', [
      'diff --git a/skills/tidy/notes.md b/skills/tidy/notes.md',
      '--- a/skills/tidy/notes.md',
      '+++ b/skills/tidy/notes.md',
      '@@ -1 +1 @@',
      '-something else',
      '+two',
      '',
    ].join('\n'));
    await assert.rejects(
      sync(m, 'tidy', { upstream: { repo: up.url, track: 'branch:main', format: 'skill', license: 'MIT' } }),
      /patch 001\.patch does not apply/,
    );
    await rm(up.dir, { recursive: true, force: true });
    await rm(m.dir, { recursive: true, force: true });
  });
});

describe('compareRisks', () => {
  const snap = ({ connectors = [], inputs = [], files = [], executables = [], licenses = {} } = {}) => ({
    entry: { contents: { connectors, inputs, skills: [] }, files },
    executables: new Set(executables),
    licenses,
  });
  const labels = (before, after, spdx) => compareRisks(before, after, spdx).map((r) => r.label);

  it('finds nothing when nothing risky changed', () => {
    const s = snap({ connectors: [{ name: 'a', transport: 'http', url: 'https://x' }], files: [{ size: 10 }] });
    assert.deepEqual(labels(s, s, { before: 'MIT', after: 'MIT' }), []);
  });
  it('flags connectors, inputs, licenses, executables and size', () => {
    const before = snap({
      connectors: [{ name: 'a', transport: 'stdio', command: 'node', args: ['a.js'] }],
      inputs: [{ key: 'TOKEN', label: 'T', secret: true }],
      files: [{ size: 100 }],
      executables: ['a.js'],
      licenses: { LICENSE: '1' },
    });
    assert.deepEqual(labels(before, snap({ ...before.entry.contents, files: [{ size: 100 }], executables: ['a.js'], licenses: { LICENSE: '1' }, connectors: [{ name: 'a', transport: 'stdio', command: 'node', args: ['b.js'] }] })), ['risk:connector']);
    const after = snap({
      connectors: [{ name: 'a', transport: 'stdio', command: 'node', args: ['a.js'] }, { name: 'b', transport: 'http', url: 'https://y' }],
      inputs: [{ key: 'TOKEN', label: 'T', secret: false }],
      files: [{ size: 151 }],
      executables: ['a.js', 'bin/run'],
      licenses: { LICENSE: '2' },
    });
    assert.deepEqual(labels(before, after), ['risk:connector', 'risk:inputs', 'risk:license', 'risk:exec', 'risk:size']);
    const sameFiles = snap({ ...before, connectors: before.entry.contents.connectors, inputs: before.entry.contents.inputs, files: [{ size: 100 }], executables: ['a.js'], licenses: { LICENSE: '1' } });
    assert.deepEqual(labels(before, sameFiles, { before: 'MIT', after: 'Apache-2.0' }), ['risk:license']);
    assert.deepEqual(labels(before, snap({ ...before, connectors: before.entry.contents.connectors, inputs: before.entry.contents.inputs, files: [{ size: 9 * 1024 * 1024 }], executables: ['a.js'], licenses: { LICENSE: '1' } })), ['risk:size']);
  });
});
