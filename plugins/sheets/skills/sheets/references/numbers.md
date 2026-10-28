# Numbers, dates and formats

A cell holds a value; the number format decides how it looks. Keep the value pure (`0.153`, the date 2026-10-01) and let the format show `15.3%` or `2026年10月1日`. Then sums, sorts, filters and charts work, and changing the look never changes the data.

## Number formats

Set `type` on the column and you get a sensible format. Use `format` when you need something else. Codes are Excel's, written as in Excel's Format Cells → Custom box; in JSON, quotes inside the code are escaped (`"\"¥\"#,##0"`).

| Shows | Code | Use for |
|---|---|---|
| 1234.5 | `General` | Years, codes stored as numbers, values whose precision varies |
| 1,235 | `#,##0` | Counts, whole amounts |
| 1,234.50 | `#,##0.00` | Amounts with cents |
| ¥1,234.50 | `"¥"#,##0.00` | Money (one currency per column) |
| -1,234.50 in red | `#,##0.00;[Red]-#,##0.00` | Figures where negatives must stand out |
| (1,234.50) | `#,##0.00;(#,##0.00)` | Finance style negatives |
| – for zero | `#,##0;-#,##0;"–"` | Sparse tables where zeros are noise |
| 15.3% | `0.0%` | Shares, rates, growth (value 0.153) |
| 1,235 (in thousands) | `#,##0,` | Large amounts; say "(thousands)" or "（千元）" in the header |
| 1.2 (in millions) | `#,##0.0,,` | Same, millions; "(millions)" / "（百万元）" |
| 1.23E+06 | `0.00E+00` | Scientific values |
| 42 units | `0 "units"` | A unit that must travel with each cell (prefer the header) |

Sections: `positive;negative;zero;text`. Colors in brackets (`[Red]`, `[Blue]`). Text in double quotes is shown as written.

**Decimals** follow the data's real precision and stay the same for the whole column. Prices and money: 2 (0 for large round amounts like budgets in 万). Percentages: 1, or 0 when differences are large. Ratios and rates of change: 1–2. Never show more decimals than the source had.

**Chinese amounts in 万 or 亿**: Excel has no format that divides by 10,000 cleanly. Either keep yuan with `#,##0` and say `金额（元）`, or compute the 万 value in a formula column (`={amount}{row}/10000`, header `金额（万元）`, format `#,##0.0`). Do not type values already divided by hand next to undivided ones.

**Percentages are fractions.** 15% is `0.15`. If the source says "15" meaning percent, divide by 100 when you write the JSON. `check` warns when a percent column holds whole numbers.

**Negative numbers** are negative values (`-1200`), never text like `(1200)` or `-¥1,200`. Choose how they look with the format.

**Precision.** Excel keeps 15 significant digits. Identifiers longer than that (ID cards, bank cards, long order numbers) must be text. Floating-point noise (`0.1 + 0.2 = 0.30000000000000004`) is invisible behind a format; `read` and `csv` round values to 15 digits.

## Dates and times

In Excel a date is a number of days (2026-10-01 is 46296) shown through a date format; a time is a fraction of a day (12:00 is 0.5). Real dates sort, filter by month, subtract (`={end}{row}-{start}{row}` is days) and work with DATE, EOMONTH, NETWORKDAYS.

- Write dates in the JSON as `YYYY-MM-DD` in a `date` column; date-times as `YYYY-MM-DDTHH:MM`. `YYYY/MM/DD` and `2026年10月1日` are also read.
- Never write `01/10/2026` or `10/1/26`: whether that is January or October depends on who reads it. Convert such dates from the source deliberately (and say which convention you assumed). `check` flags them.
- A month on its own (`2026-10`) is best stored as the first day of the month (`2026-10-01`) with the format `yyyy-mm` or `yyyy"年"m"月"`, so it still sorts and groups as a date.
- Times of day without a date: `time` column, `HH:MM`. Durations over 24 hours: format `[h]:mm`.
- Time zones are not stored in Excel. Convert to the zone the reader works in, and say which in the note line.

| Shows | Code |
|---|---|
| 2026-10-01 | `yyyy-mm-dd` (default; clear in every language) |
| 2026年10月1日 | `yyyy"年"m"月"d"日"` |
| 10月1日 | `m"月"d"日"` |
| 2026-10 | `yyyy-mm` |
| 2026年10月 | `yyyy"年"m"月"` |
| 1 Oct 2026 | `d mmm yyyy` |
| Oct 2026 | `mmm yyyy` |
| 2026-10-01 09:30 | `yyyy-mm-dd hh:mm` |
| 09:30 | `hh:mm` |
| 9:30 AM | `h:mm AM/PM` |
| 星期四 | `aaaa` (Chinese-language Excel and WPS; `dddd` gives Thursday) |
| 37:30 (duration) | `[h]:mm` |

In formulas, build dates with `DATE(2026,10,1)`, not text: `"2026-10-01"` in a formula is text that only some functions convert.

## Text

- Text columns get the `@` format, so values typed into them later stay text too.
- Trim stray spaces and unify spellings (`Beijing`, `beijing `, `北京`) before building: filters and SUMIFS treat each spelling as a different value. `info` lists the distinct values of short text columns, which shows such variants quickly.
- Long text (comments, addresses) wraps (`"wrap": true`); keep it in the rightmost columns.
- Booleans: `true`/`false`, or a text column of `是`/`否`, `Yes`/`No` when people will read and filter it. Be consistent.

## CSV

A CSV file carries values only: no formats, no formulas, no types, one sheet. `csv` writes UTF-8 with a byte-order mark (Excel then shows Chinese correctly), CRLF line ends, and quotes only where needed.

- Values are written plain: `0.153`, `1234.5`, `2026-10-01`. `--formatted` writes them as they look in the workbook instead (`15.3%`, `¥1,234.50`), which is nicer to read and worse to import.
- Formula cells are written as their calculated values; a formula the script could not calculate is written as its formula text (`=TODAY()`), which Excel evaluates when it opens the CSV.
- Excel opening a CSV by double-click guesses types again: `00123` becomes 123, long numbers turn into `1.23E+17`, and `2026-10-01` may be shown in the local date style. Tell the user that when identifiers matter, and give them the `.xlsx` as well; in Excel, Data → From Text/CSV lets them set a column to text.
- For other systems, ask (or follow their spec) about the delimiter, encoding and date format; `csv` writes comma-separated UTF-8 with ISO dates.
