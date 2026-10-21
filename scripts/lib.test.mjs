import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { digestOf, listEntries, readEntry, unpinnedPackage } from './lib.mjs';

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
