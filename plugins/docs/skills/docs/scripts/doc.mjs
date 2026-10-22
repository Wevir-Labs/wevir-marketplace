#!/usr/bin/env node
// Wevir Docs: turns a Markdown document into Word (.docx), PDF or a self-contained HTML page, and checks it.
//
//   node doc.mjs check <file.md> [--json]
//   node doc.mjs docx  <file.md> [--out file.docx]
//   node doc.mjs pdf   <file.md> [--out file.pdf]
//   node doc.mjs html  <file.md> [--out file.html]
//   node doc.mjs all   <file.md>              (docx and pdf)
//
// Options for every format: --theme modern|classic|memo  --page A4|Letter  --toc  --numbered  --lang zh-CN
// Output goes next to the source with the same base name unless --out is given.
// Needs Node 22+. PDF (and SVG/WebP images in Word files) needs Chrome, Edge, Chromium or Brave; set CHROME_PATH
// if it is installed somewhere unusual. Nothing is downloaded.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ChromeMissingError, findChrome, withPage } from './lib/chrome.mjs';
import { renderDocx } from './lib/docx.mjs';
import { renderHtml } from './lib/html.mjs';
import { loadImage } from './lib/images.mjs';
import { parseMarkdown, plainText, prepare } from './lib/markdown.mjs';
import { isZh } from './lib/themes.mjs';

const USAGE = `Usage: node doc.mjs <check|docx|pdf|html|all> <file.md> [--out path] [--theme modern|classic|memo] [--page A4|Letter] [--toc] [--numbered] [--lang code] [--json]`;

function parseArgs(argv) {
  const [command, file, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--toc' || a === '--numbered' || a === '--json') opts[a.slice(2)] = true;
    else if (['--out', '--theme', '--page', '--lang'].includes(a)) {
      if (rest[i + 1] === undefined) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = rest[++i];
    } else throw new Error(`Unknown option ${a}\n${USAGE}`);
  }
  return { command, file, opts };
}

/** Every image node in the document, wherever it sits. */
function collectImages(doc) {
  const out = [];
  const inl = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.t === 'image') out.push(n);
      if (n.c) inl(n.c);
    }
  };
  const blk = (bs) => {
    for (const b of bs ?? []) {
      if (b.type === 'figure') out.push(b.image);
      inl(b.inlines);
      inl(b.title);
      if (b.type === 'table') {
        b.head.forEach(inl);
        b.rows.forEach((r) => r.forEach(inl));
      }
      blk(b.blocks);
      for (const it of b.items ?? []) blk(it.blocks);
    }
  };
  blk(doc.blocks);
  for (const f of doc.footnotes) blk(f.blocks);
  return out;
}

const PLACEHOLDER = /\[[^\]\n]{0,40}(?:__|TBD|TODO|XXX|\?\?|待定|待补|待填|待确认)[^\]\n]{0,40}\]/g;

const ASCII_QUOTE_IN_CJK = /[\u3000-\u9fff\uff00-\uffef]"|"[\u3000-\u9fff\uff00-\uffef]/;

function check(doc, source, baseDir) {
  const problems = doc.warnings.map((w) => ({ level: 'warning', ...w }));
  for (const img of collectImages(doc)) {
    const r = loadImage(img.src, baseDir);
    if (!r.ok) problems.push({ level: /not found/.test(r.reason) ? 'error' : 'warning', message: `image ${img.src}: ${r.reason}` });
    else if ((r.type === 'svg' || r.type === 'webp') && !findChrome())
      problems.push({ level: 'warning', message: `image ${img.src}: ${r.type} needs Chrome to go into a Word file` });
  }
  let prev = 0;
  for (const h of doc.headings) {
    if (h.level > prev + 1 && prev) problems.push({ level: 'warning', line: h.line, message: `heading "${plainText(h.inlines)}" skips from level ${prev} to ${h.level}` });
    if (!plainText(h.inlines).trim()) problems.push({ level: 'warning', line: h.line, message: 'empty heading' });
    prev = h.level;
  }
  if (!doc.title) problems.push({ level: 'note', message: 'no title: add `title:` front matter or start with a `# Title` line' });
  const lines = source.split('\n');
  let fence = false;
  lines.forEach((line, k) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    for (const m of line.matchAll(PLACEHOLDER)) problems.push({ level: 'note', line: k + 1, message: `placeholder left: ${m[0]}` });
    if (ASCII_QUOTE_IN_CJK.test(line.replace(/`[^`]*`/g, '')))
      problems.push({ level: 'warning', line: k + 1, message: 'straight quotes " in Chinese text: use “…”' });
  });
  return problems;
}

async function pdfFromHtml(html, doc) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wevir-docs-'));
  try {
    const file = path.join(dir, 'doc.html');
    await writeFile(file, html);
    const footer = `<div style="width:100%;font-size:8px;color:#777;text-align:center;font-family:-apple-system,'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
    return await withPage(async (page) => {
      await page.open(file);
      return page.pdf({ displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Loads images for Word; SVG and WebP are drawn to PNG in Chrome at twice their size. */
async function wordImages(doc, baseDir, warn) {
  const map = new Map();
  const toRaster = [];
  for (const img of collectImages(doc)) {
    if (map.has(img.src)) continue;
    const r = loadImage(img.src, baseDir);
    if (!r.ok) {
      warn(`image ${img.src}: ${r.reason}`);
      continue;
    }
    if (r.type === 'svg' || r.type === 'webp') toRaster.push([img.src, r]);
    else map.set(img.src, r);
  }
  if (toRaster.length) {
    if (!findChrome()) {
      for (const [src, r] of toRaster) warn(`image ${src}: ${r.type} needs Chrome to go into a Word file; left out`);
    } else {
      await withPage(async (page) => {
        await page.open('about:blank');
        for (const [src, r] of toRaster) {
          const url = `data:${r.mime};base64,${r.data.toString('base64')}`;
          const png = await page.evaluate(`(async () => {
            const img = new Image(); img.src = ${JSON.stringify(url)}; await img.decode();
            const w = ${Math.round(r.width)}, h = ${Math.round(r.height)};
            const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
            c.getContext('2d').drawImage(img, 0, 0, w * 2, h * 2);
            return c.toDataURL('image/png').split(',')[1];
          })()`);
          map.set(src, { ok: true, data: Buffer.from(png, 'base64'), type: 'png', mime: 'image/png', width: r.width, height: r.height });
        }
      });
    }
  }
  return map;
}

async function main() {
  const { command, file, opts } = parseArgs(process.argv.slice(2));
  if (!command || !file || !['check', 'docx', 'pdf', 'html', 'all'].includes(command)) {
    console.error(USAGE);
    process.exit(2);
  }
  const source = await readFile(file, 'utf8');
  const baseDir = path.dirname(path.resolve(file));
  const doc = prepare(parseMarkdown(source), {
    theme: opts.theme,
    page: opts.page,
    lang: opts.lang,
    ...(opts.toc && { toc: true }),
    ...(opts.numbered && { numbered: true }),
  });
  const base = path.join(baseDir, path.basename(file).replace(/\.(md|markdown|txt)$/i, ''));
  const warnings = new Set();
  const warn = (m) => warnings.add(m);

  if (command === 'check') {
    const problems = check(doc, source, baseDir);
    if (opts.json) console.log(JSON.stringify({ title: doc.title ? plainText(doc.title) : null, lang: doc.lang, page: doc.page, theme: doc.theme, headings: doc.headings.length, problems }, null, 2));
    else {
      console.log(`${path.basename(file)}: ${doc.title ? `"${plainText(doc.title)}"` : 'untitled'}, ${doc.headings.length} headings, ${isZh(doc.lang) ? 'Chinese' : doc.lang}, ${doc.page}, theme ${doc.theme}`);
      if (!problems.length) console.log('No problems found.');
      for (const p of problems) console.log(`${p.level}${p.line ? ` (line ${p.line})` : ''}: ${p.message}`);
    }
    process.exit(problems.some((p) => p.level === 'error') ? 1 : 0);
  }

  const written = [];
  const out = (ext) => (opts.out && command !== 'all' ? path.resolve(opts.out) : `${base}.${ext}`);
  if (command === 'html') {
    const target = out('html');
    await writeFile(target, renderHtml(doc, { baseDir, warn }));
    written.push(target);
  }
  if (command === 'pdf' || command === 'all') {
    const target = out('pdf');
    await writeFile(target, await pdfFromHtml(renderHtml(doc, { baseDir, warn }), doc));
    written.push(target);
  }
  if (command === 'docx' || command === 'all') {
    const target = out('docx');
    const images = await wordImages(doc, baseDir, warn);
    await writeFile(target, renderDocx(doc, { images, warn }));
    written.push(target);
  }
  for (const m of [...doc.warnings.map((w) => `${w.line ? `line ${w.line}: ` : ''}${w.message}`), ...warnings]) console.warn(`warning: ${m}`);
  for (const f of written) console.log(f);
}

main().catch((error) => {
  console.error(error instanceof ChromeMissingError ? error.message : `error: ${error.message}`);
  process.exit(1);
});
