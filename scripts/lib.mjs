// Shared by validate.mjs and build-index.mjs: read an entry directory, check it and describe it as an index entry.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
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
 * Reads one entry directory. Returns `{ entry, version, problems }`: `entry` is the index entry
 * without `trust` and `history`, or null when the directory is unusable.
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
