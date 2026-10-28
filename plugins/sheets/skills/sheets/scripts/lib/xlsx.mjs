// Writes a workbook as an .xlsx file: hand-written SpreadsheetML (shared strings, styles, panes, filters, merges,
// conditional formats, list validation, defined names) packed with zip.mjs. Formulas carry the values the
// calculator computed; the workbook asks Excel to recalculate everything when it opens.
import { colName, rangeName, sheetPrefix, storedFormula } from './formula.mjs';
import { isZh } from './model.mjs';
import { xmlEscape as x, zip } from './zip.mjs';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const BUILTIN_FORMATS = { General: 0, 0: 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '@': 49 };
const argb = (hex) => `FF${hex}`;

class Styles {
  constructor(font, lang) {
    this.font = font;
    this.lang = lang;
    this.fonts = [JSON.stringify({})];
    this.fills = ['none', 'gray125'];
    this.borders = ['none'];
    this.numFmts = new Map();
    this.xfs = [JSON.stringify({ numFmt: 0, font: 0, fill: 0, border: 0 })];
    this.xfIndex = new Map([[this.xfs[0], 0]]);
    this.dxfs = [];
  }
  index(list, key) {
    let i = list.indexOf(key);
    if (i < 0) i = list.push(key) - 1;
    return i;
  }
  numFmtId(code) {
    if (code === undefined || code === null || code === 'General') return 0;
    if (BUILTIN_FORMATS[code] !== undefined) return BUILTIN_FORMATS[code];
    if (!this.numFmts.has(code)) this.numFmts.set(code, 164 + this.numFmts.size);
    return this.numFmts.get(code);
  }
  /** Index of the cell format (xf) for a style object. */
  xf(style = {}) {
    const fontKey = JSON.stringify({ b: style.bold || undefined, i: style.italic || undefined, color: style.color, size: style.size });
    const xf = {
      numFmt: this.numFmtId(style.numFmt),
      font: this.index(this.fonts, fontKey === '{}' ? JSON.stringify({}) : fontKey),
      fill: style.fill ? this.index(this.fills, style.fill) : 0,
      border: style.border && style.border !== 'none' ? this.index(this.borders, style.border) : 0,
      align: style.align,
      valign: style.valign,
      wrap: style.wrap || undefined,
    };
    const key = JSON.stringify(xf);
    if (!this.xfIndex.has(key)) {
      this.xfIndex.set(key, this.xfs.length);
      this.xfs.push(key);
    }
    return this.xfIndex.get(key);
  }
  dxf(style) {
    return this.index(this.dxfs, JSON.stringify(style ?? {}));
  }
  fontXml(key) {
    const f = JSON.parse(key);
    const zh = isZh(this.lang);
    return `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}<sz val="${f.size ?? this.font.size}"/>${f.color ? `<color rgb="${argb(f.color)}"/>` : ''}<name val="${x(this.font.name)}"/><family val="2"/>${zh ? '<charset val="134"/>' : ''}</font>`;
  }
  xml() {
    const numFmts = [...this.numFmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${x(code)}"/>`);
    const fills = this.fills.map((f) =>
      f === 'none' || f === 'gray125' ? `<fill><patternFill patternType="${f}"/></fill>` : `<fill><patternFill patternType="solid"><fgColor rgb="${argb(f)}"/><bgColor indexed="64"/></patternFill></fill>`,
    );
    const side = (name, style) =>
      style ? `<${name} style="${style}"><color rgb="${style === "medium" ? "FF5F6B7A" : "FFB8C2CC"}"/></${name}>` : `<${name}/>`;
    const borders = this.borders.map((b) => {
      const s = { top: b === 'top' || b === 'all' ? 'thin' : null, bottom: b === 'header' ? 'medium' : b === 'bottom' || b === 'all' ? 'thin' : null, sides: b === 'all' ? 'thin' : null };
      return `<border>${side('left', s.sides)}${side('right', s.sides)}${side('top', s.top)}${side('bottom', s.bottom)}<diagonal/></border>`;
    });
    const xfs = this.xfs.map((key) => {
      const f = JSON.parse(key);
      const align = f.align || f.valign || f.wrap ? `<alignment${f.align ? ` horizontal="${f.align}"` : ''}${f.valign ? ` vertical="${f.valign}"` : ''}${f.wrap ? ' wrapText="1"' : ''}/>` : '';
      const apply = `${f.numFmt ? ' applyNumberFormat="1"' : ''}${f.font ? ' applyFont="1"' : ''}${f.fill ? ' applyFill="1"' : ''}${f.border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1"' : ''}`;
      return `<xf numFmtId="${f.numFmt}" fontId="${f.font}" fillId="${f.fill}" borderId="${f.border}" xfId="0"${apply}${align ? `>${align}</xf>` : '/>'}`;
    });
    const dxfs = this.dxfs.map((key) => {
      const d = JSON.parse(key);
      const font = d.bold || d.italic || d.color ? `<font>${d.bold ? '<b/>' : ''}${d.italic ? '<i/>' : ''}${d.color ? `<color rgb="${argb(d.color)}"/>` : ''}</font>` : '';
      const fill = d.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(d.fill)}"/><bgColor rgb="${argb(d.fill)}"/></patternFill></fill>` : '';
      return `<dxf>${font}${fill}</dxf>`;
    });
    return (
      XML_HEAD +
      `<styleSheet xmlns="${NS_MAIN}">` +
      (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.map((f) => this.fontXml(f)).join('')}</fonts>` +
      `<fills count="${fills.length}">${fills.join('')}</fills>` +
      `<borders count="${borders.length}">${borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>` +
      '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
      '</styleSheet>'
    );
  }
}

class SharedStrings {
  constructor() {
    this.list = [];
    this.map = new Map();
    this.count = 0;
  }
  add(s) {
    this.count++;
    if (!this.map.has(s)) this.map.set(s, this.list.push(s) - 1);
    return this.map.get(s);
  }
  xml() {
    const items = this.list.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${x(s)}</t></si>`);
    return XML_HEAD + `<sst xmlns="${NS_MAIN}" count="${this.count}" uniqueCount="${this.list.length}">${items.join('')}</sst>`;
  }
}

const num = (v) => (Number.isFinite(v) ? String(v) : '0');

function cellXml(ref, cell, s, strings) {
  const attr = s ? ` s="${s}"` : '';
  if (cell.f !== undefined) {
    const f = `<f>${x(storedFormula(cell.f))}</f>`;
    const res = cell.result;
    if (!res) return `<c r="${ref}"${attr}>${f}</c>`;
    if (res.t === 'n') return `<c r="${ref}"${attr}>${f}<v>${num(res.v)}</v></c>`;
    if (res.t === 'b') return `<c r="${ref}"${attr} t="b">${f}<v>${res.v ? 1 : 0}</v></c>`;
    if (res.t === 'e') return `<c r="${ref}"${attr} t="e">${f}<v>${x(res.v)}</v></c>`;
    return `<c r="${ref}"${attr} t="str">${f}<v>${x(res.v)}</v></c>`;
  }
  switch (cell.t) {
    case 'n':
    case 'd':
      return `<c r="${ref}"${attr}><v>${num(cell.v)}</v></c>`;
    case 'b':
      return `<c r="${ref}"${attr} t="b"><v>${cell.v ? 1 : 0}</v></c>`;
    case 'e':
      return `<c r="${ref}"${attr} t="e"><v>${x(cell.v)}</v></c>`;
    case 's':
      return `<c r="${ref}"${attr} t="s"><v>${strings.add(cell.v)}</v></c>`;
    default:
      return `<c r="${ref}"${attr}/>`;
  }
}

function paneXml(freeze) {
  if (!freeze) return '';
  const { r, c } = freeze;
  const ref = `${colName(c)}${r}`;
  if (r > 1 && c > 1)
    return `<pane xSplit="${c - 1}" ySplit="${r - 1}" topLeftCell="${ref}" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="${ref}" sqref="${ref}"/>`;
  if (r > 1) return `<pane ySplit="${r - 1}" topLeftCell="${ref}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${ref}" sqref="${ref}"/>`;
  return `<pane xSplit="${c - 1}" topLeftCell="${ref}" activePane="topRight" state="frozen"/><selection pane="topRight" activeCell="${ref}" sqref="${ref}"/>`;
}

function conditionalXml(rules, styles, priority) {
  return rules
    .map((rule) => {
      const sqref = rangeName(rule.range);
      const p = priority.next++;
      const dxf = rule.dxf ? ` dxfId="${styles.dxf(rule.dxf)}"` : '';
      const formulas = (rule.formulas ?? []).map((f) => `<formula>${x(storedFormula(f))}</formula>`).join('');
      let body;
      switch (rule.kind) {
        case 'cellIs':
          body = `<cfRule type="cellIs"${dxf} priority="${p}" operator="${rule.operator}">${formulas}</cfRule>`;
          break;
        case 'expression':
          body = `<cfRule type="expression"${dxf} priority="${p}">${formulas}</cfRule>`;
          break;
        case 'containsText': {
          const topLeft = `${colName(rule.range.c1)}${rule.range.r1}`;
          const lit = `"${rule.text.replace(/"/g, '""')}"`;
          body = `<cfRule type="containsText"${dxf} priority="${p}" operator="containsText" text="${x(rule.text)}"><formula>${x(`NOT(ISERROR(SEARCH(${lit},${topLeft})))`)}</formula></cfRule>`;
          break;
        }
        case 'colorScale': {
          const cfvo = rule.colors.length === 3 ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>';
          body = `<cfRule type="colorScale" priority="${p}"><colorScale>${cfvo}${rule.colors.map((c) => `<color rgb="${argb(c)}"/>`).join('')}</colorScale></cfRule>`;
          break;
        }
        case 'dataBar':
          body = `<cfRule type="dataBar" priority="${p}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${argb(rule.color)}"/></dataBar></cfRule>`;
          break;
        case 'top10':
          body = `<cfRule type="top10"${dxf} priority="${p}" rank="${rule.rank}"${rule.percent ? ' percent="1"' : ''}${rule.bottom ? ' bottom="1"' : ''}/>`;
          break;
        case 'duplicateValues':
        case 'uniqueValues':
          body = `<cfRule type="${rule.kind}"${dxf} priority="${p}"/>`;
          break;
        case 'aboveAverage':
          body = `<cfRule type="aboveAverage"${dxf} priority="${p}"${rule.below ? ' aboveAverage="0"' : ''}/>`;
          break;
        default:
          return '';
      }
      return `<conditionalFormatting sqref="${sqref}">${body}</conditionalFormatting>`;
    })
    .join('');
}

function sheetXml(sheet, si, styles, strings) {
  const byRow = new Map();
  for (const [key, cell] of sheet.cells) {
    const r = Math.floor(key / 16384);
    const c = key % 16384;
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r).push([c, cell]);
  }
  const rows = [...byRow.keys()]
    .sort((a, b) => a - b)
    .map((r) => {
      const cells = byRow
        .get(r)
        .sort((a, b) => a[0] - b[0])
        .map(([c, cell]) => cellXml(`${colName(c)}${r}`, cell, styles.xf(cell.style), strings));
      return `<row r="${r}">${cells.join('')}</row>`;
    });
  const dimension = sheet.maxRow && sheet.maxCol ? rangeName({ r1: 1, c1: 1, r2: sheet.maxRow, c2: sheet.maxCol }) : 'A1';
  const cols = [...sheet.cols]
    .sort((a, b) => a[0] - b[0])
    .map(([c, col]) => `<col min="${c}" max="${c}" width="${col.width}" customWidth="1"${col.hidden ? ' hidden="1"' : ''}/>`);
  const priority = { next: 1 };
  const validations = sheet.validations.map(
    (v) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${rangeName(v.range)}"><formula1>${x(`"${v.list.join(',')}"`)}</formula1></dataValidation>`,
  );
  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
    (sheet.tabColor ? `<sheetPr><tabColor rgb="${argb(sheet.tabColor)}"/></sheetPr>` : '') +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView${si === 0 ? ' tabSelected="1"' : ''} workbookViewId="0">${paneXml(sheet.freeze)}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols.length ? `<cols>${cols.join('')}</cols>` : '') +
    (rows.length ? `<sheetData>${rows.join('')}</sheetData>` : '<sheetData/>') +
    (sheet.filter ? `<autoFilter ref="${rangeName(sheet.filter)}"/>` : '') +
    (sheet.merges.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${rangeName(m)}"/>`).join('')}</mergeCells>` : '') +
    conditionalXml(sheet.conditional, styles, priority) +
    (validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : '') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

const absolute = ({ r1, c1, r2, c2 }) =>
  r1 === r2 && c1 === c2 ? `$${colName(c1)}$${r1}` : `$${colName(c1)}$${r1}:$${colName(c2)}$${r2}`;

/**
 * @param {object} book the workbook from model.mjs, calculated
 * @returns {Buffer} the .xlsx file
 */
export function renderXlsx(book) {
  const styles = new Styles(book.font, book.props.lang);
  const strings = new SharedStrings();
  const sheets = book.sheets.map((sheet, si) => sheetXml(sheet, si, styles, strings));
  const hasFormulas = book.sheets.some((s) => [...s.cells.values()].some((c) => c.f !== undefined));

  const names = [];
  book.sheets.forEach((sheet, si) => {
    if (sheet.filter) names.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${si}" hidden="1">${x(sheetPrefix(sheet.name) + absolute(sheet.filter))}</definedName>`);
  });
  for (const def of book.names.values()) names.push(`<definedName name="${x(def.name)}">${x(sheetPrefix(book.sheets[def.si].name) + absolute(def.range))}</definedName>`);
  names.sort((a, b) => (/name="([^"]+)"/.exec(a)[1].toLowerCase() < /name="([^"]+)"/.exec(b)[1].toLowerCase() ? -1 : 1));

  const workbook =
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
    '<workbookPr defaultThemeVersion="164011"/>' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000" activeTab="0"/></bookViews>' +
    `<sheets>${book.sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    (names.length ? `<definedNames>${names.join('')}</definedNames>` : '') +
    `<calcPr calcId="191029"${hasFormulas ? ' fullCalcOnLoad="1"' : ''}/>` +
    '</workbook>';
  const n = book.sheets.length;
  const workbookRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    book.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
    '</Relationships>';
  const contentTypes =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
    book.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('') +
    `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.sharedStrings+xml"/>` +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const rootRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
    '</Relationships>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const { title, author, subject } = book.props;
  const core =
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (title ? `<dc:title>${x(title)}</dc:title>` : '') +
    (subject ? `<dc:subject>${x(subject)}</dc:subject>` : '') +
    (author ? `<dc:creator>${x(author)}</dc:creator>` : '') +
    (book.props.lang ? `<dc:language>${x(book.props.lang)}</dc:language>` : '') +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>';
  const app =
    XML_HEAD +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Wevir Sheets</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${book.sheets.map((s) => `<vt:lpstr>${x(s.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>` +
    '<AppVersion>16.0300</AppVersion></Properties>';

  // Styles last: sheets register their formats while they render.
  const stylesXml = styles.xml();
  return zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/sharedStrings.xml', data: strings.xml() },
    ...sheets.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data })),
  ]);
}
