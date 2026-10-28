#!/usr/bin/env node
// Wevir Sheets: builds .xlsx workbooks from a JSON description or a CSV file, exports CSV, reads and checks
// existing .xlsx and CSV files.
//
//   node sheet.mjs build <book.json|data.csv> [--out file.xlsx] [--csv] [--out-dir dir]
//   node sheet.mjs check <book.json|file.xlsx|data.csv> [--json]
//   node sheet.mjs csv   <book.json|file.xlsx|data.csv> [--sheet name|N] [--out-dir dir] [--formatted]
//   node sheet.mjs info  <file.xlsx|data.csv|book.json> [--json] [--rows N]
//   node sheet.mjs read  <file.xlsx|data.csv|book.json> [--sheet name|N] [--range A1:F50] [--limit N]
//                        [--records] [--formulas] [--formatted] [--format json|csv] [--out file]
//
// Outputs go next to the input with the same base name unless --out / --out-dir says otherwise.
// Zero dependencies; Node 22+. Nothing is downloaded and nothing leaves the computer.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculate, cellKey } from './lib/calc.mjs';
import { decodeText, toCsv } from './lib/csv.mjs';
import { cellName, colName, parseRange, rangeName } from './lib/formula.mjs';
import { formatValue, isDateFormat, serialToIso } from './lib/format.mjs';
import { guessHeader, lintBook } from './lib/lint.mjs';
import { fromSpec, sizeColumns, specFromCsv } from './lib/model.mjs';
import { readXlsx } from './lib/read.mjs';
import { renderXlsx } from './lib/xlsx.mjs';

const USAGE = `Usage: node sheet.mjs <build|check|csv|info|read> <file> [options]
  build <book.json|data.csv>   write <name>.xlsx (--out file.xlsx, --csv for CSV files too)
  check <book.json|.xlsx|.csv> report formula, type and date problems (--json)
  csv   <book.json|.xlsx|.csv> write one UTF-8 CSV per sheet (--sheet, --out-dir, --formatted)
  info  <.xlsx|.csv|book.json> sheets, columns, types and first rows (--json, --rows N)
  read  <.xlsx|.csv|book.json> cell values as JSON or CSV (--sheet, --range, --limit, --records,
                               --formulas, --formatted, --format json|csv, --out)`;

const FLAGS = ['csv', 'json', 'records', 'formulas', 'formatted'];
const VALUES = ['out', 'out-dir', 'sheet', 'range', 'limit', 'format', 'rows'];

function parseArgs(argv) {
  const [command, file, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const [name, inline] = a.startsWith('--') ? a.slice(2).split(/=(.*)/s, 2) : [null];
    if (name && FLAGS.includes(name)) opts[name] = true;
    else if (name && VALUES.includes(name)) {
      const v = inline ?? rest[++i];
      if (v === undefined) throw new UsageError(`--${name} needs a value`);
      opts[name] = v;
    } else throw new UsageError(`unknown option ${a}`);
  }
  return { command, file, opts };
}

class UsageError extends Error {}

const rel = (p) => {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith('..') ? r : p;
};

const safeFile = (name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'sheet';

function sheetNameFromFile(file) {
  const base = path.basename(file).replace(/\.[^.]+$/, '');
  return base.replace(/[:\\/?*[\]]/g, '-').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet1';
}

/** Loads any supported input into a calculated workbook, with the problems found while building it. */
async function load(file) {
  if (!file) throw new UsageError('name the input file');
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`no such file: ${file}`);
  const ext = path.extname(abs).toLowerCase();
  const buf = await readFile(abs);
  if (ext === '.xlsx' || ext === '.xlsm') {
    const book = readXlsx(buf);
    book.useCached = true;
    calculate(book);
    return { abs, book, problems: [], source: 'xlsx' };
  }
  if (ext === '.xls') throw new Error('.xls is the old binary format; open it in Excel, Numbers or WPS and save it as .xlsx first');
  if (ext === '.numbers' || ext === '.ods' || ext === '.et') throw new Error(`${ext} files are not read here; export the file as .xlsx or CSV first`);
  let spec;
  let source;
  if (ext === '.json') {
    try {
      spec = JSON.parse(decodeText(buf));
    } catch (e) {
      throw new Error(`${rel(abs)} is not valid JSON: ${e.message}`);
    }
    source = 'json';
  } else {
    spec = specFromCsv(decodeText(buf), { name: sheetNameFromFile(abs) });
    source = 'csv';
  }
  const { book, problems } = fromSpec(spec);
  if (book) {
    calculate(book);
    sizeColumns(book);
  }
  return { abs, book, problems, source };
}

const ORDER = { error: 0, warning: 1, note: 2 };
function sortProblems(problems, book) {
  const sheetOrder = new Map((book?.sheets ?? []).map((s, i) => [s.name, i]));
  const sheetOf = (p) => sheetOrder.get(String(p.where).split('!')[0].replace(/^sheet "|"$/g, '').split(' ')[0]) ?? -1;
  return [...problems].sort((a, b) => ORDER[a.level] - ORDER[b.level] || sheetOf(a) - sheetOf(b));
}

function printProblems(problems) {
  for (const p of problems) console.log(`${p.level.padEnd(7)} ${p.where}  ${p.message}`);
}

function summary(book) {
  let formulas = 0;
  let computed = 0;
  const parts = book.sheets.map((s) => {
    for (const cell of s.cells.values()) {
      if (cell.f === undefined) continue;
      formulas++;
      if (cell.result) computed++;
    }
    const range = s.maxRow ? rangeName({ r1: 1, c1: 1, r2: s.maxRow, c2: s.maxCol }) : 'empty';
    return `${s.name} (${range}${s.hidden ? ', hidden' : ''})`;
  });
  return `${book.sheets.length} sheet${book.sheets.length === 1 ? '' : 's'}: ${parts.join(', ')}; ${formulas} formula${formulas === 1 ? '' : 's'}${formulas ? `, ${computed} with values` : ''}`;
}

// ------------------------------------------------------------------ values for CSV and JSON output

const isDateCell = (cell) => cell.t === 'd' || (cell.f !== undefined && (cell.result?.date || (cell.result?.t === 'n' && isDateFormat(cell.style?.numFmt))));

function plainValue(cell, date1904) {
  if (!cell) return null;
  const value = cell.f !== undefined ? cell.result?.v : cell.v;
  const type = cell.f !== undefined ? cell.result?.t : cell.t;
  if (value === undefined || value === null || type === 'blank') return null;
  if (typeof value === 'number' && isDateCell(cell)) return serialToIso(value, date1904);
  // Excel keeps 15 significant digits; binary noise past them (28136.999999999996) is not data.
  if (typeof value === 'number') return Number(value.toPrecision(15));
  return value;
}

function shownValue(cell, date1904) {
  if (!cell) return '';
  const value = cell.f !== undefined ? cell.result?.v : cell.v;
  if (value === undefined || value === null) return '';
  return formatValue(value, cell.style?.numFmt ?? 'General', { date1904 });
}

/** The part of a sheet to export: a table's header and data rows, or every used cell. */
function exportBox(sheet, { tableOnly }) {
  if (tableOnly && sheet.table?.box) return sheet.table.box;
  let r1 = Infinity;
  let c1 = Infinity;
  for (const [key, cell] of sheet.cells) {
    if (cell.t === 'blank') continue;
    r1 = Math.min(r1, Math.floor(key / 16384));
    c1 = Math.min(c1, key % 16384);
  }
  if (!sheet.maxRow) return null;
  return { r1, c1, r2: sheet.maxRow, c2: sheet.maxCol };
}

function gridOf(sheet, box, { formatted, date1904, formulasAsText }) {
  const rows = [];
  if (!box) return rows;
  for (let r = box.r1; r <= box.r2; r++) {
    const row = [];
    for (let c = box.c1; c <= box.c2; c++) {
      const cell = sheet.cells.get(cellKey(r, c));
      if (cell?.f !== undefined && !cell.result) row.push(formulasAsText ? `=${cell.f}` : null);
      else row.push(formatted ? shownValue(cell, date1904) : plainValue(cell, date1904));
    }
    rows.push(row);
  }
  return rows;
}

function pickSheets(book, which) {
  if (which === undefined) return book.sheets.filter((s) => !s.kind || s.kind === 'worksheet');
  const n = /^\d+$/.test(which) ? Number(which) : null;
  const sheet = n ? book.sheets[n - 1] : book.sheets.find((s) => s.name.toLowerCase() === String(which).toLowerCase());
  if (!sheet) throw new Error(`no sheet ${JSON.stringify(which)}; the sheets are ${book.sheets.map((s, i) => `${i + 1} "${s.name}"`).join(', ')}`);
  return [sheet];
}

// ------------------------------------------------------------------ info

const headerRowOf = guessHeader;

function describeColumn(sheet, c, first, date1904) {
  const counts = { number: 0, date: 0, text: 0, boolean: 0, error: 0, empty: 0, formula: 0 };
  const nums = [];
  const dates = [];
  const texts = new Map();
  for (let r = first; r <= sheet.maxRow; r++) {
    const cell = sheet.cells.get(cellKey(r, c));
    if (cell?.f !== undefined) counts.formula++;
    const v = plainValue(cell, date1904);
    const t = cell?.f !== undefined ? cell.result?.t : cell?.t;
    if (v === null || v === '') counts.empty++;
    else if (cell && isDateCell(cell) && typeof (cell.f !== undefined ? cell.result?.v : cell.v) === 'number') {
      counts.date++;
      dates.push(v);
    } else if (t === 'n') {
      counts.number++;
      nums.push(v);
    } else if (t === 'b') counts.boolean++;
    else if (t === 'e') counts.error++;
    else {
      counts.text++;
      texts.set(v, (texts.get(v) ?? 0) + 1);
    }
  }
  const filled = counts.number + counts.date + counts.text + counts.boolean + counts.error;
  const main = Object.entries(counts)
    .filter(([k]) => !['empty', 'formula'].includes(k))
    .sort((a, b) => b[1] - a[1])[0];
  const type = !filled ? 'empty' : main[1] === filled ? main[0] : `mixed (${Object.entries(counts).filter(([k, n]) => n && !['empty', 'formula'].includes(k)).map(([k, n]) => `${n} ${k}`).join(', ')})`;
  const out = { type, values: filled, empty: counts.empty };
  if (counts.formula) out.formulas = counts.formula;
  if (counts.error) out.errors = counts.error;
  if (nums.length) {
    const sum = nums.reduce((s, x) => s + x, 0);
    Object.assign(out, { min: Math.min(...nums), max: Math.max(...nums), sum: Number(sum.toPrecision(15)) });
    out.min = Number(out.min.toPrecision(15));
    out.max = Number(out.max.toPrecision(15));
  }
  if (dates.length) Object.assign(out, { from: dates.reduce((a, b) => (a < b ? a : b)), to: dates.reduce((a, b) => (a > b ? a : b)) });
  if (texts.size && texts.size <= 12 && counts.text >= texts.size * 2) out.distinct = [...texts.keys()].slice(0, 12);
  else if (texts.size) out.distinctCount = texts.size;
  const fmt = sheet.cells.get(cellKey(first, c))?.style?.numFmt;
  if (fmt && fmt !== 'General') out.format = fmt;
  return out;
}

function describe(book, sheet, rowsToShow) {
  const date1904 = !!book.date1904;
  const header = headerRowOf(sheet);
  const first = header ? header + 1 : 1;
  const columns = [];
  for (let c = 1; c <= sheet.maxCol; c++) {
    const head = header ? plainValue(sheet.cells.get(cellKey(header, c)), date1904) : null;
    columns.push({ column: colName(c), header: head, ...describeColumn(sheet, c, first, date1904) });
  }
  const sample = gridOf(sheet, sheet.maxRow ? { r1: first, c1: 1, r2: Math.min(sheet.maxRow, first + rowsToShow - 1), c2: sheet.maxCol } : null, { date1904, formulasAsText: true });
  return {
    name: sheet.name,
    ...(sheet.hidden && { hidden: true }),
    ...(sheet.kind && sheet.kind !== 'worksheet' && { kind: sheet.kind }),
    range: sheet.maxRow ? rangeName({ r1: 1, c1: 1, r2: sheet.maxRow, c2: sheet.maxCol }) : null,
    headerRow: header,
    dataRows: sheet.maxRow ? sheet.maxRow - first + 1 : 0,
    ...(sheet.freeze && { frozenAt: cellName(sheet.freeze.r, sheet.freeze.c) }),
    ...(sheet.filter && { filter: rangeName(sheet.filter) }),
    ...(sheet.merges?.length && { merged: sheet.merges.map(rangeName) }),
    columns,
    firstRows: sample,
  };
}

function printInfo(file, book, sheets) {
  console.log(`${path.basename(file)}: ${summary(book)}${book.date1904 ? ' (1904 date system)' : ''}`);
  for (const s of sheets) {
    console.log(`\nSheet "${s.name}"${s.hidden ? ' (hidden)' : ''}${s.kind ? ` (${s.kind}, no cells)` : ''}: ${s.range ?? 'empty'}, ${s.headerRow ? `header in row ${s.headerRow}, ` : 'no header row found, '}${s.dataRows} data row${s.dataRows === 1 ? '' : 's'}${s.frozenAt ? `, frozen at ${s.frozenAt}` : ''}${s.filter ? `, filter ${s.filter}` : ''}${s.merged ? `, merged ${s.merged.slice(0, 4).join(' ')}${s.merged.length > 4 ? ' …' : ''}` : ''}`);
    for (const col of s.columns) {
      const extra = [];
      if (col.min !== undefined) extra.push(`min ${col.min}, max ${col.max}, sum ${col.sum}`);
      if (col.from !== undefined) extra.push(`${col.from} … ${col.to}`);
      if (col.distinct) extra.push(`values: ${col.distinct.join(' | ')}`);
      else if (col.distinctCount) extra.push(`${col.distinctCount} distinct`);
      if (col.formulas) extra.push(`${col.formulas} formulas`);
      if (col.errors) extra.push(`${col.errors} errors`);
      if (col.empty) extra.push(`${col.empty} empty`);
      if (col.format) extra.push(`format ${col.format}`);
      console.log(`  ${col.column.padEnd(3)} ${String(col.header ?? '').slice(0, 28).padEnd(28)} ${col.type.padEnd(8)} ${extra.join('; ')}`);
    }
    if (s.firstRows.length) {
      console.log('  first rows:');
      for (const row of s.firstRows) console.log(`    ${row.map((v) => (v === null ? '' : String(v))).join(' | ')}`);
    }
  }
}

/** JSON with each row of values on one line, so a table reads as a table. */
function compactJson(value, indent = '') {
  const flat = (v) => v === null || typeof v !== 'object';
  if (Array.isArray(value)) {
    if (value.every(flat)) return JSON.stringify(value);
    if (!value.length) return '[]';
    return `[\n${value.map((v) => `${indent}  ${compactJson(v, `${indent}  `)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    if (entries.length <= 16 && entries.every(([, v]) => flat(v)) && indent.length >= 6) return JSON.stringify(value);
    return `{\n${entries.map(([k, v]) => `${indent}  ${JSON.stringify(k)}: ${compactJson(v, `${indent}  `)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

// ------------------------------------------------------------------ commands

async function main() {
  const { command, file, opts } = parseArgs(process.argv.slice(2));
  if (!['build', 'check', 'csv', 'info', 'read'].includes(command)) throw new UsageError(command ? `unknown command ${command}` : 'name a command');
  const { abs, book, problems, source } = await load(file);
  const base = path.join(path.dirname(abs), path.basename(abs).replace(/\.[^.]+$/, ''));
  const date1904 = !!book?.date1904;

  if (command === 'check') {
    const all = sortProblems([...problems, ...(book ? lintBook(book) : [])], book);
    if (opts.json) console.log(JSON.stringify({ file: rel(abs), summary: book ? summary(book) : null, problems: all }, null, 2));
    else {
      console.log(`${path.basename(abs)}: ${book ? summary(book) : 'not readable'}`);
      if (!all.length) console.log('No problems found.');
      printProblems(all);
    }
    process.exit(all.some((p) => p.level === 'error') ? 1 : 0);
  }

  if (command === 'build') {
    if (source === 'xlsx') throw new UsageError('build takes a JSON description or a CSV file; to check an .xlsx use check, to export it use csv');
    const all = sortProblems([...problems, ...(book ? lintBook(book) : [])], book);
    const errors = all.filter((p) => p.level === 'error');
    if (errors.length || !book) {
      printProblems(errors);
      console.error(`\n${errors.length} error${errors.length === 1 ? '' : 's'}; nothing written. Fix them and build again.`);
      process.exit(1);
    }
    const target = opts.out ? path.resolve(opts.out) : `${base}.xlsx`;
    if (target === abs) throw new UsageError('--out names the input file; pick another name');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, renderXlsx(book));
    const written = [target];
    if (opts.csv) written.push(...(await writeCsvs(book, base, opts, true, abs)));
    printProblems(all.filter((p) => p.level === 'warning'));
    const notes = all.filter((p) => p.level === 'note').length;
    if (notes) console.log(`(${notes} note${notes === 1 ? '' : 's'}: run check to see ${notes === 1 ? 'it' : 'them'})`);
    for (const f of written) console.log(rel(f));
    return;
  }

  if (!book) {
    printProblems(problems);
    process.exit(1);
  }

  if (command === 'csv') {
    const written = await writeCsvs(book, base, opts, source !== 'xlsx', abs);
    for (const f of written) console.log(rel(f));
    return;
  }

  if (command === 'info') {
    const sheets = pickSheets(book, opts.sheet).map((s) => describe(book, s, Number(opts.rows ?? 5)));
    if (opts.json) console.log(compactJson({ file: rel(abs), dateSystem: date1904 ? 1904 : 1900, names: [...book.names.values()].map((n) => ({ name: n.name, refersTo: n.text ?? `${book.sheets[n.si].name}!${rangeName(n.range)}` })), sheets }));
    else printInfo(abs, book, sheets);
    return;
  }

  // read
  const limit = opts.limit === undefined ? 500 : Number(opts.limit);
  if (!Number.isInteger(limit) || limit < 0) throw new UsageError('--limit is a whole number of rows (0 for all)');
  const format = opts.format ?? 'json';
  if (!['json', 'csv'].includes(format)) throw new UsageError('--format is json or csv');
  const sheets = pickSheets(book, opts.sheet ?? (format === 'csv' ? '1' : undefined));
  const box = opts.range ? parseRange(opts.range.replace(/\$/g, '').toUpperCase()) : null;
  if (opts.range && !box) throw new UsageError(`--range ${opts.range} is not a range like A1:F50`);
  const out = [];
  const notes = [];
  for (const sheet of sheets) {
    let area = box ?? exportBox(sheet, { tableOnly: false });
    if (area && !box) area = { ...area, r1: 1, c1: 1 };
    if (area?.wholeCols) area = { ...area, r2: Math.max(sheet.maxRow, 1) };
    if (area?.wholeRows) area = { ...area, c2: Math.max(sheet.maxCol, 1) };
    let rows = gridOf(sheet, area, { formatted: opts.formatted, date1904 });
    const header = opts.records ? (box ? box.r1 : (headerRowOf(sheet) ?? 1)) : null;
    let truncated = false;
    const skip = header && area ? header - area.r1 + 1 : 0;
    if (limit && rows.length - skip > limit) {
      truncated = true;
      notes.push(`${sheet.name}: showing ${limit} of ${rows.length - skip} rows; pass --limit 0 for all or --range to pick rows`);
      rows = rows.slice(0, skip + limit);
    }
    const entry = { name: sheet.name, range: area ? rangeName({ ...area, r2: area.r1 + rows.length - 1 || area.r1 }) : null, ...(truncated && { truncated: true }) };
    if (opts.records && rows.length) {
      const heads = (rows[skip - 1] ?? rows[0]).map((h, j) => (h === null || h === '' ? colName(area.c1 + j) : String(h)));
      const unique = heads.map((h, j) => (heads.indexOf(h) === j ? h : `${h}_${j + 1}`));
      entry.records = rows.slice(skip).map((row) => Object.fromEntries(unique.map((h, j) => [h, row[j] ?? null])));
    } else entry.rows = rows;
    if (opts.formulas) {
      const formulas = {};
      for (const [key, cell] of sheet.cells) {
        const r = Math.floor(key / 16384);
        const c = key % 16384;
        if (cell.f === undefined || (area && (r < area.r1 || r > area.r1 + rows.length - 1 || c < area.c1 || c > area.c2))) continue;
        formulas[cellName(r, c)] = `=${cell.f}`;
      }
      entry.formulas = formulas;
    }
    out.push(entry);
  }
  let text;
  if (format === 'csv') {
    const entry = out[0];
    const rows = entry.records ? [Object.keys(entry.records[0] ?? {}), ...entry.records.map((r) => Object.values(r))] : entry.rows;
    text = toCsv(rows, { bom: !!opts.out });
  } else text = `${compactJson({ file: rel(abs), dateSystem: date1904 ? 1904 : 1900, sheets: out })}\n`;
  if (opts.out) {
    if (path.resolve(opts.out) === abs) throw new UsageError('--out names the file being read; pick another name');
    await writeFile(path.resolve(opts.out), text);
    console.log(rel(path.resolve(opts.out)));
  } else process.stdout.write(text);
  for (const n of notes) console.error(`note: ${n}`);
}

async function writeCsvs(book, base, opts, tableOnly, input) {
  const sheets = pickSheets(book, opts.sheet);
  const dir = opts['out-dir'] ? path.resolve(opts['out-dir']) : path.dirname(base);
  await mkdir(dir, { recursive: true });
  const written = [];
  const many = sheets.length > 1;
  const used = new Set();
  for (const sheet of sheets) {
    const rows = gridOf(sheet, exportBox(sheet, { tableOnly }), { formatted: opts.formatted, date1904: !!book.date1904, formulasAsText: true });
    let name = `${path.basename(base)}${many ? `-${safeFile(sheet.name)}` : ''}`;
    // Never write over the file being read.
    if (path.resolve(dir, `${name}.csv`) === input) name += '-export';
    while (used.has(name.toLowerCase())) name += '_';
    used.add(name.toLowerCase());
    const target = path.join(dir, `${name}.csv`);
    await writeFile(target, toCsv(rows));
    written.push(target);
  }
  return written;
}

main().catch((error) => {
  if (error instanceof UsageError) {
    console.error(`error: ${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  console.error(`error: ${error.message}`);
  if (process.env.SHEETS_DEBUG) console.error(error.stack);
  process.exit(1);
});
