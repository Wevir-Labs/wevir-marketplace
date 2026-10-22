# Look and layout

The converter gives every export the same look from the same Markdown: you choose a theme and a page, the rest is fixed so documents stay consistent and nothing needs tuning.

## Themes

| Theme | Feel | Word fonts (Latin / Chinese) | Use for |
|---|---|---|---|
| `modern` (default) | Sans-serif, muted blue accents | Calibri / Microsoft YaHei | Business documents, specs, reports, most things |
| `classic` | Serif text, black headings, wider margins | Georgia / SimSun with SimHei headings | Letters, formal reports, academic or legal-style documents, 公文-like Chinese documents |
| `memo` | Compact sans-serif, smaller headings, narrow margins | Arial / Microsoft YaHei | Memos, notes, status updates, one-pagers that must fit |

HTML and PDF use the system's equivalent fonts (PingFang SC on a Mac, Microsoft YaHei on Windows, Noto CJK on Linux). Body text is 10.5–12 pt; Chinese body text in `modern` and `memo` is 10.5 pt (五号), in `classic` 12 pt (小四).

Pick the theme from the document's purpose, not for variety. Do not ask the user about themes unless they bring up the look.

## Page

A4 by default (the size nearly everywhere outside North America); `page: Letter` for US and Canadian readers. Margins come with the theme. Page numbers (`3 / 12`) are in the footer of Word and PDF exports.

## Typography rules the converter cannot enforce

- One idea of emphasis per paragraph at most. Bold for scanning, italics for terms and titles of works.
- Headings short (under about 8 words / 20 Chinese characters); no trailing period.
- Numbers: digits for 10 and above and for all measurements and money; thousands separators (`1,200,000`, Chinese documents may also write `120 万`); right-align number columns in tables (`--:`).
- Dates and times in one format throughout.
- Abbreviations spelled out on first use.
- Quotes in the document's language: “…” in English and Chinese, 「…」 only when the user's material uses it.

## Tables

- A header row with short labels; units in the header (`Cost (¥)`), not repeated in every cell.
- Five columns or fewer read comfortably on a portrait page; past seven, split the table or turn it around (attributes as rows).
- No empty cells: write `—` or `n/a`.
- Sort rows by what the reader looks for (largest first, by date, by owner).

## Images and figures

- Use the user's images, or charts made from their data (render a chart to png or svg first). Never invent an image or use one you do not have.
- One figure per point; give it a caption (the image title) that says what to see: “Figure 2: Churn fell after onboarding changed in March”, not “Churn chart”.
- Screenshots at their natural size or `{width=80%}`; photos and charts usually `{width=70%}` to `{width=100%}`.

## Exports compared

| | Word (.docx) | PDF | HTML |
|---|---|---|---|
| Editable by the reader | yes | no | no |
| Exact layout | close (fonts on the reader's machine) | exact | screen layout, prints like the PDF |
| Contents page numbers | after Word updates the field | no (entries link to sections) | no |
| Footnotes | real footnotes at the page bottom | notes at the end | notes at the end |
| Needs Chrome | only for svg/webp images | yes | no |
