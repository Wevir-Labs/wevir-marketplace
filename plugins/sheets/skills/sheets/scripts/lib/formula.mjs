// Cell addresses and Excel formulas: tokenizer, parser, reference shifting and the _xlfn. prefixes of newer functions.
export const MAX_ROW = 1048576;
export const MAX_COL = 16384;

export function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function colNumber(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

export const cellName = (r, c) => `${colName(c)}${r}`;

/** Parses `B2` or `$B$2`; null when it is not a cell inside Excel's grid. */
export function parseCell(text) {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(text);
  if (!m) return null;
  const c = colNumber(m[2]);
  const r = Number(m[4]);
  if (c > MAX_COL || r < 1 || r > MAX_ROW) return null;
  return { r, c, absC: !!m[1], absR: !!m[3] };
}

/** Parses `A1`, `A1:C9`, `A:C` or `2:5` into a box; null when it is none of those. */
export function parseRange(text) {
  const [a, b, extra] = text.split(':');
  if (extra !== undefined) return null;
  if (b === undefined) {
    const cell = parseCell(a);
    return cell && { r1: cell.r, c1: cell.c, r2: cell.r, c2: cell.c };
  }
  const p = parseCell(a);
  const q = parseCell(b);
  if (p && q) return box(p.r, p.c, q.r, q.c);
  const cols = /^\$?([A-Za-z]{1,3})$/;
  if (cols.test(a) && cols.test(b)) {
    const c1 = colNumber(cols.exec(a)[1]);
    const c2 = colNumber(cols.exec(b)[1]);
    if (c1 <= MAX_COL && c2 <= MAX_COL) return { ...box(1, c1, MAX_ROW, c2), wholeCols: true };
  }
  const rows = /^\$?(\d+)$/;
  if (rows.test(a) && rows.test(b)) {
    const r1 = Number(rows.exec(a)[1]);
    const r2 = Number(rows.exec(b)[1]);
    if (r1 >= 1 && r2 >= 1 && r1 <= MAX_ROW && r2 <= MAX_ROW) return { ...box(r1, 1, r2, MAX_COL), wholeRows: true };
  }
  return null;
}

const box = (ra, ca, rb, cb) => ({ r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb) });

export const rangeName = ({ r1, c1, r2, c2 }) =>
  r1 === r2 && c1 === c2 ? cellName(r1, c1) : `${cellName(r1, c1)}:${cellName(r2, c2)}`;

/** A sheet name as a formula prefix: quoted when Excel would quote it. */
export function sheetPrefix(name) {
  return /^[A-Za-z_\u00c0-\uffff][\w.\u00c0-\uffff]*$/.test(name) && !parseCell(name) && !/^(TRUE|FALSE)$/i.test(name)
    ? `${name}!`
    : `'${name.replace(/'/g, "''")}'!`;
}

const ERRORS = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA', '#SPILL!', '#CALC!'];
const SHEET_RE = /^(?:'((?:[^']|'')+)'|([A-Za-z_\u00c0-\uffff][\w.\u00c0-\uffff]*))!/;
const AREA_RE = /^(?:\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![\w(.])/;
const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_RE = /^[A-Za-z_\\\u00c0-\uffff][\w.\u00c0-\uffff]*/;
const OPS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%', '(', ')', ',', ':', '{', '}', ';'];

/**
 * Splits a formula (with or without the leading `=`) into tokens that join back to the same text.
 * Token types: ws, num, str, bool, err, ref, func, name, op.
 */
export function tokenize(formula) {
  const src = formula.startsWith('=') ? formula.slice(1) : formula;
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    const push = (type, text, extra) => {
      tokens.push({ type, text, at: i, ...extra });
      i += text.length;
    };
    if ((m = /^\s+/.exec(rest))) push('ws', m[0]);
    else if (rest[0] === '"') {
      let j = 1;
      while (j < rest.length && !(rest[j] === '"' && rest[j + 1] !== '"')) j += rest[j] === '"' ? 2 : 1;
      if (j >= rest.length) throw new FormulaError('a text value in quotes is not closed');
      const text = rest.slice(0, j + 1);
      push('str', text, { value: text.slice(1, -1).replace(/""/g, '"') });
    } else if (rest[0] === '#') {
      const err = ERRORS.find((e) => rest.toUpperCase().startsWith(e));
      if (!err) throw new FormulaError(`unknown error value ${rest.slice(0, 8)}`);
      push('err', rest.slice(0, err.length), { value: err });
    } else if ((m = SHEET_RE.exec(rest)) && (AREA_RE.test(rest.slice(m[0].length)) || /^#REF!/i.test(rest.slice(m[0].length)))) {
      const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
      const after = rest.slice(m[0].length);
      if (/^#REF!/i.test(after)) push('err', m[0] + after.slice(0, 5), { value: '#REF!' });
      else {
        const area = AREA_RE.exec(after)[0];
        const range = parseRange(area);
        if (!range) throw new FormulaError(`${m[0]}${area} is outside the sheet grid`);
        push('ref', m[0] + area, { sheet, area, range });
      }
    } else if ((m = AREA_RE.exec(rest)) && parseRange(m[0]) && (!/^\$?\d+:/.test(m[0]) || isRowRange(rest, tokens))) {
      push('ref', m[0], { sheet: null, area: m[0], range: parseRange(m[0]) });
    } else if ((m = NUMBER_RE.exec(rest))) push('num', m[0], { value: Number(m[0]) });
    else if ((m = IDENT_RE.exec(rest))) {
      const after = rest.slice(m[0].length);
      if (/^\s*\(/.test(after)) push('func', m[0], { name: m[0].toUpperCase().replace(/^_XLFN\.(_XLWS\.)?/, '') });
      else if (/^(TRUE|FALSE)$/i.test(m[0])) push('bool', m[0], { value: m[0].toUpperCase() === 'TRUE' });
      else push('name', m[0]);
    } else {
      const op = OPS.find((o) => rest.startsWith(o));
      if (!op) throw new FormulaError(`unexpected character ${rest[0]}`);
      push('op', op);
    }
  }
  return tokens;
}

/** `2:5` is a row range only where a value may start, not after an operand (`IF(A1>2:5` never happens in practice). */
function isRowRange(rest, tokens) {
  if (!/^\$?\d+:\$?\d+(?![\w(.])/.test(rest)) return false;
  const prev = [...tokens].reverse().find((t) => t.type !== 'ws');
  return !prev || (prev.type === 'op' && prev.text !== ')');
}

export class FormulaError extends Error {}

/**
 * Parses a formula into a tree. Nodes: num, str, bool, err, ref {sheet, range}, name, fn {name, args}, bin {op, a, b},
 * neg, pct, missing. Precedence follows Excel: comparison < & < + - < * / < ^ < % < unary minus.
 */
export function parse(formula) {
  const tokens = tokenize(formula).filter((t) => t.type !== 'ws');
  let k = 0;
  const peek = () => tokens[k];
  const isOp = (...ops) => peek()?.type === 'op' && ops.includes(peek().text);
  const expect = (text) => {
    if (!isOp(text)) throw new FormulaError(peek() ? `expected "${text}" before "${peek().text}"` : `missing "${text}" at the end`);
    k++;
  };
  const binary = (next, ops) => () => {
    let a = next();
    while (isOp(...ops)) {
      const op = tokens[k++].text;
      a = { type: 'bin', op, a, b: next() };
    }
    return a;
  };
  const primary = () => {
    const t = tokens[k];
    if (!t) throw new FormulaError('the formula ends too early');
    if (t.type === 'op' && (t.text === '-' || t.text === '+')) {
      k++;
      const a = primary();
      return t.text === '-' ? { type: 'neg', a } : a;
    }
    k++;
    let node;
    switch (t.type) {
      case 'num':
        node = { type: 'num', value: t.value };
        break;
      case 'str':
        node = { type: 'str', value: t.value };
        break;
      case 'bool':
        node = { type: 'bool', value: t.value };
        break;
      case 'err':
        node = { type: 'err', value: t.value };
        break;
      case 'ref':
        node = { type: 'ref', sheet: t.sheet, range: t.range, text: t.text };
        break;
      case 'name':
        node = { type: 'name', name: t.text };
        break;
      case 'func': {
        expect('(');
        const args = [];
        if (!isOp(')')) {
          for (;;) {
            args.push(isOp(',', ')') ? { type: 'missing' } : compare());
            if (isOp(',')) k++;
            else break;
          }
        }
        expect(')');
        node = { type: 'fn', name: t.name, args, text: t.text };
        break;
      }
      case 'op':
        if (t.text === '(') {
          node = compare();
          expect(')');
          break;
        }
        if (t.text === '{') throw new FormulaError('array constants {…} are not supported; put the values in cells');
        throw new FormulaError(`unexpected "${t.text}"`);
      default:
        throw new FormulaError(`unexpected "${t.text}"`);
    }
    if (isOp(':')) throw new FormulaError('ranges built from functions (A1:INDEX(…)) are not supported');
    return node;
  };
  const percent = () => {
    let a = primary();
    while (isOp('%')) {
      k++;
      a = { type: 'pct', a };
    }
    return a;
  };
  const power = binary(percent, ['^']);
  const product = binary(power, ['*', '/']);
  const sum = binary(product, ['+', '-']);
  const concat = binary(sum, ['&']);
  const compare = binary(concat, ['=', '<>', '<', '>', '<=', '>=']);
  const tree = compare();
  if (k < tokens.length) throw new FormulaError(`unexpected "${tokens[k].text}"`);
  return tree;
}

/** Calls fn for every reference and name in a tree. */
export function walk(node, fn) {
  if (!node) return;
  if (node.type === 'ref' || node.type === 'name' || node.type === 'fn') fn(node);
  for (const child of [node.a, node.b, ...(node.args ?? [])]) walk(child, fn);
}

/**
 * Moves the relative parts of every reference by dr rows and dc columns, as Excel does when a formula is
 * filled or shared (`B2*C2` from row 2 becomes `B5*C5` in row 5). Out-of-grid references become #REF!.
 */
export function shiftFormula(formula, dr, dc) {
  if (!dr && !dc) return formula;
  return tokenize(formula)
    .map((t) => {
      if (t.type !== 'ref') return t.text;
      const prefix = t.text.slice(0, t.text.length - t.area.length);
      const parts = t.area.split(':').map((part) => {
        const m = /^(\$?)([A-Za-z]{1,3})?(\$?)(\d+)?$/.exec(part);
        let s = '';
        if (m[2]) {
          const c = m[1] ? colNumber(m[2]) : colNumber(m[2]) + dc;
          if (c < 1 || c > MAX_COL) return null;
          s += m[1] + colName(c);
        }
        if (m[4]) {
          const r = m[3] ? Number(m[4]) : Number(m[4]) + dr;
          if (r < 1 || r > MAX_ROW) return null;
          s += m[3] + r;
        }
        return s;
      });
      return parts.includes(null) ? '#REF!' : prefix + parts.join(':');
    })
    .join('');
}

/** Functions Excel stores with a prefix because they are newer than the 2007 file format. */
const XLFN = new Set(
  `CONCAT TEXTJOIN IFS MAXIFS MINIFS SWITCH XOR IFNA XLOOKUP XMATCH STDEV.S STDEV.P VAR.S VAR.P RANK.EQ RANK.AVG
  CEILING.MATH FLOOR.MATH DAYS ISOWEEKNUM PERCENTILE.INC PERCENTILE.EXC QUARTILE.INC QUARTILE.EXC MODE.SNGL
  NORM.DIST NORM.INV NORM.S.DIST T.TEST COVARIANCE.P COVARIANCE.S FORECAST.LINEAR LET LAMBDA TEXTBEFORE TEXTAFTER
  TEXTSPLIT VSTACK HSTACK TOCOL TOROW TAKE DROP CHOOSECOLS CHOOSEROWS UNIQUE SEQUENCE RANDARRAY SORT SORTBY FILTER
  ARRAYTOTEXT VALUETOTEXT IMAGE`.split(/\s+/),
);
const XLWS = new Set(['FILTER', 'SORT', 'SORTBY']);
/** Functions that return several cells: they need dynamic-array metadata this writer does not produce. */
export const SPILLING = new Set(['UNIQUE', 'SEQUENCE', 'RANDARRAY', 'SORT', 'SORTBY', 'FILTER', 'TEXTSPLIT', 'VSTACK', 'HSTACK', 'TOCOL', 'TOROW', 'TAKE', 'DROP', 'CHOOSECOLS', 'CHOOSEROWS']);

/** The formula text as stored in the file: no leading `=`, newer functions prefixed. */
export function storedFormula(formula) {
  return tokenize(formula)
    .map((t) => {
      if (t.type !== 'func') return t.text;
      if (!XLFN.has(t.name)) return t.text.replace(/^_xlfn\.(_xlws\.)?/i, '');
      return `_xlfn.${XLWS.has(t.name) ? '_xlws.' : ''}${t.name}`;
    })
    .join('');
}

/** The formula as a person types it: leading `=`, prefixes removed. */
export function displayFormula(stored) {
  return `=${stored.replace(/_xlfn\.(_xlws\.)?/gi, '')}`;
}
