# Typefaces

There is no house typeface. Pick one to three that fit the brief and name them in `<head>`.

## How fonts get into a deck

**Google Fonts (the normal case).** One `<link>` in `<head>`, every family in it:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
```

`family=` per family, spaces as `+`, a `:wght@` list or range covering the weights you use, no `%` escapes, only `https://fonts.googleapis.com/css2?` links. Then name the family in styles: `font-family:'IBM Plex Sans', Arial, sans-serif` on `<body>`, the display face on headings. Always end a stack with a basic face and a generic.

`build` and `export` download the faces **subset to the characters the deck uses** and embed them, so the HTML deck, the PDF and the PowerPoint pictures look the same offline and in Wevir's file preview (which loads nothing from the network). Subsetting keeps Chinese, Japanese and Korean decks small. Downloads are cached; with no network the link stays in the HTML (fonts appear only when a browser is online) and `check` warns that the face is not embedded.

**The user's own font files** (a brand face): put the `.woff2`/`.woff`/`.ttf`/`.otf` beside `deck.html` and declare it:

```html
<style>@font-face { font-family: "Acme Sans"; src: url(AcmeSans.woff2) }</style>
```

The build inlines it. A single static file renders every weight at its own weight; prefer a variable font or the weight you use most.

**Basic faces** need nothing: Arial, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman, Courier New. They are the fallback at the end of every stack. For Chinese, system faces (PingFang SC, Microsoft YaHei) differ by computer, so embed a Google face when the look matters.

Symbols most faces lack (✓ ✗ ★ ☐, dingbats) fall back to a system font: use `<x-icon name="Check">` or a word.

## Picks (all on Google Fonts)

**Text face, choose one:**

- sans: `IBM Plex Sans` (technical, enterprise) · `Public Sans` (civic, quiet) · `DM Sans` (modern product) · `Hanken Grotesk` (neutral, warm) · `Manrope` (geometric, startup) · `Rubik` (soft, friendly)
- serif: `Source Serif 4` (reports, research) · `Libre Baskerville` (editorial) · `EB Garamond` (academic, heritage) · `Newsreader` (journalistic)
- rounded: `Nunito` (education, wellness) · `Quicksand` (light, airy)
- mono: `JetBrains Mono` · `IBM Plex Mono` (developer decks, code)

**Display face, from a different row than the text face:**

- serif: `Instrument Serif` (elegant, display only) · `Libre Baskerville` · `Cormorant Garamond` (delicate, display only) · `Source Serif 4`
- sans: `Space Grotesk` (technical, distinctive) · `Bricolage Grotesque` (expressive) · `Schibsted Grotesk` (newsy, firm)
- condensed: `Oswald` (posters, sports, statements)
- accent, one line only: `Caveat` (handwritten) · `Dancing Script` (celebratory)

**Chinese (简体):**

- 正文黑体：`Noto Sans SC`（思源黑体，稳妥通用）
- 正文/标题宋体：`Noto Serif SC`（思源宋体，报告、学术、人文）
- 标题点缀：`ZCOOL XiaoWei`（站酷小薇，文艺）· `Ma Shan Zheng`（马善政楷书，只用于一行）
- Traditional Chinese, Japanese, Korean: `Noto Sans TC` / `Noto Serif TC`, `Noto Sans JP`, `Noto Sans KR`.

Mixed Chinese and Latin text: name the Latin face first and the Chinese face second, `font-family:'IBM Plex Sans', 'Noto Sans SC', sans-serif`, so Latin letters and digits use the Latin face and Chinese falls through to the CJK face. Put both in the one `<link>`.

## Pairings by mood

- Institutional, research, policy: `Source Serif 4` + `IBM Plex Sans`; `EB Garamond` + `Public Sans`
- Editorial, magazine: `Instrument Serif` + `Hanken Grotesk`; `Libre Baskerville` alone (headings at 700)
- Product, startup: `Space Grotesk` + `DM Sans`; `Manrope` alone
- Developer, infrastructure: `IBM Plex Sans` + `JetBrains Mono`
- Bold, poster, sports: `Oswald` + `Public Sans`
- Friendly, education: `Nunito` alone; `Rubik` + `Source Serif 4`
- Luxury, hospitality: `Cormorant Garamond` + `Hanken Grotesk` (light)
- 中文商务汇报：`Noto Sans SC`（标题 700，正文 400）
- 中文人文、学术：`Noto Serif SC` 标题 + `Noto Sans SC` 正文

Vary pairings between decks; do not pick the first item in a list by habit.

## Numbers behind the look

- Two faces is the norm; a third only with a clear job (code, one accent line).
- One type scale of four or five sizes, such as 120 / 72 / 44 / 32 / 24, reused everywhere.
- Display text: line-height 1.05–1.15, slightly negative letter-spacing at 96px and up. Body: 1.3–1.45. Chinese body text reads better at 1.5–1.6 with no negative letter-spacing.
- Eyebrows (small labels above a heading): 24–28px, uppercase, 2–4px letter-spacing, the accent color. Chinese eyebrows skip the uppercase and letter-spacing.
- Body text color is a softened dark (`#4a5568` on light) or softened light (`#c9cfdb` on dark); headings take the full dark or light.
