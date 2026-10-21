// Shared by validate.mjs, build-index.mjs and upstream-sync.mjs: read an entry directory, check it, describe it as
// an index entry and merge in the catalog (category, verification, upstream, listing time).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import semver from 'semver';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const MANIFEST = 'wevir-plugin.json';
/** Same limits as the Wevir client; changing them needs a client release first. */
export const LIMITS = {
  files: 200,
  fileBytes: 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  iconBytes: 128 * 1024,
  skillName: 64,
  skillDescription: 1024,
};
export const ENTRY_ID = /^(?!wevir)[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default(ajv);
const schema = (name) =>
  readFile(path.join(ROOT, 'schemas', name), 'utf8').then((text) => ajv.compile(JSON.parse(text)));
export const validateManifest = await schema('wevir-plugin.schema.json');
export const validateIndex = await schema('wevir-market.schema.json');
export const validateCatalogEntry = await schema('catalog-entry.schema.json');

export const schemaErrors = (validate) =>
  (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);

/** Every entry directory under plugins/ and skills/. */
export async function listEntries(root = ROOT) {
  const entries = [];
  for (const type of ['plugins', 'skills']) {
    const dirents = await readdir(path.join(root, type), { withFileTypes: true }).catch(() => []);
    for (const d of dirents) {
      if (d.isDirectory()) entries.push({ type, id: d.name, dir: `${type}/${d.name}` });
    }
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id) || a.type.localeCompare(b.type));
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** sha256 of `<sha256>  <path>\n` lines sorted by path; the client computes the same. */
export const digestOf = (files) =>
  sha256(
    [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => `${f.sha256}  ${f.path}\n`)
      .join(''),
  );

async function walk(abs, rel, out, problems) {
  for (const d of await readdir(abs, { withFileTypes: true })) {
    const childAbs = path.join(abs, d.name);
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    const stat = await lstat(childAbs);
    if (stat.isSymbolicLink()) problems.push(`${childRel}: symbolic links are not allowed`);
    else if (stat.isDirectory()) await walk(childAbs, childRel, out, problems);
    else if (!stat.isFile()) problems.push(`${childRel}: special files are not allowed`);
    else if (d.name === '.DS_Store') problems.push(`${childRel}: remove this file`);
    else out.push({ path: childRel, size: stat.size, abs: childAbs });
  }
}

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Frontmatter of a SKILL.md: `{ name, description, metadata }` or a problem string. */
export function parseSkill(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return 'SKILL.md must start with YAML frontmatter';
  let data;
  try {
    data = YAML.parse(match[1]);
  } catch (error) {
    return `SKILL.md frontmatter: ${error.message}`;
  }
  if (typeof data?.name !== 'string' || !data.name.trim()) return 'SKILL.md: name is required';
  if (typeof data.description !== 'string' || !data.description.trim())
    return 'SKILL.md: description is required';
  if ([...data.name].length > LIMITS.skillName) return 'SKILL.md: name is too long';
  if ([...data.description].length > LIMITS.skillDescription)
    return 'SKILL.md: description is too long';
  return { name: data.name, description: data.description, metadata: data.metadata ?? {} };
}

const PINNED_NPM = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@\d+\.\d+\.\d+(?:-[\w.]+)?$/i;
const PINNED_PY = /^[A-Za-z0-9][\w.-]*(?:\[[\w,.-]+\])?(?:==|@)\d+(?:\.\d+)*(?:[\w.+-]*)$/;

/** Package runners must name an exact version so a review covers what users will run. */
export function unpinnedPackage(command, args = []) {
  const runner = path.basename(command).replace(/\.(?:cmd|exe)$/i, '');
  let rest = args;
  if (runner === 'pnpm' || runner === 'yarn') {
    if (args[0] !== 'dlx') return null;
    rest = args.slice(1);
  } else if (!['npx', 'bunx', 'uvx', 'pipx'].includes(runner)) return null;
  if (runner === 'pipx') {
    if (rest[0] !== 'run') return null;
    rest = rest.slice(1);
  }
  let pkg;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-p' || arg === '--package' || arg === '--from') {
      pkg = rest[i + 1];
      break;
    }
    const inline = /^--(?:package|from)=(.+)$/.exec(arg);
    if (inline) {
      pkg = inline[1];
      break;
    }
    if (!arg.startsWith('-')) {
      pkg = arg;
      break;
    }
  }
  if (!pkg) return `${runner}: no package`;
  const pinned = ['uvx', 'pipx'].includes(runner) ? PINNED_PY : PINNED_NPM;
  return pinned.test(pkg) ? null : `${runner} ${pkg}: pin an exact version (for example pkg@1.2.3)`;
}

const INPUT_REF = /\$\{input:([A-Za-z_][A-Za-z0-9_]*)\}/g;
const strings = (value) =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : [];

/**
 * Reads one entry directory. Returns `{ entry, version, problems }`: `entry` is the index entry before the catalog
 * is merged in (see `catalogEntry`), with the manifest's own `category` suggestion, or null when the directory is
 * unusable.
 */
export async function readEntry({ type, id, dir }, root = ROOT) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const abs = path.join(root, dir);
  if (!ENTRY_ID.test(id) || id.length > 64)
    fail('directory name must be lowercase letters, digits and single hyphens, not starting with "wevir"');

  const files = [];
  await walk(abs, '', files, problems);
  if (files.length > LIMITS.files) fail(`too many files (${files.length} > ${LIMITS.files})`);
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (file.size > LIMITS.fileBytes) fail(`${file.path}: larger than 1 MiB`);
  }
  if (total > LIMITS.totalBytes) fail('entry is larger than 8 MiB');

  const contents = new Map();
  for (const file of files) {
    if (file.size > LIMITS.fileBytes) continue;
    const data = await readFile(file.abs);
    file.sha256 = sha256(data);
    contents.set(file.path, data);
    if (data.includes(0)) continue;
    const text = data.toString('utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) fail(`${file.path}: looks like it contains a secret (${pattern.source})`);
    }
  }
  const text = (rel) => contents.get(rel)?.toString('utf8');

  const skills = [];
  const scanSkills = (base) => {
    const prefix = base ? `${base}/` : '';
    for (const file of files) {
      if (!file.path.startsWith(prefix) || !file.path.endsWith('/SKILL.md')) continue;
      const parsed = parseSkill(text(file.path) ?? '');
      if (typeof parsed === 'string') fail(`${file.path}: ${parsed}`);
      else skills.push({ name: parsed.name, description: parsed.description, metadata: parsed.metadata });
    }
  };

  let meta;
  const connectors = [];
  if (type === 'skills') {
    const parsed = text('SKILL.md') === undefined ? 'SKILL.md is missing' : parseSkill(text('SKILL.md'));
    if (typeof parsed === 'string') {
      fail(parsed);
      return { entry: null, version: null, problems };
    }
    if (parsed.name !== id) fail(`SKILL.md name "${parsed.name}" must match the directory name`);
    if (files.some((f) => f.path.endsWith('/SKILL.md')))
      fail('a skill submission holds one skill; publish several skills as a plugin');
    const version = typeof parsed.metadata.version === 'string' ? parsed.metadata.version : '1.0.0';
    skills.push({ name: parsed.name, description: parsed.description });
    meta = { name: parsed.name, version, description: parsed.description };
    if (typeof parsed.metadata.category === 'string') meta.category = parsed.metadata.category;
  } else {
    const raw = text(MANIFEST);
    if (raw === undefined) {
      fail(`${MANIFEST} is missing`);
      return { entry: null, version: null, problems };
    }
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch (error) {
      fail(`${MANIFEST}: ${error.message}`);
      return { entry: null, version: null, problems };
    }
    if (!validateManifest(manifest)) {
      for (const message of schemaErrors(validateManifest)) fail(`${MANIFEST}${message}`);
      return { entry: null, version: null, problems };
    }
    if (manifest.id !== id) fail(`${MANIFEST}: id "${manifest.id}" must match the directory name`);
    const keys = new Set();
    for (const input of manifest.inputs ?? []) {
      if (keys.has(input.key)) fail(`${MANIFEST}: duplicate input ${input.key}`);
      keys.add(input.key);
    }
    if (!contents.has('README.md')) fail('README.md is missing');
    if (manifest.icon) {
      const icon = files.find((f) => f.path === manifest.icon.slice(2));
      if (!icon) fail(`icon ${manifest.icon} is missing`);
      else if (icon.size > LIMITS.iconBytes) fail(`icon ${manifest.icon} is larger than 128 KiB`);
    }

    let connectorMap = manifest.connectors ?? {};
    if (typeof connectorMap === 'string') {
      try {
        connectorMap = JSON.parse(text(connectorMap.slice(2)) ?? 'null') ?? {};
      } catch (error) {
        fail(`${manifest.connectors}: ${error.message}`);
        connectorMap = {};
      }
    }
    for (const [name, config] of Object.entries(connectorMap)) {
      for (const value of strings(config)) {
        for (const [, key] of value.matchAll(INPUT_REF)) {
          if (!keys.has(key)) fail(`connector ${name}: \${input:${key}} is not declared in inputs`);
        }
      }
      if (config?.transport === 'stdio') {
        const problem = unpinnedPackage(config.command ?? '', config.args);
        if (problem) fail(`connector ${name}: ${problem}`);
        connectors.push({ name, transport: 'stdio', command: config.command, args: config.args ?? [] });
      } else if (config?.transport === 'http') {
        connectors.push({ name, transport: 'http', url: config.url });
      } else fail(`connector ${name}: transport must be stdio or http`);
    }
    scanSkills((manifest.skills ?? './skills').slice(2).replace(/\/$/, ''));
    meta = manifest;
  }

  const kind =
    skills.length === 1 && connectors.length === 0
      ? 'skill'
      : skills.length === 0 && connectors.length > 0
        ? 'mcp'
        : 'plugin';
  if (skills.length === 0 && connectors.length === 0) fail('entry has no skills and no MCP servers');

  const fileList = files
    .filter((f) => f.sha256)
    .map(({ path: p, size, sha256: hash }) => ({ path: p, size, sha256: hash }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const entry = {
    id,
    kind,
    path: dir,
    name: meta.name,
    version: meta.version,
    ...(meta.description && { description: meta.description }),
    ...(meta.i18n && { i18n: meta.i18n }),
    ...(meta.author && { author: meta.author }),
    ...(meta.homepage && { homepage: meta.homepage }),
    ...(meta.license && { license: meta.license }),
    ...(meta.icon && { icon: `${dir}/${meta.icon.slice(2)}` }),
    ...(meta.category && { category: meta.category }),
    ...(meta.keywords && { keywords: meta.keywords }),
    ...(meta.examples && { examples: meta.examples }),
    ...((meta.privacyPolicy || meta.termsOfService) && {
      links: {
        ...(meta.privacyPolicy && { privacy: meta.privacyPolicy }),
        ...(meta.termsOfService && { terms: meta.termsOfService }),
      },
    }),
    ...(meta.requires && { requires: meta.requires }),
    contents: {
      connectors,
      skills: skills.map(({ name, description }) => ({ name, description })),
      inputs: meta.inputs ?? [],
    },
    files: fileList,
    digest: digestOf(fileList),
  };
  return { entry, version: meta.version, problems };
}

export const readJson = async (rel, root = ROOT) =>
  JSON.parse(await readFile(path.join(root, rel), 'utf8'));

/** Root files that carry an upstream's license; entries with an upstream must keep them. */
export const LICENSE_FILE = /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[.-][\w.-]+)?$/i;

/** `catalog/entries/<id>.json` by id, with problems for files that are not valid JSON or fail the schema. */
export async function readCatalog(root = ROOT) {
  const entries = new Map();
  const problems = [];
  const dir = path.join(root, 'catalog/entries');
  const names = await readdir(dir).catch(() => []);
  for (const name of names.sort()) {
    if (name === '.gitkeep') continue;
    const rel = `catalog/entries/${name}`;
    if (!name.endsWith('.json')) {
      problems.push(`${rel}: only <id>.json files belong here`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    } catch (error) {
      problems.push(`${rel}: ${error.message}`);
      continue;
    }
    if (!validateCatalogEntry(data)) {
      for (const message of schemaErrors(validateCatalogEntry)) problems.push(`${rel}${message}`);
      continue;
    }
    entries.set(name.slice(0, -5), data);
  }
  return { entries, problems };
}

/** The catalog decides; the manifest's `category` is a suggestion; everything else is `other`. */
export const resolveCategory = (catalog, suggested) => catalog?.category ?? suggested ?? 'other';

/**
 * When each entry directory first appeared on the first-parent history of `commit`, as UTC `…Z` times without
 * fractions. Directories that are not committed yet are missing from the map.
 */
export function listedTimes(commit, root = ROOT) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['log', '--first-parent', '--diff-filter=A', '--name-only', '--format=%x00%ct', commit, '--', 'plugins', 'skills'],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
  } catch {
    return new Map();
  }
  const times = new Map();
  // Newest first, so the last time seen for a directory is its first appearance.
  for (const block of out.split('\0').filter(Boolean)) {
    const [time, ...names] = block.split('\n').filter(Boolean);
    const iso = new Date(Number(time) * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    for (const name of names) {
      const [type, id] = name.split('/');
      if (id && name.split('/').length > 2) times.set(`${type}/${id}`, iso);
    }
  }
  return times;
}

/** Featured groups for the index: `auto: "recent"` becomes the `limit` most recently listed entries. */
export function expandFeatured(groups, entries) {
  const recent = [...entries]
    .sort((a, b) => (a.listedAt < b.listedAt ? 1 : a.listedAt > b.listedAt ? -1 : a.id.localeCompare(b.id)))
    .map((e) => e.id);
  return groups.map(({ id, name, entries: ids, auto, limit }) => ({
    id,
    name,
    entries: auto === 'recent' ? recent.slice(0, limit ?? 6) : ids,
  }));
}

/** Web page of an upstream for the index; a subdirectory gets a tree link where the host has one. */
export function upstreamUrl(upstream) {
  if (upstream.package) {
    const [registry, name] = upstream.package.split(/:(.*)/s);
    return registry === 'npm' ? `https://www.npmjs.com/package/${name}` : `https://pypi.org/project/${name}/`;
  }
  const base = upstream.repo.replace(/\/+$/, '').replace(/\.git$/, '');
  if (!upstream.path) return base;
  const ref =
    upstream.commit ?? (upstream.track?.startsWith('branch:') ? upstream.track.slice(7) : 'HEAD');
  const host = new URL(base).hostname;
  if (host === 'github.com' || host === 'gitee.com') return `${base}/tree/${ref}/${upstream.path}`;
  if (host === 'gitlab.com') return `${base}/-/tree/${ref}/${upstream.path}`;
  return base;
}

/** The index's `upstream`: display fields only, never the registration (repo, track, format, keep, overlay). */
export const indexUpstream = (upstream) => ({
  url: upstreamUrl(upstream),
  ...(upstream.version && { version: upstream.version }),
  ...(upstream.commit && !upstream.package && { commit: upstream.commit }),
  license: upstream.license,
});

/** Index entry: `readEntry`'s result with the catalog merged in, in the field order of the index format. */
export function catalogEntry(entry, { catalog, listedAt, history }) {
  const { category, ...rest } = entry;
  const ordered = {};
  for (const key of ['id', 'kind', 'path', 'name', 'i18n', 'version', 'description', 'author', 'homepage', 'license', 'icon']) {
    if (rest[key] !== undefined) ordered[key] = rest[key];
  }
  ordered.category = resolveCategory(catalog, category);
  if (rest.keywords) ordered.keywords = rest.keywords;
  ordered.listedAt = listedAt;
  if (catalog?.verification) ordered.verification = catalog.verification;
  if (catalog?.upstream) ordered.upstream = indexUpstream(catalog.upstream);
  for (const key of ['examples', 'links', 'requires', 'contents', 'files', 'digest']) {
    if (rest[key] !== undefined) ordered[key] = rest[key];
  }
  if (history?.length) ordered.history = history;
  return ordered;
}

/**
 * Checks every entry and the catalog (categories, catalog/entries, patches, featured groups). Returns the entry
 * directories by id and the problems found; validate.mjs adds the pull request checks.
 */
export async function checkRepository(root = ROOT) {
  const problems = [];
  const report = (where, message) => problems.push(`${where}: ${message}`);
  const categories = await readJson('catalog/categories.json', root);
  const categoryIds = new Set(categories.map((c) => c.id));
  if (!categoryIds.has('other')) report('catalog/categories.json', 'the "other" category is required');
  const catalog = await readCatalog(root);
  for (const message of catalog.problems) problems.push(message);

  const ids = new Map();
  for (const ref of await listEntries(root)) {
    const { entry, problems: found } = await readEntry(ref, root);
    for (const message of found) report(ref.dir, message);
    if (!entry) continue;
    if (ids.has(entry.id)) report(ref.dir, `id "${entry.id}" is also used by ${ids.get(entry.id)}`);
    ids.set(entry.id, ref.dir);
    const meta = catalog.entries.get(entry.id);
    // The author's category only matters when the catalog does not decide.
    if (entry.category && !meta?.category && !categoryIds.has(entry.category))
      report(ref.dir, `unknown category "${entry.category}" (see catalog/categories.json)`);
    if (!semver.valid(entry.version)) report(ref.dir, `version "${entry.version}" is not semver`);
    if (meta?.upstream) {
      if (!entry.files.some((f) => !f.path.includes('/') && LICENSE_FILE.test(f.path) && !/^NOTICE/i.test(f.path)))
        report(ref.dir, 'entries with an upstream must keep its LICENSE file');
      const skill = meta.upstream.format === 'skill';
      if (skill !== (ref.type === 'skills'))
        report(ref.dir, `upstream format "${meta.upstream.format ?? 'package'}" belongs in ${skill ? 'skills/' : 'plugins/'}`);
    }
  }

  for (const [id, meta] of catalog.entries) {
    const where = `catalog/entries/${id}.json`;
    if (!ids.has(id)) report(where, `no entry "${id}" under plugins/ or skills/`);
    if (meta.category && !categoryIds.has(meta.category))
      report(where, `unknown category "${meta.category}" (see catalog/categories.json)`);
    if (meta.verification?.level === 'verified' && !meta.verification.publisher)
      report(where, 'verified entries need a publisher');
    if (meta.upstream?.overlay && !['claude', 'codex'].includes(meta.upstream.format))
      report(where, 'overlay is only used by the claude and codex formats');
  }
  for (const id of await readdir(path.join(root, 'catalog/patches')).catch(() => [])) {
    if (id !== '.gitkeep' && !catalog.entries.get(id)?.upstream?.repo)
      report(`catalog/patches/${id}`, 'patches need an entry with a git upstream');
  }

  const groupIds = new Set();
  for (const group of await readJson('catalog/featured.json', root)) {
    const where = `catalog/featured.json ${group.id}`;
    if (groupIds.has(group.id)) report(where, 'duplicate group id');
    groupIds.add(group.id);
    if (group.auto !== undefined) {
      if (group.auto !== 'recent') report(where, 'auto must be "recent"');
      if (group.entries !== undefined) report(where, 'automatic groups have no entries');
      if (group.limit !== undefined && !(Number.isInteger(group.limit) && group.limit >= 1 && group.limit <= 50))
        report(where, 'limit must be an integer from 1 to 50');
      continue;
    }
    if (!Array.isArray(group.entries)) report(where, 'entries or auto is required');
    for (const id of group.entries ?? []) {
      if (!ids.has(id)) report(where, `unknown entry "${id}"`);
    }
  }
  return { ids, problems };
}
