# Sheets

Make and revise spreadsheets with Wevir, and let the agent read the ones you have.

Ask in plain words ("an Excel file of these orders with totals per region", "a budget template for the team", "what is in this export?") and the agent designs the columns, writes a short description of the workbook in your session folder, checks it, and hands you an `.xlsx` file, plus CSV when you want it. Revisions change only what you name and rebuild the same file.

## What it includes

- **The `sheets` skill:** when a spreadsheet beats a document, how to lay out rows and columns, number and date formats, formulas instead of typed results, inputs on their own sheet, Chinese fonts and column widths, and a checklist the agent runs before handing anything over.
- **A script** (`skills/sheets/scripts/sheet.mjs`, no dependencies):
  - `build`: an `.xlsx` workbook from the description (or from a CSV file): typed columns with number, currency, percent and date formats, formulas with values already calculated, totals rows, frozen headers, filters, banded rows, conditional formatting (comparisons, text, formulas, color scales, data bars, top/bottom, duplicates), drop-down lists, merged cells, defined names and several sheets. Column widths follow the content, with Chinese characters counted double.
  - `check`: formulas pointing at missing sheets or empty cells, ranges that stop short of the data, errors and circular references, unknown functions, hardcoded numbers in formula columns, numbers and dates stored as text, percentages written as whole numbers, identifiers too long for Excel. It works on your own `.xlsx` and CSV files too.
  - `info` and `read`: the sheets, header row, column types and first rows of an `.xlsx` or CSV file, and its values as JSON or CSV, with shared strings, dates (both date systems), merged cells, hidden sheets and formulas with their cached results.
  - `csv`: one UTF-8 CSV per sheet, with a byte-order mark so Excel shows Chinese correctly.

The script calculates the common formulas itself (arithmetic, SUM and friends, SUMIFS/COUNTIFS/AVERAGEIFS, IF/IFS/IFERROR, VLOOKUP, INDEX/MATCH, XLOOKUP, text and date functions), so previews and CSV exports show values; the file also asks Excel to recalculate everything when it opens.

## Requirements

- Node.js 22 or later.

No network access, API keys or accounts are needed; nothing is downloaded when the plugin runs, and your files never leave your computer.

## Limits

No charts, pivot tables, macros, comments, images or sheet protection; formulas that spill into several cells (UNIQUE, FILTER, SORT) are not supported. Old `.xls`, `.numbers`, `.ods` and password-protected files cannot be read: save them as `.xlsx` or CSV first. Formulas the script cannot calculate (such as `TODAY()`) are left for Excel, so previews that do not calculate show those cells empty.

## License

MIT.
