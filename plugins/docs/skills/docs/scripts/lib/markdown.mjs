// A Markdown parser for documents: CommonMark blocks and inlines plus the GitHub extensions a report needs
// (tables, task lists, strikethrough, autolinks, footnotes, callouts), front matter and page breaks.
// No dependencies. The output is a small tree that html.mjs and docx.mjs render.

const RE = {
  blank: /^[ \t]*$/,
  fence: /^( {0,3})(`{3,}|~{3,})(.*)$/,
  atx: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/,
  quote: /^ {0,3}> ?/,
  setext: /^ {0,3}(=+|-+)[ \t]*$/,
  fnDef: /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/,
  refDef: /^ {0,3}\[([^\]^][^\]]*)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/,
  tableDelim: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
  pagebreak: /^ {0,3}(?:\\newpage|\\pagebreak|<!--\s*page-?break\s*-->)[ \t]*$/i,
  toc: /^ {0,3}\[(?:TOC|toc)\][ \t]*$/,
  comment: /^ {0,3}<!--/,
  htmlBlock: /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/,
  callout: /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.*)$/i,
  math: /^ {0,3}\$\$/,
};

/** Inline HTML tags the renderers understand; anything else is kept as literal text. */
const INLINE_TAGS = new Set(['sup', 'sub', 'u', 'mark', 'kbd', 'ins', 'del', 's', 'b', 'i', 'strong', 'em']);
const TAG_NODE = { b: 'strong', strong: 'strong', i: 'em', em: 'em', s: 'del', del: 'del', ins: 'u', u: 'u' };

const leading = (line) => /^ */.exec(line)[0].length;
const isBlank = (line) => RE.blank.test(line);

/** Expands tabs in a line's indentation to 4-column stops. */
function expandIndent(line) {
  const m = /^[ \t]+/.exec(line);
  if (!m || !m[0].includes('\t')) return line;
  let col = 0;
  for (const ch of m[0]) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
  return ' '.repeat(col) + line.slice(m[0].length);
}

function listMarker(line) {
  let m = /^( {0,3})([-*+])( +|\t|$)(.*)$/.exec(line);
  if (m) {
    if (RE.hr.test(line)) return null;
    return { ordered: false, char: m[2], indent: m[1].length, width: 1, spaces: m[3].length, rest: m[4], start: 1 };
  }
  m = /^( {0,3})(\d{1,9})([.)])( +|\t|$)(.*)$/.exec(line);
  if (m) {
    return {
      ordered: true,
      char: m[3],
      indent: m[1].length,
      width: m[2].length + 1,
      spaces: m[4].length,
      rest: m[5],
      start: Number(m[2]),
    };
  }
  return null;
}

/** Whether a line opens a block that ends a paragraph (lazy continuation stops there). */
function startsBlock(line) {
  const fence = RE.fence.exec(line);
  if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) return true;
  if (RE.atx.test(line) || RE.hr.test(line) || RE.quote.test(line)) return true;
  if (RE.pagebreak.test(line) || RE.comment.test(line)) return true;
  const lm = listMarker(line);
  return !!lm && lm.rest.trim() !== '' && (!lm.ordered || lm.start === 1);
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let code = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      code = code === n ? 0 : code || n;
      cur += '`'.repeat(n);
      i += n - 1;
    } else if (c === '|' && !code) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** Parses the YAML-ish front matter we support: `key: value`, quoted strings, booleans, numbers, `[a, b]` lists. */
function parseFrontMatter(text) {
  const meta = {};
  for (const raw of text.split('\n')) {
    const m = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(raw);
    if (!m) continue;
    meta[m[1].toLowerCase()] = parseScalar(m[2].trim());
  }
  return meta;
}

function parseScalar(v) {
  if (v === '') return '';
  if (/^\[.*\]$/.test(v)) {
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => parseScalar(s.trim()))
      .filter((s) => s !== '');
  }
  if (/^"(.*)"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"');
  if (/^'(.*)'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/[ \t]+#.*$/, '');
}

/**
 * Parses a Markdown document.
 * @returns {{ meta: object, blocks: object[], footnotes: { label: string, n: number, blocks: object[] }[], warnings: { line?: number, message: string }[] }}
 */
export function parseMarkdown(source) {
  let text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let meta = {};
  let offset = 0;
  const fm = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  if (fm) {
    meta = parseFrontMatter(fm[1]);
    offset = fm[0].split('\n').length - 1;
    text = text.slice(fm[0].length);
  }
  const ctx = { refs: new Map(), fnDefs: new Map(), fnOrder: [], warnings: [] };
  const lines = text.split('\n').map(expandIndent);
  const blocks = parseBlocks(lines, ctx, offset + 1);
  resolveBlocks(blocks, ctx);
  const footnotes = [];
  for (const label of ctx.fnOrder) {
    const def = ctx.fnDefs.get(label);
    resolveBlocks(def.blocks, ctx);
    footnotes.push({ label, n: footnotes.length + 1, blocks: def.blocks });
  }
  for (const [label, def] of ctx.fnDefs) {
    if (!ctx.fnOrder.includes(label)) ctx.warnings.push({ line: def.line, message: `footnote [^${label}] is never referenced` });
  }
  return { meta, blocks, footnotes, warnings: ctx.warnings };
}

function parseBlocks(lines, ctx, baseLine) {
  const blocks = [];
  let para = null;
  let paraLine = 0;
  const flush = () => {
    if (!para) return;
    const pl = para;
    para = null;
    while (pl.length && RE.refDef.test(pl[0])) {
      const m = RE.refDef.exec(pl.shift());
      const label = normLabel(m[1]);
      if (!ctx.refs.has(label)) ctx.refs.set(label, { href: m[2], title: m[3] ?? m[4] ?? m[5] });
    }
    if (pl.length) blocks.push({ type: 'paragraph', raw: pl.map((l) => l.replace(/^[ \t]+/, '')).join('\n'), line: paraLine });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = baseLine + i;
    if (isBlank(line)) {
      flush();
      i++;
      continue;
    }
    let m;

    // Fenced code.
    m = RE.fence.exec(line);
    if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
      flush();
      const indent = m[1].length;
      const fence = m[2];
      const lang = m[3].trim().split(/\s+/)[0]?.replace(/^\{\.?|\}$/g, '') ?? '';
      const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
      const body = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (close.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        body.push(lines[i].replace(new RegExp(`^ {0,${indent}}`), ''));
        i++;
      }
      if (!closed) ctx.warnings.push({ line: lineNo, message: 'code fence is never closed' });
      blocks.push({ type: 'code', lang, text: body.join('\n'), line: lineNo });
      continue;
    }

    if (RE.pagebreak.test(line)) {
      flush();
      blocks.push({ type: 'pagebreak' });
      i++;
      continue;
    }
    if (RE.toc.test(line)) {
      flush();
      blocks.push({ type: 'toc' });
      i++;
      continue;
    }
    m = RE.atx.exec(line);
    if (m) {
      flush();
      blocks.push({ type: 'heading', level: m[1].length, raw: (m[2] ?? '').trim(), line: lineNo });
      i++;
      continue;
    }
    m = RE.setext.exec(line);
    if (para && m && !(m[1][0] === '-' && para.length === 0)) {
      const raw = para.map((l) => l.trim()).join('\n');
      para = null;
      blocks.push({ type: 'heading', level: m[1][0] === '=' ? 1 : 2, raw, line: paraLine });
      i++;
      continue;
    }
    if (RE.hr.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (RE.math.test(line)) {
      ctx.warnings.push({ line: lineNo, message: 'math ($$ … $$) is not supported; it is kept as plain text' });
    }
    if (RE.comment.test(line)) {
      flush();
      while (i < lines.length && !lines[i].includes('-->')) i++;
      i++;
      continue;
    }

    // Block quote or callout.
    if (RE.quote.test(line)) {
      flush();
      const inner = [];
      while (i < lines.length) {
        const l = lines[i];
        if (RE.quote.test(l)) inner.push(l.replace(RE.quote, ''));
        else if (!isBlank(l) && inner.length && !isBlank(inner[inner.length - 1]) && !startsBlock(l)) inner.push(l);
        else break;
        i++;
      }
      const cm = RE.callout.exec(inner[0]?.trim() ?? '');
      if (cm) {
        blocks.push({
          type: 'callout',
          kind: cm[1].toLowerCase(),
          titleRaw: cm[2].trim(),
          blocks: parseBlocks(inner.slice(1), ctx, lineNo + 1),
          line: lineNo,
        });
      } else blocks.push({ type: 'blockquote', blocks: parseBlocks(inner, ctx, lineNo) });
      continue;
    }

    // Lists.
    const lm = listMarker(line);
    if (lm && (!para || (lm.rest.trim() !== '' && (!lm.ordered || lm.start === 1)))) {
      flush();
      const list = { type: 'list', ordered: lm.ordered, start: lm.start, tight: true, items: [] };
      while (i < lines.length) {
        const mm = listMarker(lines[i]);
        if (!mm || mm.ordered !== lm.ordered || mm.char !== lm.char) break;
        const wide = mm.spaces >= 5 || mm.rest === '';
        const contentIndent = mm.indent + mm.width + (wide ? 1 : mm.spaces);
        const itemLines = [wide && mm.rest !== '' ? ' '.repeat(mm.spaces - 1) + mm.rest : mm.rest];
        const itemLine = baseLine + i;
        i++;
        let lastBlank = false;
        while (i < lines.length) {
          const l = lines[i];
          if (isBlank(l)) {
            itemLines.push('');
            lastBlank = true;
            i++;
            continue;
          }
          if (leading(l) >= contentIndent) {
            itemLines.push(l.slice(contentIndent));
            lastBlank = false;
            i++;
            continue;
          }
          if (!lastBlank && !startsBlock(l) && !listMarker(l)) {
            itemLines.push(l.trim());
            i++;
            continue;
          }
          break;
        }
        let trailing = 0;
        while (itemLines.length > 1 && itemLines[itemLines.length - 1] === '') {
          itemLines.pop();
          trailing++;
        }
        const item = { task: null, blocks: [] };
        const tm = /^\[([ xX])\][ \t]+/.exec(itemLines[0]);
        if (tm) {
          item.task = tm[1] !== ' ';
          itemLines[0] = itemLines[0].slice(tm[0].length);
        }
        item.blocks = parseBlocks(itemLines, ctx, itemLine);
        const innerBlank = itemLines.some((l, k) => l === '' && k > 0 && k < itemLines.length - 1);
        if (innerBlank && item.blocks.filter((b) => b.type !== 'list').length > 1) list.tight = false;
        list.items.push(item);
        const next = i < lines.length ? listMarker(lines[i]) : null;
        const continues = next && next.ordered === lm.ordered && next.char === lm.char;
        if (trailing && continues) list.tight = false;
        if (!continues) break;
      }
      blocks.push(list);
      continue;
    }

    // Footnote definition.
    m = RE.fnDef.exec(line);
    if (m && !para) {
      const label = m[1].toLowerCase();
      const body = [m[2]];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) {
          if (i + 1 < lines.length && leading(lines[i + 1]) >= 4) {
            body.push('');
            i++;
            continue;
          }
          break;
        }
        if (leading(l) >= 4) body.push(l.slice(4));
        else if (!isBlank(body[body.length - 1]) && !startsBlock(l) && !RE.fnDef.test(l)) body.push(l.trim());
        else break;
        i++;
      }
      if (ctx.fnDefs.has(label)) ctx.warnings.push({ line: lineNo, message: `footnote [^${m[1]}] is defined twice` });
      else ctx.fnDefs.set(label, { blocks: parseBlocks(body, ctx, lineNo), line: lineNo });
      continue;
    }

    // Table: a header row followed by a delimiter row with the same number of cells.
    if (line.includes('|') && i + 1 < lines.length && RE.tableDelim.test(lines[i + 1])) {
      const head = splitRow(line);
      const delim = splitRow(lines[i + 1]);
      if (head.length === delim.length) {
        flush();
        const align = delim.map((c) =>
          c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null,
        );
        i += 2;
        const rows = [];
        while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
          const cells = splitRow(lines[i]);
          rows.push(head.map((_, k) => cells[k] ?? ''));
          i++;
        }
        blocks.push({ type: 'table', align, head, rows, line: lineNo });
        continue;
      }
    }

    // Raw HTML block (not supported: kept as text so nothing is lost).
    m = RE.htmlBlock.exec(line);
    if (m && !para && !INLINE_TAGS.has(m[1].toLowerCase()) && m[1].toLowerCase() !== 'br') {
      const raw = [];
      while (i < lines.length && !isBlank(lines[i])) raw.push(lines[i++]);
      ctx.warnings.push({ line: lineNo, message: `raw HTML <${m[1]}> is not supported; it is kept as plain text` });
      blocks.push({ type: 'paragraph', raw: raw.join('\n').replace(/<[^>]+>/g, ''), line: lineNo });
      continue;
    }

    // Indented code (not inside a paragraph).
    if (!para && leading(line) >= 4) {
      const body = [];
      while (i < lines.length && (isBlank(lines[i]) || leading(lines[i]) >= 4)) body.push(lines[i++].slice(4));
      while (body.length && isBlank(body[body.length - 1])) body.pop();
      blocks.push({ type: 'code', lang: '', text: body.join('\n'), line: lineNo });
      continue;
    }

    if (!para) {
      para = [];
      paraLine = lineNo;
    }
    para.push(line);
    i++;
  }
  flush();
  return blocks;
}

const normLabel = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Second pass, once every link reference and footnote is known: inline content for every block. */
function resolveBlocks(blocks, ctx) {
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.type === 'paragraph') {
      b.inlines = parseInline(b.raw, ctx, b.line);
      const visible = b.inlines.filter((n) => !(n.t === 'text' && !n.v.trim()));
      if (visible.length === 1 && visible[0].t === 'image') blocks[k] = { type: 'figure', image: visible[0], line: b.line };
    } else if (b.type === 'heading') b.inlines = parseInline(b.raw, ctx, b.line);
    else if (b.type === 'table') {
      b.head = b.head.map((c) => parseInline(c, ctx, b.line));
      b.rows = b.rows.map((r) => r.map((c) => parseInline(c, ctx, b.line)));
    } else if (b.type === 'callout') {
      b.title = b.titleRaw ? parseInline(b.titleRaw, ctx, b.line) : null;
      resolveBlocks(b.blocks, ctx);
    } else if (b.type === 'blockquote') resolveBlocks(b.blocks, ctx);
    else if (b.type === 'list') for (const item of b.items) resolveBlocks(item.blocks, ctx);
  }
}

const isWS = (ch) => !ch || /\s/u.test(ch);
const isPunct = (ch) => !!ch && /[\p{P}\p{S}]/u.test(ch);
export const isCJK = (ch) =>
  !!ch && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u.test(ch);
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

/** Parses inline Markdown into nodes: text, strong, em, del, u, mark, sup, sub, kbd, code, link, image, br, fnref. */
export function parseInline(text, ctx, line) {
  const nodes = [];
  const delims = [];
  let buf = '';
  const flushText = () => {
    if (buf) nodes.push({ t: 'text', v: buf });
    buf = '';
  };
  const lastChar = () => {
    if (buf) return buf[buf.length - 1];
    for (let k = nodes.length - 1; k >= 0; k--) {
      const n = nodes[k];
      if (n.t === 'text' && n.v) return n.v[n.v.length - 1];
      if (n.t !== 'text') return 'a';
    }
    return '';
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === '\\') {
      const nx = text[i + 1];
      if (nx === '\n') {
        flushText();
        nodes.push({ t: 'br' });
        i += 2;
        while (text[i] === ' ' || text[i] === '\t') i++;
        continue;
      }
      if (nx && ASCII_PUNCT.test(nx)) {
        buf += nx;
        i += 2;
        continue;
      }
      buf += c;
      i++;
      continue;
    }

    if (c === '`') {
      let n = 1;
      while (text[i + n] === '`') n++;
      const run = '`'.repeat(n);
      let j = i + n;
      let found = -1;
      while ((j = text.indexOf(run, j)) !== -1) {
        if (text[j + n] !== '`' && text[j - 1] !== '`') {
          found = j;
          break;
        }
        while (text[j] === '`') j++;
      }
      if (found === -1) {
        buf += run;
        i += n;
        continue;
      }
      let code = text.slice(i + n, found).replace(/\n/g, ' ');
      if (/^ .* $/.test(code) && code.trim()) code = code.slice(1, -1);
      flushText();
      nodes.push({ t: 'code', v: code });
      i = found + n;
      continue;
    }

    if (c === '\n') {
      const hard = / {2,}$/.test(buf);
      buf = buf.replace(/[ \t]+$/, '');
      let j = i + 1;
      while (text[j] === ' ' || text[j] === '\t') j++;
      if (hard) {
        flushText();
        nodes.push({ t: 'br' });
      } else if (!(isCJK(lastChar()) && isCJK(text[j]))) buf += ' ';
      i = j;
      continue;
    }

    if (c === '!' && text[i + 1] === '[') {
      const r = parseLinkLike(text, i + 1, ctx, true, line);
      if (r) {
        flushText();
        nodes.push(r.node);
        i = r.end;
        continue;
      }
    }

    if (c === '[') {
      const fn = /^\[\^([^\]\s]+)\]/.exec(text.slice(i));
      if (fn) {
        const label = fn[1].toLowerCase();
        if (ctx.fnDefs.has(label)) {
          if (!ctx.fnOrder.includes(label)) ctx.fnOrder.push(label);
          flushText();
          nodes.push({ t: 'fnref', label, n: ctx.fnOrder.indexOf(label) + 1 });
          i += fn[0].length;
          continue;
        }
        ctx.warnings.push({ line, message: `footnote [^${fn[1]}] has no definition` });
      }
      const r = parseLinkLike(text, i, ctx, false, line);
      if (r) {
        flushText();
        nodes.push(r.node);
        i = r.end;
        continue;
      }
    }

    if (c === '<') {
      const rest = text.slice(i);
      let m = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(rest);
      if (m) {
        flushText();
        nodes.push({ t: 'link', href: m[1], c: [{ t: 'text', v: m[1] }] });
        i += m[0].length;
        continue;
      }
      m = /^<([\w.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)+)>/.exec(rest);
      if (m) {
        flushText();
        nodes.push({ t: 'link', href: `mailto:${m[1]}`, c: [{ t: 'text', v: m[1] }] });
        i += m[0].length;
        continue;
      }
      m = /^<br\s*\/?>/i.exec(rest);
      if (m) {
        flushText();
        nodes.push({ t: 'br' });
        i += m[0].length;
        continue;
      }
      m = /^<([a-z]+)>/i.exec(rest);
      if (m && INLINE_TAGS.has(m[1].toLowerCase())) {
        const tag = m[1].toLowerCase();
        const close = rest.toLowerCase().indexOf(`</${tag}>`, m[0].length);
        if (close !== -1) {
          flushText();
          nodes.push({ t: TAG_NODE[tag] ?? tag, c: parseInline(rest.slice(m[0].length, close), ctx, line) });
          i += close + tag.length + 3;
          continue;
        }
      }
      m = /^<a\s+href="([^"]*)"[^>]*>/i.exec(rest);
      if (m) {
        const close = rest.toLowerCase().indexOf('</a>', m[0].length);
        if (close !== -1) {
          flushText();
          nodes.push({ t: 'link', href: m[1], c: parseInline(rest.slice(m[0].length, close), ctx, line) });
          i += close + 4;
          continue;
        }
      }
      m = /^<\/?[A-Za-z][^>]*>/.exec(rest);
      if (m) ctx.warnings.push({ line, message: `inline HTML ${m[0]} is not supported; it is kept as text` });
    }

    if ((c === 'h' || c === 'w') && !/[\p{L}\p{N}]/u.test(lastChar() ?? '')) {
      const m = /^(?:https?:\/\/|www\.)[^\s<>"'`]*/i.exec(text.slice(i));
      if (m && m[0].length > 7) {
        let url = m[0];
        url = url.replace(/[?!.,:;*_~'"。，、；：！？）】」』]+$/u, '');
        while (url.endsWith(')') && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) url = url.slice(0, -1);
        flushText();
        nodes.push({ t: 'link', href: url.startsWith('www.') ? `https://${url}` : url, c: [{ t: 'text', v: url }] });
        i += url.length;
        continue;
      }
    }

    if (c === '*' || c === '_' || c === '~') {
      let n = 1;
      while (text[i + n] === c) n++;
      const prev = i > 0 ? text[i - 1] : '';
      const next = text[i + n] ?? '';
      if (c === '~' && n !== 2) {
        buf += c.repeat(n);
        i += n;
        continue;
      }
      const left = !isWS(next) && (!isPunct(next) || isWS(prev) || isPunct(prev) || isCJK(prev));
      const right = !isWS(prev) && (!isPunct(prev) || isWS(next) || isPunct(next) || isCJK(next));
      let canOpen = left;
      let canClose = right;
      if (c === '_') {
        canOpen = left && (!right || isPunct(prev));
        canClose = right && (!left || isPunct(next));
      }
      flushText();
      const node = { t: 'text', v: c.repeat(n) };
      nodes.push(node);
      delims.push({ node, ch: c, count: n, orig: n, canOpen, canClose });
      i += n;
      continue;
    }

    buf += c;
    i++;
  }
  flushText();
  processEmphasis(nodes, delims);
  return tidy(nodes);
}

function processEmphasis(nodes, delims) {
  for (let ci = 0; ci < delims.length; ci++) {
    const closer = delims[ci];
    if (!closer.canClose || closer.count === 0) continue;
    for (let oi = ci - 1; oi >= 0; oi--) {
      const opener = delims[oi];
      if (opener.ch !== closer.ch || !opener.canOpen || opener.count === 0) continue;
      const ch = closer.ch;
      if (
        ch !== '~' &&
        (opener.canClose || closer.canOpen) &&
        (opener.orig + closer.orig) % 3 === 0 &&
        !(opener.orig % 3 === 0 && closer.orig % 3 === 0)
      )
        continue;
      const use = ch === '~' ? 2 : opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      const start = nodes.indexOf(opener.node);
      const end = nodes.indexOf(closer.node);
      if (start === -1 || end === -1) continue;
      const inner = nodes.splice(start + 1, end - start - 1);
      nodes.splice(start + 1, 0, { t: ch === '~' ? 'del' : use === 2 ? 'strong' : 'em', c: tidy(inner) });
      opener.count -= use;
      closer.count -= use;
      opener.node.v = opener.node.v.slice(use);
      closer.node.v = closer.node.v.slice(use);
      for (let k = oi + 1; k < ci; k++) delims[k].count = 0;
      if (closer.count > 0) ci--;
      break;
    }
  }
}

function tidy(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.t === 'text') {
      if (!n.v) continue;
      const last = out[out.length - 1];
      if (last?.t === 'text') last.v += n.v;
      else out.push({ t: 'text', v: n.v });
    } else out.push(n);
  }
  return out;
}

/** `[text](dest "title")`, `[text][ref]`, `[text][]`, `[ref]` and the `!` image forms, with `{width=60%}` after an image. */
function parseLinkLike(text, at, ctx, image, line) {
  let depth = 0;
  let j = at;
  for (; j < text.length; j++) {
    const ch = text[j];
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '`') {
      let n = 1;
      while (text[j + n] === '`') n++;
      const close = text.indexOf('`'.repeat(n), j + n);
      if (close !== -1) j = close + n - 1;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) break;
  }
  if (j >= text.length) return null;
  const label = text.slice(at + 1, j);
  let end = j + 1;
  let href;
  let title;
  if (text[end] === '(') {
    let k = end + 1;
    while (text[k] === ' ' || text[k] === '\n') k++;
    if (text[k] === '<') {
      const close = text.indexOf('>', k);
      if (close === -1) return null;
      href = text.slice(k + 1, close);
      k = close + 1;
    } else {
      let p = 0;
      const s = k;
      for (; k < text.length; k++) {
        const ch = text[k];
        if (ch === '\\') {
          k++;
          continue;
        }
        if (/\s/.test(ch)) break;
        if (ch === '(') p++;
        else if (ch === ')') {
          if (p === 0) break;
          p--;
        }
      }
      href = text.slice(s, k);
    }
    while (text[k] === ' ' || text[k] === '\n') k++;
    const tq = /^(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))/.exec(text.slice(k));
    if (tq) {
      title = tq[1] ?? tq[2] ?? tq[3];
      k += tq[0].length;
      while (text[k] === ' ' || text[k] === '\n') k++;
    }
    if (text[k] !== ')') return null;
    end = k + 1;
  } else {
    let ref = label;
    const rm = /^\[([^\]]*)\]/.exec(text.slice(end));
    if (rm) {
      if (rm[1].trim()) ref = rm[1];
      end += rm[0].length;
    }
    const def = ctx.refs.get(normLabel(ref));
    if (!def) {
      if (rm) ctx.warnings.push({ line, message: `link reference [${ref}] has no definition` });
      return null;
    }
    href = def.href;
    title = def.title;
  }
  href = href.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  if (image) {
    const node = { t: 'image', src: href, alt: label.replace(/[*_`]/g, ''), title };
    const attrs = /^\{([^}\n]*)\}/.exec(text.slice(end));
    if (attrs) {
      const w = /width\s*=\s*"?(\d+(?:\.\d+)?)(%|px|cm|mm|in)?"?/.exec(attrs[1]);
      if (w) node.width = { value: Number(w[1]), unit: w[2] ?? 'px' };
      end += attrs[0].length;
    }
    return { node, end };
  }
  return { node: { t: 'link', href, title, c: parseInline(label, ctx, line) }, end };
}

/** Plain text of inline nodes (for slugs, alt text and the table of contents). */
export function plainText(nodes) {
  let s = '';
  for (const n of nodes ?? []) {
    if (n.t === 'text' || n.t === 'code') s += n.v;
    else if (n.t === 'br') s += ' ';
    else if (n.t === 'image') s += n.alt;
    else if (n.c) s += plainText(n.c);
  }
  return s;
}

export function slugify(text, used) {
  let base =
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

/**
 * Prepares a parsed document for rendering: picks the title (front matter, else a leading `#` heading),
 * promotes the headings when the body has no level 1, numbers them when asked, and gives each an id.
 */
export function prepare(doc, overrides = {}) {
  const meta = { ...doc.meta, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) };
  let blocks = doc.blocks;
  let title = typeof meta.title === 'string' && meta.title ? parseInline(meta.title, { refs: new Map(), fnDefs: new Map(), fnOrder: [], warnings: [] }) : null;
  if (!title && blocks[0]?.type === 'heading' && blocks[0].level === 1) {
    title = blocks[0].inlines;
    blocks = blocks.slice(1);
  }
  const headings = [];
  const walk = (bs, fn) => {
    for (const b of bs) {
      fn(b);
      if (b.blocks) walk(b.blocks, fn);
      if (b.items) for (const it of b.items) walk(it.blocks, fn);
    }
  };
  const top = blocks.filter((b) => b.type === 'heading');
  const shift = top.length && !top.some((b) => b.level === 1) ? Math.min(...top.map((b) => b.level)) - 1 : 0;
  const used = new Set();
  const counters = [0, 0, 0, 0, 0, 0];
  for (const b of blocks) {
    if (b.type !== 'heading') continue;
    const level = Math.max(1, b.level - shift);
    const id = slugify(plainText(b.inlines), used);
    let number = '';
    if (meta.numbered && level <= 3) {
      counters[level - 1]++;
      for (let k = level; k < counters.length; k++) counters[k] = 0;
      number = counters.slice(0, level).join('.') + (level === 1 ? '.' : '');
    }
    Object.assign(b, { level, id, number });
    headings.push(b);
  }
  walk(blocks, (b) => {
    if (b.type === 'heading' && !b.id) Object.assign(b, { id: slugify(plainText(b.inlines), used), number: '' });
  });
  const lang = String(meta.lang ?? (/[\p{Script=Han}]/u.test(JSON.stringify(doc.blocks).slice(0, 20000)) ? 'zh-CN' : 'en'));
  const page = String(meta.page ?? (/^en-US$/i.test(lang) ? 'Letter' : 'A4'));
  return {
    ...doc,
    meta,
    blocks,
    title,
    headings,
    lang,
    page: /^letter$/i.test(page) ? 'Letter' : 'A4',
    theme: ['modern', 'classic', 'memo'].includes(meta.theme) ? meta.theme : 'modern',
    toc: !!meta.toc,
    authors: Array.isArray(meta.author) ? meta.author.map(String) : meta.author ? [String(meta.author)] : [],
    date: meta.date !== undefined ? String(meta.date) : '',
    subtitle: meta.subtitle ? String(meta.subtitle) : '',
  };
}
