#!/usr/bin/env node
// Wevir Slides: check, build and export a deck written as one HTML file of 1920×1080 <section> slides.
//
//   node deck.mjs check  <deck.html> [--json]                 lint + measured layout report (needs Chrome)
//   node deck.mjs build  <deck.html> [--out file.html]        self-contained HTML (viewer, fonts, images inlined)
//   node deck.mjs pdf    <deck.html> [--out file.pdf]         one page per slide
//   node deck.mjs pptx   <deck.html> [--out file.pptx] [--scale 1|2]   picture slides + speaker notes
//   node deck.mjs png    <deck.html> [--slides 1,3-5] [--out-dir dir] [--scale 1|2]
//   node deck.mjs export <deck.html> [--formats html,pdf,pptx] [--out-dir dir]
//
// Outputs go to <deck folder>/dist/ named after the deck's <title> unless --out / --out-dir says otherwise.
// Zero dependencies; Node 22+. PDF, PPTX, PNG and the layout report drive a local Chrome/Edge/Chromium
// (CHROME_PATH overrides the search).
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChromeMissingError, withPage } from './lib/chrome.mjs';
import { deckCharacters, embedGoogleFonts, inlineLocalFontFaces } from './lib/fonts.mjs';
import { ICONS } from './lib/icons.mjs';
import { lintDeck, parseAttrs } from './lib/lint.mjs';
import { buildPptx } from './lib/pptx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function parseArgs(argv) {
  const [command, file, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) opts[k] = v;
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) opts[k] = rest[++i];
    else opts[k] = true;
  }
  return { command, file, opts };
}

const rel = (p) => {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith('..') ? r : p;
};

function safeName(title, fallback) {
  const t = (title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t || fallback;
}

function printProblems(problems, file) {
  const order = { error: 0, warn: 1, note: 2 };
  for (const p of [...problems].sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)) {
    const where = `${rel(file)}:${p.line}${p.slide ? ` [${p.slide}]` : ''}`;
    console.log(`${p.level.padEnd(5)} ${where}  ${p.message}`);
  }
}

async function readDeck(file) {
  if (!file) throw new Error('Name the deck file: node deck.mjs <command> path/to/deck.html');
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`No such file: ${file}`);
  return { abs, html: await readFile(abs, 'utf8') };
}

async function inlineImages(html, dir, warnings) {
  const cache = new Map();
  const dataUri = async (ref) => {
    if (!ref || ref.startsWith('data:') || /^(https?:)?\/\//i.test(ref) || ref.startsWith('#')) return null;
    const file = path.resolve(dir, decodeURIComponent(ref.split(/[?#]/)[0]));
    if (cache.has(file)) return cache.get(file);
    const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
    if (!type || !existsSync(file)) {
      warnings.push(`image not found or not an image: ${ref}`);
      return null;
    }
    const uri = `data:${type};base64,${(await readFile(file)).toString('base64')}`;
    cache.set(file, uri);
    return uri;
  };
  const replaceAsync = async (text, re, fn) => {
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      parts.push(text.slice(last, m.index), await fn(m));
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.join('');
  };
  html = await replaceAsync(html, /<img\b[^>]*>/gi, async (m) =>
    replaceAsync(m[0], /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i, async (s) => {
      const uri = await dataUri((s[2] ?? s[3] ?? '').replace(/&amp;/g, '&'));
      return uri ? `src="${uri}"` : s[0];
    }),
  );
  html = await replaceAsync(html, /url\(\s*(&quot;|['"]?)([^'")&]+)\1\s*\)/g, async (m) => {
    const uri = await dataUri(m[2]);
    return uri ? `url(${uri})` : m[0];
  });
  return html;
}

/** Turns a deck source into the self-contained viewer page. */
async function buildHtml(abs, html, { embedFonts = true } = {}) {
  const dir = path.dirname(abs);
  const warnings = [];
  const lint = lintDeck(html, abs);
  let out = html;

  if (embedFonts) {
    const chars = deckCharacters(html);
    const links = [...out.matchAll(/<link\b[^>]*>/gi)].filter((m) => /fonts\.googleapis\.com\/css2/.test(m[0]));
    for (const m of links) {
      const href = parseAttrs(m[0].slice(5, -1)).href;
      try {
        const css = await embedGoogleFonts(href, chars);
        out = out.replace(m[0], () => `<style data-deck-fonts>\n${css}\n</style>`);
      } catch (error) {
        warnings.push(
          `Google Fonts not embedded (${error.message}); the link stays, so the fonts show only online in a browser, not in Wevir's preview or offline.`,
        );
      }
    }
    const styles = [...out.matchAll(/<style(?![^>]*data-deck-fonts)[^>]*>([\s\S]*?)<\/style>/gi)];
    for (const m of styles) {
      if (!/@font-face/.test(m[1])) continue;
      const { css, problems } = await inlineLocalFontFaces(m[1], dir);
      warnings.push(...problems);
      out = out.replace(m[0], () => m[0].replace(m[1], () => css));
    }
  }
  out = await inlineImages(out, dir, warnings);

  const used = {};
  for (const m of html.matchAll(/<x-icon\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)) if (ICONS[m[1]]) used[m[1]] = ICONS[m[1]];
  const css = await readFile(path.join(HERE, 'lib', 'runtime.css'), 'utf8');
  const js = await readFile(path.join(HERE, 'lib', 'runtime.js'), 'utf8');
  const headBits = [];
  if (!/<meta\b[^>]*charset/i.test(out)) headBits.push('<meta charset="utf-8">');
  if (!/<meta\b[^>]*name\s*=\s*["']viewport/i.test(out)) headBits.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  headBits.push('<meta name="generator" content="Wevir Slides">');
  headBits.push(`<style id="deck-runtime-css">\n${css}</style>`);
  const head = headBits.join('\n');
  if (/<head\b[^>]*>/i.test(out)) out = out.replace(/<head\b[^>]*>/i, (h) => `${h}\n${head}`);
  else out = `${head}\n${out}`;
  const tail = `<script>window.__DECK_ICONS=${JSON.stringify(used)};</script>\n<script>\n${js}</script>\n`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${tail}</body>`) : out + tail;
  if (!/^\s*<!doctype/i.test(out)) out = `<!doctype html>\n${out}`;
  return { html: out, lint, warnings };
}

function defaultOut(abs, title, ext, opts) {
  if (opts.out && ext === opts.outExt) return path.resolve(opts.out);
  const dir = opts['out-dir'] ? path.resolve(opts['out-dir']) : path.join(path.dirname(abs), 'dist');
  return path.join(dir, `${safeName(title, path.basename(abs, path.extname(abs)))}${ext}`);
}

function parseSlides(spec, count) {
  if (!spec || spec === true) return [...Array(count).keys()];
  const set = new Set();
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-').map((v) => parseInt(v, 10));
    if (Number.isNaN(a)) continue;
    const end = b === undefined || Number.isNaN(b) ? a : b;
    for (let i = a; i <= end; i++) if (i >= 1 && i <= count) set.add(i - 1);
  }
  return [...set].sort((x, y) => x - y);
}

async function withBuilt(abs, html, fn) {
  const built = await buildHtml(abs, html);
  const errors = built.lint.problems.filter((p) => p.level === 'error');
  if (errors.length) {
    printProblems(errors, abs);
    throw new Error(`${errors.length} error(s) in the deck; fix them first (node deck.mjs check ${rel(abs)}).`);
  }
  for (const w of built.warnings) console.log(`warn  ${w}`);
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wevir-deck-'));
  const page = path.join(tmp, 'deck.html');
  await writeFile(page, built.html);
  try {
    return await fn(page, built);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function openExport(page, file, scale = 1) {
  await page.viewport(1920, 1080, scale);
  await page.open(file, '#export');
  await page.evaluate('window.__deck ? window.__deck.ready() : Promise.reject(new Error("the deck runtime did not start"))');
  return page.evaluate('window.__deck.slides()');
}

async function screenshots(page, info, indexes) {
  const shots = [];
  for (const i of indexes) {
    const s = info[i];
    shots.push(await page.screenshot({ x: s.left, y: s.top, width: 1920, height: 1080 }));
  }
  return shots;
}

function langOf(html) {
  return /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] || 'en-US';
}

async function cmdCheck(file, opts) {
  const { abs, html } = await readDeck(file);
  const lint = lintDeck(html, abs);
  const result = { file: rel(abs), slides: lint.slides, title: lint.title, problems: lint.problems, layout: null, layoutSkipped: null };
  const hasErrors = lint.problems.some((p) => p.level === 'error');
  if (!hasErrors) {
    try {
      await withBuilt(abs, html, (built) =>
        withPage(async (page) => {
          await openExport(page, built);
          result.layout = await page.evaluate('window.__deck.report()');
        }),
      );
    } catch (error) {
      if (error instanceof ChromeMissingError) result.layoutSkipped = error.message;
      else throw error;
    }
  } else {
    result.layoutSkipped = 'fix the errors above first; layout is measured on a deck that builds';
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.file}: ${lint.slides} slide(s)${lint.title ? `, "${lint.title}"` : ''}`);
    printProblems(lint.problems, abs);
    if (result.layout) {
      const { slides, faces, hiddenSlides } = result.layout;
      for (const s of slides) {
        for (const p of s.issues) {
          console.log(`${p.level.padEnd(5)} slide ${s.index}${s.id ? ` [${s.id}]` : ''}${p.element ? ` ${p.element}` : ''}  ${p.message}`);
        }
      }
      for (const f of faces) console.log(`warn  font "${f.family}" ${f.message}`);
      if (hiddenSlides) console.log(`note  ${hiddenSlides} hidden slide(s) skipped`);
    } else if (result.layoutSkipped) {
      console.log(`note  layout not measured: ${result.layoutSkipped}`);
    }
    const all = [...lint.problems, ...(result.layout?.slides.flatMap((s) => s.issues) ?? [])];
    const count = (l) => all.filter((p) => p.level === l).length;
    console.log(
      all.length ? `${count('error')} error(s), ${count('warn')} warning(s), ${count('note')} note(s)` : 'No problems found.',
    );
  }
  const failed = lint.problems.some((p) => p.level === 'error') || result.layout?.slides.some((s) => s.issues.some((p) => p.level === 'error'));
  process.exitCode = failed ? 1 : 0;
}

async function writeOut(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  console.log(`wrote ${rel(file)}`);
}

async function cmdBuild(file, opts) {
  const { abs, html } = await readDeck(file);
  const built = await buildHtml(abs, html);
  const errors = built.lint.problems.filter((p) => p.level === 'error');
  if (errors.length) {
    printProblems(errors, abs);
    throw new Error(`${errors.length} error(s); nothing written.`);
  }
  for (const w of built.warnings) console.log(`warn  ${w}`);
  await writeOut(defaultOut(abs, built.lint.title, '.html', { ...opts, outExt: '.html' }), built.html);
}

async function cmdExport(file, opts, formats) {
  const { abs, html } = await readDeck(file);
  const scale = Math.min(3, Math.max(1, Number(opts.scale) || 1));
  await withBuilt(abs, html, async (builtFile, built) => {
    const title = built.lint.title;
    if (formats.includes('html')) await writeOut(defaultOut(abs, title, '.html', { ...opts, outExt: '.html' }), built.html);
    const needsChrome = formats.some((f) => f !== 'html');
    if (!needsChrome) return;
    await withPage(async (page) => {
      const info = await openExport(page, builtFile, formats.includes('pptx') || formats.includes('png') ? scale : 1);
      if (formats.includes('pdf')) {
        await writeOut(defaultOut(abs, title, '.pdf', { ...opts, outExt: '.pdf' }), await page.pdf());
      }
      if (formats.includes('pptx')) {
        const shots = await screenshots(page, info, info.map((_, i) => i));
        const pptx = buildPptx({
          title: title || 'Slides',
          lang: langOf(html),
          slides: info.map((s, i) => ({ png: shots[i], notes: s.notes, alt: s.text, title: s.title })),
        });
        await writeOut(defaultOut(abs, title, '.pptx', { ...opts, outExt: '.pptx' }), pptx);
      }
      if (formats.includes('png')) {
        const indexes = parseSlides(opts.slides, info.length);
        if (!indexes.length) throw new Error(`--slides ${opts.slides} matches none of the ${info.length} slides`);
        const shots = await screenshots(page, info, indexes);
        const dir = opts['out-dir'] ? path.resolve(opts['out-dir']) : path.join(path.dirname(abs), 'dist', 'slides');
        for (let k = 0; k < indexes.length; k++) {
          const s = info[indexes[k]];
          await writeOut(path.join(dir, `slide-${String(s.index).padStart(2, '0')}${s.id ? `-${s.id}` : ''}.png`), shots[k]);
        }
      }
    });
  });
}

async function main() {
  const { command, file, opts } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'check':
      return cmdCheck(file, opts);
    case 'build':
      return cmdBuild(file, opts);
    case 'pdf':
      return cmdExport(file, opts, ['pdf']);
    case 'pptx':
      return cmdExport(file, opts, ['pptx']);
    case 'png':
      return cmdExport(file, opts, ['png']);
    case 'export': {
      const formats = String(opts.formats && opts.formats !== true ? opts.formats : 'html,pdf,pptx')
        .split(',')
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean);
      const bad = formats.filter((f) => !['html', 'pdf', 'pptx', 'png'].includes(f));
      if (bad.length) throw new Error(`unknown format(s): ${bad.join(', ')}`);
      return cmdExport(file, opts, formats);
    }
    default:
      console.log(
        'Usage: node deck.mjs <check|build|pdf|pptx|png|export> <deck.html> [options]\nSee the comment at the top of this file.',
      );
      process.exitCode = command ? 2 : 0;
  }
}

main().catch((error) => {
  console.error(`error ${error.message}`);
  process.exitCode = 1;
});
