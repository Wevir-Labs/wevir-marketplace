// A small formula calculator. It computes the formulas a workbook uses most (arithmetic, aggregates, conditional
// sums and counts, lookups, text and date functions) so the file carries cached values that previews and CSV
// exports can show. Anything it cannot compute exactly is left for Excel to calculate when the file opens.
import { parse } from './formula.mjs';
import { dateToSerial, formatValue, parseDateText, parseNumberText, serialToParts } from './format.mjs';

export class XErr {
  constructor(code) {
    this.code = code;
  }
  toString() {
    return this.code;
  }
}
const E = {
  div0: () => new XErr('#DIV/0!'),
  value: () => new XErr('#VALUE!'),
  ref: () => new XErr('#REF!'),
  name: () => new XErr('#NAME?'),
  num: () => new XErr('#NUM!'),
  na: () => new XErr('#N/A'),
};

/** Thrown when a result cannot be computed here; the cell is then left for Excel to calculate. */
export class Skip {
  constructor(reason) {
    this.reason = reason;
  }
}

class Ref {
  constructor(si, r1, c1, r2, c2) {
    Object.assign(this, { si, r1, c1, r2, c2 });
  }
  get single() {
    return this.r1 === this.r2 && this.c1 === this.c2;
  }
}
class Matrix {
  constructor(rows) {
    this.rows = rows;
  }
}

export const cellKey = (r, c) => r * 16384 + c;

const isArr = (v) => v instanceof Ref || v instanceof Matrix;

/**
 * @param {{ sheets: { name: string, cells: Map<number, object>, maxRow: number, maxCol: number }[],
 *           names: Map<string, { si: number, range: object }> }} book
 *   Cells hold `{ v, f }`: a constant value, or a formula `f` (text without `=`).
 */
export function createCalc(book) {
  const sheetIndex = new Map(book.sheets.map((s, i) => [s.name.toLowerCase(), i]));
  const state = new Map(); // `${si}:${key}` → { value } | { skip } | 'busy'

  function cellValue(si, r, c) {
    const sheet = book.sheets[si];
    const cell = sheet.cells.get(cellKey(r, c));
    if (!cell) return null;
    if (cell.f === undefined) return cell.t === 'e' ? new XErr(cell.v) : (cell.v ?? null);
    if (book.useCached && cell.result) return cell.result.t === 'e' ? new XErr(cell.result.v) : cell.result.v;
    const id = `${si}:${cellKey(r, c)}`;
    const s = state.get(id);
    if (s === 'busy') throw new Skip(`circular reference through ${sheet.name}!${colLetters(c)}${r}`);
    if (s) {
      if (s.skip) throw s.skip;
      return s.value;
    }
    state.set(id, 'busy');
    try {
      const value = compute(si, r, c, cell);
      state.set(id, { value });
      return value;
    } catch (e) {
      if (!(e instanceof Skip)) throw e;
      state.set(id, { skip: e });
      throw e;
    }
  }

  function compute(si, r, c, cell) {
    cell.ast ??= parse(cell.f);
    const ctx = { si, r, c };
    let v;
    try {
      v = ev(cell.ast, ctx);
      if (isArr(v)) v = intersect(v, ctx);
      if (v === null) v = 0;
      if (typeof v === 'number' && !Number.isFinite(v)) v = E.num();
    } catch (e) {
      if (e instanceof XErr) return e;
      throw e;
    }
    return v;
  }

  /** A range used where one value belongs: the cell in the formula's own row or column, as older Excel did. */
  function intersect(v, ctx) {
    if (v instanceof Matrix) {
      if (v.rows.length === 1 && v.rows[0].length === 1) return v.rows[0][0];
      throw new Skip('the formula returns several values (it would spill)');
    }
    if (v.single) return cellValue(v.si, v.r1, v.c1);
    if (v.si === ctx.si && v.c1 === v.c2 && ctx.r >= v.r1 && ctx.r <= v.r2) return cellValue(v.si, ctx.r, v.c1);
    if (v.si === ctx.si && v.r1 === v.r2 && ctx.c >= v.c1 && ctx.c <= v.c2) return cellValue(v.si, v.r1, ctx.c);
    throw new Skip('the formula returns several values (it would spill)');
  }

  /** Rows of values of a range, whole columns and rows trimmed to the used part of the sheet. */
  function grid(v) {
    if (v instanceof Matrix) return v.rows;
    if (!(v instanceof Ref)) return [[v]];
    const sheet = book.sheets[v.si];
    const r2 = Math.min(v.r2, Math.max(sheet.maxRow, v.r1));
    const c2 = Math.min(v.c2, Math.max(sheet.maxCol, v.c1));
    const rows = [];
    for (let r = v.r1; r <= r2; r++) {
      const row = [];
      for (let c = v.c1; c <= c2; c++) row.push(cellValue(v.si, r, c));
      rows.push(row);
    }
    return rows;
  }

  function resolveRef(node, ctx) {
    let si = ctx.si;
    if (node.sheet !== null && node.sheet !== undefined) {
      si = sheetIndex.get(node.sheet.toLowerCase());
      if (si === undefined) throw E.ref();
    }
    const { r1, c1, r2, c2 } = node.range;
    return new Ref(si, r1, c1, r2, c2);
  }

  function ev(node, ctx) {
    switch (node.type) {
      case 'num':
      case 'str':
      case 'bool':
        return node.value;
      case 'err':
        return new XErr(node.value);
      case 'missing':
        return null;
      case 'ref':
        return resolveRef(node, ctx);
      case 'name': {
        const def = book.names.get(node.name.toLowerCase());
        if (!def) throw E.name();
        const { r1, c1, r2, c2 } = def.range;
        return new Ref(def.si, r1, c1, r2, c2);
      }
      case 'neg':
        return lift(ev(node.a, ctx), ctx, (x) => -num(x));
      case 'pct':
        return lift(ev(node.a, ctx), ctx, (x) => num(x) / 100);
      case 'bin':
        return binary(node.op, ev(node.a, ctx), ev(node.b, ctx), ctx);
      case 'fn': {
        const fn = FN[node.name];
        if (!fn) throw new Skip(`${node.name} is not computed here`);
        return fn(node.args, ctx);
      }
      default:
        throw new Skip(`unsupported ${node.type}`);
    }
  }

  /** Applies a one-value operation to a value or to every value of an array. */
  function lift(v, ctx, f) {
    const one = (x) => {
      try {
        if (x instanceof XErr) return x;
        return f(x);
      } catch (e) {
        if (e instanceof XErr) return e;
        throw e;
      }
    };
    if (isArr(v)) return new Matrix(grid(v).map((row) => row.map(one)));
    const r = one(v);
    if (r instanceof XErr) throw r;
    return r;
  }

  function binary(op, a, b, ctx) {
    const f = (x, y) => {
      if (x instanceof XErr) return x;
      if (y instanceof XErr) return y;
      try {
        return OPS[op](x, y);
      } catch (e) {
        if (e instanceof XErr) return e;
        throw e;
      }
    };
    if (!isArr(a) && !isArr(b)) {
      const r = f(a, b);
      if (r instanceof XErr) throw r;
      return r;
    }
    const ga = isArr(a) ? grid(a) : [[a]];
    const gb = isArr(b) ? grid(b) : [[b]];
    const h = Math.max(ga.length, gb.length);
    const w = Math.max(ga[0]?.length ?? 0, gb[0]?.length ?? 0);
    const at = (g, i, j) => {
      const row = g.length === 1 ? g[0] : g[i];
      if (!row) return E.na();
      const x = row.length === 1 ? row[0] : row[j];
      return x === undefined ? E.na() : x;
    };
    const rows = [];
    for (let i = 0; i < h; i++) {
      const row = [];
      for (let j = 0; j < w; j++) row.push(f(at(ga, i, j), at(gb, i, j)));
      rows.push(row);
    }
    return new Matrix(rows);
  }

  // ------------------------------------------------------------------ helpers for functions
  const val = (node, ctx) => {
    let v = ev(node, ctx);
    if (isArr(v)) v = intersect(v, ctx);
    if (v instanceof XErr) throw v;
    return v;
  };
  const any = (node, ctx) => ev(node, ctx);
  /** Values of every argument flattened; `ref` tells whether a value came from a range (Excel ignores text there). */
  const flat = (args, ctx) => {
    const out = [];
    for (const a of args) {
      if (a.type === 'missing') continue;
      const v = ev(a, ctx);
      if (isArr(v)) for (const row of grid(v)) for (const x of row) out.push({ v: x, ref: true });
      else out.push({ v, ref: false });
    }
    return out;
  };
  const numbers = (args, ctx) => {
    const out = [];
    for (const { v, ref } of flat(args, ctx)) {
      if (v instanceof XErr) throw v;
      if (ref) {
        if (typeof v === 'number') out.push(v);
      } else if (v !== null) out.push(num(v));
    }
    return out;
  };
  const optNum = (node, ctx, dflt) => (node && node.type !== 'missing' ? num(val(node, ctx)) : dflt);
  const arr = (node, ctx) => {
    const v = ev(node, ctx);
    return isArr(v) ? v : new Matrix([[v]]);
  };
  const dims = (v) => {
    const g = grid(v);
    return [g.length, g[0]?.length ?? 0];
  };
  /** Value at offset (i, j) of a range or array, reading past its trimmed size when it is a range. */
  const at = (v, i, j) => {
    if (v instanceof Ref) return cellValue(v.si, v.r1 + i, v.c1 + j);
    return v.rows[i]?.[j] ?? null;
  };
  const vector = (v) => {
    const g = grid(v);
    if (g.length === 1) return g[0];
    if (g.every((row) => row.length === 1)) return g.map((row) => row[0]);
    return null;
  };

  function conditional(args, ctx, pairsFrom, valuesNode) {
    const pairs = [];
    for (let k = pairsFrom; k + 1 < args.length; k += 2) pairs.push([arr(args[k], ctx), criterion(val(args[k + 1], ctx))]);
    const [h, w] = dims(pairs[0][0]);
    const target = valuesNode ? arr(valuesNode, ctx) : pairs[0][0];
    const out = [];
    for (let i = 0; i < h; i++)
      for (let j = 0; j < w; j++) if (pairs.every(([range, test]) => test(at(range, i, j)))) out.push(at(target, i, j));
    return out;
  }

  const sumOf = (xs) => xs.reduce((s, x) => s + x, 0);
  const stats = {
    mean: (xs) => (xs.length ? sumOf(xs) / xs.length : E.div0()),
    variance: (xs, sample) => {
      if (xs.length < (sample ? 2 : 1)) throw E.div0();
      const m = sumOf(xs) / xs.length;
      return sumOf(xs.map((x) => (x - m) ** 2)) / (xs.length - (sample ? 1 : 0));
    },
  };
  const must = (v) => {
    if (v instanceof XErr) throw v;
    return v;
  };
  const onlyNums = (list) => list.filter((x) => typeof x === 'number');

  function lookupIndex(needle, list, mode) {
    // mode: 0 exact, 2 wildcard, -1 exact or next smaller, 1 exact or next larger
    let best = -1;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (mode === 2 || (mode === 0 && typeof needle === 'string' && /[*?]/.test(needle))) {
        if (typeof x === 'string' && wildcard(needle).test(x)) return i;
        if (typeof needle !== 'string' && equal(x, needle)) return i;
        continue;
      }
      if (equal(x, needle)) return i;
      if (mode === 0 || x === null || typeof x !== typeof needle) continue;
      const d = compare(x, needle);
      if (mode === -1 && d < 0 && (best < 0 || compare(x, list[best]) > 0)) best = i;
      if (mode === 1 && d > 0 && (best < 0 || compare(x, list[best]) < 0)) best = i;
    }
    return best;
  }

  /** Approximate match on sorted data (VLOOKUP/MATCH default): the last value not greater than the needle. */
  function sortedIndex(needle, list, descending = false) {
    let found = -1;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (x === null || typeof x !== typeof needle) continue;
      const d = compare(x, needle);
      if (descending ? d >= 0 : d <= 0) found = i;
      else break;
    }
    return found;
  }

  const FN = {
    SUM: (a, c) => sumOf(numbers(a, c)),
    PRODUCT: (a, c) => numbers(a, c).reduce((p, x) => p * x, 1),
    SUMSQ: (a, c) => sumOf(numbers(a, c).map((x) => x * x)),
    AVERAGE: (a, c) => must(stats.mean(numbers(a, c))),
    MIN: (a, c) => {
      const xs = numbers(a, c);
      return xs.length ? Math.min(...xs) : 0;
    },
    MAX: (a, c) => {
      const xs = numbers(a, c);
      return xs.length ? Math.max(...xs) : 0;
    },
    MEDIAN: (a, c) => {
      const xs = numbers(a, c).sort((x, y) => x - y);
      if (!xs.length) throw E.num();
      const m = xs.length >> 1;
      return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
    },
    COUNT: (a, c) =>
      flat(a, c).filter(({ v, ref }) => typeof v === 'number' || (!ref && v !== null && !(v instanceof XErr) && toNumber(v) !== null)).length,
    COUNTA: (a, c) => flat(a, c).filter(({ v }) => v !== null).length,
    COUNTBLANK: (a, c) => flat(a, c).filter(({ v }) => v === null || v === '').length,
    LARGE: (a, c) => kth(a, c, (x, y) => y - x),
    SMALL: (a, c) => kth(a, c, (x, y) => x - y),
    RANK: (a, c) => {
      const x = num(val(a[0], c));
      const xs = onlyNums(grid(arr(a[1], c)).flat());
      if (!xs.includes(x)) throw E.na();
      const asc = optNum(a[2], c, 0) !== 0;
      return 1 + xs.filter((y) => (asc ? y < x : y > x)).length;
    },
    'STDEV.S': (a, c) => Math.sqrt(stats.variance(numbers(a, c), true)),
    'STDEV.P': (a, c) => Math.sqrt(stats.variance(numbers(a, c), false)),
    'VAR.S': (a, c) => stats.variance(numbers(a, c), true),
    'VAR.P': (a, c) => stats.variance(numbers(a, c), false),
    SUBTOTAL: (a, c) => {
      const code = num(val(a[0], c)) % 100;
      const name = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P' }[code];
      if (!name) throw E.value();
      return FN[name](a.slice(1), c);
    },
    SUMPRODUCT: (a, c) => {
      const gs = a.map((n) => grid(arr(n, c)));
      const [h, w] = [gs[0].length, gs[0][0]?.length ?? 0];
      if (gs.some((g) => g.length !== h || (g[0]?.length ?? 0) !== w)) throw E.value();
      let s = 0;
      for (let i = 0; i < h; i++)
        for (let j = 0; j < w; j++) {
          let p = 1;
          for (const g of gs) {
            const x = must(g[i][j]);
            p *= typeof x === 'number' ? x : 0;
          }
          s += p;
        }
      return s;
    },
    SUMIF: (a, c) => sumOf(onlyNums(conditional([a[0], a[1]], c, 0, a[2]?.type === 'missing' ? undefined : a[2]))),
    SUMIFS: (a, c) => sumOf(onlyNums(conditional(a, c, 1, a[0]))),
    COUNTIF: (a, c) => conditional([a[0], a[1]], c, 0).length,
    COUNTIFS: (a, c) => conditional(a, c, 0).length,
    AVERAGEIF: (a, c) => must(stats.mean(onlyNums(conditional([a[0], a[1]], c, 0, a[2]?.type === 'missing' ? undefined : a[2])))),
    AVERAGEIFS: (a, c) => must(stats.mean(onlyNums(conditional(a, c, 1, a[0])))),
    MAXIFS: (a, c) => {
      const xs = onlyNums(conditional(a, c, 1, a[0]));
      return xs.length ? Math.max(...xs) : 0;
    },
    MINIFS: (a, c) => {
      const xs = onlyNums(conditional(a, c, 1, a[0]));
      return xs.length ? Math.min(...xs) : 0;
    },

    ABS: (a, c) => Math.abs(num(val(a[0], c))),
    INT: (a, c) => Math.floor(num(val(a[0], c))),
    TRUNC: (a, c) => roundWith(num(val(a[0], c)), optNum(a[1], c, 0), Math.trunc),
    ROUND: (a, c) => roundWith(num(val(a[0], c)), optNum(a[1], c, 0), Math.round),
    ROUNDUP: (a, c) => roundWith(num(val(a[0], c)), optNum(a[1], c, 0), Math.ceil),
    ROUNDDOWN: (a, c) => roundWith(num(val(a[0], c)), optNum(a[1], c, 0), Math.floor),
    MROUND: (a, c) => {
      const [x, m] = [num(val(a[0], c)), num(val(a[1], c))];
      if (m === 0) return 0;
      if (x * m < 0) throw E.num();
      return roundWith(x / m, 0, Math.round) * m;
    },
    CEILING: (a, c) => step(num(val(a[0], c)), optNum(a[1], c, 1), Math.ceil),
    'CEILING.MATH': (a, c) => step(num(val(a[0], c)), optNum(a[1], c, 1), Math.ceil),
    FLOOR: (a, c) => step(num(val(a[0], c)), optNum(a[1], c, 1), Math.floor),
    'FLOOR.MATH': (a, c) => step(num(val(a[0], c)), optNum(a[1], c, 1), Math.floor),
    MOD: (a, c) => {
      const [x, d] = [num(val(a[0], c)), num(val(a[1], c))];
      if (d === 0) throw E.div0();
      return x - d * Math.floor(x / d);
    },
    POWER: (a, c) => num(val(a[0], c)) ** num(val(a[1], c)),
    SQRT: (a, c) => {
      const x = num(val(a[0], c));
      if (x < 0) throw E.num();
      return Math.sqrt(x);
    },
    EXP: (a, c) => Math.exp(num(val(a[0], c))),
    LN: (a, c) => positive(Math.log, num(val(a[0], c))),
    LOG10: (a, c) => positive(Math.log10, num(val(a[0], c))),
    LOG: (a, c) => positive(Math.log, num(val(a[0], c))) / Math.log(optNum(a[1], c, 10)),
    SIGN: (a, c) => Math.sign(num(val(a[0], c))),
    PI: () => Math.PI,

    IF: (a, c) => {
      const test = truth(val(a[0], c));
      const branch = test ? a[1] : a[2];
      if (!branch) return test;
      if (branch.type === 'missing') return 0;
      return ev(branch, c);
    },
    IFS: (a, c) => {
      for (let k = 0; k + 1 < a.length; k += 2) if (truth(val(a[k], c))) return ev(a[k + 1], c);
      throw E.na();
    },
    IFERROR: (a, c) => fallback(a, c, () => true),
    IFNA: (a, c) => fallback(a, c, (e) => e.code === '#N/A'),
    AND: (a, c) => logical(a, c).every(Boolean),
    OR: (a, c) => logical(a, c).some(Boolean),
    XOR: (a, c) => logical(a, c).filter(Boolean).length % 2 === 1,
    NOT: (a, c) => !truth(val(a[0], c)),
    TRUE: () => true,
    FALSE: () => false,
    SWITCH: (a, c) => {
      const x = val(a[0], c);
      for (let k = 1; k + 1 < a.length; k += 2) if (equal(x, val(a[k], c))) return ev(a[k + 1], c);
      if (a.length % 2 === 0) return ev(a[a.length - 1], c);
      throw E.na();
    },
    CHOOSE: (a, c) => {
      const k = Math.trunc(num(val(a[0], c)));
      if (k < 1 || k >= a.length) throw E.value();
      return ev(a[k], c);
    },

    ISBLANK: (a, c) => isEmpty(a[0], c),
    ISNUMBER: (a, c) => probe(a[0], c, (v) => typeof v === 'number'),
    ISTEXT: (a, c) => probe(a[0], c, (v) => typeof v === 'string'),
    ISNONTEXT: (a, c) => probe(a[0], c, (v) => typeof v !== 'string'),
    ISLOGICAL: (a, c) => probe(a[0], c, (v) => typeof v === 'boolean'),
    ISERROR: (a, c) => probe(a[0], c, (v) => v instanceof XErr),
    ISERR: (a, c) => probe(a[0], c, (v) => v instanceof XErr && v.code !== '#N/A'),
    ISNA: (a, c) => probe(a[0], c, (v) => v instanceof XErr && v.code === '#N/A'),
    ISEVEN: (a, c) => Math.trunc(num(val(a[0], c))) % 2 === 0,
    ISODD: (a, c) => Math.abs(Math.trunc(num(val(a[0], c))) % 2) === 1,
    NA: () => E.na(),
    N: (a, c) => {
      const v = val(a[0], c);
      return typeof v === 'number' ? v : v === true ? 1 : 0;
    },
    T: (a, c) => {
      const v = val(a[0], c);
      return typeof v === 'string' ? v : '';
    },
    ROW: (a, c) => (a[0] && a[0].type !== 'missing' ? refArg(a[0], c).r1 : c.r),
    COLUMN: (a, c) => (a[0] && a[0].type !== 'missing' ? refArg(a[0], c).c1 : c.c),
    ROWS: (a, c) => {
      const v = arr(a[0], c);
      return v instanceof Ref ? v.r2 - v.r1 + 1 : v.rows.length;
    },
    COLUMNS: (a, c) => {
      const v = arr(a[0], c);
      return v instanceof Ref ? v.c2 - v.c1 + 1 : (v.rows[0]?.length ?? 0);
    },

    VLOOKUP: (a, c) => tableLookup(a, c, false),
    HLOOKUP: (a, c) => tableLookup(a, c, true),
    MATCH: (a, c) => {
      const needle = val(a[0], c);
      const list = vector(arr(a[1], c));
      if (!list) throw E.na();
      const type = optNum(a[2], c, 1);
      const i = type === 0 ? lookupIndex(needle, list, 0) : sortedIndex(needle, list, type < 0);
      if (i < 0) throw E.na();
      return i + 1;
    },
    XMATCH: (a, c) => {
      const needle = val(a[0], c);
      const list = vector(arr(a[1], c));
      if (!list) throw E.value();
      const i = xIndex(needle, list, optNum(a[2], c, 0), optNum(a[3], c, 1));
      if (i < 0) throw E.na();
      return i + 1;
    },
    INDEX: (a, c) => {
      const v = arr(a[0], c);
      const [h, w] = v instanceof Ref ? [v.r2 - v.r1 + 1, v.c2 - v.c1 + 1] : dims(v);
      let row = optNum(a[1], c, 0);
      let col = optNum(a[2], c, a[2] ? 0 : 1);
      if (h === 1 && a.length === 2) [row, col] = [1, row];
      if (row < 0 || col < 0 || row > h || col > w) throw E.ref();
      if (row && col) return at(v, row - 1, col - 1);
      if (!(v instanceof Ref)) throw new Skip('INDEX of a whole row or column of an array');
      return row ? new Ref(v.si, v.r1 + row - 1, v.c1, v.r1 + row - 1, v.c2) : new Ref(v.si, v.r1, v.c1 + col - 1, v.r2, v.c1 + col - 1);
    },
    XLOOKUP: (a, c) => {
      const needle = val(a[0], c);
      const keys = arr(a[1], c);
      const list = vector(keys);
      if (!list) throw E.value();
      const i = xIndex(needle, list, optNum(a[4], c, 0), optNum(a[5], c, 1));
      if (i < 0) {
        if (a[3] && a[3].type !== 'missing') return ev(a[3], c);
        throw E.na();
      }
      const ret = arr(a[2], c);
      const [h, w] = ret instanceof Ref ? [ret.r2 - ret.r1 + 1, ret.c2 - ret.c1 + 1] : dims(ret);
      const vertical = grid(keys).length > 1 || (grid(keys)[0]?.length ?? 0) === 1;
      if (vertical) {
        if (w === 1) return at(ret, i, 0);
        if (ret instanceof Ref) return new Ref(ret.si, ret.r1 + i, ret.c1, ret.r1 + i, ret.c2);
      } else {
        if (h === 1) return at(ret, 0, i);
        if (ret instanceof Ref) return new Ref(ret.si, ret.r1, ret.c1 + i, ret.r2, ret.c1 + i);
      }
      throw new Skip('XLOOKUP returning several values');
    },
    HYPERLINK: (a, c) => (a[1] && a[1].type !== 'missing' ? val(a[1], c) : val(a[0], c)),

    LEN: (a, c) => [...text(val(a[0], c))].length,
    LEFT: (a, c) => [...text(val(a[0], c))].slice(0, count(optNum(a[1], c, 1))).join(''),
    RIGHT: (a, c) => {
      const chars = [...text(val(a[0], c))];
      const n = count(optNum(a[1], c, 1));
      return n ? chars.slice(-n).join('') : '';
    },
    MID: (a, c) => {
      const start = num(val(a[1], c));
      if (start < 1) throw E.value();
      return [...text(val(a[0], c))].slice(start - 1, start - 1 + count(num(val(a[2], c)))).join('');
    },
    UPPER: (a, c) => text(val(a[0], c)).toUpperCase(),
    LOWER: (a, c) => text(val(a[0], c)).toLowerCase(),
    PROPER: (a, c) => text(val(a[0], c)).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, p, l) => p + l.toUpperCase()),
    TRIM: (a, c) => text(val(a[0], c)).replace(/ +/g, ' ').trim(),
    CLEAN: (a, c) => text(val(a[0], c)).replace(/[\u0000-\u001f]/g, ''),
    SUBSTITUTE: (a, c) => {
      const [s, from, to] = [text(val(a[0], c)), text(val(a[1], c)), text(val(a[2], c))];
      if (!from) return s;
      if (!a[3]) return s.split(from).join(to);
      const nth = num(val(a[3], c));
      let k = 0;
      return s.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => (++k === nth ? to : m));
    },
    REPLACE: (a, c) => {
      const chars = [...text(val(a[0], c))];
      const start = num(val(a[1], c));
      chars.splice(start - 1, count(num(val(a[2], c))), text(val(a[3], c)));
      return chars.join('');
    },
    FIND: (a, c) => position(a, c, false),
    SEARCH: (a, c) => position(a, c, true),
    CONCATENATE: (a, c) => a.map((n) => text(val(n, c))).join(''),
    CONCAT: (a, c) => flat(a, c).map(({ v }) => text(must(v))).join(''),
    TEXTJOIN: (a, c) => {
      const sep = text(val(a[0], c));
      const skipEmpty = truth(val(a[1], c));
      return flat(a.slice(2), c)
        .map(({ v }) => text(must(v)))
        .filter((s) => !skipEmpty || s !== '')
        .join(sep);
    },
    REPT: (a, c) => text(val(a[0], c)).repeat(count(num(val(a[1], c)))),
    EXACT: (a, c) => text(val(a[0], c)) === text(val(a[1], c)),
    VALUE: (a, c) => {
      const v = val(a[0], c);
      if (typeof v === 'number') return v;
      const n = toNumber(text(v));
      if (n === null) throw E.value();
      return n;
    },
    TEXT: (a, c) => formatValue(val(a[0], c), text(val(a[1], c))),
    CHAR: (a, c) => String.fromCharCode(num(val(a[0], c))),
    UNICHAR: (a, c) => String.fromCodePoint(num(val(a[0], c))),
    CODE: (a, c) => {
      const s = text(val(a[0], c));
      if (!s) throw E.value();
      return s.charCodeAt(0);
    },

    DATE: (a, c) => {
      let [y, m, d] = [num(val(a[0], c)), num(val(a[1], c)), num(val(a[2], c))].map(Math.trunc);
      if (y < 1900) y += 1900;
      const t = Date.UTC(y, m - 1, d);
      const p = new Date(t);
      return dateToSerial(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate());
    },
    TIME: (a, c) => {
      const s = num(val(a[0], c)) * 3600 + num(val(a[1], c)) * 60 + num(val(a[2], c));
      return (((s % 86400) + 86400) % 86400) / 86400;
    },
    DATEVALUE: (a, c) => {
      const p = parseDateText(text(val(a[0], c)));
      if (!p) throw E.value();
      return Math.floor(p.serial);
    },
    YEAR: (a, c) => serialToParts(date(val(a[0], c))).y,
    MONTH: (a, c) => serialToParts(date(val(a[0], c))).m,
    DAY: (a, c) => serialToParts(date(val(a[0], c))).d,
    HOUR: (a, c) => serialToParts(date(val(a[0], c))).hh,
    MINUTE: (a, c) => serialToParts(date(val(a[0], c))).mi,
    SECOND: (a, c) => serialToParts(date(val(a[0], c))).ss,
    WEEKDAY: (a, c) => {
      const wd = serialToParts(date(val(a[0], c))).weekday;
      const type = optNum(a[1], c, 1);
      if (type === 2) return ((wd + 6) % 7) + 1;
      if (type === 3) return (wd + 6) % 7;
      return wd + 1;
    },
    EDATE: (a, c) => addMonths(date(val(a[0], c)), num(val(a[1], c)), false),
    EOMONTH: (a, c) => addMonths(date(val(a[0], c)), num(val(a[1], c)), true),
    DAYS: (a, c) => Math.floor(date(val(a[0], c))) - Math.floor(date(val(a[1], c))),
    DATEDIF: (a, c) => {
      const [s, e] = [date(val(a[0], c)), date(val(a[1], c))];
      if (s > e) throw E.num();
      const [p, q] = [serialToParts(s), serialToParts(e)];
      const unit = text(val(a[2], c)).toUpperCase();
      const months = (q.y - p.y) * 12 + q.m - p.m - (q.d < p.d ? 1 : 0);
      if (unit === 'D') return Math.floor(e) - Math.floor(s);
      if (unit === 'M') return months;
      if (unit === 'Y') return Math.floor(months / 12);
      if (unit === 'YM') return months % 12;
      throw new Skip(`DATEDIF unit ${unit}`);
    },
  };
  FN.STDEV = FN['STDEV.S'];
  FN.STDEVP = FN['STDEV.P'];
  FN.VAR = FN['VAR.S'];
  FN.VARP = FN['VAR.P'];
  FN['RANK.EQ'] = FN.RANK;
  for (const name of ['TODAY', 'NOW', 'RAND', 'RANDBETWEEN', 'OFFSET', 'INDIRECT', 'CELL', 'INFO'])
    FN[name] = () => {
      throw new Skip(`${name} changes every time the workbook recalculates`);
    };
  if (!COMPUTED.size) for (const name of Object.keys(FN)) COMPUTED.add(name);

  function kth(a, c, order) {
    const xs = onlyNums(grid(arr(a[0], c)).flat().map(must)).sort(order);
    const k = Math.trunc(num(val(a[1], c)));
    if (k < 1 || k > xs.length) throw E.num();
    return xs[k - 1];
  }
  function logical(a, c) {
    const out = [];
    for (const { v, ref } of flat(a, c)) {
      if (v instanceof XErr) throw v;
      if (v === null || (ref && typeof v === 'string')) continue;
      out.push(truth(v));
    }
    if (!out.length) throw E.value();
    return out;
  }
  function fallback(a, c, catches) {
    try {
      const v = val(a[0], c);
      return v;
    } catch (e) {
      if (e instanceof XErr && catches(e)) return a[1] ? ev(a[1], c) : 0;
      throw e;
    }
  }
  function probe(node, c, test) {
    try {
      return test(val(node, c));
    } catch (e) {
      if (e instanceof XErr) return test(e);
      throw e;
    }
  }
  function isEmpty(node, c) {
    const v = ev(node, c);
    if (v instanceof Ref) return v.single && cellValue(v.si, v.r1, v.c1) === null;
    return v === null;
  }
  function refArg(node, c) {
    const v = ev(node, c);
    if (!(v instanceof Ref)) throw E.value();
    return v;
  }
  function tableLookup(a, c, horizontal) {
    const needle = val(a[0], c);
    let g = grid(arr(a[1], c));
    if (horizontal) g = g[0] ? g[0].map((_, j) => g.map((row) => row[j])) : [];
    const idx = Math.trunc(num(val(a[2], c)));
    if (idx < 1) throw E.value();
    if (idx > (g[0]?.length ?? 0)) throw E.ref();
    const approx = a[3] && a[3].type !== 'missing' ? truth(val(a[3], c)) : true;
    const keys = g.map((row) => row[0]);
    const i = approx ? sortedIndex(needle, keys) : lookupIndex(needle, keys, 0);
    if (i < 0) throw E.na();
    return must(g[i][idx - 1]);
  }
  function xIndex(needle, list, mode, search) {
    if (search < 0) {
      const i = lookupIndex(needle, [...list].reverse(), mode);
      return i < 0 ? -1 : list.length - 1 - i;
    }
    return lookupIndex(needle, list, mode);
  }
  function position(a, c, insensitive) {
    const needle = text(val(a[0], c));
    const hay = text(val(a[1], c));
    const start = optNum(a[2], c, 1);
    if (start < 1 || start > hay.length + 1) throw E.value();
    let i;
    if (insensitive) {
      const re = new RegExp(wildcard(needle).source.slice(1, -1), 'i');
      const m = re.exec(hay.slice(start - 1));
      i = m ? m.index + start - 1 : -1;
    } else i = hay.indexOf(needle, start - 1);
    if (i < 0) throw E.value();
    return i + 1;
  }

  return {
    /** The value of a cell, computing formulas on the way; throws Skip when it cannot be computed here. */
    value: (si, r, c) => cellValue(si, r, c),
  };
}

const colLetters = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return 0;
  if (typeof v !== 'string') return null;
  const n = parseNumberText(v);
  if (n) return n.value;
  const d = parseDateText(v);
  return d ? d.serial : null;
}

function num(v) {
  if (v instanceof XErr) throw v;
  const n = toNumber(v);
  if (n === null) throw E.value();
  return n;
}

function date(v) {
  const n = num(v);
  if (n < 0) throw E.num();
  return n;
}

function text(v) {
  if (v instanceof XErr) throw v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(Number(v.toPrecision(15)));
  return v;
}

function truth(v) {
  if (v instanceof XErr) throw v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null) return false;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  throw E.value();
}

const count = (n) => {
  if (n < 0) throw E.value();
  return Math.trunc(n);
};

function positive(f, x) {
  if (x <= 0) throw E.num();
  return f(x);
}

/** Rounds half away from zero at `digits` places, steadied against binary noise (1.005 → 1.01). */
function roundWith(x, digits, how) {
  const f = 10 ** Math.trunc(digits);
  const y = Number((Math.abs(x) * f).toPrecision(15));
  return (Math.sign(x) * how(y)) / f || 0;
}

function step(x, sig, how) {
  if (sig === 0) return 0;
  return how(Number((x / sig).toPrecision(15))) * sig;
}

function addMonths(serial, months, endOfMonth) {
  const p = serialToParts(serial);
  const target = new Date(Date.UTC(p.y, p.m - 1 + Math.trunc(months) + (endOfMonth ? 1 : 0), endOfMonth ? 0 : 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = endOfMonth ? target.getUTCDate() : Math.min(p.d, last);
  return dateToSerial(target.getUTCFullYear(), target.getUTCMonth() + 1, day);
}

// ---------------------------------------------------------------- comparison and criteria
const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);

/** Excel ordering: numbers before text before logicals; text compared without case. */
function compare(a, b) {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') {
    const [x, y] = [a.toLowerCase(), b.toLowerCase()];
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

const equal = (a, b) => compare(a, b) === 0;

const OPS = {
  '+': (a, b) => num(a) + num(b),
  '-': (a, b) => num(a) - num(b),
  '*': (a, b) => num(a) * num(b),
  '/': (a, b) => {
    const d = num(b);
    if (d === 0) throw E.div0();
    return num(a) / d;
  },
  '^': (a, b) => {
    const r = num(a) ** num(b);
    if (!Number.isFinite(r)) throw E.num();
    return r;
  },
  '&': (a, b) => text(a) + text(b),
  '=': (a, b) => compare(a, b) === 0,
  '<>': (a, b) => compare(a, b) !== 0,
  '<': (a, b) => compare(a, b) < 0,
  '>': (a, b) => compare(a, b) > 0,
  '<=': (a, b) => compare(a, b) <= 0,
  '>=': (a, b) => compare(a, b) >= 0,
};

function wildcard(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** A test for one value, from a criterion such as `">=10"`, `"<>done"`, `"North*"`, `5` or `""`. */
export function criterion(crit) {
  if (typeof crit === 'number') return (x) => x === crit || (typeof x === 'string' && toNumber(x) === crit);
  if (typeof crit === 'boolean') return (x) => x === crit;
  if (crit === null) crit = '';
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(String(crit));
  const op = m[1] ?? '=';
  const operand = m[2];
  if (operand === '') {
    if (op === '=') return (x) => x === null || x === '';
    if (op === '<>') return (x) => x !== null && x !== '';
  }
  const n = parseNumberText(operand)?.value ?? parseDateText(operand)?.serial;
  if (n !== undefined) {
    const t = OPS[op];
    if (op === '<>') return (x) => typeof x !== 'number' || x !== n;
    return (x) => typeof x === 'number' && t(x, n);
  }
  if (/^(true|false)$/i.test(operand)) {
    const b = /^true$/i.test(operand);
    return op === '<>' ? (x) => x !== b : (x) => x === b;
  }
  if (op === '=' || op === '<>') {
    const re = wildcard(operand);
    return op === '=' ? (x) => typeof x === 'string' && re.test(x) : (x) => !(typeof x === 'string' && re.test(x));
  }
  return (x) => typeof x === 'string' && OPS[op](x, operand);
}

/** Functions the calculator computes. */
export const COMPUTED = new Set();

/** Real Excel functions the calculator leaves to Excel (so they are not reported as typos). */
export const EXCEL_ONLY = new Set(
  `ACCRINT ACOS ACOSH ADDRESS AGGREGATE AREAS ASIN ASINH ATAN ATAN2 ATANH AVEDEV AVERAGEA BAHTTEXT BASE BESSELI
  BETA.DIST BIN2DEC BINOM.DIST CHISQ.TEST COMBIN CONFIDENCE.NORM CONVERT CORREL COS COSH COUNTUNIQUE COVAR
  COVARIANCE.P COVARIANCE.S CUMIPMT CUMPRINC DATESTRING DAVERAGE DB DCOUNT DDB DEC2BIN DEC2HEX DEGREES DELTA DEVSQ
  DGET DMAX DMIN DOLLAR DSUM DURATION EFFECT ERF EVEN EXPON.DIST FACT FIXED FORECAST FORECAST.LINEAR FREQUENCY
  FV FVSCHEDULE GAMMA GCD GEOMEAN GETPIVOTDATA GROWTH HARMEAN HEX2DEC IMAGE INTERCEPT IPMT IRR ISFORMULA ISOWEEKNUM
  ISPMT ISREF KURT LCM LINEST LOGEST LOOKUP MAXA MDETERM MINA MINVERSE MIRR MMULT MODE MODE.SNGL MULTINOMIAL
  NETWORKDAYS NETWORKDAYS.INTL NOMINAL NORM.DIST NORM.INV NORM.S.DIST NORMDIST NPER NPV NUMBERVALUE ODD PEARSON
  PERCENTILE PERCENTILE.EXC PERCENTILE.INC PERCENTRANK PERMUT PHONETIC PMT POISSON.DIST PPMT PRICE PROB PV
  QUARTILE QUARTILE.EXC QUARTILE.INC QUOTIENT RADIANS RANK.AVG RATE ROMAN RSQ SEC SECOND SHEET SHEETS SIN SINH
  SKEW SLN SLOPE STANDARDIZE STDEVA STDEVPA STEYX SUMX2MY2 SUMX2PY2 SUMXMY2 SYD T.DIST T.TEST TAN TANH TBILLEQ
  TEXTAFTER TEXTBEFORE TRANSPOSE TREND TRIMMEAN TYPE UNICODE VARA VARPA VDB WEEKNUM WEIBULL.DIST WORKDAY
  WORKDAY.INTL XIRR XNPV YEARFRAC YIELD Z.TEST LET LAMBDA ARRAYTOTEXT VALUETOTEXT ENCODEURL WEBSERVICE`.split(/\s+/),
);

/**
 * Computes every formula in the workbook and stores the results on the cells: `v` and `t` hold the cached value,
 * `skip` the reason when the value is left for Excel to calculate.
 * @returns {{ computed: number, skipped: number }}
 */
export function calculate(book) {
  const calc = createCalc(book);
  let computed = 0;
  let skipped = 0;
  book.sheets.forEach((sheet, si) => {
    for (const [key, cell] of sheet.cells) {
      if (cell.f === undefined || (book.useCached && cell.result)) continue;
      const r = Math.floor(key / 16384);
      const c = key % 16384;
      try {
        const v = calc.value(si, r, c);
        cell.result = v instanceof XErr ? { t: 'e', v: v.code } : { t: typeof v === 'boolean' ? 'b' : typeof v === 'number' ? 'n' : 's', v };
        delete cell.skip;
        computed++;
      } catch (e) {
        if (e instanceof Skip) {
          cell.skip = e.reason;
          delete cell.result;
          skipped++;
        } else if (e?.constructor?.name === 'FormulaError') {
          cell.skip = `formula error: ${e.message}`;
          delete cell.result;
          skipped++;
        } else throw e;
      }
    }
  });
  return { computed, skipped };
}

createCalc({ sheets: [], names: new Map() }); // fills COMPUTED
