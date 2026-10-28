// Turns a workbook description (JSON) or a CSV file into the in-memory workbook the writer, the calculator and
// the checks share: sheets of cells keyed by position, with styles, column widths, panes, filters and rules.
import { cellKey } from './calc.mjs';
import { parseCsv } from './csv.mjs';
import { colName, MAX_COL, MAX_ROW, parseCell, parseRange, rangeName, sheetPrefix } from './formula.mjs';
import { formatValue, isDateFormat, looksLikeDate, parseDateText, parseNumberText } from './format.mjs';

export const TYPES = ['text', 'number', 'integer', 'currency', 'percent', 'date', 'datetime', 'time', 'boolean'];
const BOOK_KEYS = ['$schema', 'title', 'author', 'subject', 'lang', 'font', 'headerStyle', 'names', 'sheets'];
const SHEET_KEYS = ['name', 'title', 'note', 'columns', 'rows', 'header', 'headerStyle', 'totals', 'freeze', 'filter', 'banded', 'merge', 'conditional', 'validation', 'cells', 'widths', 'tabColor'];
const COLUMN_KEYS = ['header', 'key', 'type', 'format', 'decimals', 'symbol', 'width', 'wrap', 'align', 'formula', 'total', 'hidden', 'list', 'bold', 'color', 'fill'];
const CELL_KEYS = ['value', 'formula', 'type', 'format', 'bold', 'italic', 'color', 'fill', 'align', 'wrap', 'size', 'border'];
const TOTALS = { sum: 'SUM', average: 'AVERAGE', count: 'COUNT', counta: 'COUNTA', min: 'MIN', max: 'MAX', median: 'MEDIAN' };
export const STYLE_PRESETS = {
  good: { fill: '#C6EFCE', color: '#006100' },
  bad: { fill: '#FFC7CE', color: '#9C0006' },
  neutral: { fill: '#FFEB9C', color: '#9C5700' },
  bold: { bold: true },
};
const DEFAULT_HEADER = { bold: true, fill: 'E8EEF4', color: '1F2933', border: 'header' };

const CJK = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
export const isZh = (lang) => /^zh/i.test(lang ?? '');

/** Display width of text in Excel column units: CJK and full-width characters count two. */
export function textWidth(text) {
  let w = 0;
  for (const line of String(text).split('\n')) {
    let lw = 0;
    for (const ch of line) lw += CJK.test(ch) || ch.codePointAt(0) > 0xffff ? 2 : /[A-Z@%&MW]/.test(ch) ? 1.2 : 1;
    w = Math.max(w, lw);
  }
  return w;
}

function defaultFormat(type, col, lang) {
  const decimals = col.decimals;
  const dec = (n) => (n > 0 ? `.${'0'.repeat(n)}` : '');
  switch (type) {
    case 'text':
      return '@';
    case 'integer':
      return '#,##0';
    case 'number':
      return `#,##0${dec(decimals ?? 2)}`;
    case 'currency': {
      const symbol = col.symbol ?? (isZh(lang) ? '¥' : '$');
      return `"${symbol}"#,##0${dec(decimals ?? 2)}`;
    }
    case 'percent':
      return `0${dec(decimals ?? 1)}%`;
    case 'date':
      return 'yyyy-mm-dd';
    case 'datetime':
      return 'yyyy-mm-dd hh:mm';
    case 'time':
      return 'hh:mm';
    default:
      return undefined;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Converts one value for a column type. Returns the cell parts and, when the value had to be read out of
 * text or could not be used, a problem to report.
 */
function coerce(value, type) {
  if (value === null || value === undefined || value === '') return { empty: true };
  if (typeof value === 'number' && !Number.isFinite(value)) return { problem: ['error', `${value} is not a number Excel can store`] };
  switch (type) {
    case 'text':
      return { v: typeof value === 'string' ? value : String(value), t: 's' };
    case 'boolean':
      if (typeof value === 'boolean') return { v: value, t: 'b' };
      if (/^(true|false|yes|no|是|否)$/i.test(String(value))) return { v: /^(true|yes|是)$/i.test(String(value)), t: 'b' };
      return { v: String(value), t: 's', problem: ['warning', `"${value}" in a boolean column is not true or false`] };
    case 'date':
    case 'datetime':
    case 'time': {
      if (typeof value === 'number') return { v: value, t: 'd' };
      const p = parseDateText(String(value));
      if (p) return { v: type === 'date' ? Math.floor(p.serial) : p.serial, t: 'd', ...(type === 'date' && p.kind === 'datetime' && { problem: ['note', `time of day in "${value}" is dropped by the date type; use datetime to keep it`] }) };
      return {
        v: String(value),
        t: 's',
        problem: ['warning', looksLikeDate(value) ? `"${value}" is ambiguous or not a date Excel reads; write it as YYYY-MM-DD` : `"${value}" in a ${type} column is not a ${type}`],
      };
    }
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent': {
      if (typeof value === 'number') {
        if (type === 'percent' && Math.abs(value) > 1.5 && Number.isInteger(value))
          return { v: value, t: 'n', problem: ['warning', `${value} in a percent column shows as ${value * 100}%; percents are fractions (0.15 for 15%)`] };
        return { v: value, t: 'n' };
      }
      if (typeof value === 'boolean') return { v: value, t: 'b', problem: ['warning', `${value} in a ${type} column`] };
      const n = parseNumberText(value);
      if (n) return { v: n.value, t: 'n' };
      return { v: String(value), t: 's', problem: ['warning', `text "${value}" in a ${type} column; it will not add up`] };
    }
    default: {
      // No declared type: keep what JSON says.
      if (typeof value === 'number') return { v: value, t: 'n' };
      if (typeof value === 'boolean') return { v: value, t: 'b' };
      return { v: String(value), t: 's' };
    }
  }
}

/** Picks a type for a column without one, from its values; strings that all read as dates or numbers convert. */
function inferType(values) {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'string' && v.startsWith('=')) && !isPlainObject(v));
  if (!present.length) return null;
  if (present.every((v) => typeof v === 'boolean')) return 'boolean';
  if (present.every((v) => typeof v === 'number')) return null;
  const strings = present.filter((v) => typeof v === 'string');
  if (strings.length !== present.length) return null;
  const dates = strings.map((s) => parseDateText(s));
  if (dates.every(Boolean)) {
    const kinds = new Set(dates.map((d) => d.kind));
    return kinds.has('datetime') ? 'datetime' : kinds.has('time') && kinds.size === 1 ? 'time' : kinds.has('time') ? null : 'date';
  }
  const numbers = strings.map((s) => parseNumberText(s));
  if (numbers.every(Boolean)) {
    const kinds = new Set(numbers.map((n) => n.kind));
    if (kinds.size === 1 && kinds.has('percent')) return 'percent';
    if (kinds.has('currency') && !kinds.has('percent')) return 'currency';
    if (kinds.size === 1) return numbers.every((n) => Number.isInteger(n.value)) && strings.some((s) => s.includes(',')) ? 'integer' : 'number';
  }
  return null;
}

function normalizeColor(color, problems, where) {
  if (color === undefined) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color));
  if (!m) {
    problems.push({ level: 'warning', where, message: `color ${JSON.stringify(color)} is not #RRGGBB; ignored` });
    return undefined;
  }
  return m[1].toUpperCase();
}

function styleFrom(src, problems, where) {
  const style = {};
  if (!src) return style;
  if (src.bold !== undefined) style.bold = !!src.bold;
  if (src.italic !== undefined) style.italic = !!src.italic;
  if (src.size !== undefined) style.size = Number(src.size);
  const color = normalizeColor(src.color, problems, where);
  if (color) style.color = color;
  const fill = normalizeColor(src.fill, problems, where);
  if (fill) style.fill = fill;
  if (src.align !== undefined) {
    if (['left', 'center', 'right'].includes(src.align)) style.align = src.align;
    else problems.push({ level: 'warning', where, message: `align must be left, center or right` });
  }
  if (src.wrap) style.wrap = true;
  if (src.border !== undefined) {
    if (['top', 'bottom', 'all', 'header', 'none'].includes(src.border)) style.border = src.border;
    else problems.push({ level: 'warning', where, message: 'border must be top, bottom, all or none' });
  }
  return style;
}

function unknownKeys(obj, allowed, where, problems) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      const near = allowed.find((a) => distance(a.toLowerCase(), k.toLowerCase()) <= Math.min(2, Math.floor(a.length / 3)));
      problems.push({ level: 'warning', where, message: `unknown key "${k}" ignored${near ? `; did you mean "${near}"?` : ''}` });
    }
  }
}

/** Edit distance, for suggesting the key a typo meant. */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = row;
  }
  return prev[b.length];
}

const SHEET_NAME_BAD = /[:\\/?*[\]]/;

function checkSheetName(name, seen, where, problems) {
  if (typeof name !== 'string' || !name.trim()) return problems.push({ level: 'error', where, message: 'every sheet needs a name' });
  if (name.length > 31) problems.push({ level: 'error', where, message: `sheet name "${name}" is longer than 31 characters` });
  if (SHEET_NAME_BAD.test(name)) problems.push({ level: 'error', where, message: `sheet name "${name}" contains one of : \\ / ? * [ ]` });
  if (/^'|'$/.test(name)) problems.push({ level: 'error', where, message: `sheet name "${name}" starts or ends with an apostrophe` });
  if (name.toLowerCase() === 'history') problems.push({ level: 'error', where, message: '"History" is reserved by Excel' });
  if (seen.has(name.toLowerCase())) problems.push({ level: 'error', where, message: `two sheets are named "${name}"` });
  seen.add(name.toLowerCase());
}

/**
 * Expands the placeholders of a formula written in a workbook description:
 * {row} {prev} {first} {last} {col}, {key} (a column letter), {key:data} (that column's data cells),
 * and the same with a sheet: {Sheet!key}, {Sheet!key:data}, {Sheet!first}, {Sheet!last}.
 */
function expand(formula, ctx, layouts, problems, where) {
  let text = String(formula).trim();
  if (text.startsWith('=')) text = text.slice(1);
  // Placeholders sit outside quoted text only.
  const parts = text.split(/("(?:[^"]|"")*")/);
  const out = parts.map((part, i) => {
    if (i % 2) return part;
    return part.replace(/\{([^{}]+)\}/g, (all, inner) => {
      if (/^[\d.,;\s"-]+$/.test(inner) || /^(TRUE|FALSE)$/i.test(inner)) return all; // an array constant
      const m = /^(?:(.+)!)?([^:!]+?)(?::(data))?$/.exec(inner.trim());
      if (!m) return bad(all);
      const layout = m[1] ? layouts.get(m[1].toLowerCase()) : ctx.layout;
      if (!layout) return bad(all, m[1] ? `no sheet named "${m[1]}"` : undefined);
      const prefix = m[1] ? sheetPrefix(layout.name) : '';
      const name = m[2];
      if (!m[3]) {
        if (name === 'row' && !m[1] && ctx.row) return String(ctx.row);
        if (name === 'prev' && !m[1] && ctx.row) return String(ctx.row - 1);
        if (name === 'col' && !m[1] && ctx.col) return colName(ctx.col);
        if (name === 'first') return String(layout.first);
        if (name === 'last') return String(layout.last);
      }
      const c = layout.keys.get(name.toLowerCase());
      if (!c) return bad(all, `no column with key or header "${name}"${m[1] ? ` on ${m[1]}` : ''}`);
      if (m[3]) return `${prefix}${colName(c)}${layout.first}:${colName(c)}${Math.max(layout.last, layout.first)}`;
      return `${prefix}${colName(c)}`;
    });
  });
  return out.join('');

  function bad(all, why) {
    problems.push({ level: 'error', where, message: `placeholder ${all} in a formula: ${why ?? 'not understood'}` });
    return '#REF!';
  }
}

/** Box of a "column" or "range" option, for rules that apply to cells. */
function targetRange(rule, layout, problems, where) {
  if (rule.range) {
    const r = parseRange(String(rule.range).replace(/\$/g, ''));
    if (!r) problems.push({ level: 'error', where, message: `range "${rule.range}" is not a cell range like C2:C40` });
    return r;
  }
  if (rule.column !== undefined) {
    const c = layout.keys.get(String(rule.column).toLowerCase());
    if (!c) {
      problems.push({ level: 'error', where, message: `no column with key or header "${rule.column}"` });
      return null;
    }
    if (layout.last < layout.first) return null;
    return { r1: layout.first, c1: c, r2: layout.last, c2: c };
  }
  problems.push({ level: 'error', where, message: 'needs "column" or "range"' });
  return null;
}

const CF_OPERATORS = { '<': 'lessThan', '<=': 'lessThanOrEqual', '>': 'greaterThan', '>=': 'greaterThanOrEqual', '=': 'equal', '<>': 'notEqual', '!=': 'notEqual', between: 'between', notBetween: 'notBetween' };

function conditionalRule(rule, layout, layouts, problems, where) {
  if (!isPlainObject(rule)) {
    problems.push({ level: 'error', where, message: 'each conditional rule is an object' });
    return null;
  }
  unknownKeys(rule, ['column', 'range', 'when', 'value', 'contains', 'formula', 'scale', 'bar', 'top', 'bottom', 'percent', 'duplicates', 'unique', 'aboveAverage', 'belowAverage', 'style'], where, problems);
  const range = targetRange(rule, layout, problems, where);
  if (!range) return null;
  const preset = typeof rule.style === 'string' ? STYLE_PRESETS[rule.style] : rule.style;
  if (typeof rule.style === 'string' && !preset) problems.push({ level: 'warning', where, message: `style "${rule.style}" is not one of good, bad, neutral, bold` });
  const dxf = styleFrom(preset ?? STYLE_PRESETS.neutral, problems, where);
  const literal = (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' && v.startsWith('=') ? expand(v, { layout, row: range.r1, col: range.c1 }, layouts, problems, where) : `"${String(v).replace(/"/g, '""')}"`);
  if (rule.when !== undefined) {
    const op = CF_OPERATORS[rule.when];
    if (!op) {
      problems.push({ level: 'error', where, message: `"when" must be one of ${Object.keys(CF_OPERATORS).join(' ')}` });
      return null;
    }
    const values = op.endsWith('etween') ? rule.value : [rule.value];
    if (!Array.isArray(values) || values.length !== (op.endsWith('etween') ? 2 : 1) || values.some((v) => v === undefined)) {
      problems.push({ level: 'error', where, message: op.endsWith('etween') ? '"between" needs "value": [low, high]' : 'needs a "value" to compare with' });
      return null;
    }
    return { range, kind: 'cellIs', operator: op, formulas: values.map(literal), dxf };
  }
  if (rule.contains !== undefined) return { range, kind: 'containsText', text: String(rule.contains), dxf };
  if (rule.formula !== undefined) return { range, kind: 'expression', formulas: [expand(rule.formula, { layout, row: range.r1, col: range.c1 }, layouts, problems, where)], dxf };
  if (rule.scale !== undefined) {
    const colors = rule.scale === true ? ['#FFFFFF', '#63BE7B'] : rule.scale;
    if (!Array.isArray(colors) || colors.length < 2 || colors.length > 3) {
      problems.push({ level: 'error', where, message: '"scale" is true or a list of two or three colors (low, [middle,] high)' });
      return null;
    }
    return { range, kind: 'colorScale', colors: colors.map((c) => normalizeColor(c, problems, where) ?? 'FFFFFF') };
  }
  if (rule.bar !== undefined) return { range, kind: 'dataBar', color: rule.bar === true ? '638EC6' : (normalizeColor(rule.bar, problems, where) ?? '638EC6') };
  if (rule.top !== undefined || rule.bottom !== undefined) {
    const rank = Number(rule.top ?? rule.bottom);
    if (!Number.isInteger(rank) || rank < 1) {
      problems.push({ level: 'error', where, message: '"top" and "bottom" take a whole number of items (or percent with "percent": true)' });
      return null;
    }
    return { range, kind: 'top10', rank, bottom: rule.bottom !== undefined, percent: !!rule.percent, dxf };
  }
  if (rule.duplicates || rule.unique) return { range, kind: rule.unique ? 'uniqueValues' : 'duplicateValues', dxf };
  if (rule.aboveAverage || rule.belowAverage) return { range, kind: 'aboveAverage', below: !!rule.belowAverage, dxf };
  problems.push({ level: 'error', where, message: 'a rule needs one of when, contains, formula, scale, bar, top, bottom, duplicates, unique, aboveAverage, belowAverage' });
  return null;
}

function listValidation(list, range, problems, where) {
  if (!Array.isArray(list) || !list.length) {
    problems.push({ level: 'error', where, message: '"list" is a non-empty array of allowed values' });
    return null;
  }
  const items = list.map(String);
  if (items.some((s) => s.includes(','))) problems.push({ level: 'error', where, message: 'list items cannot contain commas' });
  if (items.join(',').length > 255) problems.push({ level: 'error', where, message: 'the list is longer than 255 characters; put the values in cells and refer to them' });
  return { range, list: items };
}

/**
 * Builds a workbook from its JSON description.
 * @returns {{ book: object, problems: { level: string, where: string, message: string }[] }}
 */
export function fromSpec(input) {
  const problems = [];
  let spec = input;
  if (Array.isArray(spec)) spec = { sheets: spec };
  else if (isPlainObject(spec) && !spec.sheets && (spec.rows || spec.columns)) spec = { sheets: [spec] };
  if (!isPlainObject(spec) || !Array.isArray(spec.sheets) || !spec.sheets.length) {
    problems.push({ level: 'error', where: 'workbook', message: 'the description needs "sheets": [ { "name", "columns", "rows" }, … ]' });
    return { book: null, problems };
  }
  unknownKeys(spec, BOOK_KEYS, 'workbook', problems);
  const allText = JSON.stringify(spec);
  const lang = spec.lang ?? (CJK.test(allText) ? 'zh-CN' : 'en');
  const font = { name: spec.font?.name ?? (isZh(lang) ? '等线' : 'Calibri'), size: Number(spec.font?.size ?? 11) };
  const book = {
    props: { title: spec.title, author: spec.author, subject: spec.subject, lang },
    font,
    sheets: [],
    names: new Map(),
  };
  const bookHeader = { ...DEFAULT_HEADER, ...styleFrom(spec.headerStyle, problems, 'headerStyle') };

  // Pass 1: where every table sits, so formulas can name columns and rows on any sheet.
  const seen = new Set();
  const layouts = new Map();
  const plans = spec.sheets.map((s, si) => {
    const where = `sheets[${si}]`;
    if (!isPlainObject(s)) {
      problems.push({ level: 'error', where, message: 'each sheet is an object' });
      return null;
    }
    unknownKeys(s, SHEET_KEYS, s.name ? `sheet "${s.name}"` : where, problems);
    const name = s.name ?? `Sheet${si + 1}`;
    checkSheetName(name, seen, where, problems);
    const label = `${name}`;
    let row = 1;
    const titleRow = s.title ? row++ : null;
    const noteRow = s.note ? row++ : null;
    if (titleRow || noteRow) row++;
    const rows = Array.isArray(s.rows) ? s.rows : [];
    if (s.rows !== undefined && !Array.isArray(s.rows)) problems.push({ level: 'error', where: label, message: '"rows" must be an array' });
    const columns = Array.isArray(s.columns) ? s.columns.map((c) => (typeof c === 'string' ? { header: c } : c)) : null;
    if (s.columns !== undefined && !Array.isArray(s.columns)) problems.push({ level: 'error', where: label, message: '"columns" must be an array' });
    const hasHeader = columns ? true : s.header !== false && rows.length > 0;
    const headerRow = hasHeader ? row : null;
    const first = hasHeader ? row + 1 : row;
    const dataCount = columns ? rows.length : hasHeader ? rows.length - 1 : rows.length;
    const last = first + dataCount - 1;
    const keys = new Map();
    const width = columns ? columns.length : Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
    if (columns) {
      columns.forEach((c, j) => {
        if (!isPlainObject(c)) return;
        for (const k of [c.key, c.header]) {
          if (k === undefined || k === null) continue;
          const lower = String(k).toLowerCase();
          if (keys.has(lower) && keys.get(lower) !== j + 1 && k === c.key) problems.push({ level: 'error', where: `${label} columns[${j}]`, message: `two columns use the key "${k}"` });
          if (!keys.has(lower)) keys.set(lower, j + 1);
        }
      });
    } else if (hasHeader && Array.isArray(rows[0])) rows[0].forEach((h, j) => h !== null && h !== undefined && !keys.has(String(h).toLowerCase()) && keys.set(String(h).toLowerCase(), j + 1));
    const totals = columns?.some((c) => isPlainObject(c) && c.total !== undefined && c.total !== null && c.total !== 'none') ?? false;
    const layout = { name, titleRow, noteRow, headerRow, first, last, keys, width, totals, totalsRow: totals ? last + 1 : null };
    layouts.set(name.toLowerCase(), layout);
    return { s, si, name, label, columns, rows, layout, hasHeader };
  });

  // Defined names.
  if (spec.names !== undefined) {
    if (!isPlainObject(spec.names)) problems.push({ level: 'error', where: 'names', message: '"names" maps a name to a cell or range, such as { "TaxRate": "Inputs!B2" }' });
    else
      for (const [name, target] of Object.entries(spec.names)) {
        const where = `names.${name}`;
        if (!/^[A-Za-z_\\\u00c0-\uffff][\w.\u00c0-\uffff]*$/.test(name) || parseCell(name) || /^[RC]\d*$/i.test(name) || /^(TRUE|FALSE)$/i.test(name)) {
          problems.push({ level: 'error', where, message: `"${name}" cannot be a name: start with a letter, no spaces, and not a cell address` });
          continue;
        }
        const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(String(target));
        const sheetName = m ? (m[1]?.replace(/''/g, "'") ?? m[2]) : null;
        const range = m ? parseRange(m[3].replace(/\$/g, '')) : null;
        const si = plans.findIndex((p) => p && sheetName && p.name.toLowerCase() === sheetName.toLowerCase());
        if (!range || si < 0) {
          problems.push({ level: 'error', where, message: `"${target}" should be Sheet!B2 or Sheet!B2:B9 on a sheet of this workbook` });
          continue;
        }
        book.names.set(name.toLowerCase(), { name, si, range });
      }
  }

  // Pass 2: cells.
  for (const plan of plans) {
    if (!plan) continue;
    const { s, si, name, label, columns, rows, layout, hasHeader } = plan;
    const sheet = {
      name,
      cells: new Map(),
      maxRow: 0,
      maxCol: 0,
      cols: new Map(),
      merges: [],
      conditional: [],
      validations: [],
      freeze: null,
      filter: null,
      tabColor: normalizeColor(s.tabColor, problems, `${label} tabColor`),
      table: null,
    };
    book.sheets.push(sheet);
    const put = (r, c, cell) => {
      if (r > MAX_ROW || c > MAX_COL) {
        problems.push({ level: 'error', where: label, message: `cell ${colName(Math.min(c, MAX_COL))}${r} is outside Excel's grid` });
        return;
      }
      sheet.cells.set(cellKey(r, c), cell);
      sheet.maxRow = Math.max(sheet.maxRow, r);
      sheet.maxCol = Math.max(sheet.maxCol, c);
    };
    const headerStyle = { ...bookHeader, ...styleFrom(s.headerStyle, problems, `${label} headerStyle`) };
    const width = layout.width;

    if (layout.titleRow) put(layout.titleRow, 1, { v: String(s.title), t: 's', style: { bold: true, size: font.size + 3 }, role: 'title' });
    if (layout.noteRow) put(layout.noteRow, 1, { v: String(s.note), t: 's', style: { italic: true, color: '5F6B7A' }, role: 'note' });

    // Column definitions, with types settled.
    const defs = [];
    if (columns) {
      columns.forEach((col, j) => {
        const where = `${label} column ${colName(j + 1)}`;
        if (!isPlainObject(col)) {
          problems.push({ level: 'error', where, message: 'a column is a header string or an object' });
          defs.push({ header: '', type: null, style: {} });
          return;
        }
        unknownKeys(col, COLUMN_KEYS, where, problems);
        if (col.type !== undefined && !TYPES.includes(col.type)) problems.push({ level: 'error', where, message: `type "${col.type}" is not one of ${TYPES.join(', ')}` });
        const key = col.key ?? col.header;
        const values = rows.map((r) => (Array.isArray(r) ? r[j] : isPlainObject(r) ? (r[key] ?? (col.key ? undefined : r[col.header])) : undefined));
        const declared = TYPES.includes(col.type) ? col.type : null;
        const type = declared ?? inferType(values);
        const format = col.format ?? defaultFormat(type, col, lang);
        if (col.format && type && ['date', 'datetime', 'time'].includes(type) !== isDateFormat(col.format) && type !== 'text')
          problems.push({ level: 'warning', where, message: `format "${col.format}" does not match type ${type}` });
        if (col.width !== undefined && !(Number(col.width) > 0 && Number(col.width) <= 255)) problems.push({ level: 'error', where, message: 'width is a number of characters from 1 to 255' });
        const align = col.align ?? undefined;
        defs.push({
          header: col.header === undefined || col.header === null ? '' : String(col.header),
          key,
          type,
          declared,
          inferred: !declared && type,
          format,
          formula: col.formula,
          total: col.total,
          width: col.width === undefined ? undefined : Number(col.width),
          hidden: !!col.hidden,
          wrap: !!col.wrap,
          list: col.list,
          style: { ...styleFrom({ bold: col.bold, color: col.color, fill: col.fill, align, wrap: col.wrap }, problems, where), ...(format && { numFmt: format }) },
        });
        if (col.header === undefined || col.header === null || col.header === '') problems.push({ level: 'warning', where, message: 'column has no header' });
      });
    }

    // Header row.
    if (layout.headerRow && columns) {
      defs.forEach((d, j) => {
        const numeric = ['number', 'integer', 'currency', 'percent'].includes(d.type);
        put(layout.headerRow, j + 1, { v: d.header, t: 's', style: { ...headerStyle, wrap: true, valign: 'center', ...(numeric && { align: 'right' }), ...(d.style.align && { align: d.style.align }) }, role: 'header' });
      });
    }

    // Data rows.
    const ctxBase = { layout };
    const placeRow = (values, r, rowWhere, objectKeys) => {
      for (let j = 0; j < Math.max(values.length, columns ? defs.length : 0); j++) {
        const d = defs[j];
        const where = `${name}!${colName(j + 1)}${r}`;
        let raw = values[j];
        let override = null;
        if (isPlainObject(raw)) {
          unknownKeys(raw, CELL_KEYS, where, problems);
          override = raw;
          raw = raw.formula !== undefined ? `=${String(raw.formula).replace(/^=/, '')}` : raw.value;
          if (override.type === 'text' && override.formula === undefined) raw = { text: raw };
        }
        const isFormula = typeof raw === 'string' && raw.startsWith('=') && raw.length > 1;
        if ((raw === undefined || raw === null || raw === '') && d?.formula) {
          raw = `=${String(d.formula).replace(/^=/, '')}`;
        } else if (d?.formula && raw !== undefined && raw !== null && raw !== '' && !isFormula) {
          problems.push({ level: 'warning', where, message: `typed value ${JSON.stringify(raw)} replaces this column's formula; is it hardcoded?` });
        }
        const style = { ...(d?.style ?? {}), ...(override && styleFrom(override, problems, where)), ...(override?.format && { numFmt: override.format }) };
        if (typeof raw === 'string' && raw.startsWith('=') && raw.length > 1) {
          const f = expand(raw, { ...ctxBase, row: r, col: j + 1 }, layouts, problems, where);
          put(r, j + 1, { f, style, where, ...(d?.formula && { fromColumn: true }) });
          continue;
        }
        if (raw && typeof raw === 'object' && 'text' in raw) {
          if (raw.text !== undefined && raw.text !== null) put(r, j + 1, { v: String(raw.text), t: 's', style: { ...style, numFmt: style.numFmt === '@' ? '@' : undefined }, where });
          continue;
        }
        const type = override?.type && TYPES.includes(override.type) ? override.type : d?.type;
        const out = coerce(raw, type);
        if (out.problem) problems.push({ level: out.problem[0], where, message: out.problem[1] });
        if (out.empty) continue;
        if (!d?.declared && !override?.type && typeof raw === 'string' && out.t === 's') {
          if (looksLikeDate(raw)) problems.push({ level: 'warning', where, message: `"${raw}" looks like a date stored as text; give the column type "date" (YYYY-MM-DD values)` });
          else if (parseNumberText(raw)) problems.push({ level: 'warning', where, message: `"${raw}" is a number stored as text; write it as a JSON number or give the column a number type` });
        }
        if (typeof out.v === 'string' && out.v.length > 32767) problems.push({ level: 'error', where, message: 'text longer than 32,767 characters does not fit in a cell' });
        if (out.t === 'n' && Number.isInteger(out.v) && Math.abs(out.v) > 2 ** 53) problems.push({ level: 'warning', where, message: `${out.v} has more digits than Excel keeps (15); store identifiers as text` });
        const cellStyle = out.t === 's' && style.numFmt && style.numFmt !== '@' ? { ...style, numFmt: undefined } : style;
        put(r, j + 1, { v: out.v, t: out.t, style: cellStyle, where, ...(out.t === 'd' && !cellStyle.numFmt && { style: { ...cellStyle, numFmt: 'yyyy-mm-dd' } }) });
      }
      if (objectKeys) {
        const known = new Set(defs.flatMap((d) => [d.key, d.header].filter((k) => k !== undefined).map(String)));
        for (const k of objectKeys) if (!known.has(k)) problems.push({ level: 'warning', where: rowWhere, message: `"${k}" is not a column key or header; value ignored` });
      }
    };

    const dataRows = columns ? rows : hasHeader ? rows.slice(1) : rows;
    if (!columns && hasHeader && rows.length) {
      const head = Array.isArray(rows[0]) ? rows[0] : [];
      head.forEach((h, j) => put(layout.headerRow, j + 1, { v: h === null || h === undefined ? '' : String(h), t: 's', style: { ...headerStyle, wrap: true, valign: 'center' }, role: 'header' }));
    }
    if (!columns) {
      // Untyped sheet: infer a type per column the same way.
      for (let j = 0; j < width; j++) {
        const values = dataRows.map((r) => (Array.isArray(r) ? r[j] : undefined));
        const type = inferType(values);
        defs.push({ header: '', type, inferred: !!type, style: type ? { numFmt: defaultFormat(type, {}, lang) } : {} });
      }
    }
    dataRows.forEach((r, i) => {
      const rowNum = layout.first + i;
      const rowWhere = `${name} row ${rowNum}`;
      if (Array.isArray(r)) {
        if (columns && r.length > defs.length) problems.push({ level: 'warning', where: rowWhere, message: `${r.length} values for ${defs.length} columns; the extra values are dropped` });
        placeRow(columns ? r.slice(0, defs.length) : r, rowNum, rowWhere, null);
      } else if (isPlainObject(r) && columns) {
        const values = defs.map((d) => {
          if (d.key !== undefined && r[d.key] !== undefined) return r[d.key];
          if (r[d.header] !== undefined) return r[d.header];
          return undefined;
        });
        placeRow(values, rowNum, rowWhere, Object.keys(r));
      } else problems.push({ level: 'error', where: rowWhere, message: columns ? 'a row is an array of values or an object keyed by column' : 'without "columns", rows are arrays' });
    });

    // Totals row.
    if (layout.totals) {
      const r = layout.totalsRow;
      let labelled = false;
      defs.forEach((d, j) => {
        const where = `${name}!${colName(j + 1)}${r}`;
        const base = { bold: true, border: 'top', ...(d.style.numFmt && { numFmt: d.style.numFmt }) };
        if (d.total === undefined || d.total === null || d.total === 'none') {
          if (!labelled) {
            put(r, j + 1, { v: typeof s.totals === 'string' ? s.totals : isZh(lang) ? '合计' : 'Total', t: 's', style: { bold: true, border: 'top' }, role: 'totals' });
            labelled = true;
          } else put(r, j + 1, { v: null, t: 'blank', style: { border: 'top' }, role: 'totals' });
          return;
        }
        labelled = true;
        const fn = TOTALS[String(d.total).toLowerCase()];
        const formula = fn ? `${fn}(${colName(j + 1)}${layout.first}:${colName(j + 1)}${Math.max(layout.last, layout.first)})` : String(d.total).startsWith('=') ? d.total : null;
        if (!formula) {
          problems.push({ level: 'error', where, message: `total "${d.total}" is not one of ${Object.keys(TOTALS).join(', ')} or a formula starting with =` });
          return;
        }
        put(r, j + 1, { f: expand(formula, { layout, row: r, col: j + 1 }, layouts, problems, where), style: base, where, role: 'totals' });
      });
    }

    // Extra cells.
    if (s.cells !== undefined) {
      if (!isPlainObject(s.cells)) problems.push({ level: 'error', where: label, message: '"cells" maps addresses to values: { "H2": "Note", "H3": "=SUM(…)" }' });
      else
        for (const [addr, raw] of Object.entries(s.cells)) {
          const where = `${name}!${addr}`;
          const p = parseCell(addr.replace(/\$/g, ''));
          if (!p) {
            problems.push({ level: 'error', where, message: `"${addr}" is not a cell address` });
            continue;
          }
          if (sheet.cells.has(cellKey(p.r, p.c)) && sheet.cells.get(cellKey(p.r, p.c)).role !== 'blank')
            problems.push({ level: 'warning', where, message: 'replaces a cell the table already filled' });
          let value = raw;
          let style = {};
          if (isPlainObject(raw)) {
            unknownKeys(raw, CELL_KEYS, where, problems);
            style = { ...styleFrom(raw, problems, where), ...(raw.format && { numFmt: raw.format }) };
            value = raw.formula !== undefined ? `=${String(raw.formula).replace(/^=/, '')}` : raw.value;
            if (raw.type && !TYPES.includes(raw.type)) problems.push({ level: 'error', where, message: `type "${raw.type}" is not one of ${TYPES.join(', ')}` });
            if (raw.type && raw.formula === undefined) {
              const out = coerce(value, raw.type);
              if (out.problem) problems.push({ level: out.problem[0], where, message: out.problem[1] });
              if (!out.empty) put(p.r, p.c, { v: out.v, t: out.t, style: { numFmt: defaultFormat(raw.type, raw, lang), ...style }, where });
              continue;
            }
          }
          if (typeof value === 'string' && value.startsWith('=') && value.length > 1) put(p.r, p.c, { f: expand(value, { layout, row: p.r, col: p.c }, layouts, problems, where), style, where });
          else {
            const out = coerce(value, null);
            if (out.problem) problems.push({ level: out.problem[0], where, message: out.problem[1] });
            if (!out.empty) {
              if (typeof value === 'string' && looksLikeDate(value)) problems.push({ level: 'warning', where, message: `"${value}" looks like a date stored as text; use { "value": "YYYY-MM-DD", "type": "date" }` });
              put(p.r, p.c, { v: out.v, t: out.t, style, where });
            }
          }
        }
    }

    // Layout options.
    const tableBox = layout.headerRow && width ? { r1: layout.headerRow, c1: 1, r2: Math.max(layout.last, layout.headerRow), c2: width } : null;
    sheet.table = { ...layout, defs, box: tableBox };
    const freeze = s.freeze === undefined ? (layout.headerRow && dataRows.length > 0 ? true : false) : s.freeze;
    if (freeze === true && layout.headerRow) sheet.freeze = { r: layout.headerRow + 1, c: 1 };
    else if (typeof freeze === 'string') {
      const p = parseCell(freeze.replace(/\$/g, ''));
      if (!p) problems.push({ level: 'error', where: `${label} freeze`, message: '"freeze" is true, false, or the first scrolling cell such as "B2"' });
      else if (p.r > 1 || p.c > 1) sheet.freeze = { r: p.r, c: p.c };
    } else if (isPlainObject(freeze)) sheet.freeze = { r: 1 + Number(freeze.rows ?? 0), c: 1 + Number(freeze.columns ?? 0) };
    else if (freeze !== false && freeze !== true) problems.push({ level: 'error', where: `${label} freeze`, message: '"freeze" is true, false, "B2" or { "rows": 1, "columns": 1 }' });

    if (s.filter) {
      if (s.filter === true) {
        if (tableBox) sheet.filter = tableBox;
        else problems.push({ level: 'warning', where: `${label} filter`, message: 'a filter needs a header row' });
      } else {
        const r = parseRange(String(s.filter).replace(/\$/g, ''));
        if (r) sheet.filter = r;
        else problems.push({ level: 'error', where: `${label} filter`, message: '"filter" is true or a range like A3:F40' });
      }
    }
    if (s.banded && layout.last >= layout.first && width)
      sheet.conditional.push({ range: { r1: layout.first, c1: 1, r2: layout.last, c2: width }, kind: 'expression', formulas: [`MOD(ROW()-${layout.first},2)=1`], dxf: { fill: typeof s.banded === 'string' ? (normalizeColor(s.banded, problems, `${label} banded`) ?? 'F5F7FA') : 'F5F7FA' } });

    for (const [k, m] of (Array.isArray(s.merge) ? s.merge : s.merge ? [s.merge] : []).entries()) {
      const r = parseRange(String(m).replace(/\$/g, ''));
      const where = `${label} merge[${k}]`;
      if (!r || (r.r1 === r.r2 && r.c1 === r.c2)) {
        problems.push({ level: 'error', where, message: `"${m}" is not a range of two or more cells` });
        continue;
      }
      if (sheet.merges.some((o) => overlaps(o, r))) problems.push({ level: 'error', where, message: `${rangeName(r)} overlaps another merged range` });
      if (tableBox && overlaps(r, { ...tableBox, r1: tableBox.r1 + 1 })) problems.push({ level: 'warning', where, message: `${rangeName(r)} merges cells inside the table; sorting and filtering break on merged cells` });
      for (let rr = r.r1; rr <= r.r2; rr++)
        for (let cc = r.c1; cc <= r.c2; cc++) {
          if (rr === r.r1 && cc === r.c1) continue;
          const cell = sheet.cells.get(cellKey(rr, cc));
          if (cell && (cell.f !== undefined || (cell.v !== null && cell.v !== ''))) problems.push({ level: 'warning', where, message: `${colName(cc)}${rr} has a value that the merge hides` });
        }
      sheet.merges.push(r);
    }

    for (const [k, rule] of (Array.isArray(s.conditional) ? s.conditional : s.conditional ? [s.conditional] : []).entries()) {
      const out = conditionalRule(rule, layout, layouts, problems, `${label} conditional[${k}]`);
      if (out) sheet.conditional.push(out);
    }
    defs.forEach((d, j) => {
      if (d.list === undefined) return;
      if (layout.last < layout.first) return;
      const v = listValidation(d.list, { r1: layout.first, c1: j + 1, r2: layout.last, c2: j + 1 }, problems, `${label} column ${colName(j + 1)} list`);
      if (v) sheet.validations.push(v);
    });
    for (const [k, v] of (Array.isArray(s.validation) ? s.validation : []).entries()) {
      const where = `${label} validation[${k}]`;
      const range = targetRange(v ?? {}, layout, problems, where);
      if (!range) continue;
      const out = listValidation(v.list, range, problems, where);
      if (out) sheet.validations.push(out);
    }

    // Column widths and visibility.
    const widths = isPlainObject(s.widths) ? s.widths : {};
    if (s.widths !== undefined && !isPlainObject(s.widths)) problems.push({ level: 'error', where: `${label} widths`, message: '"widths" maps column letters to widths: { "A": 30 }' });
    plan.widths = widths;
    plan.defs = defs;
    plan.sheet = sheet;
    plan.filterOn = !!sheet.filter;
  }
  book.plans = plans.filter(Boolean);
  return { book, problems };
}

const overlaps = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

/**
 * Sets column widths from what the cells show (after formulas are calculated), unless a width was given.
 * Wide text columns are capped and wrapped.
 */
export function sizeColumns(book) {
  for (const plan of book.plans ?? []) {
    const { sheet, defs, widths, filterOn } = plan;
    const need = new Map();
    const headerNeed = new Map();
    for (const [key, cell] of sheet.cells) {
      const c = key % 16384;
      if (cell.role === 'title' || cell.role === 'note') continue;
      const value = cell.f !== undefined ? cell.result?.v ?? null : cell.v;
      const shown = cell.f !== undefined && !cell.result ? '0000000000' : formatValue(value, cell.style?.numFmt ?? 'General');
      const w = textWidth(shown);
      const into = cell.role === 'header' ? headerNeed : need;
      into.set(c, Math.max(into.get(c) ?? 0, w));
    }
    for (let c = 1; c <= sheet.maxCol; c++) {
      const d = defs[c - 1];
      const letter = colName(c);
      const given = widths[letter] ?? widths[letter.toLowerCase()] ?? d?.width;
      let width;
      if (given !== undefined) width = Number(given);
      else {
        const data = need.get(c) ?? 0;
        const head = headerNeed.get(c) ?? 0;
        const longestWord = Math.max(0, ...String(sheet.cells.get(cellKey(sheet.table?.headerRow ?? 0, c))?.v ?? '').split(/\s+/).map(textWidth));
        const headerShare = Math.max(Math.min(head, Math.max(data, 12)), Math.min(longestWord, 24));
        width = Math.max(data, headerShare) + 2 + (filterOn && head ? 2 : 0);
        width = Math.min(Math.max(width, 6), 60);
        if (data + 2 > 60) {
          for (const [key, cell] of sheet.cells) if (key % 16384 === c && cell.t === 's' && cell.role !== 'title' && cell.role !== 'note') cell.style = { ...cell.style, wrap: true, valign: 'top' };
        }
      }
      if (d?.wrap)
        for (const [key, cell] of sheet.cells) if (key % 16384 === c && cell.role !== 'header') cell.style = { ...cell.style, wrap: true, valign: 'top' };
      sheet.cols.set(c, { width: Math.round(width * 100) / 100, hidden: !!d?.hidden });
    }
  }
}

/**
 * Builds a workbook description from CSV text: the first row is the header, column types are read from the
 * values (numbers, percents, currency, dates, booleans; codes with leading zeros stay text).
 */
export function specFromCsv(text, { name = 'Sheet1', header = true, title } = {}) {
  const rows = parseCsv(text);
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  if (!rows.length) return { name, rows: [] };
  const width = Math.max(...rows.map((r) => r.length));
  const head = header ? rows[0] : null;
  const body = header ? rows.slice(1) : rows;
  const columns = [];
  for (let j = 0; j < width; j++) {
    const values = body.map((r) => r[j] ?? '');
    const present = values.filter((v) => v.trim() !== '');
    const numbers = present.map((v) => parseNumberText(v));
    const dates = present.map((v) => parseDateText(v));
    const share = (list) => (present.length ? list.filter(Boolean).length / present.length : 0);
    // A column where most values are dates, or at least half are numbers, gets that type; the odd text values
    // stay text and are reported.
    let type = inferType(values);
    if (!type && share(dates) >= 0.8) type = dates.some((d) => d?.kind === 'datetime') ? 'datetime' : 'date';
    if (!type && share(numbers) >= 0.5) type = numbers.some((n) => n?.kind === 'currency') ? 'currency' : 'number';
    if (!type) type = 'text';
    const col = { header: head ? (head[j] ?? '') : colName(j + 1) };
    if (type) col.type = type;
    if (type === 'number' || type === 'currency') {
      const nums = numbers.filter(Boolean).map((n) => n.value);
      const decimals = Math.max(0, ...present.map((v) => /\.(\d+)\s*%?$/.exec(v.replace(/[^\d.%]/g, ''))?.[1].length ?? 0));
      if (nums.every(Number.isInteger) && type === 'number') {
        if (present.some((v) => /\d,\d{3}/.test(v))) col.type = 'integer';
        else col.format = 'General';
      } else col.decimals = Math.min(decimals, 4);
      if (type === 'currency') col.symbol = numbers.find((n) => n?.symbol)?.symbol;
    }
    columns.push(col);
  }
  const data = body.map((r) => columns.map((_, j) => (r[j] === undefined || r[j] === '' ? null : r[j])));
  return { name, ...(title && { title }), columns, rows: data, freeze: true, filter: data.length >= 10 };
}

