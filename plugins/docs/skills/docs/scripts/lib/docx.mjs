// Renders a prepared document as a Word file (.docx): hand-written WordprocessingML packed with zip.mjs.
import { plainText } from './markdown.mjs';
import { CALLOUTS, isZh, PAGE, THEMES, words } from './themes.mjs';
import { xmlEscape as x, zip } from './zip.mjs';

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
};
const REL = {
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  numbering: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
  settings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
  footnotes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
  footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
};
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const twip = (pt) => Math.round(pt * 20);
const half = (pt) => Math.round(pt * 2);
const mmTwip = (mm) => Math.round((mm / 25.4) * 1440);
const EMU_PX = 9525;
const LIST_STEP = 360;
const LIST_HANG = 280;

/** Rough width of a string in "narrow characters" (CJK counts double), for table column weights. */
// Table column sizing: twips per text-weight unit (half a CJK character at the table's 10pt) and the cell's side margins.
const CELL_UNIT = 105;
const CELL_PAD = 260;
const textWeight = (s) => [...s].reduce((n, ch) => n + (/[⺀-￯]/.test(ch) ? 2 : 1), 0);

class Part {
  constructor(name) {
    this.name = name;
    this.rels = [];
  }
  rel(type, target, external = false) {
    const id = `rId${this.rels.length + 10}`;
    this.rels.push({ id, type, target, external });
    return id;
  }
  relsXml(base = []) {
    const all = [...base, ...this.rels];
    return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${all
      .map(
        (r) =>
          `<Relationship Id="${r.id}" Type="${r.type}" Target="${x(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`,
      )
      .join('')}</Relationships>`;
  }
}

/**
 * @param {object} doc a prepared document
 * @param {{ images: Map<string, object>, warn: (msg: string) => void }} opts images: src → loaded image (png/jpeg/gif only)
 * @returns {Buffer}
 */
export function renderDocx(doc, { images, warn }) {
  const theme = THEMES[doc.theme];
  const zh = isZh(doc.lang);
  const w = words(doc.lang);
  const page = PAGE[doc.page];
  const pageW = mmTwip(page.widthMm);
  const pageH = mmTwip(page.heightMm);
  const marginTop = mmTwip(theme.marginMm);
  const marginSide = mmTwip(theme.marginMm - 2);
  const marginBottom = mmTwip(theme.marginMm + 4);
  const textW = pageW - 2 * marginSide;
  const textH = pageH - marginTop - marginBottom;
  const bodyPt = zh ? theme.size.bodyZh : theme.size.body;

  const document = new Part('document');
  const footnotesPart = new Part('footnotes');
  const media = [];
  const mediaBySrc = new Map();
  const nums = [];
  let drawingId = 1;
  let bookmarkId = 1;
  const bookmarks = new Map(doc.headings.map((h, k) => [h.id, `_Hd${k + 1}`]));

  // ---- runs ----------------------------------------------------------------
  const rPr = (f) => {
    const parts = [];
    if (f.style) parts.push(`<w:rStyle w:val="${f.style}"/>`);
    if (f.font) parts.push(`<w:rFonts w:ascii="${x(f.font)}" w:hAnsi="${x(f.font)}" w:eastAsia="${x(f.font)}" w:cs="${x(f.font)}"/>`);
    if (f.b) parts.push('<w:b/><w:bCs/>');
    if (f.i) parts.push('<w:i/><w:iCs/>');
    if (f.strike) parts.push('<w:strike/>');
    if (f.color) parts.push(`<w:color w:val="${f.color}"/>`);
    if (f.sz) parts.push(`<w:sz w:val="${half(f.sz)}"/><w:szCs w:val="${half(f.sz)}"/>`);
    if (f.highlight) parts.push('<w:highlight w:val="yellow"/>');
    if (f.u) parts.push('<w:u w:val="single"/>');
    if (f.kbd) parts.push(`<w:bdr w:val="single" w:sz="4" w:space="0" w:color="${theme.color.rule}"/>`);
    if (f.vert) parts.push(`<w:vertAlign w:val="${f.vert}"/>`);
    return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
  };
  const textRun = (text, f) => {
    if (!text) return '';
    const pieces = text.split('\t');
    const body = pieces.map((p) => (p ? `<w:t xml:space="preserve">${x(p)}</w:t>` : '')).join('<w:tab/>');
    return `<w:r>${rPr(f)}${body}</w:r>`;
  };

  const imageRun = (src, alt, width, part, maxW = textW, maxH = textH * 0.85) => {
    const im = images.get(src);
    if (!im) return textRun(`[${alt || src}]`, { color: theme.color.muted, i: true });
    let entry = mediaBySrc.get(src);
    if (!entry) {
      entry = { name: `image${media.length + 1}.${im.type === 'jpeg' ? 'jpeg' : im.type}`, data: im.data, type: im.type };
      media.push(entry);
      mediaBySrc.set(src, entry);
    }
    const rid = part.rel(REL.image, `media/${entry.name}`);
    // Pixels at 96 dpi, then the explicit width, then fit inside the text area.
    let wEmu = im.width * EMU_PX;
    let hEmu = im.height * EMU_PX;
    const maxWEmu = Math.round((maxW / 1440) * 914400);
    const maxHEmu = Math.round((maxH / 1440) * 914400);
    if (width) {
      const u = width.unit;
      const target =
        u === '%'
          ? (maxWEmu * width.value) / 100
          : u === 'cm'
            ? width.value * 360000
            : u === 'mm'
              ? width.value * 36000
              : u === 'in'
                ? width.value * 914400
                : width.value * EMU_PX;
      hEmu = (hEmu * target) / wEmu;
      wEmu = target;
    }
    if (wEmu > maxWEmu) {
      hEmu = (hEmu * maxWEmu) / wEmu;
      wEmu = maxWEmu;
    }
    if (hEmu > maxHEmu) {
      wEmu = (wEmu * maxHEmu) / hEmu;
      hEmu = maxHEmu;
    }
    wEmu = Math.round(wEmu);
    hEmu = Math.round(hEmu);
    const id = drawingId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}" descr="${x(alt ?? '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}"><pic:pic xmlns:pic="${NS.pic}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${entry.name}" descr="${x(alt ?? '')}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };

  const runs = (nodes, f, part, inLink = false) =>
    (nodes ?? [])
      .map((n) => {
        switch (n.t) {
          case 'text':
            return textRun(n.v, f);
          case 'strong':
            return runs(n.c, { ...f, b: true }, part, inLink);
          case 'em':
            return runs(n.c, { ...f, i: true }, part, inLink);
          case 'del':
            return runs(n.c, { ...f, strike: true }, part, inLink);
          case 'u':
            return runs(n.c, { ...f, u: true }, part, inLink);
          case 'mark':
            return runs(n.c, { ...f, highlight: true }, part, inLink);
          case 'sup':
            return runs(n.c, { ...f, vert: 'superscript' }, part, inLink);
          case 'sub':
            return runs(n.c, { ...f, vert: 'subscript' }, part, inLink);
          case 'kbd':
            return runs(n.c, { ...f, style: 'VerbatimChar', kbd: true }, part, inLink);
          case 'code':
            return textRun(n.v, { ...f, style: 'VerbatimChar' });
          case 'br':
            return '<w:r><w:br/></w:r>';
          case 'image':
            return imageRun(n.src, n.alt, n.width, part, textW, textH * 0.4);
          case 'fnref':
            return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${n.n}"/></w:r>`;
          case 'link': {
            if (inLink) return runs(n.c, f, part, true);
            const inner = runs(n.c, { ...f, style: 'Hyperlink' }, part, true);
            if (n.href.startsWith('#')) {
              const bm = bookmarks.get(decodeURIComponent(n.href.slice(1)));
              return bm ? `<w:hyperlink w:anchor="${bm}" w:history="1">${inner}</w:hyperlink>` : inner;
            }
            if (/^\s*(javascript|vbscript|data):/i.test(n.href)) return inner;
            const rid = part.rel(REL.hyperlink, n.href, true);
            return `<w:hyperlink r:id="${rid}" w:history="1">${inner}</w:hyperlink>`;
          }
          default:
            return n.c ? runs(n.c, f, part, inLink) : '';
        }
      })
      .join('');

  // ---- paragraphs ----------------------------------------------------------
  const pPr = (o) => {
    const parts = [];
    if (o.style) parts.push(`<w:pStyle w:val="${o.style}"/>`);
    if (o.keepNext) parts.push('<w:keepNext/>');
    if (o.num) parts.push(`<w:numPr><w:ilvl w:val="${o.num.lvl}"/><w:numId w:val="${o.num.id}"/></w:numPr>`);
    if (o.box) parts.push(o.box.bdr);
    else if (o.bdr) parts.push(o.bdr);
    if (o.box) parts.push(o.box.shd);
    if (o.spacing) {
      const s = o.spacing;
      parts.push(
        `<w:spacing${s.before !== undefined ? ` w:before="${s.before}"` : ''}${s.after !== undefined ? ` w:after="${s.after}"` : ''}/>`,
      );
    }
    if (o.ind) {
      const i = o.ind;
      parts.push(
        `<w:ind w:left="${i.left ?? 0}"${i.right ? ` w:right="${i.right}"` : ''}${i.hanging ? ` w:hanging="${i.hanging}"` : ''}/>`,
      );
    }
    if (o.jc) parts.push(`<w:jc w:val="${o.jc}"/>`);
    return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
  };
  const para = (o, body) => `<w:p>${pPr(o)}${body}</w:p>`;

  const levelIndent = (depth) => LIST_STEP * (depth + 1) + LIST_HANG - LIST_STEP;
  const ctxPara = (ctx, o = {}) => {
    const out = { ...o };
    if (ctx.quote && !out.style) out.style = 'Quote';
    if (ctx.box) out.box = ctx.box;
    const extra = ctx.indent ?? 0;
    if (extra || out.ind) out.ind = { ...(out.ind ?? {}), left: (out.ind?.left ?? 0) + extra };
    if (ctx.quote && out.style === 'Quote' && ctx.quote > 1) out.ind = { ...(out.ind ?? {}), left: (out.ind?.left ?? 0) + 284 * (ctx.quote - 1) };
    if (ctx.tight) out.spacing = { after: 40 };
    return out;
  };

  const newNum = (ordered, start, lvl) => {
    const id = nums.length + 2;
    nums.push({ id, ordered, start, lvl });
    return id;
  };

  const blocks = (bs, ctx) => bs.map((b) => block(b, ctx)).join('');
  const block = (b, ctx) => {
    const part = ctx.part;
    switch (b.type) {
      case 'heading': {
        const level = Math.min(b.level, 4);
        const bm = bookmarks.get(b.id);
        const id = bookmarkId++;
        const num = b.number ? textRun(`${b.number} `, { color: theme.color.accent }) : '';
        const open = bm ? `<w:bookmarkStart w:id="${id}" w:name="${bm}"/>` : '';
        const close = bm ? `<w:bookmarkEnd w:id="${id}"/>` : '';
        return para({ style: `Heading${level}` }, `${open}${num}${runs(b.inlines, {}, part)}${close}`);
      }
      case 'paragraph':
        return para(ctxPara(ctx), runs(b.inlines, {}, part));
      case 'figure': {
        const cap = b.image.title;
        const body = para(ctxPara(ctx, { jc: 'center', keepNext: !!cap, spacing: { before: 120, after: cap ? 60 : 200 } }), imageRun(b.image.src, b.image.alt, b.image.width, part, textW - (ctx.indent ?? 0)));
        return body + (cap ? para({ style: 'Caption' }, textRun(cap, {})) : '');
      }
      case 'code': {
        const lines = b.text.split('\n');
        const body = lines.map((l, k) => (k ? '<w:r><w:br/></w:r>' : '') + textRun(l.replace(/ /g, ' '), {})).join('');
        const o = { style: 'CodeBlock' };
        if (ctx.indent) o.ind = { left: (ctx.indent ?? 0) + 115, right: 115 };
        return para(o, body || '<w:r><w:t></w:t></w:r>');
      }
      case 'blockquote':
        return blocks(b.blocks, { ...ctx, quote: (ctx.quote ?? 0) + 1, tight: false });
      case 'callout': {
        const k = CALLOUTS[b.kind];
        const box = {
          bdr: `<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${k.bg}"/><w:left w:val="single" w:sz="24" w:space="8" w:color="${k.color}"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${k.bg}"/><w:right w:val="single" w:sz="4" w:space="8" w:color="${k.bg}"/></w:pBdr>`,
          shd: `<w:shd w:val="clear" w:color="auto" w:fill="${k.bg}"/>`,
        };
        const inner = { ...ctx, box, indent: (ctx.indent ?? 0) + 200, tight: false };
        const titleRuns = b.title ? runs(b.title, { b: true, color: k.color }, part) : textRun(zh ? k.zh : k.en, { b: true, color: k.color });
        return (
          para(ctxPara(inner, { keepNext: true, spacing: { before: 120, after: 60 }, ind: { right: 200 } }), titleRuns) +
          blocks(b.blocks, inner).replace(/<w:ind w:left="(\d+)"\/>/g, '<w:ind w:left="$1" w:right="200"/>')
        );
      }
      case 'list':
        return list(b, ctx);
      case 'table':
        return table(b, ctx);
      case 'hr':
        return para(
          { bdr: `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${theme.color.rule}"/></w:pBdr>`, spacing: { before: 120, after: 240 } },
          '',
        );
      case 'pagebreak':
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      case 'toc':
        return tocXml();
      default:
        return '';
    }
  };

  const list = (b, ctx) => {
    const depth = ctx.listDepth ?? 0;
    const lvl = Math.min(depth, 8);
    const numId = b.ordered ? newNum(true, b.start, lvl) : 1;
    const baseIndent = ctx.indentBeforeList ?? ctx.indent ?? 0;
    const left = baseIndent + levelIndent(depth);
    return b.items
      .map((it) => {
        // Blocks after the first paragraph align with the item's text; nested lists keep the list's base indent.
        const itemCtx = { ...ctx, listDepth: depth + 1, indent: left, indentBeforeList: baseIndent, tight: b.tight };
        const [first, ...rest] = it.blocks;
        let head;
        const spacing = b.tight ? { after: 40 } : { after: 100 };
        if (it.task !== null) {
          const box = textRun(`${it.task ? '☑' : '☐'}\t`, { font: 'Segoe UI Symbol' });
          const body = first?.type === 'paragraph' ? runs(first.inlines, {}, ctx.part) : '';
          head = para(
            { ...ctxPara({ ...ctx, indent: 0 }), ind: { left, hanging: LIST_HANG }, spacing, ...(ctx.box && { box: ctx.box }) },
            box + body,
          );
        } else if (first?.type === 'paragraph') {
          const o = { ...ctxPara({ ...ctx, indent: 0 }), num: { id: numId, lvl }, spacing };
          o.ind = { left, hanging: LIST_HANG };
          head = para(o, runs(first.inlines, {}, ctx.part));
        } else {
          head = para({ num: { id: numId, lvl }, ind: { left, hanging: LIST_HANG }, spacing }, '');
        }
        const remaining = first?.type === 'paragraph' ? rest : it.blocks;
        return head + blocks(remaining, itemCtx);
      })
      .join('');
  };

  const tableBorders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${theme.color.rule}"/>`)
    .join('')}</w:tblBorders>`;
  const table = (b, ctx) => {
    const indent = ctx.indent ?? 0;
    const avail = textW - indent;
    // Short columns (labels, names, dates) get their natural width so they never wrap; long ones share the rest by length.
    const longest = b.head.map((h, k) => Math.max(...[h, ...b.rows.map((r) => r[k])].map((c) => textWeight(plainText(c)))));
    const weights = longest.map((n) => Math.min(Math.max(n, 4), 48));
    const natural = longest.map((n) => Math.max(n, 2) * CELL_UNIT + CELL_PAD);
    let widths;
    if (natural.reduce((a, c) => a + c, 0) <= avail) {
      const total = natural.reduce((a, c) => a + c, 0);
      widths = natural.map((n) => Math.floor((avail * n) / total));
    } else {
      const fair = avail / natural.length;
      const short = natural.map((n) => n <= fair);
      const fixed = natural.reduce((a, n, k) => a + (short[k] ? n : 0), 0);
      const rest = avail - fixed;
      const longSum = weights.reduce((a, w, k) => a + (short[k] ? 0 : w), 0);
      widths = longSum
        ? natural.map((n, k) => (short[k] ? n : Math.floor((rest * weights[k]) / longSum)))
        : weights.map((w) => Math.floor((avail * w) / weights.reduce((a, c) => a + c, 0)));
    }
    const cell = (c, k, head) => {
      const jc = b.align[k] === 'center' ? 'center' : b.align[k] === 'right' ? 'right' : null;
      const shd = head ? `<w:shd w:val="clear" w:color="auto" w:fill="${theme.color.headBg}"/>` : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[k]}" w:type="dxa"/>${shd}</w:tcPr>${para({ style: 'TableText', ...(jc && { jc }) }, runs(c, head ? { b: true } : {}, ctx.part))}</w:tc>`;
    };
    const head = `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${b.head.map((c, k) => cell(c, k, true)).join('')}</w:tr>`;
    const rows = b.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, k) => cell(c, k, false)).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblStyle w:val="DocTable"/><w:tblW w:w="${avail}" w:type="dxa"/>${indent ? `<w:tblInd w:w="${indent}" w:type="dxa"/>` : ''}${tableBorders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${widths
      .map((wd) => `<w:gridCol w:w="${wd}"/>`)
      .join('')}</w:tblGrid>${head}${rows}</w:tbl>${para({ spacing: { before: 0, after: 120 } }, '')}`;
  };

  const tocXml = () => {
    const entries = doc.headings.filter((h) => h.level <= 3);
    const begin = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
    const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const items = entries.map((h, k) => {
      const bm = bookmarks.get(h.id);
      const label = `${h.number ? `${h.number} ` : ''}${plainText(h.inlines)}`;
      const link = `<w:hyperlink w:anchor="${bm}" w:history="1">${textRun(label, {})}</w:hyperlink>`;
      return para({ style: `TOC${h.level}` }, (k === 0 ? begin : '') + link + (k === entries.length - 1 ? end : ''));
    });
    if (!items.length) items.push(para({}, begin + end));
    return para({ style: 'TOCHeading' }, textRun(w.contents, {})) + items.join('') + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  };

  // ---- body ----------------------------------------------------------------
  let body = '';
  if (doc.title) {
    const byline = [doc.authors.join(zh ? '、' : ', '), doc.date].filter(Boolean).join(' · ');
    const rule = `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="12" w:color="${theme.color.rule}"/></w:pBdr>`;
    const lastIs = byline ? 'byline' : doc.subtitle ? 'subtitle' : 'title';
    body += para({ style: 'Title', ...(lastIs === 'title' && { bdr: rule }) }, runs(doc.title, {}, document));
    if (doc.subtitle) body += para({ style: 'Subtitle', ...(lastIs === 'subtitle' && { bdr: rule }) }, textRun(doc.subtitle, {}));
    if (byline) body += para({ style: 'Byline', bdr: rule }, textRun(byline, {}));
  }
  const hasToc = JSON.stringify(doc.blocks).includes('"type":"toc"');
  if (doc.toc && !hasToc) body += tocXml();
  body += blocks(doc.blocks, { part: document });

  const footnoteXml = doc.footnotes
    .map((f) => {
      const ctx = { part: footnotesPart };
      let inner = blocks(f.blocks, ctx).replace(/<w:pPr>.*?<\/w:pPr>/g, '');
      const ref = '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>';
      inner = inner.replace(/<w:p>/g, '<w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>').replace('<w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>', `<w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>${ref}`);
      if (!inner) inner = `<w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>${ref}</w:p>`;
      return `<w:footnote w:id="${f.n}">${inner}</w:footnote>`;
    })
    .join('');

  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId5"/><w:pgSz w:w="${pageW}" w:h="${pageH}"/><w:pgMar w:top="${marginTop}" w:right="${marginSide}" w:bottom="${marginBottom}" w:left="${marginSide}" w:header="567" w:footer="567" w:gutter="0"/><w:pgNumType w:start="1"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  const nsAttrs = `xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"`;
  const documentXml = `${XML_HEAD}<w:document ${nsAttrs}><w:body>${body}${sect}</w:body></w:document>`;
  const footnotesXml = `${XML_HEAD}<w:footnotes ${nsAttrs}><w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${footnoteXml}</w:footnotes>`;
  const field = (instr, shown) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const footerXml = `${XML_HEAD}<w:ftr ${nsAttrs}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>${field('PAGE', '1')}<w:r><w:t xml:space="preserve"> / </w:t></w:r>${field('NUMPAGES', '1')}</w:p></w:ftr>`;

  const files = [];
  const types = new Set(media.map((m) => m.type));
  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[
    ...types,
  ]
    .map((t) => `<Default Extension="${t}" ContentType="image/${t}"/>`)
    .join(
      '',
    )}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  files.push({ name: '[Content_Types].xml', data: contentTypes });
  files.push({
    name: '_rels/.rels',
    data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  });
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files.push({
    name: 'docProps/core.xml',
    data: `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(doc.title ? plainText(doc.title) : '')}</dc:title><dc:creator>${x(doc.authors.join(', '))}</dc:creator><dc:language>${x(doc.lang)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
  });
  files.push({
    name: 'docProps/app.xml',
    data: `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Wevir Docs</Application></Properties>`,
  });
  files.push({ name: 'word/document.xml', data: documentXml });
  files.push({
    name: 'word/_rels/document.xml.rels',
    data: document.relsXml([
      { id: 'rId1', type: REL.styles, target: 'styles.xml' },
      { id: 'rId2', type: REL.numbering, target: 'numbering.xml' },
      { id: 'rId3', type: REL.settings, target: 'settings.xml' },
      { id: 'rId4', type: REL.footnotes, target: 'footnotes.xml' },
      { id: 'rId5', type: REL.footer, target: 'footer1.xml' },
    ]),
  });
  files.push({ name: 'word/styles.xml', data: stylesXml(theme, bodyPt, zh, doc.lang, textW) });
  files.push({ name: 'word/numbering.xml', data: numberingXml(nums, zh) });
  files.push({ name: 'word/settings.xml', data: settingsXml(doc.toc || hasToc) });
  files.push({ name: 'word/footnotes.xml', data: footnotesXml });
  if (footnotesPart.rels.length) files.push({ name: 'word/_rels/footnotes.xml.rels', data: footnotesPart.relsXml() });
  files.push({ name: 'word/footer1.xml', data: footerXml });
  for (const m of media) files.push({ name: `word/media/${m.name}`, data: m.data, store: true });
  if (nums.length > 200) warn(`${nums.length} numbered lists; Word handles it, but consider merging lists`);
  return zip(files);
}

function settingsXml(updateFields) {
  return `${XML_HEAD}<w:settings xmlns:w="${NS.w}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="compressPunctuation"/>${
    updateFields ? '<w:updateFields w:val="true"/>' : ''
  }<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
}

function numberingXml(nums, zh) {
  const bulletChars = ['•', '◦', '▪'];
  const fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
  const lvl = (k, ordered, start = 1) => {
    const left = LIST_STEP * (k + 1) + LIST_HANG - LIST_STEP;
    if (ordered) {
      const fmt = zh ? 'decimal' : fmts[k % 3];
      const text = zh && k > 0 ? `%${k + 1})` : `%${k + 1}.`;
      return `<w:lvl w:ilvl="${k}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${LIST_HANG}"/></w:pPr></w:lvl>`;
    }
    return `<w:lvl w:ilvl="${k}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bulletChars[k % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${LIST_HANG}"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial" w:hint="default"/></w:rPr></w:lvl>`;
  };
  const abstract = (id, ordered) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, k) => lvl(k, ordered)).join('')}</w:abstractNum>`;
  const instances = [
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
    ...nums.map(
      (n) =>
        `<w:num w:numId="${n.id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${n.lvl}"><w:startOverride w:val="${n.start}"/></w:lvlOverride></w:num>`,
    ),
  ];
  return `${XML_HEAD}<w:numbering xmlns:w="${NS.w}">${abstract(0, false)}${abstract(1, true)}${instances.join('')}</w:numbering>`;
}

function stylesXml(t, bodyPt, zh, lang, textW) {
  const c = t.color;
  const fonts = (ascii, ea) => `<w:rFonts w:ascii="${x(ascii)}" w:hAnsi="${x(ascii)}" w:eastAsia="${x(ea)}" w:cs="${x(ascii)}"/>`;
  const lineVal = Math.round(240 * t.line);
  const after = twip(bodyPt * 0.7);
  const style = (type, id, name, { basedOn, next, link, pPr = '', rPr = '', extra = '', q = true } = {}) =>
    `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ''}${
      next ? `<w:next w:val="${next}"/>` : ''
    }${link ? `<w:link w:val="${link}"/>` : ''}${q ? '<w:qFormat/>' : ''}${extra}${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`;
  const sz = (pt) => `<w:sz w:val="${half(pt)}"/><w:szCs w:val="${half(pt)}"/>`;
  const heading = (n, pt, before, afterPt) =>
    style('paragraph', `Heading${n}`, `heading ${n}`, {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="${twip(before)}" w:after="${twip(afterPt)}" w:line="${Math.round(240 * 1.2)}" w:lineRule="auto"/><w:outlineLvl w:val="${n - 1}"/>`,
      rPr: `${fonts(t.word.heading, t.word.headingEa)}<w:b/><w:bCs/><w:color w:val="${n === 4 ? c.muted : c.heading}"/>${sz(pt)}`,
    });
  const langTag = zh ? `<w:lang w:val="en-US" w:eastAsia="${x(lang)}"/>` : `<w:lang w:val="${x(lang === 'en' ? 'en-US' : lang)}" w:eastAsia="zh-CN"/>`;
  return `${XML_HEAD}<w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr>${fonts(t.word.body, t.word.bodyEa)}<w:color w:val="${c.text}"/>${sz(bodyPt)}${langTag}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${after}" w:line="${lineVal}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${[
    style('paragraph', 'Normal', 'Normal', { extra: '', pPr: zh ? '<w:jc w:val="both"/>' : '' }),
    heading(1, t.size.h1, 22, 8),
    heading(2, t.size.h2, 16, 6),
    heading(3, t.size.h3, 12, 4),
    heading(4, t.size.h4, 10, 2),
    style('paragraph', 'Title', 'Title', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:spacing w:before="0" w:after="${twip(6)}" w:line="${Math.round(240 * 1.1)}" w:lineRule="auto"/><w:jc w:val="left"/>`,
      rPr: `${fonts(t.word.heading, t.word.headingEa)}<w:b/><w:bCs/><w:color w:val="${c.heading}"/><w:kern w:val="28"/>${sz(t.size.title)}`,
    }),
    style('paragraph', 'Subtitle', 'Subtitle', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:spacing w:before="0" w:after="${twip(4)}"/><w:jc w:val="left"/>`,
      rPr: `<w:color w:val="${c.muted}"/>${sz(t.size.subtitle)}`,
    }),
    style('paragraph', 'Byline', 'Byline', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:spacing w:before="${twip(6)}" w:after="${twip(24)}"/><w:jc w:val="left"/>`,
      rPr: `<w:color w:val="${c.muted}"/>${sz(t.size.small + 1)}`,
    }),
    style('paragraph', 'Quote', 'Quote', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="${c.rule}"/></w:pBdr><w:ind w:left="284" w:right="284"/>`,
      rPr: `<w:color w:val="${c.muted}"/>`,
    }),
    style('paragraph', 'CodeBlock', 'Code Block', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:pBdr><w:top w:val="single" w:sz="4" w:space="5" w:color="${c.rule}"/><w:left w:val="single" w:sz="4" w:space="5" w:color="${c.rule}"/><w:bottom w:val="single" w:sz="4" w:space="5" w:color="${c.rule}"/><w:right w:val="single" w:sz="4" w:space="5" w:color="${c.rule}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${c.codeBg}"/><w:spacing w:before="${twip(4)}" w:after="${twip(12)}" w:line="252" w:lineRule="auto"/><w:ind w:left="115" w:right="115"/><w:jc w:val="left"/>`,
      rPr: `${fonts(t.word.mono, t.word.bodyEa)}${sz(t.size.code)}`,
    }),
    style('paragraph', 'TableText', 'Table Text', {
      basedOn: 'Normal',
      pPr: `<w:spacing w:before="0" w:after="0" w:line="264" w:lineRule="auto"/><w:jc w:val="left"/>`,
      rPr: sz(Math.max(bodyPt - 1, 8.5)),
    }),
    style('paragraph', 'Caption', 'caption', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:spacing w:before="0" w:after="${twip(10)}"/><w:jc w:val="center"/>`,
      rPr: `<w:color w:val="${c.muted}"/>${sz(t.size.small + 0.5)}`,
    }),
    style('paragraph', 'FootnoteText', 'footnote text', {
      basedOn: 'Normal',
      pPr: '<w:spacing w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/>',
      rPr: sz(t.size.small),
    }),
    style('paragraph', 'Footer', 'footer', { basedOn: 'Normal', pPr: '<w:spacing w:after="0"/>', rPr: `<w:color w:val="${c.muted}"/>${sz(t.size.small)}` }),
    style('paragraph', 'TOCHeading', 'TOC Heading', {
      basedOn: 'Normal',
      next: 'Normal',
      pPr: `<w:keepNext/><w:spacing w:before="${twip(12)}" w:after="${twip(8)}"/>`,
      rPr: `${fonts(t.word.heading, t.word.headingEa)}<w:b/><w:bCs/><w:color w:val="${c.heading}"/>${sz(t.size.h2)}`,
    }),
    ...[1, 2, 3].map((n) =>
      style('paragraph', `TOC${n}`, `toc ${n}`, {
        basedOn: 'Normal',
        next: 'Normal',
        pPr: `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${textW}"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="${(n - 1) * 360}"/><w:jc w:val="left"/>`,
        rPr: n === 1 ? '<w:b/><w:bCs/>' : '',
      }),
    ),
    style('character', 'VerbatimChar', 'Verbatim Char', {
      rPr: `${fonts(t.word.mono, t.word.bodyEa)}<w:sz w:val="${half(Math.max(bodyPt - 1, 8))}"/><w:shd w:val="clear" w:color="auto" w:fill="${c.codeBg}"/>`,
    }),
    style('character', 'Hyperlink', 'Hyperlink', { q: false, rPr: `<w:color w:val="${c.accent}"/><w:u w:val="single"/>` }),
    style('character', 'FootnoteReference', 'footnote reference', { q: false, rPr: '<w:vertAlign w:val="superscript"/>' }),
    `<w:style w:type="table" w:styleId="DocTable"><w:name w:val="Doc Table"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${c.rule}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${c.rule}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${c.rule}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${c.rule}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${c.rule}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${c.rule}"/></w:tblBorders><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`,
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>',
  ].join('')}</w:styles>`;
}
