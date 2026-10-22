// Embeds a deck's fonts so it renders the same offline, in Wevir's file preview (which loads nothing from the
// network) and in PDF/PPTX exports: Google Fonts are fetched subset to the characters the deck uses; local
// font files beside the deck are inlined.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FONT_TYPES = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

function cacheDir() {
  const base =
    process.env.XDG_CACHE_HOME ||
    (process.platform === 'win32' && process.env.LOCALAPPDATA) ||
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches') : path.join(os.homedir(), '.cache'));
  return path.join(base, 'wevir-slides', 'fonts');
}

async function cachedFetch(url, kind) {
  const dir = cacheDir();
  const key = createHash('sha256').update(url).digest('hex').slice(0, 32);
  const file = path.join(dir, `${key}.${kind === 'css' ? 'css' : 'bin'}`);
  if (existsSync(file)) return readFile(file);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dir, { recursive: true });
  await writeFile(file, buf);
  return buf;
}

/** The characters a deck's text uses, as one string (always with basic Latin for small edits). */
export function deckCharacters(html) {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  for (const ch of '–—‘’“”…•·×→←↑↓€£¥%‰') set.add(ch);
  for (const ch of text) if (ch.codePointAt(0) >= 0x20 && !/\s/.test(ch)) set.add(ch);
  return [...set].join('');
}

/** Splits text into chunks whose URL encoding stays short enough for one request. */
function chunks(text, maxEncoded = 6000) {
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of text) {
    const l = encodeURIComponent(ch).length;
    if (len + l > maxEncoded && cur) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += l;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Fetches a Google Fonts css2 stylesheet subset to `chars` and returns @font-face rules whose sources are data URIs.
 * @returns {Promise<string>}
 */
export async function embedGoogleFonts(href, chars) {
  const rules = [];
  for (const part of chunks(chars)) {
    const base = href.replace(/&amp;/g, '&').replace(/[?&](text|display)=[^&]*/g, (m) => (m[0] === '?' ? '?' : ''));
    const cssUrl = `${base}${base.endsWith('?') ? '' : '&'}display=swap&text=${encodeURIComponent(part)}`;
    const css = (await cachedFetch(cssUrl, 'css')).toString('utf8');
    for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
      const src = /url\((https:\/\/[^)]+)\)/.exec(block)?.[1];
      if (!src) continue;
      const font = await cachedFetch(src, 'font');
      const type = /format\('woff2'\)/.test(block) ? 'font/woff2' : /format\('woff'\)/.test(block) ? 'font/woff' : 'font/ttf';
      rules.push(block.replace(/src:[^;]+;/, `src: url(data:${type};base64,${font.toString('base64')});`));
    }
  }
  if (!rules.length) throw new Error(`no font faces came back for ${href}`);
  return rules.join('\n');
}

/** Inlines `url(file)` in local @font-face rules; returns the rewritten CSS and any problems. */
export async function inlineLocalFontFaces(css, dir) {
  const problems = [];
  const parts = [];
  let last = 0;
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    parts.push(css.slice(last, m.index));
    last = m.index + m[0].length;
    const ref = m[2];
    if (ref.startsWith('data:') || /^https?:/i.test(ref)) {
      parts.push(m[0]);
      continue;
    }
    const file = path.resolve(dir, decodeURIComponent(ref));
    const type = FONT_TYPES[path.extname(file).toLowerCase()];
    if (!type || !existsSync(file)) {
      problems.push(`font file not found or not a font: ${ref}`);
      parts.push(m[0]);
      continue;
    }
    parts.push(`url(data:${type};base64,${(await readFile(file)).toString('base64')})`);
  }
  parts.push(css.slice(last));
  return { css: parts.join(''), problems };
}
