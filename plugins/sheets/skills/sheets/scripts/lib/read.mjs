// Reads an .xlsx file into the same workbook shape the writer uses: values, shared strings, rich text, dates
// (from the cell's number format, in either date system), formulas with their cached values (shared formulas
// expanded), merged ranges, frozen panes, filters, hidden sheets and defined names.
import path from 'node:path/posix';
import { cellKey } from './calc.mjs';
import { displayFormula, parseCell, parseRange, shiftFormula } from './formula.mjs';
import { isDateFormat } from './format.mjs';
import { unzip } from './zip.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text) {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e] ?? m;
    });
}

/** OOXML escapes characters XML cannot hold as _xHHHH_. */
const unescapeOoxml = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/** A small XML parser: elements with local names (prefixes dropped), attributes and text. */
export function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.text += decode(text.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] !== undefined) {
      top.text += m[1];
      continue;
    }
    if (!m[3]) continue;
    const name = m[3].includes(':') ? m[3].slice(m[3].indexOf(':') + 1) : m[3];
    if (m[2]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs = {};
    for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const key = a[1].includes(':') && !a[1].startsWith('xmlns') ? a[1].slice(a[1].indexOf(':') + 1) : a[1];
      attrs[key] = decode(a[2] ?? a[3]);
    }
    const el = { name, attrs, children: [], text: '' };
    top.children.push(el);
    if (!m[5]) stack.push(el);
  }
  return root;
}

/** Text of an XML part: UTF-8 normally, UTF-16 when it starts with a byte-order mark or a wide `<`. */
function xmlText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  if (buf[0] === 0x3c && buf[1] === 0x00) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0x00 && buf[1] === 0x3c) return new TextDecoder('utf-16be').decode(buf);
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}
const xmlOf = (files, name) => parseXml(xmlText(files.get(name)));

const kids = (el, name) => (el?.children ?? []).filter((c) => c.name === name);
const kid = (el, name) => el?.children.find((c) => c.name === name);
/** All text below an element (rich text runs joined), phonetic guides left out. */
function allText(el) {
  if (!el) return '';
  if (el.name === 'rPh' || el.name === 'phoneticPr') return '';
  if (el.name === 't') return el.text;
  return el.children.map(allText).join('');
}

const BUILTIN = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
  22: 'yyyy-mm-dd h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
};
// East Asian built-in date formats (ids 27–36 and 50–58) and Thai ones (71–81) are dates whatever the locale.
for (const id of [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81]) BUILTIN[id] = 'yyyy-mm-dd';

function relsOf(files, partPath) {
  const dir = path.dirname(partPath);
  const relsPath = path.join(dir, '_rels', `${path.basename(partPath)}.rels`);
  const map = new Map();
  if (!files.has(relsPath)) return map;
  for (const r of kids(xmlOf(files, relsPath).children[0], 'Relationship')) {
    const target = r.attrs.Target ?? '';
    const resolved = target.startsWith('/') ? target.slice(1) : path.normalize(path.join(dir, target));
    map.set(r.attrs.Id, { type: r.attrs.Type ?? '', target: resolved, external: r.attrs.TargetMode === 'External' });
  }
  return map;
}

function isoToSerial(text) {
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(t) ? null : t / 86400000 + 25569;
}

/**
 * @param {Buffer} buf an .xlsx (or .xlsm) file
 * @returns {object} workbook: { sheets: [{ name, hidden, cells, maxRow, maxCol, merges, freeze, filter }], names, date1904 }
 */
export function readXlsx(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))
    throw new Error('this is an old binary .xls file (or an encrypted workbook); open it in Excel or Numbers and save it as .xlsx first');
  const files = unzip(buf);
  const rootRels = relsOf(files, '');
  const officeDoc = [...rootRels.values()].find((r) => r.type.endsWith('/officeDocument'));
  const wbPath = officeDoc?.target ?? 'xl/workbook.xml';
  if (!files.has(wbPath)) throw new Error('no workbook inside; is this an .xlsx file?');
  const wb = xmlOf(files, wbPath).children.find((c) => c.name === 'workbook');
  const rels = relsOf(files, wbPath);
  const date1904 = /^(1|true)$/i.test(kid(wb, 'workbookPr')?.attrs.date1904 ?? '');

  const sstRel = [...rels.values()].find((r) => r.type.endsWith('/sharedStrings'));
  const strings = sstRel && files.has(sstRel.target) ? kids(xmlOf(files, sstRel.target).children.find((c) => c.name === 'sst'), 'si').map((si) => unescapeOoxml(allText(si))) : [];

  const stylesRel = [...rels.values()].find((r) => r.type.endsWith('/styles'));
  const formats = [];
  if (stylesRel && files.has(stylesRel.target)) {
    const ss = xmlOf(files, stylesRel.target).children.find((c) => c.name === 'styleSheet');
    const custom = new Map(kids(kid(ss, 'numFmts'), 'numFmt').map((n) => [Number(n.attrs.numFmtId), n.attrs.formatCode]));
    for (const xf of kids(kid(ss, 'cellXfs'), 'xf')) {
      const id = Number(xf.attrs.numFmtId ?? 0);
      formats.push(custom.get(id) ?? BUILTIN[id] ?? 'General');
    }
  }

  const sheetEls = kids(kid(wb, 'sheets'), 'sheet');
  const book = { sheets: [], names: new Map(), date1904, props: {} };
  for (const s of sheetEls) {
    const rel = rels.get(s.attrs.id);
    const sheet = { name: s.attrs.name, hidden: s.attrs.state === 'hidden' || s.attrs.state === 'veryHidden', cells: new Map(), maxRow: 0, maxCol: 0, merges: [], freeze: null, filter: null, kind: 'worksheet' };
    book.sheets.push(sheet);
    if (!rel || !files.has(rel.target)) {
      sheet.kind = rel?.type.endsWith('/chartsheet') ? 'chart' : 'missing';
      continue;
    }
    if (!rel.type.endsWith('/worksheet')) {
      sheet.kind = rel.type.split('/').pop();
      continue;
    }
    readSheet(xmlOf(files, rel.target).children.find((c) => c.name === 'worksheet'), sheet, strings, formats);
  }
  for (const dn of kids(kid(wb, 'definedNames'), 'definedName')) {
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)$/.exec(dn.text.trim());
    if (!m || dn.attrs.name.startsWith('_xlnm.')) continue;
    const sheetName = m[1]?.replace(/''/g, "'") ?? m[2];
    const si = book.sheets.findIndex((sh) => sh.name.toLowerCase() === sheetName.toLowerCase());
    const range = parseRange(m[3].replace(/\$/g, ''));
    if (si >= 0 && range) book.names.set(dn.attrs.name.toLowerCase(), { name: dn.attrs.name, si, range, text: dn.text.trim() });
  }
  return book;
}

function readSheet(ws, sheet, strings, formats) {
  const shared = new Map(); // si → { r, c, f }
  let rowNo = 0;
  for (const row of kids(kid(ws, 'sheetData'), 'row')) {
    rowNo = row.attrs.r ? Number(row.attrs.r) : rowNo + 1;
    let colNo = 0;
    for (const c of kids(row, 'c')) {
      const pos = c.attrs.r ? parseCell(c.attrs.r) : null;
      colNo = pos ? pos.c : colNo + 1;
      const r = pos ? pos.r : rowNo;
      const t = c.attrs.t ?? 'n';
      const numFmt = formats[Number(c.attrs.s ?? 0)] ?? 'General';
      const vEl = kid(c, 'v');
      const fEl = kid(c, 'f');
      const cell = { style: numFmt !== 'General' ? { numFmt } : {} };
      let value = null;
      let type = null;
      if (t === 'inlineStr') {
        value = unescapeOoxml(allText(kid(c, 'is')));
        type = 's';
      } else if (vEl) {
        const text = vEl.text;
        if (t === 's') {
          value = strings[Number(text)] ?? '';
          type = 's';
        } else if (t === 'str') {
          value = unescapeOoxml(text);
          type = 's';
        } else if (t === 'b') {
          value = text.trim() === '1' || /^true$/i.test(text.trim());
          type = 'b';
        } else if (t === 'e') {
          value = text.trim();
          type = 'e';
        } else if (t === 'd') {
          value = isoToSerial(text.trim());
          type = value === null ? 's' : 'd';
          if (value === null) value = text;
        } else if (text.trim() !== '') {
          value = Number(text);
          type = isDateFormat(numFmt) ? 'd' : 'n';
        }
      }
      if (fEl) {
        let f = fEl.text;
        if (fEl.attrs.t === 'shared' && fEl.attrs.si !== undefined) {
          const si = fEl.attrs.si;
          if (f.trim()) shared.set(si, { r, c: colNo, f });
          else if (shared.has(si)) {
            const base = shared.get(si);
            try {
              f = shiftFormula(base.f, r - base.r, colNo - base.c);
            } catch {
              f = base.f;
            }
          }
        }
        if (f.trim() && fEl.attrs.t !== 'dataTable') {
          cell.f = displayFormula(f).slice(1);
          if (fEl.attrs.t === 'array') cell.array = fEl.attrs.ref;
          if (type) cell.result = { t: type === 'd' ? 'n' : type, v: value, ...(type === 'd' && { date: true }) };
        }
      }
      if (cell.f === undefined) {
        if (type === null) {
          if (!c.attrs.s) continue;
          cell.v = null;
          cell.t = 'blank';
        } else {
          cell.v = value;
          cell.t = type;
        }
      }
      sheet.cells.set(cellKey(r, colNo), cell);
      if (cell.t !== 'blank') {
        sheet.maxRow = Math.max(sheet.maxRow, r);
        sheet.maxCol = Math.max(sheet.maxCol, colNo);
      }
    }
  }
  for (const m of kids(kid(ws, 'mergeCells'), 'mergeCell')) {
    const r = parseRange(m.attrs.ref ?? '');
    if (r) sheet.merges.push(r);
  }
  const pane = kid(kid(kid(ws, 'sheetViews'), 'sheetView'), 'pane');
  if (pane && /frozen/i.test(pane.attrs.state ?? '')) sheet.freeze = { r: 1 + Number(pane.attrs.ySplit ?? 0), c: 1 + Number(pane.attrs.xSplit ?? 0) };
  const af = kid(ws, 'autoFilter');
  if (af?.attrs.ref) sheet.filter = parseRange(af.attrs.ref);
  const cols = kids(kid(ws, 'cols'), 'col');
  sheet.hiddenCols = cols.filter((c) => c.attrs.hidden === '1' || c.attrs.hidden === 'true').flatMap((c) => range(Number(c.attrs.min), Number(c.attrs.max)));
}

const range = (a, b) => Array.from({ length: Math.max(0, Math.min(b, a + 200) - a + 1) }, (_, i) => a + i);
