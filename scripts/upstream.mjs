// Entries copied from other projects (`upstream` in catalog/entries/<id>.json): find the newest upstream version,
// fetch it, convert it into the entry directory, apply our patches, bump the version and compare risks.
// upstream-sync.mjs adds the GitHub side (branches, pull requests, issues); everything here works offline against
// any git URL, which is how the tests drive it.
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import semver from 'semver';
import { LICENSE_FILE, LIMITS, MANIFEST, parseSkill, ROOT, readEntry } from './lib.mjs';

const exec = promisify(execFile);
export const git = async (args, cwd) => {
  try {
    const { stdout } = await exec('git', args, {
      cwd,
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  } catch (error) {
    const detail = (error.stderr || error.message).trim().split('\n').filter(Boolean).at(-1);
    throw new Error(`git ${args[0]}: ${detail}`);
  }
};

const exists = (abs) => lstat(abs).then(
  () => true,
  () => false,
);

// --- Finding the newest upstream version ---

const githubRepo = (repo) => {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(repo ?? '');
  return match && `${match[1]}/${match[2]}`;
};

async function getJson(fetch, url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'wevir-upstream-sync', ...headers } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const githubHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token && { Authorization: `Bearer ${token}` }),
});

/** Refs of a remote: `refs/... → sha`, with annotated tags peeled to their commit. */
export async function lsRemote(repo) {
  let out;
  try {
    out = await git(['ls-remote', '--', repo]);
  } catch (error) {
    throw new Error(`upstream repository is not reachable (${error.message})`);
  }
  const refs = new Map();
  for (const line of out.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t');
    if (ref.endsWith('^{}')) refs.set(ref.slice(0, -3), sha);
    else if (!refs.has(ref)) refs.set(ref, sha);
  }
  return refs;
}

/** Simple globs: `*` within a path segment, `**` across segments, `?` one character. */
export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

const tagVersion = (tag) => {
  const version = semver.valid(semver.clean(tag.replace(/^[^\d]*/, ''), { loose: true }));
  return version && !semver.prerelease(version) ? version : null;
};

/** Newest stable tag matching a glob: highest semver first, otherwise the highest name. */
export function pickTag(tags, glob) {
  const pattern = globToRegExp(glob);
  const matching = tags.filter((t) => pattern.test(t));
  const versioned = matching.filter(tagVersion).sort((a, b) => semver.rcompare(tagVersion(a), tagVersion(b)));
  if (versioned.length) return versioned[0];
  // Tags that are not versions at all; prereleases never win.
  const plain = matching.filter((t) => !semver.valid(semver.clean(t.replace(/^[^\d]*/, ''), { loose: true })));
  return plain.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0] ?? null;
}

const stableNpm = (versions) =>
  Object.keys(versions ?? {})
    .filter((v) => semver.valid(v) && !semver.prerelease(v))
    .sort(semver.rcompare)[0];

async function latestPackage(spec, fetch) {
  const [registry, name] = spec.split(/:(.*)/s);
  if (registry === 'npm') {
    const base = `https://registry.npmjs.org/${name.replace('/', '%2F')}`;
    const doc = await getJson(fetch, base, { Accept: 'application/vnd.npm.install-v1+json' });
    if (!doc) throw new Error(`npm package ${name} is not found`);
    const tagged = doc['dist-tags']?.latest;
    const version = tagged && !semver.prerelease(tagged) ? tagged : stableNpm(doc.versions);
    if (!version) throw new Error(`npm package ${name} has no stable version`);
    const manifest = (await getJson(fetch, `${base}/${version}`)) ?? {};
    const license = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type;
    return { version, ...(license && { license }) };
  }
  const doc = await getJson(fetch, `https://pypi.org/pypi/${name}/json`);
  if (!doc) throw new Error(`PyPI package ${name} is not found`);
  const version = doc.info?.version;
  if (!version) throw new Error(`PyPI package ${name} has no version`);
  const raw = doc.info.license_expression || doc.info.license;
  const license = typeof raw === 'string' && raw.length <= 128 && !raw.includes('\n') ? raw.trim() : undefined;
  return { version, ...(license && { license }) };
}

/**
 * Newest upstream state for `track`: `{ commit, ref, version? }` for git upstreams (ref is the branch or tag to
 * clone), `{ version, license? }` for packages.
 */
export async function latestUpstream(upstream, { fetch = globalThis.fetch, token } = {}) {
  if (upstream.package) return latestPackage(upstream.package, fetch);
  const github = githubRepo(upstream.repo);
  if (github) {
    const repo = await getJson(fetch, `https://api.github.com/repos/${github}`, githubHeaders(token));
    if (!repo) throw new Error(`upstream repository ${github} is not found`);
    if (repo.archived) throw new Error(`upstream repository ${github} is archived`);
  }
  const { track } = upstream;
  if (track === 'release') {
    if (!github) throw new Error('track "release" is only available for GitHub repositories');
    const releases =
      (await getJson(fetch, `https://api.github.com/repos/${github}/releases?per_page=30`, githubHeaders(token))) ?? [];
    const release = releases.find((r) => !r.draft && !r.prerelease);
    if (!release) throw new Error(`upstream ${github} has no published release`);
    const commit = (await lsRemote(upstream.repo)).get(`refs/tags/${release.tag_name}`);
    if (!commit) throw new Error(`release tag ${release.tag_name} is not in the repository`);
    return { commit, ref: release.tag_name, version: release.tag_name.replace(/^v(?=\d)/, '') };
  }
  const refs = await lsRemote(upstream.repo);
  if (track.startsWith('branch:')) {
    const name = track.slice(7);
    const commit = refs.get(`refs/heads/${name}`);
    if (!commit) throw new Error(`upstream has no branch ${name}`);
    return { commit, ref: name };
  }
  const tags = [...refs.keys()].filter((r) => r.startsWith('refs/tags/')).map((r) => r.slice(10));
  const tag = pickTag(tags, track.slice(4));
  if (!tag) throw new Error(`upstream has no tag matching ${track.slice(4)}`);
  return {
    commit: refs.get(`refs/tags/${tag}`),
    ref: tag,
    ...(tagVersion(tag) && { version: tagVersion(tag) }),
  };
}

/** Whether the registered state already is the newest one. */
export const isCurrent = (upstream, latest) =>
  upstream.package ? upstream.version === latest.version : upstream.commit === latest.commit;

// --- Fetching and converting ---

/** Sparse, shallow clone of `ref` with only `path` checked out (plus root files such as LICENSE). */
export async function fetchUpstream(upstream, latest, dir) {
  const sparse = upstream.path ? ['--sparse'] : [];
  await git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', ...sparse, '--branch', latest.ref, '--', upstream.repo, dir]);
  if (upstream.path) await git(['-C', dir, 'sparse-checkout', 'set', '--', upstream.path]);
  const commit = (await git(['-C', dir, 'rev-parse', 'HEAD'])).trim();
  const src = upstream.path ? path.join(dir, upstream.path) : dir;
  if (!(await lstat(src).then((s) => s.isDirectory(), () => false)))
    throw new Error(`upstream directory ${upstream.path} is missing`);
  return { root: dir, src, commit };
}

/** Never copied from an upstream: repository plumbing of the upstream itself. */
const SKIPPED = new Set(['.git', '.github', '.gitignore', '.gitattributes', '.DS_Store', 'node_modules']);

async function copyTree(from, to, skip = () => false, rel = '') {
  for (const d of await readdir(from, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (SKIPPED.has(d.name) || skip(childRel)) continue;
    const abs = path.join(from, d.name);
    if (d.isSymbolicLink()) throw new Error(`upstream contains a symbolic link: ${childRel}`);
    if (d.isDirectory()) await copyTree(abs, path.join(to, d.name), skip, childRel);
    else if (d.isFile()) {
      await mkdir(to, { recursive: true });
      await copyFile(abs, path.join(to, d.name));
    } else throw new Error(`upstream contains a special file: ${childRel}`);
  }
}

const record = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);
const httpUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? value : undefined;
  } catch {
    return undefined;
  }
};

/** Deep merge for `overlay`: objects merge, everything else (arrays included) replaces. */
export function deepMerge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay ?? {})) {
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && record(base[key]) === base[key]
        ? deepMerge(base[key], value)
        : value;
  }
  return out;
}

/** Fields of a Claude / Codex manifest that become part of the Wevir plugin; the rest is listed as ignored. */
const IMPORTED_FIELDS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'interface',
  'skills',
  'mcpServers',
]);
/** Parts Claude finds by convention in the plugin root. */
const CONVENTION_DIRS = ['commands', 'agents', 'hooks', 'output-styles'];
const MCP_FIELDS = new Set([
  'type',
  'transport',
  'command',
  'args',
  'env',
  'cwd',
  'url',
  'headers',
  'http_headers',
  'enabled',
  'toolTimeoutSec',
  'tool_timeout_sec',
]);
const CONNECTOR_NAME = /^[a-z0-9_-]{1,63}$/;
/** Resource directories of the Agent Skills layout that travel with a SKILL.md when it mentions them. */
const SKILL_RESOURCES = ['references', 'scripts', 'assets'];
const SKILL_DIR_NAME = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

/**
 * The SKILL.md at the root of `src`, or null: `{ skill, paths }` with the parsed frontmatter and the root paths that
 * belong to the skill (SKILL.md and the resource directories it mentions, such as `references/`). Repository files
 * the skill never mentions, like a maintainer's `scripts/`, stay where they are.
 */
async function findRootSkill(src) {
  const raw = await readFile(path.join(src, 'SKILL.md'), 'utf8').catch(() => null);
  if (raw === null) return null;
  const skill = parseSkill(raw);
  if (typeof skill === 'string') throw new Error(`upstream ${skill}`);
  if (!SKILL_DIR_NAME.test(skill.name)) throw new Error(`upstream skill name "${skill.name}" cannot be a directory name`);
  const paths = ['SKILL.md'];
  for (const dir of SKILL_RESOURCES) {
    const mentioned = new RegExp(`(?<![\\w/.-])(?:\\./)?${dir}/`).test(raw);
    if (mentioned && (await lstat(path.join(src, dir)).then((s) => s.isDirectory(), () => false))) paths.push(dir);
  }
  return { skill, paths };
}

/** Copies a root skill to `skills/<name>/` of `out`, where Wevir looks for a plugin's skills. */
async function copyRootSkill(src, out, { skill, paths }) {
  const target = path.join(out, 'skills', skill.name);
  if (await exists(target)) throw new Error(`skills/${skill.name} exists upstream besides the root SKILL.md`);
  for (const rel of paths) {
    if (rel === 'SKILL.md') {
      await mkdir(target, { recursive: true });
      await copyFile(path.join(src, rel), path.join(target, rel));
    } else await copyTree(path.join(src, rel), path.join(target, rel));
  }
}
const stringMap = (value) =>
  value && Object.fromEntries(Object.entries(record(value)).filter(([, v]) => typeof v === 'string'));

/** `mcpServers` of a Claude / Codex manifest (default `./.mcp.json`) as Wevir connectors. */
async function importConnectors(src, manifest, swap) {
  let mcp = manifest.mcpServers ?? './.mcp.json';
  if (typeof mcp === 'string') {
    if (!mcp.startsWith('./')) throw new Error('plugin paths must start with ./');
    try {
      mcp = JSON.parse(await readFile(path.join(src, mcp), 'utf8'));
    } catch (error) {
      if (manifest.mcpServers === undefined && error.code === 'ENOENT') mcp = {};
      else throw new Error(`invalid MCP configuration ${manifest.mcpServers ?? './.mcp.json'}`);
    }
  }
  const data = record(mcp);
  // Codex writes the server table inline; .mcp.json and Claude usually wrap it in mcpServers.
  const servers = 'mcpServers' in data ? record(data.mcpServers) : data;
  const connectors = {};
  for (const [name, value] of Object.entries(servers)) {
    const entry = record(value);
    const kind = entry.type ?? entry.transport;
    if (
      !CONNECTOR_NAME.test(name) ||
      Object.keys(entry).some((key) => !MCP_FIELDS.has(key)) ||
      (kind !== undefined && !['stdio', 'http', 'streamable-http'].includes(String(kind)))
    )
      throw new Error(`unsupported MCP server "${name}"`);
    const common = {
      ...(typeof entry.enabled === 'boolean' && { enabled: entry.enabled }),
      ...((entry.toolTimeoutSec ?? entry.tool_timeout_sec) > 0 && {
        toolTimeoutSec: entry.toolTimeoutSec ?? entry.tool_timeout_sec,
      }),
    };
    if (entry.url === undefined) {
      if (typeof entry.command !== 'string' || !entry.command) throw new Error(`MCP server "${name}" has no command`);
      connectors[name] = {
        transport: 'stdio',
        command: swap(entry.command),
        ...(Array.isArray(entry.args) && { args: entry.args.map(String).map(swap) }),
        ...(typeof entry.cwd === 'string' && entry.cwd && { cwd: swap(entry.cwd) }),
        ...(entry.env && { env: Object.fromEntries(Object.entries(stringMap(entry.env)).map(([k, v]) => [k, swap(v)])) }),
        ...common,
      };
    } else {
      if (!httpUrl(entry.url)) throw new Error(`MCP server "${name}" needs an http(s) url`);
      const headers = stringMap(entry.headers ?? entry.http_headers);
      connectors[name] = { transport: 'http', url: entry.url, ...(headers && { headers }), ...common };
    }
  }
  return connectors;
}

/**
 * Claude / Codex plugin → Wevir plugin, by the import rules of the Wevir Host (plugin-packages.ts): skills and MCP
 * servers are kept, `${CLAUDE_PLUGIN_ROOT}` / `${PLUGIN_ROOT}` become `${pluginDir}`, everything else (hooks,
 * commands, agents, apps, output styles) is left out and reported as ignored. The id is the catalog entry's.
 */
async function convertImported(src, out, format, id) {
  const dir = format === 'claude' ? '.claude-plugin' : '.codex-plugin';
  let manifest;
  try {
    manifest = record(JSON.parse(await readFile(path.join(src, dir, 'plugin.json'), 'utf8')));
  } catch (error) {
    throw new Error(error.code === 'ENOENT' ? `${dir}/plugin.json is missing upstream` : `${dir}/plugin.json: ${error.message}`);
  }
  if (!text(manifest.name, 128)) throw new Error(`${dir}/plugin.json: name is required`);
  const variable = format === 'claude' ? '${CLAUDE_PLUGIN_ROOT}' : '${PLUGIN_ROOT}';
  const swap = (value) => value.replaceAll(variable, '${pluginDir}');
  const connectors = await importConnectors(src, manifest, swap);

  const skillPaths =
    manifest.skills === undefined ? ['./skills'] : Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills];
  for (const p of skillPaths) {
    if (typeof p !== 'string' || !p.startsWith('./') || p.split('/').includes('..'))
      throw new Error('plugin paths must start with ./ and stay inside the plugin');
  }
  const ignored = Object.keys(manifest).filter((key) => !IMPORTED_FIELDS.has(key));
  for (const name of CONVENTION_DIRS) {
    if (!ignored.includes(name) && (await lstat(path.join(src, name)).then((s) => s.isDirectory(), () => false)))
      ignored.push(name);
  }
  // Files only the ignored parts point at are not copied.
  const left = new Set([dir, ...CONVENTION_DIRS]);
  if (typeof manifest.mcpServers === 'string' || manifest.mcpServers === undefined)
    left.add((manifest.mcpServers ?? './.mcp.json').slice(2));
  for (const key of ignored) {
    for (const value of [manifest[key]].flat()) {
      if (typeof value === 'string' && value.startsWith('./')) left.add(value.slice(2).replace(/\/$/, ''));
    }
  }
  // A SKILL.md in the plugin root (`"skills": ["./"]`, or simply there) moves to skills/<name>/, and the other skill
  // paths join it under skills/.
  const rootSkill = await findRootSkill(src);
  for (const rel of rootSkill?.paths ?? []) left.add(rel);
  const skillDirs = skillPaths.map((p) => p.slice(2).replace(/\/$/, '')).filter(Boolean);
  const relocate = skillDirs.length > 1 || (Boolean(rootSkill) && skillDirs.some((rel) => rel !== 'skills'));
  const moved = (rel) => relocate && rel !== 'skills' && skillDirs.includes(rel);
  await copyTree(src, out, (rel) => left.has(rel) || moved(rel));
  for (const rel of skillDirs.filter(moved)) {
    if (await exists(path.join(src, rel))) await copyTree(path.join(src, rel), path.join(out, 'skills', path.basename(rel)));
  }
  if (rootSkill) await copyRootSkill(src, out, rootSkill);

  const ui = record(manifest.interface);
  const author = record(manifest.author);
  const authorName = text(author.name, 128) ?? text(ui.developerName, 128);
  const authorUrl = httpUrl(author.url);
  const homepage = httpUrl(manifest.homepage) ?? httpUrl(ui.websiteUrl ?? ui.websiteURL);
  const description = text(manifest.description, 1024) ?? text(ui.shortDescription, 1024);
  const license = text(manifest.license, 128);
  const keywords = Array.isArray(manifest.keywords)
    ? manifest.keywords.filter((k) => typeof k === 'string' && k.length >= 1 && k.length <= 32).slice(0, 16)
    : [];
  let icon;
  if (typeof ui.logo === 'string' && /^\.\/.*\.(?:png|svg)$/.test(ui.logo)) {
    const info = await lstat(path.join(src, ui.logo)).catch(() => null);
    if (info?.isFile() && info.size <= LIMITS.iconBytes) icon = ui.logo;
  }
  const upstreamVersion = text(manifest.version, 128);
  const result = {
    schemaVersion: 1,
    id,
    name: text(ui.displayName, 128) ?? text(manifest.name, 128),
    version: semver.valid(upstreamVersion) ? upstreamVersion : '1.0.0',
    ...(description && { description }),
    ...(authorName && { author: { name: authorName, ...(authorUrl && { url: authorUrl }) } }),
    ...(homepage && { homepage }),
    ...(license && { license }),
    ...(icon && { icon }),
    ...(keywords.length && { keywords }),
    ...(!relocate && !rootSkill && skillDirs[0] !== 'skills' && skillDirs[0] && { skills: `./${skillDirs[0]}` }),
    ...(Object.keys(connectors).length && { connectors }),
  };
  return { manifest: result, ignored: ignored.sort(), version: upstreamVersion, license };
}

/**
 * Converts the fetched upstream directory `src` into a fresh directory `out`. Returns `{ ignored, version, license }`:
 * the parts left out, and the upstream's own version and SPDX license when its files say so.
 */
export async function convert(src, out, { format, id, overlay, repoRoot }) {
  await mkdir(out, { recursive: true });
  let result = { ignored: [] };
  if (format === 'wevir') {
    await copyTree(src, out);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(out, MANIFEST), 'utf8'));
    } catch (error) {
      throw new Error(error.code === 'ENOENT' ? `${MANIFEST} is missing upstream` : `${MANIFEST}: ${error.message}`);
    }
    if (manifest.id !== id) throw new Error(`upstream ${MANIFEST} has id "${manifest.id}", not "${id}"`);
    result = { ignored: [], version: text(manifest.version, 64), license: text(manifest.license, 128) };
  } else if (format === 'skill') {
    await copyTree(src, out);
    const skill = parseSkill((await readFile(path.join(out, 'SKILL.md'), 'utf8').catch(() => null)) ?? '');
    if (typeof skill === 'string') throw new Error(`upstream ${skill}`);
    if (skill.name !== id) throw new Error(`upstream skill is named "${skill.name}", not "${id}"`);
    const version = skill.metadata?.version;
    result = { ignored: [], ...(typeof version === 'string' && { version }) };
  } else if (format === 'claude' || format === 'codex') {
    const imported = await convertImported(src, out, format, id);
    const manifest = deepMerge(imported.manifest, overlay);
    await writeFile(path.join(out, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    result = { ignored: imported.ignored, version: imported.version, license: imported.license };
  } else throw new Error(`unknown format "${format}"`);

  // A subdirectory usually has no license of its own; bring the repository's.
  if (repoRoot && path.resolve(repoRoot) !== path.resolve(src)) {
    const own = (await readdir(out)).some((name) => LICENSE_FILE.test(name));
    if (!own) {
      for (const d of await readdir(repoRoot, { withFileTypes: true })) {
        if (d.isFile() && LICENSE_FILE.test(d.name)) await copyFile(path.join(repoRoot, d.name), path.join(out, d.name));
      }
    }
  }
  if (!(await readdir(out)).length) throw new Error('nothing is left after conversion');
  return result;
}

async function listFiles(abs, rel = '', out = []) {
  for (const d of await readdir(abs, { withFileTypes: true }).catch(() => [])) {
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) await listFiles(path.join(abs, d.name), childRel, out);
    else out.push(childRel);
  }
  return out;
}

async function pruneEmpty(abs, keepRoot = true) {
  for (const d of await readdir(abs, { withFileTypes: true }).catch(() => [])) {
    if (d.isDirectory()) await pruneEmpty(path.join(abs, d.name), false);
  }
  if (!keepRoot && !(await readdir(abs)).length) await rmdir(abs);
}

/** Replaces everything in `entryDir` but the `keep` globs with the converted files (upstream deletions included). */
export async function replaceFiles(entryDir, staging, keep = []) {
  const patterns = keep.map(globToRegExp);
  const kept = (rel) => patterns.some((p) => p.test(rel));
  for (const rel of await listFiles(entryDir)) {
    if (!kept(rel)) await rm(path.join(entryDir, rel), { force: true });
  }
  for (const rel of await listFiles(staging)) {
    const target = path.join(entryDir, rel);
    if (kept(rel) && (await exists(target))) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(staging, rel), target);
  }
  await pruneEmpty(entryDir);
}

/** `catalog/patches/<id>/*.patch` in file name order, as `git apply` from the repository root. */
export async function applyPatches(id, root = ROOT) {
  const dir = path.join(root, 'catalog/patches', id);
  const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.patch')).sort();
  for (const name of names) {
    try {
      await git(['apply', '--whitespace=nowarn', path.join(dir, name)], root);
    } catch (error) {
      throw new Error(`patch ${name} does not apply (${error.message})`);
    }
  }
  return names;
}

/** Version after a sync: the patch digit goes up; a new entry starts at the upstream's version. */
export const nextVersion = (current, candidate) =>
  current ? semver.inc(current, 'patch') : semver.valid(candidate) ? candidate : '1.0.0';

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrites the version pinned for `npm:<name>` / `pypi:<name>` in every stdio connector's arguments. */
export function repinArgs(args, spec, version) {
  const [registry, name] = spec.split(/:(.*)/s);
  const pin =
    registry === 'npm'
      ? new RegExp(`^((?:--package=)?${escape(name)}@)[^\\s@]+$`)
      : new RegExp(`^((?:--from=)?${escape(name)}(?:\\[[\\w,.-]+\\])?(?:==|@))[^\\s=@]+$`, 'i');
  let changed = 0;
  const next = args.map((arg) => {
    if (!pin.test(arg)) return arg;
    changed++;
    return arg.replace(pin, `$1${version}`);
  });
  return { args: next, changed };
}

async function repinPackage(entryDir, spec, version) {
  const file = path.join(entryDir, MANIFEST);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  let target = file;
  let servers = manifest.connectors;
  if (typeof servers === 'string') {
    target = path.join(entryDir, servers.slice(2));
    servers = JSON.parse(await readFile(target, 'utf8'));
  }
  let changed = 0;
  for (const config of Object.values(servers ?? {})) {
    if (config?.transport !== 'stdio' || !config.args) continue;
    const result = repinArgs(config.args, spec, version);
    config.args = result.args;
    changed += result.changed;
  }
  if (!changed) throw new Error(`no connector pins ${spec.split(/:(.*)/s)[1]} to a version`);
  if (target === file) manifest.connectors = servers;
  await writeFile(target, `${JSON.stringify(target === file ? manifest : servers, null, 2)}\n`);
}

async function setVersion(entryDir, version) {
  const file = path.join(entryDir, MANIFEST);
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.version = version;
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

// --- Risks ---

const SCRIPT = /\.(?:sh|bash|zsh|fish|ps1|psm1|bat|cmd|exe|dll|so|dylib|py|js|mjs|cjs|ts|mts|cts|rb|pl|php|jar|wasm|node)$/i;
const MEDIA = /\.(?:png|jpe?g|gif|webp|ico|bmp|svgz?|woff2?|ttf|otf|eot|pdf|mp3|mp4|wav|zip)$/i;

/** What a sync compares: `readEntry`'s result, plus executable files and license file contents. */
export async function snapshot(ref, root = ROOT) {
  const read = await readEntry(ref, root);
  const executables = new Set();
  const licenses = {};
  for (const file of read.entry?.files ?? []) {
    const abs = path.join(root, ref.dir, file.path);
    const mode = (await lstat(abs)).mode;
    const binary = !MEDIA.test(file.path) && (await readFile(abs)).includes(0);
    if (mode & 0o111 || SCRIPT.test(file.path) || binary) executables.add(file.path);
    if (!file.path.includes('/') && LICENSE_FILE.test(file.path)) licenses[file.path] = file.sha256;
  }
  return { ...read, executables, licenses };
}

const connectorKey = (c) => JSON.stringify([c.transport, c.command ?? null, c.args ?? null, c.url ?? null]);
const total = (entry) => (entry?.files ?? []).reduce((sum, f) => sum + f.size, 0);

/**
 * Risk labels between two snapshots (`before` is null for a new entry), each with a one-line reason. `spdx` holds
 * the registered and newly detected SPDX license.
 */
export function compareRisks(before, after, spdx = {}) {
  const risks = [];
  const add = (label, detail) => risks.push({ label, detail });
  const oldConnectors = new Map((before?.entry?.contents.connectors ?? []).map((c) => [c.name, c]));
  const changed = [];
  for (const c of after.entry?.contents.connectors ?? []) {
    const old = oldConnectors.get(c.name);
    if (!old) changed.push(`${c.name} (new)`);
    else if (connectorKey(old) !== connectorKey(c)) changed.push(c.name);
  }
  if (changed.length) add('risk:connector', `connectors changed: ${changed.join(', ')}`);

  const inputs = (e) => new Map((e?.contents.inputs ?? []).map((i) => [i.key, Boolean(i.secret)]));
  const oldInputs = inputs(before?.entry);
  const newInputs = inputs(after.entry);
  const inputChanges = [...new Set([...oldInputs.keys(), ...newInputs.keys()])].filter(
    (key) => oldInputs.get(key) !== newInputs.get(key),
  );
  if (inputChanges.length) add('risk:inputs', `inputs changed: ${inputChanges.join(', ')}`);

  const licenseFilesChanged = JSON.stringify(before?.licenses ?? {}) !== JSON.stringify(after.licenses);
  const spdxChanged = spdx.before && spdx.after && spdx.before !== spdx.after;
  if (licenseFilesChanged || spdxChanged)
    add(
      'risk:license',
      spdxChanged ? `license ${spdx.before} → ${spdx.after}` : 'license files changed',
    );

  const newExec = [...after.executables].filter((p) => !before?.executables.has(p));
  if (newExec.length) add('risk:exec', `new executables or scripts: ${newExec.join(', ')}`);

  const oldSize = total(before?.entry);
  const newSize = total(after.entry);
  const fileCount = after.entry?.files.length ?? 0;
  if ((oldSize > 0 && newSize > oldSize * 1.5) || newSize > LIMITS.totalBytes || fileCount > LIMITS.files)
    add('risk:size', `size ${oldSize} → ${newSize} bytes, ${fileCount} files`);
  return risks;
}

const LIMIT_PROBLEM = /too many files|larger than/;

/**
 * Brings one entry to `latest` in the working tree at `root`: entry directory, patches, version and
 * catalog/entries/<id>.json. Throws for problems that need a maintainer (they become an issue); validation
 * problems of the result are returned for the pull request instead.
 */
export async function syncEntry({ id, meta, latest, workDir, root = ROOT }) {
  const upstream = meta.upstream;
  const type = upstream.format === 'skill' ? 'skills' : 'plugins';
  const ref = { type, id, dir: `${type}/${id}` };
  const entryDir = path.join(root, ref.dir);
  // A directory holding only files to keep (an icon added ahead of the first sync) counts as a new entry.
  let before = (await exists(entryDir)) ? await snapshot(ref, root) : null;
  if (!before?.entry) before = null;

  let detected = latest.license;
  let upstreamVersion = latest.version;
  let commit;
  let ignored = [];
  let patches = [];
  if (upstream.package) {
    if (!before) throw new Error(`${ref.dir} is missing; write the plugin before registering its package`);
    await repinPackage(entryDir, upstream.package, latest.version);
  } else {
    const fetched = await fetchUpstream(upstream, latest, path.join(workDir, 'upstream'));
    commit = fetched.commit;
    const staging = path.join(workDir, 'staging');
    const converted = await convert(fetched.src, staging, {
      format: upstream.format,
      id,
      overlay: upstream.overlay,
      repoRoot: fetched.root,
    });
    ignored = converted.ignored;
    upstreamVersion = latest.version ?? converted.version;
    detected = converted.license;
    await mkdir(entryDir, { recursive: true });
    await replaceFiles(entryDir, staging, upstream.keep);
    patches = await applyPatches(id, root);
  }
  if (type === 'plugins') {
    const current = JSON.parse(await readFile(path.join(entryDir, MANIFEST), 'utf8')).version;
    await setVersion(entryDir, nextVersion(before?.entry.version, current));
  }

  const after = await snapshot(ref, root);
  if (!after.entry) throw new Error(`after the sync, ${after.problems.join('; ')}`);
  const limits = after.problems.filter((p) => LIMIT_PROBLEM.test(p));
  if (limits.length) throw new Error(`after the sync, ${limits.join('; ')}`);

  const next = { ...upstream };
  if (commit) next.commit = commit;
  if (upstreamVersion) next.version = upstreamVersion;
  else delete next.version;
  if (detected) next.license = detected;
  const file = path.join(root, 'catalog/entries', `${id}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ ...meta, upstream: next }, null, 2)}\n`);

  return {
    ref,
    from: { version: before?.entry.version, upstreamVersion: upstream.version, commit: upstream.commit },
    to: { version: after.entry.version, upstreamVersion, commit },
    risks: compareRisks(before, after, { before: upstream.license, after: detected }),
    ignored,
    patches,
    problems: after.problems,
    digestChanged: before?.entry.digest !== after.entry.digest,
  };
}

/** Link or text describing what changed upstream, for the pull request. */
export function compareText(upstream, from, to) {
  if (upstream.package) return `${upstream.package}: ${from.upstreamVersion ?? '(none)'} → ${to.upstreamVersion}`;
  const github = githubRepo(upstream.repo);
  if (github && from.commit) return `https://github.com/${github}/compare/${from.commit}...${to.commit}`;
  return `${upstream.repo}: ${from.commit ?? '(none)'} → ${to.commit}`;
}
