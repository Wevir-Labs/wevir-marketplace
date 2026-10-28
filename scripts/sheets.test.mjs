// Tests for the Sheets plugin's script (plugins/sheets/skills/sheets/scripts): formulas, formats, the calculator,
// CSV, the ZIP reader, building and reading back workbooks, the checks and the command line.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { after, before, describe, it } from 'node:test';
import { calculate, cellKey, criterion } from '../plugins/sheets/skills/sheets/scripts/lib/calc.mjs';
import { decodeText, guessDelimiter, parseCsv, toCsv } from '../plugins/sheets/skills/sheets/scripts/lib/csv.mjs';
import {
  colName,
  colNumber,
  parse,
  parseRange,
  shiftFormula,
  storedFormula,
  tokenize,
} from '../plugins/sheets/skills/sheets/scripts/lib/formula.mjs';
import {
  dateToSerial,
  formatValue,
  isDateFormat,
  looksLikeDate,
  parseDateText,
  parseNumberText,
  serialToIso,
} from '../plugins/sheets/skills/sheets/scripts/lib/format.mjs';
import { lintBook } from '../plugins/sheets/skills/sheets/scripts/lib/lint.mjs';
import { fromSpec, sizeColumns, specFromCsv, textWidth } from '../plugins/sheets/skills/sheets/scripts/lib/model.mjs';
import { readXlsx } from '../plugins/sheets/skills/sheets/scripts/lib/read.mjs';
import { renderXlsx } from '../plugins/sheets/skills/sheets/scripts/lib/xlsx.mjs';
import { unzip, zip } from '../plugins/sheets/skills/sheets/scripts/lib/zip.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../plugins/sheets/skills/sheets/scripts/sheet.mjs');

/** Builds a workbook from a description the way `sheet.mjs build` does. */
function build(spec) {
  const { book, problems } = fromSpec(spec);
  assert.ok(book, JSON.stringify(problems));
  calculate(book);
  sizeColumns(book);
  return { book, problems };
}
const cell = (sheet, ref) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return sheet.cells.get(cellKey(Number(m[2]), colNumber(m[1])));
};
const value = (c) => (c?.f !== undefined ? c.result?.v : c?.v);

let dir;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'wevir-sheets-'));
});
after(() => rm(dir, { recursive: true, force: true }));

describe('formula', () => {
  it('converts column letters and ranges', () => {
    for (const n of [1, 26, 27, 52, 702, 703, 16384]) assert.equal(colNumber(colName(n)), n);
    assert.equal(colName(16384), 'XFD');
    assert.deepEqual(parseRange('B2:D9'), { r1: 2, c1: 2, r2: 9, c2: 4 });
    assert.equal(parseRange('A:C').wholeCols, true);
    assert.equal(parseRange('XFE1'), null);
  });

  it('tokenizes and parses with Excel precedence', () => {
    const toks = tokenize("=SUM('Q3 Sales'!B2:B9)*-2^2&\"x\"");
    assert.deepEqual(toks.map((t) => t.type), ['func', 'op', 'ref', 'op', 'op', 'op', 'num', 'op', 'num', 'op', 'str']);
    assert.equal(toks[2].sheet, 'Q3 Sales');
    const tree = parse('-2^2');
    assert.equal(tree.type, 'bin');
    assert.equal(tree.a.type, 'neg');
    assert.throws(() => parse('SUM(1,'), /ends too early/);
    assert.throws(() => parse('{1,2}'), /array constants/);
  });

  it('shifts relative references and keeps absolute ones', () => {
    assert.equal(shiftFormula('B2*$C$1+SUM(D2:D3)', 3, 1), 'C5*$C$1+SUM(E5:E6)');
    assert.equal(shiftFormula('A1', -1, 0), '#REF!');
  });

  it('prefixes newer functions for the file and leaves the rest', () => {
    assert.equal(storedFormula('=XLOOKUP(A2,B:B,C:C)+SUM(1)'), '_xlfn.XLOOKUP(A2,B:B,C:C)+SUM(1)');
    assert.equal(storedFormula('FILTER(A1:A9,B1:B9>0)'), '_xlfn._xlws.FILTER(A1:A9,B1:B9>0)');
    assert.equal(storedFormula('IFS(A1>0,"a",TRUE,"b")'), '_xlfn.IFS(A1>0,"a",TRUE,"b")');
  });
});

describe('format', () => {
  it('maps dates to serial numbers in both date systems', () => {
    assert.equal(dateToSerial(2026, 10, 1), 46296);
    assert.equal(dateToSerial(1900, 1, 1), 1);
    assert.equal(dateToSerial(1900, 3, 1), 61);
    assert.equal(serialToIso(46296), '2026-10-01');
    assert.equal(serialToIso(46296.5), '2026-10-01T12:00:00');
    assert.equal(serialToIso(0.25), '06:00:00');
    assert.equal(serialToIso(46296 - 1462, true), '2026-10-01');
  });

  it('reads unambiguous dates and refuses ambiguous ones', () => {
    assert.deepEqual(parseDateText('2026-10-01'), { serial: 46296, kind: 'date' });
    assert.deepEqual(parseDateText('2026年10月1日'), { serial: 46296, kind: 'date' });
    assert.equal(parseDateText('2026-02-30'), null);
    assert.equal(parseDateText('01/10/2026'), null);
    assert.equal(looksLikeDate('01/10/2026'), true);
    assert.equal(looksLikeDate('Oct 1, 2026'), true);
    assert.equal(looksLikeDate('A-123'), false);
  });

  it('reads numbers written as text but not identifiers', () => {
    assert.deepEqual(parseNumberText('(1,234.5)'), { value: -1234.5, kind: 'number' });
    assert.deepEqual(parseNumberText('¥1,200'), { value: 1200, kind: 'currency', symbol: '¥' });
    assert.deepEqual(parseNumberText('12.5%'), { value: 0.125, kind: 'percent' });
    assert.equal(parseNumberText('00123'), null);
    assert.equal(parseNumberText('1234567890123456789'), null);
    assert.equal(parseNumberText('12 apples'), null);
  });

  it('renders values through format codes', () => {
    const cases = [
      [1234567.891, '#,##0.00', '1,234,567.89'],
      [-1234.5, '#,##0.00;[Red]-#,##0.00', '-1,234.50'],
      [-5, '#,##0_);(#,##0)', '(5)'],
      [0, '#,##0;-#,##0;"–"', '–'],
      [0.1534, '0.0%', '15.3%'],
      [1234, '"¥"#,##0.00', '¥1,234.00'],
      [1234567, '#,##0.0,,', '1.2'],
      [123456, '0.00E+00', '1.23E+05'],
      [46296, 'yyyy"年"m"月"d"日"', '2026年10月1日'],
      [46296.395833, 'yyyy-mm-dd hh:mm', '2026-10-01 09:30'],
      [0.5, 'h:mm AM/PM', '12:00 PM'],
      [1.5, '[h]:mm', '36:00'],
      [12345.678, 'General', '12345.678'],
      ['abc', '@', 'abc'],
    ];
    for (const [v, code, shown] of cases) assert.equal(formatValue(v, code), shown, code);
    assert.equal(isDateFormat('yyyy-mm-dd'), true);
    assert.equal(isDateFormat('#,##0.00'), false);
    assert.equal(isDateFormat('"m"0'), false);
  });

  it('measures Chinese text as double width', () => {
    assert.equal(textWidth('ab'), 2);
    assert.equal(textWidth('金额'), 4);
  });
});

describe('calculator', () => {
  const book = () => {
    const cells = new Map();
    const put = (ref, x) => {
      const m = /^([A-Z]+)(\d+)$/.exec(ref);
      cells.set(cellKey(Number(m[2]), colNumber(m[1])), typeof x === 'string' && x.startsWith('=') ? { f: x.slice(1) } : { v: x, t: typeof x === 'number' ? 'n' : 's' });
    };
    [['Region', 'Units', 'Price'], ['North', 10, 2.5], ['South', 4, 3], ['East', 7, 1.005]].forEach((row, i) =>
      row.forEach((x, j) => put(`${colName(j + 1)}${i + 1}`, x)),
    );
    return { put, book: { sheets: [{ name: 'Data', cells, maxRow: 4, maxCol: 3 }], names: new Map([['rate', { si: 0, range: { r1: 2, c1: 3, r2: 2, c2: 3 } }]]) } };
  };
  const cases = {
    '=SUM(B2:B4)': 21,
    '=SUMPRODUCT(B2:B4,C2:C4)': 10 * 2.5 + 4 * 3 + 7 * 1.005,
    '=AVERAGE(B2:B4)': 7,
    '=SUMIF(A2:A4,"N*",B2:B4)': 10,
    '=COUNTIFS(B2:B4,">5")': 2,
    '=VLOOKUP("south",A2:C4,3,FALSE)': 3,
    '=INDEX(B2:B4,MATCH("East",A2:A4,0))': 7,
    '=XLOOKUP("West",A2:A4,B2:B4,"none")': 'none',
    '=SUMPRODUCT((A2:A4<>"South")*B2:B4)': 17,
    '=ROUND(C4*100,0)/100': 1.01,
    '=ROUND(1.005,2)': 1.01,
    '=ROUNDUP(-1.21,1)': -1.3,
    '=IFERROR(1/0,"n/a")': 'n/a',
    '=TEXT(DATE(2026,10,1),"yyyy-mm-dd")': '2026-10-01',
    '=EOMONTH(DATE(2026,1,31),1)': dateToSerial(2026, 2, 28),
    '=-2^2': 4,
    '=A2&" "&B2': 'North 10',
    '=Rate*B2': 25,
    '=MOD(-3,2)': 1,
    '=TEXTJOIN("/",TRUE,A2:A4)': 'North/South/East',
    '=MAX(B:B)': 10,
    '=1/0': '#DIV/0!',
    '=Missing!A1': '#REF!',
  };
  it('computes common formulas like Excel', () => {
    const { put, book: b } = book();
    const refs = Object.keys(cases).map((f, k) => {
      put(`E${k + 1}`, f);
      return `E${k + 1}`;
    });
    b.sheets[0].maxCol = 5;
    b.sheets[0].maxRow = refs.length;
    calculate(b);
    Object.values(cases).forEach((expected, k) => {
      const c = cell(b.sheets[0], refs[k]);
      const got = c.result?.v;
      if (typeof expected === 'number') assert.ok(Math.abs(got - expected) < 1e-9, `${Object.keys(cases)[k]} gave ${got}`);
      else assert.equal(got, expected, Object.keys(cases)[k]);
    });
  });

  it('leaves volatile, unknown, spilling and circular formulas uncomputed', () => {
    const { put, book: b } = book();
    put('E1', '=TODAY()');
    put('E2', '=NOSUCH(1)');
    put('E3', '=B2:B4*2');
    put('E4', '=E5+1');
    put('E5', '=E4+1');
    b.sheets[0].maxCol = 5;
    calculate(b);
    const s = b.sheets[0];
    assert.match(cell(s, 'E1').skip, /TODAY/);
    assert.match(cell(s, 'E2').skip, /NOSUCH/);
    assert.match(cell(s, 'E3').skip, /spill/);
    assert.match(cell(s, 'E4').skip, /circular/);
    assert.equal(cell(s, 'E1').result, undefined);
  });

  it('matches criteria the way SUMIF does', () => {
    assert.equal(criterion('>=10')(10), true);
    assert.equal(criterion('>=10')('12'), false);
    assert.equal(criterion('<>done')('Done'), false);
    assert.equal(criterion('n?rth*')('North-1'), true);
    assert.equal(criterion('')(null), true);
    assert.equal(criterion(5)('5'), true);
  });
});

describe('csv', () => {
  it('parses quotes, embedded line breaks and other delimiters', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,"x, ""y"""\n2,"multi\nline"\n'), [['a', 'b'], ['1', 'x, "y"'], ['2', 'multi\nline']]);
    assert.equal(guessDelimiter('a;b;c\n1;2;3'), ';');
    assert.equal(guessDelimiter('a\tb\n1\t2'), '\t');
  });

  it('writes UTF-8 with a BOM and quotes only where needed', () => {
    const text = toCsv([['名称', '值'], ['a,b', 1], [' pad', null]]);
    assert.ok(text.startsWith('\uFEFF名称,值\r\n'));
    assert.ok(text.includes('"a,b",1\r\n'));
    assert.ok(text.includes('" pad",\r\n'));
    assert.deepEqual(parseCsv(text.slice(1)), [['名称', '值'], ['a,b', '1'], [' pad', '']]);
  });

  it('decodes GB18030 files saved by Chinese Excel', () => {
    assert.equal(decodeText(Buffer.from([0xc4, 0xe3, 0xba, 0xc3])), '你好');
    assert.equal(decodeText(Buffer.from('\uFEFF你好', 'utf8')), '你好');
  });

  it('infers column types from CSV text', () => {
    const spec = specFromCsv('id,date,amount,share,note\n007,2026-10-01,"1,200.5",10%,ok\n008,2026-10-02,980,5%,\n009,2026-10-03,n/a,0%,late\n');
    assert.deepEqual(spec.columns.map((c) => c.type), ['text', 'date', 'number', 'percent', 'text']);
  });
});

describe('zip', () => {
  it('reads back what it writes, stored and deflated', () => {
    const files = unzip(zip([{ name: 'a.xml', data: '<a>中文</a>'.repeat(50) }, { name: 'b.png', data: Buffer.from([1, 2, 3]) }]));
    assert.equal(files.get('a.xml').toString(), '<a>中文</a>'.repeat(50));
    assert.deepEqual([...files.get('b.png')], [1, 2, 3]);
  });

  it('rejects damaged archives', () => {
    const buf = zip([{ name: 'a.txt', data: 'hello hello hello', store: true }]);
    buf[buf.indexOf('hello')] = 0x48;
    assert.throws(() => unzip(buf), /checksum/);
    assert.throws(() => unzip(Buffer.from('not a zip at all, sorry')), /not a ZIP/);
  });
});

const SPEC = {
  title: 'Q3',
  names: { TaxRate: 'Inputs!B2' },
  sheets: [
    {
      name: 'Sales',
      title: 'Q3 sales',
      note: 'Amounts in CNY',
      columns: [
        { header: 'Date', key: 'date', type: 'date' },
        { header: 'Region', key: 'region', list: ['North', 'South'] },
        { header: 'Units', key: 'units', type: 'integer', total: 'sum' },
        { header: 'Price', key: 'price', type: 'currency', symbol: '¥' },
        { header: 'Amount', key: 'amount', type: 'currency', symbol: '¥', formula: '={units}{row}*{price}{row}', total: 'sum' },
        { header: 'Gross', key: 'gross', type: 'currency', formula: '={amount}{row}*(1+TaxRate)' },
        { header: 'Share', key: 'share', type: 'percent', formula: '={amount}{row}/SUM({amount:data})' },
        { header: 'Code', key: 'code', type: 'text' },
      ],
      rows: [
        ['2026-07-03', 'North', 12, 1980, null, null, null, '007'],
        { date: '2026-08-19', region: 'South', units: 2, price: 19800, code: 8 },
      ],
      freeze: 'B5',
      filter: true,
      banded: true,
      merge: ['J1:K1'],
      cells: { J1: '说明', J3: '=XLOOKUP("South",{region:data},{amount:data})' },
      conditional: [
        { column: 'share', when: '>=', value: 0.5, style: 'good' },
        { column: 'amount', bar: true },
        { column: 'units', scale: ['#F8696B', '#FFEB84', '#63BE7B'] },
        { column: 'region', contains: 'No', style: 'bad' },
        { column: 'units', top: 1, style: 'bold' },
      ],
    },
    {
      name: '汇总',
      columns: [{ header: '区域', key: 'region' }, { header: '金额', key: 'amount', type: 'currency', formula: '=SUMIFS({Sales!amount:data},{Sales!region:data},{region}{row})', total: 'sum' }],
      rows: [['North'], ['South']],
    },
    { name: 'Inputs', columns: [{ header: 'Item' }, { header: 'Value', type: 'percent' }], rows: [['Tax', 0.13]] },
  ],
};

describe('build and read back', () => {
  it('lays out the table, fills formulas and computes them', () => {
    const { book, problems } = build(SPEC);
    assert.deepEqual(problems, []);
    const s = book.sheets[0];
    assert.equal(cell(s, 'A4').v, 'Date');
    assert.equal(cell(s, 'A5').t, 'd');
    assert.equal(cell(s, 'A5').v, dateToSerial(2026, 7, 3));
    assert.equal(cell(s, 'E5').f, 'C5*D5');
    assert.equal(value(cell(s, 'E5')), 23760);
    assert.equal(cell(s, 'E7').f, 'SUM(E5:E6)');
    assert.equal(value(cell(s, 'E7')), 23760 + 39600);
    assert.equal(cell(s, 'A7').v, '合计'); // the workbook has Chinese text, so the label is Chinese
    assert.equal(cell(s, 'H6').v, '8');
    assert.equal(cell(s, 'H5').style.numFmt, '@');
    assert.equal(value(cell(s, 'J3')), 39600);
    assert.equal(value(cell(book.sheets[1], 'B3')), 39600);
    assert.ok(Math.abs(value(cell(s, 'F5')) - 23760 * 1.13) < 1e-6);
    assert.deepEqual(s.freeze, { r: 5, c: 2 });
    assert.deepEqual(s.filter, { r1: 4, c1: 1, r2: 6, c2: 8 });
    assert.ok(s.cols.get(2).width >= 8);
    assert.deepEqual(lintBook(book), []);
  });

  it('writes a valid package that reads back to the same workbook', () => {
    const { book } = build(SPEC);
    const buf = renderXlsx(book);
    const files = unzip(buf);
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet3.xml', 'docProps/core.xml'])
      assert.ok(files.has(part), part);
    const workbook = files.get('xl/workbook.xml').toString();
    assert.match(workbook, /fullCalcOnLoad="1"/);
    assert.match(workbook, /<definedName name="TaxRate">Inputs!\$B\$2<\/definedName>/);
    assert.match(workbook, /_xlnm\._FilterDatabase/);
    const sheet1 = files.get('xl/worksheets/sheet1.xml').toString();
    assert.match(sheet1, /<f>_xlfn\.XLOOKUP\(/);
    assert.match(sheet1, /<pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"\/>/);
    assert.match(sheet1, /<autoFilter ref="A4:H6"\/>/);
    assert.match(sheet1, /<mergeCell ref="J1:K1"\/>/);
    for (const kind of ['cellIs', 'dataBar', 'colorScale', 'containsText', 'top10', 'expression']) assert.match(sheet1, new RegExp(`type="${kind}"`));
    assert.match(sheet1, /<dataValidation type="list"[^>]*sqref="B5:B6"><formula1>&quot;North,South&quot;<\/formula1>/);
    // Elements must follow the schema order Excel insists on.
    const order = ['sheetViews', 'cols', 'sheetData', 'autoFilter', 'mergeCells', 'conditionalFormatting', 'dataValidations', 'pageMargins'].map((t) => sheet1.indexOf(`<${t}`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);

    const back = readXlsx(buf);
    assert.deepEqual(back.sheets.map((s) => s.name), ['Sales', '汇总', 'Inputs']);
    const s = back.sheets[0];
    assert.equal(cell(s, 'A1').v, 'Q3 sales');
    assert.equal(cell(s, 'A5').t, 'd');
    assert.equal(serialToIso(cell(s, 'A5').v), '2026-07-03');
    assert.equal(cell(s, 'E5').f, 'C5*D5');
    assert.equal(cell(s, 'E5').result.v, 23760);
    assert.equal(cell(s, 'J3').f, 'XLOOKUP("South",B5:B6,E5:E6)');
    assert.equal(cell(s, 'H5').v, '007');
    assert.equal(cell(s, 'D5').style.numFmt, '"¥"#,##0.00');
    assert.deepEqual(s.freeze, { r: 5, c: 2 });
    assert.deepEqual(s.merges, [{ r1: 1, c1: 10, r2: 1, c2: 11 }]);
    assert.equal(back.names.get('taxrate').range.r1, 2);
    // Every value and formula result survives the round trip.
    book.sheets.forEach((orig, i) => {
      for (const [key, c] of orig.cells) {
        const got = back.sheets[i].cells.get(key);
        if (c.t === 'blank') continue;
        assert.equal(value(got), value(c), `${orig.name} cell ${key}`);
      }
    });
  });

  it('builds a one-sheet workbook from CSV', () => {
    const { book, problems } = build(specFromCsv('name,joined,score\nAnn,2026-01-05,91.5\nBo,2026-02-11,78\n', { name: 'people' }));
    assert.deepEqual(problems, []);
    const s = book.sheets[0];
    assert.equal(cell(s, 'B2').t, 'd');
    assert.equal(cell(s, 'C2').v, 91.5);
    assert.deepEqual(s.freeze, { r: 2, c: 1 });
  });
});

describe('reader', () => {
  it('reads files written by other programs', () => {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheet = `<?xml version="1.0"?><x:worksheet xmlns:x="${ns}"><x:sheetData>
      <x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>Inline</x:t></x:is></x:c><x:c t="s"><x:v>1</x:v></x:c></x:row>
      <x:row r="2"><x:c r="A2" s="1"><x:v>46296</x:v></x:c><x:c r="B2"><x:v>10</x:v></x:c><x:c r="C2"><x:f t="shared" ref="C2:C3" si="0">B2*2</x:f><x:v>20</x:v></x:c><x:c r="D2" t="d"><x:v>2026-10-01T12:00:00</x:v></x:c></x:row>
      <x:row r="3"><x:c r="A3" t="e"><x:v>#N/A</x:v></x:c><x:c r="B3"><x:v>5</x:v></x:c><x:c r="C3"><x:f t="shared" si="0"/><x:v>10</x:v></x:c><x:c r="D3" t="b"><x:v>1</x:v></x:c></x:row>
      </x:sheetData><x:mergeCells count="1"><x:mergeCell ref="E1:F1"/></x:mergeCells></x:worksheet>`;
    const buf = zip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: '_rels/.rels', data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="${rel}/officeDocument" Target="/xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<workbook xmlns="${ns}" xmlns:r="${rel}"><workbookPr date1904="0"/><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId9"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/s1.xml"/><Relationship Id="rId2" Type="${rel}/sharedStrings" Target="strings.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/strings.xml', data: `<sst xmlns="${ns}"><si><r><t>Rich </t></r><r><t>text</t></r><rPh><t>ruby</t></rPh></si><si><t>Line_x000D_break &amp; more</t></si></sst>` },
      { name: 'xl/styles.xml', data: `<styleSheet xmlns="${ns}"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>` },
      { name: 'xl/worksheets/s1.xml', data: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(sheet, 'utf16le')]) },
    ]);
    const book = readXlsx(buf);
    const s = book.sheets[0];
    assert.equal(cell(s, 'A1').v, 'Rich text');
    assert.equal(cell(s, 'B1').v, 'Inline');
    assert.equal(cell(s, 'C1').v, 'Line\rbreak & more');
    assert.equal(cell(s, 'A2').t, 'd');
    assert.equal(cell(s, 'C3').f, 'B3*2');
    assert.equal(cell(s, 'C3').result.v, 10);
    assert.equal(serialToIso(cell(s, 'D2').v), '2026-10-01T12:00:00');
    assert.equal(cell(s, 'D3').v, true);
    assert.equal(cell(s, 'A3').t, 'e');
    assert.deepEqual(s.merges, [{ r1: 1, c1: 5, r2: 1, c2: 6 }]);
    assert.equal(book.sheets[1].hidden, true);
  });

  it('refuses old binary files with a useful message', () => {
    assert.throws(() => readXlsx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), /old binary \.xls/);
  });

  it('inflates archives made by other zip tools', () => {
    // A local header with a data descriptor (bit 3) and sizes only in the central directory, like many writers emit.
    const body = deflateRawSync(Buffer.from('<x/>'));
    const dataName = Buffer.from('a.xml');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dataName.length, 26);
    const crc = unzip(zip([{ name: 'a.xml', data: '<x/>' }])).get('a.xml');
    assert.equal(crc.toString(), '<x/>');
    const archive = zip([{ name: 'a.xml', data: '<x/>' }]);
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(archive.readUInt32LE(central + 16), 4);
    descriptor.writeUInt32LE(body.length, 8);
    descriptor.writeUInt32LE(4, 12);
    const cd = Buffer.from(archive.subarray(central, archive.length - 22));
    cd.writeUInt16LE(8, 8);
    cd.writeUInt32LE(body.length, 20);
    const end = Buffer.from(archive.subarray(archive.length - 22));
    const head = Buffer.concat([local, dataName, body, descriptor]);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(head.length, 16);
    assert.equal(unzip(Buffer.concat([head, cd, end])).get('a.xml').toString(), '<x/>');
  });
});

describe('checks', () => {
  const messages = (problems) => problems.map((p) => `${p.level} ${p.where} ${p.message}`).join('\n');

  it('finds the common mistakes in a description', () => {
    const { book, problems } = fromSpec({
      sheets: [
        {
          name: 'Data',
          colums: [],
          columns: [
            { header: 'Month' },
            { header: 'Revenue', type: 'number' },
            { header: 'Margin', key: 'margin', type: 'percent', formula: '={Revenue}{row}/100' },
            { header: 'Growth', type: 'percent' },
            { header: 'ID' },
          ],
          rows: [
            ['2026-01-05', 100, null, 5, 12345678901234567890],
            ['2026/02/01', '1,200', 0.4, 0.2, 1],
            ['03/01/2026', 'n/a', null, 0.1, 2],
            ['2026-04-01', 50, null, 0.1, 3],
          ],
          cells: {
            H2: '=SUM(B2:B4)',
            H3: '=Other!A1',
            H4: '=VLOKUP(A2,A2:B4,2,FALSE)',
            H5: '=Rate*B2',
            H6: '=B40',
            H7: '=H8',
            H8: '=H7',
            H9: '=B2*1.13',
            H10: '=UNIQUE(A2:A4)',
          },
        },
      ],
    });
    calculate(book);
    const text = messages([...problems, ...lintBook(book)]);
    const expect = [
      /warning sheet "Data" unknown key "colums" ignored; did you mean "columns"\?/,
      /warning Data!D2 5 in a percent column/,
      /warning Data!E2 12345678901234567000 has more digits/,
      /warning Data!A4 "03\/01\/2026" looks like a date stored as text/,
      /warning Data!B4 text "n\/a" in a number column/,
      /warning Data!C3 typed value 0.4 replaces this column's formula/,
      /warning Data!H2 B2:B4 stops at row 4, but column B has numbers through row 5/,
      /error Data!H3 refers to sheet "Other"/,
      /warning Data!H4 VLOKUP is not an Excel function/,
      /error Data!H5 "Rate" is not a defined name/,
      /warning Data!H6 B40 is an empty cell past the data/,
      /error Data!H7 circular reference/,
      /note Data!H9 the number 1.13 is typed into/,
      /warning Data!H10 UNIQUE returns several cells/,
    ];
    for (const re of expect) assert.match(text, re);
  });

  it('finds numbers and dates stored as text and hardcoded values in files', () => {
    const cells = new Map();
    const put = (r, c, x) => cells.set(cellKey(r, c), x);
    ['Item', 'Qty', 'Price', 'Total', 'Date'].forEach((h, j) => put(1, j + 1, { v: h, t: 's' }));
    for (let r = 2; r <= 6; r++) {
      put(r, 1, { v: `Item ${r}`, t: 's' });
      put(r, 2, r === 4 ? { v: '7', t: 's' } : { v: r, t: 'n' });
      put(r, 3, { v: 2, t: 'n' });
      put(r, 4, r === 5 ? { v: 99, t: 'n' } : { f: `B${r}*C${r}`, result: { t: 'n', v: r * 2 } });
      put(r, 5, r === 3 ? { v: '2026-10-01', t: 's' } : { v: 46296 + r, t: 'd' });
    }
    const book = { sheets: [{ name: 'S', cells, maxRow: 6, maxCol: 5, merges: [] }], names: new Map(), useCached: true };
    calculate(book);
    const text = messages(lintBook(book));
    assert.match(text, /warning S!B4 numbers stored as text in B4/);
    assert.match(text, /warning S!E3 dates stored as text in E3/);
    assert.match(text, /warning S!D5 typed number in a column of formulas: D5; hardcoded\?/);
  });
});

describe('command line', () => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });

  it('builds, checks, reads and exports', async () => {
    const json = path.join(dir, 'book.json');
    await writeFile(json, JSON.stringify(SPEC));
    let r = run('check', json);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No problems found/);
    r = run('build', json, '--csv');
    assert.equal(r.status, 0, r.stderr);
    const xlsx = path.join(dir, 'book.xlsx');
    const csv = await readFile(path.join(dir, 'book-Sales.csv'), 'utf8');
    assert.ok(csv.startsWith('\uFEFFDate,Region,Units,Price,Amount,Gross,Share,Code\r\n2026-07-03,North,12,1980,23760,26848.8,0.375,007\r\n'));
    assert.ok(!csv.includes('Total'), 'the totals row stays out of the CSV');
    r = run('read', xlsx, '--sheet', '汇总', '--records');
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.sheets[0].records, [
      { 区域: 'North', 金额: 23760 },
      { 区域: 'South', 金额: 39600 },
      { 区域: '合计', 金额: 63360 },
    ]);
    r = run('read', xlsx, '--range', 'A4:C5', '--format', 'csv');
    assert.equal(r.stdout, 'Date,Region,Units\r\n2026-07-03,North,12\r\n');
    r = run('info', xlsx, '--json');
    const info = JSON.parse(r.stdout);
    assert.equal(info.sheets[0].headerRow, 4);
    assert.equal(info.sheets[0].columns[0].type, 'date');
    r = run('check', xlsx);
    assert.equal(r.status, 0, r.stdout);
  });

  it('refuses to build with errors and never overwrites its input', async () => {
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ sheets: [{ name: 'A', rows: [['x'], ['=B1+']] }] }));
    const r = run('build', bad);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nothing written/);
    const data = path.join(dir, 'data.csv');
    await writeFile(data, 'a,b\n1,2\n');
    assert.equal(run('csv', data).status, 0);
    assert.equal(await readFile(data, 'utf8'), 'a,b\n1,2\n');
    assert.ok((await readFile(path.join(dir, 'data-export.csv'), 'utf8')).startsWith('\uFEFFa,b'));
    assert.equal(run('nope', data).status, 2);
    assert.match(execFileSync(process.execPath, [SCRIPT, 'read', data, '--format', 'csv'], { cwd: dir, encoding: 'utf8' }), /^a,b\r\n1,2\r\n$/);
  });
});
