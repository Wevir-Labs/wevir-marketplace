# Look and layout

A good sheet looks plain: the header stands out, the numbers line up, and color appears only where something needs attention. The defaults give that; change them when the user or their organization asks, not for variety.

## Fonts

The font is set once for the workbook (`"font": { "name": …, "size": 11 }`). Excel draws with the fonts installed on the reader's computer and substitutes silently, which changes widths and line breaks, so pick a font your readers have.

| Font | Where it exists | Use |
|---|---|---|
| 等线 (DengXian) | Windows 10/11 with Office, Excel for Mac, WPS | Default for Chinese workbooks; Excel's own default for Chinese. Clear digits, compact. |
| 微软雅黑 (Microsoft YaHei) | Windows; Office for Mac installs it | Screen-friendly alternative; wider than 等线. |
| 宋体 (SimSun) | Windows | Printed forms and government-style documents that expect it. Thin on screen. |
| 苹方 (PingFang SC) | macOS and iOS only | Only when everyone is on a Mac; Windows substitutes it. |
| Calibri | Windows and Mac with Office | Default for English workbooks. |
| Aptos | Newer Office (2023 and later) | Matches Office's current default; older Office and WPS substitute it. |
| Arial | Everywhere | Safe neutral choice for files that travel widely. |

Size 11 for data (10 for dense tables, 12 for sheets that will be printed or projected). Titles are 3 points larger and bold; that is the only size change a sheet needs. Emphasis inside a table comes from bold or a fill, not from more sizes or fonts.

## Column widths

`build` measures what each column shows (formatted values, after formulas are calculated) and sets its width: Chinese, Japanese and Korean characters count as two character widths, Latin letters and digits as one, plus room for padding and, on filtered sheets, the filter button.

- A header longer than its data wraps onto two lines instead of widening the column, up to a limit; give long headers a shorter wording before you reach for `width`.
- Columns whose text would be wider than about 60 characters are capped and their text wraps. For comment and address columns, set `"wrap": true` and a `width` of 30–50 yourself.
- Set `width` (characters) when the measured width is wrong for the job: a column users will type long text into, a narrow flag column, or a print layout.
- Numbers that do not fit show as `#####` in Excel; widths from `build` leave room for the formatted value, so this only happens after users type bigger numbers. Give input columns some slack.

Row heights are left to Excel, which fits wrapped text and larger title fonts when it opens the file.

## Header, panes and filters

- The header row is bold on a light fill with a rule underneath (`headerStyle` changes it workbook-wide or per sheet). Numeric columns get right-aligned headers so they sit over their numbers.
- `freeze` is on by default for tables: the header stays visible while scrolling. For wide tables, freeze the identifier column too (`"freeze": "B2"`, or `"B5"` under a title and note).
- `filter: true` for any table people will search, over about 15 rows. The filter covers the header and data, not the totals row, so sorting keeps the totals at the bottom.
- `banded: true` shades alternate rows for wide tables where the eye loses its row; skip it for narrow ones. It is a conditional format, so it stays correct after sorting.

## Color

- Use conditional formatting for meaning: negatives or misses in red (`"style": "bad"`), targets met in green, warnings in amber; data bars or a color scale for magnitude in one column. One or two rules per sheet; a sheet where everything is colored highlights nothing.
- Never use color as the only signal of something the reader must act on; pair it with a value or a status column (colors are lost when printed in grey and invisible to some readers).
- Input cells may get a light fill (`"fill": "#FFF4CE"`) so people know what they can change; say so in the note line.
- `tabColor` can group sheets (inputs one color, outputs another); leave it off for two or three sheets.

## Titles and notes

A table for people (rather than for another system) may start with a `title` and a `note` line: what the table is, the unit, the source and the date of the data. Keep them in column A as single lines; they spill over empty cells, so they need no merge. A table meant for import or for analysis in another tool starts at A1 with the header and nothing above it.

## Merged cells

Avoid them inside tables: Excel cannot sort, filter or paste over ranges that include merged cells, and `read` sees only the top-left value. Centered labels over a group of columns are fine **above** the table (`"merge": ["E3:G3"]` over the header), and a title never needs one. `check` warns about merges that touch data.

## Printing

Tables that will be printed: landscape-friendly widths (all columns fit within about 120 characters of total width for A4 landscape), the header frozen (Excel can repeat it on each page when the user sets Print Titles), and no colors that carry meaning without a value beside them. The script does not set print areas or page orientation; say so if the user needs exact print layout, and suggest Page Layout → Print Titles and Fit to 1 page wide in Excel.

## Chinese workbooks

- Headers and sheet names in Chinese are fine everywhere; formulas still use English function names (`SUMIFS`, not a translated name) and Excel shows them in the user's language.
- Full-width punctuation in Chinese text (，。：；（）); half-width digits and units (`2026 年`, `12.5%`, `金额（元）`).
- Use 万 and 亿 only in headers or in computed columns (numbers.md); keep raw values in 元 unless the source is already in 万.
- Dates: `yyyy-mm-dd` works for everyone; `yyyy"年"m"月"d"日"` reads naturally in Chinese reports.
