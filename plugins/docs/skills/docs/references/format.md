# The Markdown the converter reads

`scripts/doc.mjs` reads CommonMark plus the GitHub extensions a document needs. Anything outside this page is either kept as plain text (with a `check` warning) or dropped; nothing is silently reinterpreted.

## Front matter

A block between `---` lines at the very top. One `key: value` per line; strings may be quoted; lists as `[a, b]`.

| Key | Values | Effect |
|---|---|---|
| `title` | text | Title block, document properties, PDF title. If absent, a leading `# Heading` becomes the title. |
| `subtitle` | text | Line under the title. |
| `author` | text or `[a, b]` | Byline and document properties. Several authors are joined with `, ` (`、` in Chinese). |
| `date` | text | Byline after the authors, as written. |
| `lang` | `en`, `en-US`, `zh-CN`, `ja`, … | Fonts, punctuation handling, labels ("Contents" / "目录"). Guessed from the text when absent. |
| `page` | `A4`, `Letter` | Paper size. Default A4; `Letter` when `lang: en-US`. |
| `theme` | `modern`, `classic`, `memo` | See style.md. Default `modern`. |
| `toc` | `true`/`false` | Table of contents after the title block (levels 1–3). A `[TOC]` line places it elsewhere. |
| `numbered` | `true`/`false` | Numbers headings of levels 1–3 (`1.`, `1.1`, `1.1.1`). |

## Headings

ATX (`#` to `######`) and setext (underlined with `===` or `---`). The top level used in the body becomes Heading 1 in Word: a body that uses `##` and `###` is promoted to Heading 1 and 2. Levels below 4 are styled as level 4. Every heading gets an anchor: lowercase text, spaces as `-`, punctuation dropped (`## 风险 Risks` → `#风险-risks`), so `[see Risks](#风险-risks)` links inside the document (in Word too).

## Paragraphs and line breaks

Blank lines separate paragraphs. A single line break inside a paragraph is a space, except between two Chinese/Japanese/Korean characters, where it disappears. A hard break: end the line with a backslash `\` or two spaces, or write `<br>`.

## Inline

| Write | Get |
|---|---|
| `**bold**` `__bold__` | bold |
| `*italic*` `_italic_` | italic |
| `~~struck~~` | strikethrough |
| `` `code` `` | inline code |
| `<u>u</u>` `<mark>m</mark>` `<sup>2</sup>` `<sub>2</sub>` `<kbd>Ctrl</kbd>` | underline, highlight, superscript, subscript, key |
| `[text](https://…)` `[text](https://… "title")` | link |
| `[text][ref]` with `[ref]: https://…` anywhere | reference link |
| `<https://…>`, `<name@example.com>`, bare `https://…` or `www.…` | autolink |
| `[text](#heading-anchor)` | link inside the document |
| `![alt](images/chart.png)` | image (see Images) |
| `Claim.[^src]` with `[^src]: Source text.` | footnote (numbered in order of first use) |
| `\*` | a literal `*` (any ASCII punctuation can be escaped) |

Bold around Chinese quotes works (`**“关键”**后`), unlike in many Markdown tools.

## Lists

`-`, `*` or `+` for bullets; `1.` or `1)` for numbers (a list may start at any number). Indent nested lists and follow-on paragraphs to the item's text (two spaces after `- `, three after `1. `). A list with blank lines between items is "loose" and gets paragraph spacing. Task items: `- [ ] open`, `- [x] done`.

## Block quotes and callouts

`> text` is a quote; quotes nest. A quote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` is a callout box; text after the marker on that line replaces the default label:

```markdown
> [!WARNING] Budget not approved
> Do not share these figures outside the team.
```

## Code

Fenced with three or more backticks or tildes (a language name after the fence is kept but not highlighted), or indented four spaces. Code keeps its spacing and wraps long lines.

## Tables

GitHub tables: a header row, a delimiter row, body rows. `:--` left, `:-:` center, `--:` right (use right for numbers). Cells hold inline content only (no lists or paragraphs; use `<br>` for a line break). Escape a literal pipe as `\|`. Column widths in Word follow the longest text in each column; in HTML/PDF the browser sizes them. Header rows repeat on every page.

## Images

`![alt](path)`: the path is relative to the Markdown file. png, jpg, gif, svg and webp are embedded (svg and webp are drawn to png for Word, which needs Chrome). A paragraph holding only an image becomes a centered figure; its title (`![alt](chart.png "Figure 1: Revenue by quarter")`) becomes the caption. Size it with `{width=60%}` (of the text width), `{width=8cm}`, `{width=300px}` right after the image; otherwise it shows at its natural size (96 px per inch), shrunk to fit the page. Remote (`https://`) images are not fetched: download them first if the user wants them and may use them.

## Page breaks, rules, contents

- `\newpage` (or `\pagebreak`, or `<!-- pagebreak -->`) on its own line: page break.
- `---`, `***` or `___` on its own line after a blank line: horizontal rule. (Directly under a text line, `---` makes that line a heading.)
- `[TOC]` on its own line: the table of contents at that spot (otherwise `toc: true` puts it after the title). In Word it is a real contents field; Word offers to update it on opening, which fills in page numbers.
- `<!-- comments -->` are dropped.

## Not supported

- Math (`$…$`, `$$…$$`): kept as plain text. Write simple formulas inline, or put an image of the formula.
- Raw HTML blocks (`<div>`, `<table>`, `<img>`, styles): the tags are removed and the text kept, with a warning.
- Mermaid or other diagram code blocks: shown as code. Render the diagram to an image first if you need it.
- Definition lists, attributes on anything but images, custom fonts, multi-column layout, headers other than page numbers, tracked changes, comments.
