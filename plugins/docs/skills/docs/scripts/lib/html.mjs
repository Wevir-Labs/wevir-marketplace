// Renders a prepared document as one self-contained HTML page: inline CSS, images as data URIs, print rules for PDF.
import { loadImage } from './images.mjs';
import { plainText } from './markdown.mjs';
import { CALLOUTS, isZh, PAGE, THEMES, words } from './themes.mjs';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const safeHref = (href) => (/^\s*(javascript|vbscript|data):/i.test(href) ? '#' : href);

function css(doc) {
  const t = THEMES[doc.theme];
  const c = t.color;
  const zh = isZh(doc.lang);
  const body = zh ? t.size.bodyZh : t.size.body;
  const page = PAGE[doc.page];
  return `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0; color: #${c.text}; font-family: ${t.web.body}; font-size: ${body}pt; line-height: ${t.line};
  -webkit-text-size-adjust: 100%; text-rendering: optimizeLegibility; font-kerning: normal; }
.doc { max-width: 780px; margin: 0 auto; padding: 56px 32px 96px; }
.doc-header { margin: 0 0 2.2em; }
.doc-title { font-family: ${t.web.heading}; font-size: ${t.size.title}pt; line-height: 1.15; font-weight: 700;
  color: #${c.heading}; margin: 0; letter-spacing: ${zh ? '0' : '-0.01em'}; }
.doc-subtitle { font-size: ${t.size.subtitle}pt; color: #${c.muted}; margin: 0.5em 0 0; }
.doc-byline { font-size: ${t.size.small + 1}pt; color: #${c.muted}; margin: 1em 0 0; }
.doc-header::after { content: ""; display: block; margin-top: 1.4em; border-bottom: 1px solid #${c.rule}; }
h2, h3, h4, h5, h6 { font-family: ${t.web.heading}; color: #${c.heading}; line-height: 1.25; break-after: avoid; page-break-after: avoid; }
h2 { font-size: ${t.size.h1}pt; margin: 1.9em 0 0.6em; font-weight: 700; }
h3 { font-size: ${t.size.h2}pt; margin: 1.6em 0 0.5em; font-weight: 700; }
h4 { font-size: ${t.size.h3}pt; margin: 1.4em 0 0.4em; font-weight: 700; }
h5, h6 { font-size: ${t.size.h4}pt; margin: 1.2em 0 0.3em; font-weight: 700; color: #${c.muted}; }
.num { color: #${c.accent}; margin-right: 0.45em; font-variant-numeric: tabular-nums; }
p { margin: 0 0 0.85em; orphans: 2; widows: 2; }
a { color: #${c.accent}; text-decoration: underline; text-decoration-thickness: 0.06em; text-underline-offset: 0.15em; }
strong { font-weight: 700; }
mark { background: #fff1a8; padding: 0 0.1em; }
kbd { font-family: ${t.web.mono}; font-size: 0.85em; border: 1px solid #${c.rule}; border-bottom-width: 2px; border-radius: 3px; padding: 0 0.3em; }
code { font-family: ${t.web.mono}; font-size: 0.88em; background: #${c.codeBg}; border-radius: 3px; padding: 0.08em 0.3em; }
pre { font-family: ${t.web.mono}; font-size: ${t.size.code}pt; line-height: 1.5; background: #${c.codeBg}; border: 1px solid #${c.rule};
  border-radius: 4px; padding: 0.8em 1em; margin: 0 0 1em; white-space: pre-wrap; word-break: break-word; }
pre code { background: none; padding: 0; font-size: inherit; }
ul, ol { margin: 0 0 0.85em; padding-left: 1.6em; }
li { margin: 0.2em 0; }
li > p { margin: 0 0 0.4em; }
ul.tight > li > p, ol.tight > li > p { margin: 0; }
li > ul, li > ol { margin: 0.2em 0 0.3em; }
li.task { list-style: none; position: relative; }
li.task > .box { position: absolute; left: -1.35em; top: 0.05em; font-family: "Segoe UI Symbol", "Apple Symbols", sans-serif; }
blockquote { margin: 0 0 1em; padding: 0.1em 0 0.1em 1em; border-left: 3px solid #${c.rule}; color: #${c.muted}; }
blockquote p:last-child { margin-bottom: 0.2em; }
.callout { margin: 0 0 1em; padding: 0.7em 1em 0.6em; border-left: 4px solid; border-radius: 0 4px 4px 0; break-inside: avoid; }
.callout-title { font-weight: 700; margin: 0 0 0.3em; }
.callout > :last-child { margin-bottom: 0.2em; }
${Object.entries(CALLOUTS)
  .map(([k, v]) => `.callout-${k} { border-color: #${v.color}; background: #${v.bg}; } .callout-${k} .callout-title { color: #${v.color}; }`)
  .join('\n')}
hr { border: 0; border-top: 1px solid #${c.rule}; margin: 1.8em 0; }
/* 1px short of the column: a collapsed border's outer half would otherwise be clipped at the page edge in print */
table { border-collapse: collapse; width: calc(100% - 1px); margin: 0.2em 0 1.2em 0.5px; font-size: 0.94em; line-height: 1.4; }
th, td { border: 1px solid #${c.rule}; padding: 0.4em 0.6em; vertical-align: top; text-align: left; }
th { background: #${c.headBg}; font-weight: 700; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
figure { margin: 0.4em 0 1.2em; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; height: auto; }
figcaption { font-size: ${t.size.small + 0.5}pt; color: #${c.muted}; margin-top: 0.5em; }
img { max-width: 100%; }
.missing { display: inline-block; border: 1px dashed #${c.rule}; color: #${c.muted}; padding: 0.6em 1em; font-size: 0.9em; }
.doc-toc { margin: 0 0 2.2em; break-after: page; }
.doc-toc .toc-title { font-family: ${t.web.heading}; font-size: ${t.size.h2}pt; font-weight: 700; margin: 0 0 0.6em; color: #${c.heading}; }
.doc-toc ol { list-style: none; padding: 0; margin: 0; }
.doc-toc li { margin: 0.25em 0; }
.doc-toc li.l2 { padding-left: 1.4em; }
.doc-toc li.l3 { padding-left: 2.8em; font-size: 0.95em; }
.doc-toc a { color: inherit; text-decoration: none; }
.footnotes { margin-top: 2.5em; font-size: ${t.size.small + 0.5}pt; color: #${c.muted}; }
.footnotes ol { padding-left: 1.4em; }
.footnotes p { margin: 0 0 0.3em; }
sup.fn a { text-decoration: none; font-size: 0.8em; }
.page-break { break-after: page; page-break-after: always; height: 0; }
@media screen { .page-break { border-top: 1px dashed #${c.rule}; margin: 2.5em 0; } }
@page { size: ${page.css}; margin: ${t.marginMm}mm ${t.marginMm - 2}mm ${t.marginMm + 4}mm; }
@media print {
  .doc { max-width: none; padding: 0; }
  a { color: inherit; }
  pre, blockquote { break-inside: auto; }
}
${zh ? 'p, li { text-align: justify; text-justify: inter-character; }' : ''}
`;
}

/**
 * @param {object} doc a prepared document (markdown.mjs `prepare`)
 * @param {{ baseDir: string, warn: (msg: string) => void }} opts
 */
export function renderHtml(doc, { baseDir, warn }) {
  const zh = isZh(doc.lang);
  const w = words(doc.lang);
  const inline = (nodes) => (nodes ?? []).map(inl).join('');
  const inl = (n) => {
    switch (n.t) {
      case 'text':
        return esc(n.v);
      case 'strong':
        return `<strong>${inline(n.c)}</strong>`;
      case 'em':
        return `<em>${inline(n.c)}</em>`;
      case 'del':
        return `<del>${inline(n.c)}</del>`;
      case 'u':
        return `<u>${inline(n.c)}</u>`;
      case 'mark':
        return `<mark>${inline(n.c)}</mark>`;
      case 'sup':
        return `<sup>${inline(n.c)}</sup>`;
      case 'sub':
        return `<sub>${inline(n.c)}</sub>`;
      case 'kbd':
        return `<kbd>${inline(n.c)}</kbd>`;
      case 'code':
        return `<code>${esc(n.v)}</code>`;
      case 'br':
        return '<br>';
      case 'link':
        return `<a href="${esc(safeHref(n.href))}"${n.title ? ` title="${esc(n.title)}"` : ''}>${inline(n.c)}</a>`;
      case 'fnref':
        return `<sup class="fn" id="fnref-${n.n}"><a href="#fn-${n.n}">${n.n}</a></sup>`;
      case 'image':
        return img(n, false);
      default:
        return n.c ? inline(n.c) : '';
    }
  };
  const img = (n, figure) => {
    const im = loadImage(n.src, baseDir);
    if (!im.ok) {
      warn(`image ${n.src}: ${im.reason}`);
      return `<span class="missing">${esc(n.alt || n.src)}</span>`;
    }
    let style = '';
    if (n.width) style = ` style="width:${n.width.value}${n.width.unit === 'px' ? 'px' : n.width.unit}"`;
    else if (figure) style = ` style="width:${Math.min(im.width, 1600)}px"`;
    return `<img src="data:${im.mime};base64,${im.data.toString('base64')}" alt="${esc(n.alt)}"${style}>`;
  };

  const blocks = (bs, tightList = false) => bs.map((b) => block(b, tightList)).join('\n');
  const block = (b, tight) => {
    switch (b.type) {
      case 'heading': {
        const h = Math.min(b.level + 1, 6);
        return `<h${h} id="${esc(b.id)}">${b.number ? `<span class="num">${esc(b.number)}</span>` : ''}${inline(b.inlines)}</h${h}>`;
      }
      case 'paragraph':
        return `<p>${inline(b.inlines)}</p>`;
      case 'figure': {
        const cap = b.image.title || '';
        return `<figure>${img(b.image, true)}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
      }
      case 'code':
        return `<pre${b.lang ? ` data-lang="${esc(b.lang)}"` : ''}><code>${esc(b.text)}</code></pre>`;
      case 'blockquote':
        return `<blockquote>${blocks(b.blocks)}</blockquote>`;
      case 'callout': {
        const k = CALLOUTS[b.kind];
        const title = b.title ? inline(b.title) : esc(zh ? k.zh : k.en);
        return `<aside class="callout callout-${b.kind}"><p class="callout-title">${title}</p>${blocks(b.blocks)}</aside>`;
      }
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
        const items = b.items
          .map((it) => {
            const box = it.task === null ? '' : `<span class="box">${it.task ? '☑' : '☐'}</span>`;
            const inner =
              b.tight && it.blocks[0]?.type === 'paragraph'
                ? inline(it.blocks[0].inlines) + (it.blocks.length > 1 ? `\n${blocks(it.blocks.slice(1))}` : '')
                : blocks(it.blocks);
            return `<li${it.task === null ? '' : ' class="task"'}>${box}${inner}</li>`;
          })
          .join('\n');
        return `<${tag}${start}${b.tight ? ' class="tight"' : ''}>${items}</${tag}>`;
      }
      case 'table': {
        const al = (k) => (b.align[k] ? ` style="text-align:${b.align[k]}"` : '');
        const head = b.head.map((c, k) => `<th${al(k)}>${inline(c)}</th>`).join('');
        const rows = b.rows.map((r) => `<tr>${r.map((c, k) => `<td${al(k)}>${inline(c)}</td>`).join('')}</tr>`).join('\n');
        return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
      }
      case 'hr':
        return '<hr>';
      case 'pagebreak':
        return '<div class="page-break"></div>';
      case 'toc':
        return toc();
      default:
        return '';
    }
  };
  const toc = () => {
    const items = doc.headings
      .filter((h) => h.level <= 3)
      .map((h) => `<li class="l${h.level}"><a href="#${esc(h.id)}">${h.number ? `<span class="num">${esc(h.number)}</span>` : ''}${esc(plainText(h.inlines))}</a></li>`)
      .join('\n');
    return `<nav class="doc-toc"><p class="toc-title">${w.contents}</p><ol>${items}</ol></nav>`;
  };

  const titleText = doc.title ? plainText(doc.title) : '';
  const byline = [doc.authors.join(zh ? '、' : ', '), doc.date].filter(Boolean).join(' · ');
  const header = doc.title
    ? `<header class="doc-header"><h1 class="doc-title">${inline(doc.title)}</h1>${
        doc.subtitle ? `<p class="doc-subtitle">${esc(doc.subtitle)}</p>` : ''
      }${byline ? `<p class="doc-byline">${esc(byline)}</p>` : ''}</header>`
    : '';
  const hasTocMarker = JSON.stringify(doc.blocks).includes('"type":"toc"');
  const notes = doc.footnotes.length
    ? `<section class="footnotes"><hr><ol>${doc.footnotes
        .map((f) => `<li id="fn-${f.n}">${blocks(f.blocks).replace(/<\/p>(?![\s\S]*<\/p>)/, ` <a href="#fnref-${f.n}">↩</a></p>`)}</li>`)
        .join('\n')}</ol></section>`
    : '';
  return `<!doctype html>
<html lang="${esc(doc.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titleText || 'Document')}</title>
${doc.authors.length ? `<meta name="author" content="${esc(doc.authors.join(', '))}">\n` : ''}<style>${css(doc)}</style>
</head>
<body>
<article class="doc">
${header}
${doc.toc && !hasTocMarker ? toc() : ''}
${blocks(doc.blocks)}
${notes}
</article>
</body>
</html>
`;
}
