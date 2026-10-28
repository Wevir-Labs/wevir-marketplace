// Checks a calculated workbook for the mistakes that make spreadsheets wrong without looking wrong: formulas
// pointing at missing sheets, empty cells or ranges that stop short of the data, errors and circular
// references, hardcoded numbers in formula columns, numbers and dates stored as text, digits Excel drops.
import { COMPUTED, EXCEL_ONLY, cellKey } from './calc.mjs';
import { cellName, FormulaError, parse, rangeName, SPILLING, tokenize, walk } from './formula.mjs';
import { looksLikeDate, parseNumberText } from './format.mjs';

const AGGREGATES = new Set(['SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MIN', 'MAX', 'MEDIAN', 'PRODUCT', 'SUMPRODUCT', 'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS', 'MAXIFS', 'MINIFS', 'SUBTOTAL', 'STDEV', 'STDEV.S', 'VAR', 'VAR.S']);
const ORDINARY_CONSTANTS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24, 60, 100, 1000, 365, 0.5, -1]);
const PLACEHOLDER_TEXT = /^(-|—|–|n\/a|na|tbd|none|null|\?|待定|无|—+|total|totals|sum|subtotal|grand total|合计|总计|小计)$/i;

const valueOf = (cell) => (cell?.f !== undefined ? (cell.result?.v ?? null) : (cell?.v ?? null));
const isNumber = (cell) => (cell?.f !== undefined ? cell.result?.t === 'n' : cell?.t === 'n' || cell?.t === 'd');
const isBlank = (cell) => !cell || (cell.f === undefined && (cell.v === null || cell.v === '' || cell.t === 'blank'));

/** A formula with its references written relative to its own cell, for comparing formulas down a column. */
export function relativeShape(formula, r, c) {
  try {
    return tokenize(formula)
      .map((t) => {
        if (t.type !== 'ref') return t.type === 'ws' ? '' : t.text.toUpperCase();
        const prefix = t.text.slice(0, t.text.length - t.area.length).toUpperCase();
        return (
          prefix +
          t.area
            .split(':')
            .map((part) => {
              const m = /^(\$?)([A-Za-z]{1,3})?(\$?)(\d+)?$/.exec(part);
              const col = m[2] ? (m[1] ? `C${m[2].toUpperCase()}` : `C[${colIndex(m[2]) - c}]`) : '';
              const row = m[4] ? (m[3] ? `R${m[4]}` : `R[${Number(m[4]) - r}]`) : '';
              return row + col;
            })
            .join(':')
        );
      })
      .join('');
  } catch {
    return formula;
  }
}
const colIndex = (letters) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function list(refs, max = 4) {
  return refs.length > max ? `${refs.slice(0, max).join(', ')} and ${refs.length - max} more` : refs.join(', ');
}

/**
 * Guesses the header row of a sheet read from a file: the first row of two or more filled cells, all text, about
 * as wide as the rows below it. Title and note lines above a table are skipped.
 */
export function guessHeader(sheet) {
  if (sheet.table?.headerRow) return sheet.table.headerRow;
  const filled = (r) => {
    const cells = [];
    for (let c = 1; c <= sheet.maxCol; c++) {
      const cell = sheet.cells.get(cellKey(r, c));
      if (!isBlank(cell)) cells.push(cell);
    }
    return cells;
  };
  for (let r = 1; r <= Math.min(sheet.maxRow - 1, 30); r++) {
    const cells = filled(r);
    if (cells.length < 2 && !(sheet.maxCol === 1 && cells.length === 1)) continue;
    if (!cells.every((cell) => cell.f === undefined && cell.t === 's')) return null;
    let below = 0;
    for (let k = r + 1; k <= Math.min(sheet.maxRow, r + 5); k++) below = Math.max(below, filled(k).length);
    if (below && cells.length >= below * 0.6) return r;
  }
  return null;
}

/**
 * @param {object} book a calculated workbook (model.mjs or read.mjs)
 * @returns {{ level: 'error'|'warning'|'note', where: string, message: string }[]}
 */
export function lintBook(book) {
  const problems = [];
  const add = (level, where, message) => problems.push({ level, where, message });
  const sheetIndex = new Map(book.sheets.map((s, i) => [s.name.toLowerCase(), i]));
  const notComputed = new Map();

  book.sheets.forEach((sheet, si) => {
    if (sheet.kind && sheet.kind !== 'worksheet') return;
    if (!sheet.cells.size) add('note', sheet.name, 'the sheet is empty');

    // Formulas.
    for (const [key, cell] of sheet.cells) {
      if (cell.f === undefined) continue;
      const r = Math.floor(key / 16384);
      const c = key % 16384;
      const where = `${sheet.name}!${cellName(r, c)}`;
      let ast;
      try {
        ast = parse(cell.f);
      } catch (e) {
        if (e instanceof FormulaError) {
          add('error', where, `formula =${cell.f} cannot be read: ${e.message}`);
          continue;
        }
        throw e;
      }
      const constants = [];
      const aggregateArgs = new Set();
      walk(ast, (node) => {
        if (node.type === 'fn') {
          if (AGGREGATES.has(node.name)) for (const a of node.args) if (a.type === 'ref') aggregateArgs.add(a);
          if (SPILLING.has(node.name)) add('warning', where, `${node.name} returns several cells (a dynamic array); this file format stores it as one value. Write the results into cells instead`);
          else if (!COMPUTED.has(node.name) && !EXCEL_ONLY.has(node.name)) add('warning', where, `${node.name} is not an Excel function this checker knows; a typo shows as #NAME? in Excel`);
        } else if (node.type === 'name') {
          if (!book.names.has(node.name.toLowerCase())) add('error', where, `"${node.name}" is not a defined name (Excel shows #NAME?); quote text as "${node.name}" or define the name`);
        } else if (node.type === 'ref') {
          const ti = node.sheet ? sheetIndex.get(node.sheet.toLowerCase()) : si;
          if (ti === undefined) {
            add('error', where, `refers to sheet "${node.sheet}", which this workbook does not have`);
            return;
          }
          checkRef(node, book.sheets[ti], ti === si, { r, c }, where, aggregateArgs.has(node), add);
        }
      });
      walkConstants(ast, constants);
      const odd = constants.filter((n) => !ORDINARY_CONSTANTS.has(n));
      if (odd.length) add('note', where, `the number${odd.length > 1 ? 's' : ''} ${odd.join(', ')} ${odd.length > 1 ? 'are' : 'is'} typed into =${cell.f}; an assumption reads better in its own labeled cell`);
      if (cell.result?.t === 'e') add('warning', where, `=${cell.f} evaluates to ${cell.result.v}`);
      if (cell.skip) {
        if (/^circular/.test(cell.skip)) add('error', where, cell.skip);
        else if (/^formula error/.test(cell.skip)) add('error', where, cell.skip);
        else {
          const list = notComputed.get(sheet.name) ?? [];
          list.push({ where, reason: cell.skip });
          notComputed.set(sheet.name, list);
        }
      }
    }

    // Columns of a table: types and formulas that do not match their neighbours.
    const headerRow = guessHeader(sheet);
    const first = headerRow ? headerRow + 1 : 1;
    for (let c = 1; c <= sheet.maxCol; c++) {
      const cells = [];
      for (let r = first; r <= sheet.maxRow; r++) {
        const cell = sheet.cells.get(cellKey(r, c));
        if (isBlank(cell) || cell.role === 'totals' || cell.role === 'title' || cell.role === 'note') continue;
        cells.push({ r, cell, ref: `${sheet.name}!${cellName(r, c)}` });
      }
      if (!cells.length) continue;
      const numbers = cells.filter((x) => isNumber(x.cell));
      const texts = cells.filter((x) => (x.cell.f === undefined ? x.cell.t === 's' : x.cell.result?.t === 's'));
      const constText = texts.filter((x) => x.cell.f === undefined && !x.cell.where);
      const numericText = constText.filter((x) => parseNumberText(x.cell.v));
      if (numericText.length && numbers.length >= numericText.length)
        add('warning', `${sheet.name}!${cellName(numericText[0].r, c)}`, `numbers stored as text in ${list(numericText.map((x) => cellName(x.r, c)))}; they are left out of sums and sorts`);
      const dateText = constText.filter((x) => looksLikeDate(x.cell.v));
      if (dateText.length) add('warning', `${sheet.name}!${cellName(dateText[0].r, c)}`, `dates stored as text in ${list(dateText.map((x) => cellName(x.r, c)))}; they do not sort or filter as dates`);
      const realText = texts.filter((x) => !parseNumberText(x.cell.v ?? x.cell.result?.v) && !PLACEHOLDER_TEXT.test(String(valueOf(x.cell)).trim()));
      if (numbers.length >= 3 && realText.length && realText.length <= numbers.length / 4)
        add('note', `${sheet.name}!${cellName(realText[0].r, c)}`, `text in a column of numbers or dates: ${list(realText.map((x) => `${cellName(x.r, c)} "${String(valueOf(x.cell)).slice(0, 20)}"`), 3)}`);
      for (const x of numbers) {
        const v = valueOf(x.cell);
        if (x.cell.f === undefined && !x.cell.where && Number.isInteger(v) && Math.abs(v) >= 1e15)
          add('warning', x.ref, `${v} has more than 15 digits, which Excel cannot keep; store identifiers as text`);
        if (/%/.test(x.cell.style?.numFmt ?? '') && x.cell.f === undefined && Number.isInteger(v) && Math.abs(v) > 1 && !x.cell.where)
          add('warning', x.ref, `${v} is formatted as a percent and shows as ${v * 100}%; percents are fractions (0.15 for 15%)`);
      }
      const formulas = cells.filter((x) => x.cell.f !== undefined);
      if (formulas.length >= 3 && formulas.length >= cells.length * 0.6) {
        const shapes = new Map();
        for (const x of formulas) {
          const shape = relativeShape(x.cell.f, x.r, c);
          shapes.set(shape, [...(shapes.get(shape) ?? []), x]);
        }
        const main = [...shapes.values()].sort((a, b) => b.length - a.length)[0];
        if (main.length >= formulas.length * 0.6) {
          // Descriptions get this check per cell when they are built, so only files read from disk need it here.
          const typed = cells.filter((x) => x.cell.f === undefined && x.cell.t === 'n');
          if (typed.length && !sheet.table)
            add('warning', typed[0].ref, `typed number${typed.length > 1 ? 's' : ''} in a column of formulas: ${list(typed.map((x) => cellName(x.r, c)))}; hardcoded?`);
          const odd = formulas.filter((x) => !main.includes(x) && x.r > main[0].r && x.r < main[main.length - 1].r);
          if (odd.length) add('note', odd[0].ref, `formula differs from the rest of column ${cellName(1, c).replace(/\d+/, '')}: ${list(odd.map((x) => `${cellName(x.r, c)} =${x.cell.f}`), 3)}`);
        }
      }
    }

    // Merges inside tables read from files.
    if (!sheet.table && headerRow)
      for (const m of sheet.merges ?? []) if (m.r1 > headerRow && m.r2 <= sheet.maxRow && m.r1 !== m.r2) add('note', `${sheet.name}!${rangeName(m)}`, 'merged cells inside the data block; sorting and filtering will not work across them');
  });

  for (const [name, items] of notComputed) {
    const reasons = [...new Set(items.map((x) => x.reason))];
    add('note', name, `${items.length} formula${items.length > 1 ? 's are' : ' is'} left for Excel to calculate when the file opens (${list(reasons, 2)}); previews that do not calculate show ${items.length > 1 ? 'them' : 'it'} empty: ${list(items.map((x) => x.where.split('!')[1]))}`);
  }
  return dedupe(problems);
}

const COMPARISONS = new Set(['=', '<>', '<', '>', '<=', '>=']);
const ARITHMETIC = new Set(['SUM', 'PRODUCT', 'ABS', 'MAX', 'MIN']);

/** Numbers typed into the arithmetic of a formula; those in conditions, lookups and percent signs do not count. */
function walkConstants(node, out) {
  if (!node) return;
  switch (node.type) {
    case 'num':
      out.push(node.value);
      return;
    case 'neg':
      if (node.a.type === 'num') out.push(-node.a.value);
      else walkConstants(node.a, out);
      return;
    case 'bin':
      if (COMPARISONS.has(node.op)) return;
      walkConstants(node.a, out);
      walkConstants(node.b, out);
      return;
    case 'fn':
      if (ARITHMETIC.has(node.name)) for (const a of node.args) walkConstants(a, out);
      else if (node.name === 'IF') [node.args[1], node.args[2]].forEach((a) => walkConstants(a, out));
      else if (['ROUND', 'ROUNDUP', 'ROUNDDOWN', 'IFERROR', 'IFNA'].includes(node.name)) walkConstants(node.args[0], out);
      return;
    default:
  }
}

function checkRef(node, target, sameSheet, at, where, inAggregate, add) {
  const { r1, c1, r2, c2, wholeCols, wholeRows } = node.range;
  if (wholeCols || wholeRows) return;
  const cellAt = (r, c) => target.cells.get(cellKey(r, c));
  const single = r1 === r2 && c1 === c2;
  if (single) {
    if (isBlank(cellAt(r1, c1)) && (r1 > target.maxRow || c1 > target.maxCol))
      add('warning', where, `${node.text} is an empty cell past the data on ${target.name} (it ends at ${cellName(target.maxRow || 1, target.maxCol || 1)})`);
    return;
  }
  let filled = false;
  for (let r = r1; r <= Math.min(r2, target.maxRow) && !filled; r++) for (let c = c1; c <= c2 && !filled; c++) filled = !isBlank(cellAt(r, c));
  if (!filled) {
    add('warning', where, `${node.text} is an empty range`);
    return;
  }
  if (!inAggregate || r1 === r2) return;
  const own = (r, c) => sameSheet && r === at.r && c === at.c;
  const isData = (r, c) => {
    const cell = cellAt(r, c);
    if (!cell || own(r, c) || cell.role === 'totals' || cell.role === 'header') return false;
    if (cell.f !== undefined && /\b(SUM|SUBTOTAL|AVERAGE|COUNT)\w*\(/i.test(cell.f)) return false;
    return isNumber(cell);
  };
  for (let c = c1; c <= c2; c++) {
    if (isData(r2 + 1, c)) {
      let end = r2 + 1;
      while (isData(end + 1, c)) end++;
      add('warning', where, `${node.text} stops at row ${r2}, but column ${cellName(1, c).replace(/\d+/, '')} has numbers through row ${end}; is the range too short?`);
      return;
    }
    if (r1 > 1 && isData(r1 - 1, c) && isNumber(cellAt(r1, c))) {
      add('warning', where, `${node.text} starts at row ${r1}, but column ${cellName(1, c).replace(/\d+/, '')} has numbers in row ${r1 - 1} too; is the first row left out?`);
      return;
    }
  }
}

function dedupe(problems) {
  const seen = new Set();
  return problems.filter((p) => {
    const key = `${p.level}|${p.where}|${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
