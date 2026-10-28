# Designing a workbook

Most spreadsheet trouble is decided before the first value is typed: what a row is, which columns exist, and where the calculations live. Settle those, then write the description.

## What is a row?

Pick one kind of thing per table and give it one row: one order, one employee, one day, one budget line. Then every column is a fact about that thing.

- **Long, not wide, for data that grows.** Monthly sales by region is `Month | Region | Sales` with a row per month and region, not one column per month. Long tables filter, sort, sum with SUMIFS and import into other tools; a new month is new rows, not a new column and rewritten formulas. A wide layout (months across) is right for a **summary** people read, built from the long table with formulas.
- **One value per cell.** `Beijing, Shanghai` in one cell, or `3 pcs @ ¥20`, cannot be counted or summed. Split into columns or rows.
- **No blank rows or subtotal rows inside the data.** They break sorting, filters and ranges. Subtotals belong on a summary sheet or in a totals row under the table.
- **No merged cells inside the table**, and no headers spread over two rows. A two-level header (`2026 › Q1`) becomes one row of `2026 Q1`, `2026 Q2`.

## Columns

Order them the way a reader scans: identifiers and descriptions on the left (date, name, category), measures in the middle (quantities, prices), calculated columns to the right of what they use, status and notes last.

For every column decide:

| Question | Why it matters |
|---|---|
| **Header** | Short (one to four words, two to eight Chinese characters), unique, the unit in it: `Weight (kg)`, `金额（万元）`, `Share (%)`. No unit repeated in every cell. |
| **Type** | Text, number, currency, percent, date … Every value in the column has that type. Mixed columns are where sums go wrong silently. |
| **Format** | Decimals that match the precision of the data (prices 2, percentages 1, counts 0); one format for the whole column. |
| **Input or formula?** | Inputs are typed; everything derived is a formula. Mark inputs so people know what they may change (a light fill, or keep them on an Inputs sheet). |
| **Empty allowed?** | If a value may be unknown, leave the cell empty, not `0` (zero is a value) and not `N/A` text in a number column. |

Identifiers that look like numbers (order numbers, employee numbers, phone numbers, postal codes, Chinese ID numbers, bank accounts) are **text**: they are never added up, may have leading zeros, and anything over 15 digits loses its tail as a number.

## Sheets

A workbook with more than one table usually has this shape, in this order:

1. **Summary / 汇总** (when there is one): the answer, as formulas over the data. This is what the reader opens.
2. **Data / 明细**: the long table of records.
3. **Inputs / 假设 or 参数**: rates, targets and other assumptions, each with a label and, for important ones, a defined name.
4. **Lookups / 对照表** (when needed): code lists, price lists, mappings used by VLOOKUP or XLOOKUP.

Small jobs need only the data sheet. Do not split one table across sheets by month or region; add a column instead, and summarize.

Sheet names: short and plain (`Data`, `Summary`, `Inputs`; `明细`, `汇总`, `参数`), no dates that will go stale, no special characters. Formulas refer to them, so do not rename sheets when revising.

## Calculations

- **Inputs once, referenced everywhere.** A rate typed in ten formulas is ten places to forget. Put it in a labeled cell; name it (`"names": { "TaxRate": "Inputs!B2" }`).
- **One formula per column.** A calculated column has the same formula in every row (the column `formula` key does this). A row that needs an exception is a sign the data needs another column (a flag, an override value) rather than a special formula. `check` notes formulas that differ from their column.
- **Simple steps beat one clever formula.** Two helper columns (hidden if they clutter) are easier to audit than a nested formula five functions deep.
- **Guard divisions and lookups**: `IFERROR(x/y, "")`, `IFNA(XLOOKUP(…), "not found")`, so one missing value does not paint the column with errors. Do not wrap everything in IFERROR: an error you hide is a mistake you will not see.
- **Totals in a totals row** (`"total": "sum"`), or on the summary sheet; not inside the data.
- **Rounding**: keep full precision in calculations and round with the format. Use `ROUND` only where the rounded value itself matters (invoices, tax), and then round each line the way the rules say.
- **Summaries from the data**: `SUMIFS`, `COUNTIFS`, `AVERAGEIFS`, `MAXIFS`, `XLOOKUP`. A summary table of regions × months is SUMIFS with the row and column labels as criteria.

## Templates and trackers

When the user will keep adding rows (a tracker, a log, a form to fill):

- Leave the data table at the top-left with a frozen header and a filter.
- Put drop-down lists on columns with fixed choices (`"list": [...]`, or `validation` over a range longer than today's data so new rows get it).
- Summaries that should include future rows use whole-column references (`SUM(F:F)` on another sheet, or `SUMIFS(明细!F:F, 明细!B:B, A2)`), not ranges that end at today's last row.
- Say in the note line how to add rows ("add new orders below the last row").

## Analysis results

When the workbook carries the results of an analysis you did:

- Include the data the results come from (or the filtered part you used), and compute the results from it with formulas, so the reader can check and extend them.
- State the scope in the sheet's `note`: source, date range, filters, rows excluded and why.
- Put the headline numbers first: a small summary table at the top of the Summary sheet, details below or on other sheets.
- Sort tables the way the reader looks things up: largest first for rankings, chronological for time, alphabetical for reference lists.
