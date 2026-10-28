# The workbook description

`scripts/sheet.mjs build` reads one JSON file. Unknown keys are reported by `check` (with a suggestion when it looks like a typo) and ignored; nothing is guessed silently.

## Workbook

```json
{
  "title": "Q3 sales",
  "author": "Ann Lee",
  "lang": "zh-CN",
  "font": { "name": "等线", "size": 11 },
  "headerStyle": { "fill": "#E8EEF4", "color": "#1F2933", "bold": true },
  "names": { "TaxRate": "Inputs!B2" },
  "sheets": [ … ]
}
```

| Key | Default | Effect |
|---|---|---|
| `title`, `author`, `subject` | none | File properties (shown in Excel's Info pane and in file search). |
| `lang` | `zh-CN` when any Chinese text appears, else `en` | Default font, currency symbol (¥ or $) and the totals label (合计 or Total). |
| `font` | 等线 11 for Chinese, Calibri 11 otherwise | The workbook's base font. |
| `headerStyle` | bold, light blue-gray fill, dark text, a rule under it | Header cells of every sheet; `fill`, `color`, `bold`, `italic`, `size`. |
| `names` | none | Defined names: `"Name": "Sheet!B2"` or `"Sheet!B2:B9"`. Formulas may use the name (`=Amount*(1+TaxRate)`). |
| `sheets` | required | The sheets in order. The first is the one Excel opens on. |

A description that is only `{ "columns": …, "rows": … }` (no `sheets`) is one sheet; a bare array is a list of sheets.

## Sheet

```json
{
  "name": "Sales",
  "title": "Q3 2026 sales by order",
  "note": "Amounts in CNY; source: CRM export of 2026-10-01",
  "columns": [ … ],
  "rows": [ … ],
  "freeze": true,
  "filter": true,
  "banded": true,
  "conditional": [ … ],
  "merge": ["E1:G1"],
  "cells": { "J2": "Rate", "K2": 0.13 },
  "validation": [ { "range": "F5:F500", "list": ["Open", "Done"] } ],
  "widths": { "J": 24 },
  "tabColor": "#2F7D4F"
}
```

| Key | Default | Effect |
|---|---|---|
| `name` | `Sheet1`, `Sheet2` … | At most 31 characters, none of `: \ / ? * [ ]`, unique, not `History`. |
| `title` | none | Bold line in A1 above the table. |
| `note` | none | Grey italic line under the title: units, source, date of the data. |
| `columns` | none | The table's columns (below). Without `columns`, `rows` are written as they are and the first row is the header (`"header": false` for none). |
| `rows` | `[]` | Arrays of values in column order, or objects keyed by column `key` or `header`. |
| `totals` | `合计` / `Total` | Label of the totals row, which appears when any column has a `total`. |
| `freeze` | `true` | `true` freezes the rows down to the header; `"B5"` freezes everything above and left of B5; `{ "rows": 1, "columns": 1 }`; `false` for none. |
| `filter` | `false` | `true` puts filter buttons on the header over the data rows (not the totals); or a range such as `"A4:H200"`. |
| `banded` | `false` | `true` shades every other data row (a conditional format, so it survives sorting); or a color. |
| `conditional` | none | Rules that color cells by value (below). |
| `merge` | none | Ranges to merge, such as `["A1:F1"]`. Keep merges out of the table. |
| `cells` | none | Single cells outside the table: `{ "J2": "Note", "J3": "=SUM({amount:data})", "J4": { "value": "2026-10-28", "type": "date" } }`. |
| `validation` | none | Drop-down lists: `{ "range": "F5:F500", "list": ["Open", "Done"] }` or `{ "column": "status", "list": […] }`. |
| `widths` | from the content | Widths by column letter, in characters: `{ "A": 30 }`. |
| `tabColor` | none | `#RRGGBB`. |
| `headerStyle` | the workbook's | Override for this sheet. |

Layout: with a `title` and/or `note`, they take the first rows, then one empty row, then the header; otherwise the header is row 1. Data starts on the row after the header. Placeholders (below) mean you never have to count rows.

## Columns

```json
{ "header": "Amount", "key": "amount", "type": "currency", "symbol": "¥", "decimals": 2,
  "formula": "={units}{row}*{price}{row}", "total": "sum", "width": 14 }
```

A plain string (`"Region"`) is a column with that header and no type.

| Key | Effect |
|---|---|
| `header` | Header text. Keep it short; put the unit in it (`Weight (kg)`, `金额（元）`). |
| `key` | Name for formulas and object rows. Defaults to the header; formulas may use either. |
| `type` | `text`, `number`, `integer`, `currency`, `percent`, `date`, `datetime`, `time`, `boolean`. Without one, the type is taken from the values: all `YYYY-MM-DD` strings become dates, numeric strings become numbers, JSON numbers stay numbers in General format. |
| `format` | An Excel number format code that replaces the type's default (see numbers.md). |
| `decimals` | For `number`, `currency`, `percent`: digits after the point (defaults 2, 2, 1). |
| `symbol` | For `currency`: `¥`, `$`, `€`, `£`, `HK$` … (default ¥ in Chinese workbooks, $ otherwise). |
| `formula` | Filled into every data row that has no value in this column. Use placeholders. |
| `total` | `sum`, `average`, `count`, `counta`, `min`, `max`, `median`, or a formula (`"=SUM({amount:data})/SUM({units:data})"`). Adds a bold totals row under the data. |
| `width` | Width in characters (1–255), when the automatic width is wrong. |
| `wrap` | Wrap text in this column (long comments, addresses). |
| `align` | `left`, `center`, `right`. Numbers are right-aligned by Excel already. |
| `hidden` | Hide the column (helper columns). |
| `list` | Drop-down of allowed values for the data rows. |
| `bold`, `color`, `fill` | Style for the column's data cells. |

Defaults per type:

| Type | Format | Notes |
|---|---|---|
| `text` | `@` | Numbers in a text column are stored as text: identifiers keep their leading zeros. |
| `integer` | `#,##0` | |
| `number` | `#,##0.00` (`decimals` changes it) | Use `"format": "General"` or `"0"` for years and codes that must not get a thousands separator. |
| `currency` | `"¥"#,##0.00` | |
| `percent` | `0.0%` | Values are fractions; `5` in a percent column is reported (it would show 500%). |
| `date` | `yyyy-mm-dd` | Values `YYYY-MM-DD`, `YYYY/MM/DD` or `2026年10月1日`. A time of day is dropped (and noted). |
| `datetime` | `yyyy-mm-dd hh:mm` | `YYYY-MM-DDTHH:MM[:SS]`. Time zones are not converted. |
| `time` | `hh:mm` | `HH:MM[:SS]`. |
| `boolean` | General | `true`/`false` (also `yes`/`no`, `是`/`否` in the data). |

## Values in rows

| Write | Cell |
|---|---|
| `1200.5`, `-3`, `0.153` | Number. |
| `"North"` | Text. In a typed column, text is converted when it clearly is that type (`"1,200"` in a number column becomes 1200; `"2026/10/01"` in a date column becomes a date); otherwise it stays text and `check` warns. |
| `"=B2*C2"` | Formula. |
| `null`, `""` or a missing value | Empty cell, or the column's `formula` when it has one. |
| `true`, `false` | Boolean. |
| `{ "value": 0.2, "format": "0%", "bold": true, "fill": "#FFF4CE" }` | A value with its own style. Style keys: `format`, `bold`, `italic`, `color`, `fill`, `align`, `wrap`, `size`, `border` (`top`, `bottom`, `all`). |
| `{ "formula": "=SUM(B2:B9)" }` | A formula with optional style keys. |
| `{ "value": "=not a formula", "type": "text" }` | Text that starts with `=`; `type` also forces any other type for one cell. |

A typed value in a column that has a `formula` replaces the formula for that row; `check` asks whether it is hardcoded.

## Placeholders in formulas

Every formula (column `formula`, `total`, row values, `cells`, conditional `formula`) may use:

| Placeholder | Becomes |
|---|---|
| `{row}` | This row's number. |
| `{prev}` | The row above (running totals: `={balance}{prev}+{amount}{row}`; give the first row its own value). |
| `{first}`, `{last}` | First and last data row of this sheet's table. |
| `{col}` | This cell's column letter. |
| `{key}` | The column letter of the column with that key or header: `{price}{row}`. |
| `{key:data}` | That column's data cells: `{amount:data}` → `F5:F40`. |
| `{Sheet!key}`, `{Sheet!key:data}`, `{Sheet!first}`, `{Sheet!last}` | The same on another sheet, with the sheet prefix: `{Sales!amount:data}` → `Sales!F5:F40`. |

Text inside quotes is left alone (`"{x}"` stays as written). An unknown placeholder is an error that names it.

Examples:

```json
"formula": "={units}{row}*{price}{row}"
"formula": "=IFERROR({profit}{row}/{revenue}{row},\"\")"
"formula": "=SUMIFS({Orders!amount:data},{Orders!region:data},{region}{row})"
"total": "=SUM({amount:data})/SUM({units:data})"
"cells": { "H2": "=MAX({date:data})" }
```

Formulas use English function names and commas between arguments, whatever the user's Excel language; Excel shows them translated.

## Conditional formatting

Each rule names its cells with `column` (the data rows of that column) or `range` (`"B5:H40"`), plus one condition:

| Rule | Example |
|---|---|
| Compare | `{ "column": "margin", "when": "<", "value": 0, "style": "bad" }`; `when` is `<` `<=` `>` `>=` `=` `<>` `between` `notBetween` (`"value": [low, high]`). A value starting with `=` is a formula (`"value": "=TaxRate"`). |
| Contains text | `{ "column": "status", "contains": "overdue", "style": "bad" }` |
| Formula | `{ "range": "A5:H40", "formula": "={due}{row}<TODAY()", "style": "bad" }`: written for the range's first row; Excel moves it down. Use `$` to pin a column: `=${due}{row}…` pins the due column for the whole row. |
| Color scale | `{ "column": "amount", "scale": true }` (white to green) or `"scale": ["#F8696B", "#FFEB84", "#63BE7B"]` (low, middle, high). |
| Data bar | `{ "column": "amount", "bar": true }` or `"bar": "#5B8FF9"`. |
| Top / bottom | `{ "column": "amount", "top": 3, "style": "good" }`, `{ "bottom": 10, "percent": true }`. |
| Duplicates / unique | `{ "column": "email", "duplicates": true, "style": "bad" }` |
| Above / below average | `{ "column": "score", "belowAverage": true, "style": "neutral" }` |

`style` is `good` (green), `bad` (red), `neutral` (amber), `bold`, or `{ "fill": "#…", "color": "#…", "bold": true }`.

## A complete example

```json
{
  "title": "2026 年第三季度销售",
  "names": { "税率": "假设!B2" },
  "sheets": [
    {
      "name": "明细",
      "title": "2026 年第三季度销售明细",
      "note": "金额单位：元；数据截至 2026-09-30",
      "columns": [
        { "header": "日期", "key": "date", "type": "date" },
        { "header": "区域", "key": "region", "list": ["华北", "华东", "华南"] },
        { "header": "产品", "key": "product" },
        { "header": "数量", "key": "units", "type": "integer", "total": "sum" },
        { "header": "单价", "key": "price", "type": "currency" },
        { "header": "金额", "key": "amount", "type": "currency", "formula": "={units}{row}*{price}{row}", "total": "sum" },
        { "header": "含税金额", "key": "gross", "type": "currency", "formula": "={amount}{row}*(1+税率)", "total": "sum" }
      ],
      "rows": [
        ["2026-07-03", "华北", "标准版", 12, 1980],
        ["2026-08-19", "华东", "企业版", 2, 19800]
      ],
      "freeze": "B5",
      "filter": true,
      "conditional": [{ "column": "amount", "bar": true }]
    },
    {
      "name": "汇总",
      "columns": [
        { "header": "区域", "key": "region" },
        { "header": "金额", "key": "amount", "type": "currency", "formula": "=SUMIFS({明细!amount:data},{明细!region:data},{region}{row})", "total": "sum" }
      ],
      "rows": [["华北"], ["华东"], ["华南"]]
    },
    {
      "name": "假设",
      "columns": [{ "header": "项目" }, { "header": "值", "type": "percent" }],
      "rows": [["税率", 0.13]]
    }
  ]
}
```

## What it does not make

Charts, pivot tables, Excel tables (ListObjects), macros, comments, images, hyperlinks other than `=HYPERLINK(…)`, sheet protection, print areas, outline grouping, rich text inside a cell, formulas with array constants (`{1,2,3}`) and dynamic-array formulas. Say so when asked, and offer the nearest thing above.
