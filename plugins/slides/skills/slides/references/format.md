# The slide format

A deck is one HTML file. `deck.mjs check` lints it against this page and then measures every slide in a browser; `build`/`export` inject the viewer, inline fonts and images, and write the outputs. Slides render in a real browser engine, so standard HTML and CSS behave as usual; the subset below keeps every slide self-contained, editable in place and predictable across the HTML, PDF and PowerPoint outputs.

## Document

```html
<!doctype html>
<html lang="zh-CN">            <!-- the deck's language: line breaking, hyphenation, viewer labels -->
<head>
<meta charset="utf-8">
<title>Deck name</title>       <!-- names the deck and its exported files -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…">   <!-- at most one; fonts.md -->
<style>@font-face { font-family: "Brand Sans"; src: url(BrandSans.woff2) }</style>  <!-- only @font-face -->
</head>
<body style="font-family:…; color:…">   <!-- deck-wide text defaults -->
<section …>…</section>
…
</body>
</html>
```

- `<body style>` sets defaults that inherit into every slide: `font-family`, `color`, `line-height`, `letter-spacing`, `font-size` (default 32px).
- `font-size` and `font-weight` inherit into `<p>` and `<li>` but never into `<h1>`–`<h3>`; headings keep 96/64/44px at weight 600 until you set them.
- Nothing else goes in `<head>`. No `<script>`; no stylesheet rules beyond `@font-face`.

## Slide

`<section id="…" style="…" [data-section="…"] [data-transition="fade|push"] [hidden]>`

- `id`: letters, digits, `-`, `_`; unique; stable across revisions.
- `style`: always `background` (a color or gradient), the layout (`display:flex; flex-direction:column` or `display:grid`; no `display` = a column), `padding` (the margins, normally 128px), `gap`, `align-items`, `justify-content`, and any text defaults for this slide.
- `data-section`: this slide starts a section of the outline; the value is that section's one-sentence description. It is a note for you and for later revisions; nothing shows it.
- `data-transition`: how this slide leaves in the viewer. `fade` or `push`; omitted = a cut.
- `hidden`: skipped in the viewer and every export.
- `<aside>` as the **last** child: speaker notes, plain text, under 4,000 characters. Shown with N in the viewer and as notes in the PowerPoint file. Anyone with the file can read them.

Children **flow** in the section's layout, or are **pinned** with `position:absolute` plus `left`/`top`/`right`/`bottom`/`width`/`height`, measured from the slide's edge (`left:0` is the slide edge, not the margin). A `<div style="position:relative">` becomes the reference box for pinned children inside it. Paint order is source order: list a full-bleed backdrop first.

## Elements

| Element | Use |
|---|---|
| `<h1>` `<h2>` `<h3>` | Titles. Set `font-size`, `font-weight`, `line-height`. |
| `<p>` | Any text block: body, eyebrow, label, big number, caption, pill (`background` + `padding` + `border-radius`). |
| `<ul>` `<ol>` `<li>` | One level of plain items. Prefer cards, tables or statements. |
| `<b>` `<i>` `<u>` `<s>` `<a href>` `<span style="color:…">` `<code>` `<sup>` `<sub>` `<br>` | Inline only. A different size or typeface is a separate block, not a span. |
| `<div>` | Rows, columns and grids. Invisible unless it has `background`, `border` or `box-shadow`. An empty `<div style="flex:1">` is a spacer. At most 15 levels deep. |
| `<img src alt style>` | A file beside the deck (png, jpg, webp, gif, svg). Always `width`, `height`, `object-fit:cover|contain`. `alt` says what it shows (`alt=""` when decorative). No `src` = an empty frame the user fills later. |
| `<table>` `<tr>` `<th>` `<td>` | Plain text cells; first row of `<th>` is the header. Column widths: `width:N%` on every cell of the first row. `background` on a `<tr>` bands rows. No colspan/rowspan. |
| `<svg aria-label>` | Charts, curves, illustrations: shapes and paths only, no `<script>`, no external references, no `<text>` (fonts do not reach it; put labels as `<p>` over it). |
| `<hr>` | A rule: `border-top` sets its weight and color. |
| `<x-shape kind>` | `rect` `rounded` `ellipse` `diamond` `arrow-right` `arrow-left` `arrow-up` `arrow-down` `line`. `background` fills it, `border` strokes it, `width`/`height` size it (default 160×160). Holds no text: pin a `<p>` over it. Block arrows read best near 2:1. |
| `<x-icon name>` | A line icon in `color`, filling its `width`×`height` (default 48px). Names below. |
| `<x-connector>` | A line with arrowheads; diagrams.md. |
| `<aside>` | Speaker notes (above). |

Custom elements always take a closing tag: `<x-icon name="Check"></x-icon>`. A self-closed `<x-icon … />` swallows what follows it.

**Icons:** Activity ArrowRight ArrowUpRight Book Bot Briefcase Building Calendar Chart ChartLine ChartPie Chat Check CheckCircle Clock Cloud Code Compass Cpu Database Dollar Download File Flag Folder Gift Globe GraduationCap Heart Home Image Key Layers Leaf Lightbulb Lightning Link Lock Mail Map MapPin Megaphone Mic Minus Package PaperPlane Phone Play Plus Puzzle Rocket Search Server Settings Shield ShoppingCart Sparkle Star Target ThumbsUp Tool TrendingDown TrendingUp Trophy Trust User Users Verified Warning Wrench X. Use 40px or more beside body text, in a color that stands off the background; an icon never replaces a word ("✓ Done", not "✓").

## CSS

Inline `style=""` only, in px. The subset:

- **Box:** `position` (`absolute`, `relative`), `left` `top` `right` `bottom` (px, %, `calc(50% - 200px)`), `width` `height` `min-width` `min-height` `max-width` `max-height`, `padding`, `overflow:hidden`, `aspect-ratio`, `opacity`, `transform` (translate, rotate, scale, skew), `transform-origin`.
- **Flex and grid:** `display:flex|grid|none`, `flex-direction`, `flex-wrap`, `gap`, `align-items`, `justify-content`, `justify-items`, `align-self`, `justify-self`, `flex`, `flex-grow`, `flex-shrink`, `flex-basis`, `grid-template-columns`/`-rows` (px, `fr`, `auto`, `repeat()`), `grid-column`/`grid-row` (`span N`).
- **Text:** `font-family` `font-size` `font-weight` `font-style` `font` `line-height` `letter-spacing` `text-align` `text-transform` `white-space` `text-decoration` `font-variant-numeric:tabular-nums` `text-wrap:balance` `word-break` `-webkit-text-stroke` `text-shadow` `color`.
- **Paint:** `background` (color, `linear-gradient`, `radial-gradient`), `background-clip:text` with `-webkit-text-fill-color:transparent` for gradient text, `border` and its sides, `border-radius`, `box-shadow`, `filter`, `backdrop-filter`, `mix-blend-mode`, `object-fit`, `object-position`.

`check` warns on `margin` (use `gap`, `padding` or a spacer), `z-index` (reorder the HTML), `float`, `transition`/`animation` (use the motion attributes), `em`/`rem`/`vw`/`vh`, `var()`, and any `font-size` under 24px. Other properties outside the list get a note: they render, but keep to the list unless you have a reason.

## Motion (viewer only; exports show the finished slide)

- `data-transition="fade|push"` on a section: how it leaves.
- `data-build-in="fade|rise|drop|left|right|scale|pop [order N] [auto]"` on a pinned child: hidden until the presenter advances; `order` sets the sequence (default: document order), `auto` reveals it together with the build before it. Going back shows the previous slide complete.

## What `check` reports

**Errors** stop `build` and `export`: malformed or unclosed markup, scripts or `on…=` handlers, `<iframe>`/`<canvas>`/`<video>`/forms, a `<link>` that is not Google Fonts, an image or font from the network, a missing file, an unknown icon or shape, an incomplete connector, duplicate or missing slide ids, and, from the browser: content past the slide's edge, a word wider than its box, text taller than a fixed height, an image that did not load.

**Warnings** to fix: text under 24px, contrast under 4.5:1 (3:1 at 44px+), content running into the bottom margin, a box narrower than what it holds, text boxes overlapping, a slide with no background, notes not last, discouraged CSS, a typeface that is neither embedded nor basic.

**Notes** to weigh: headings that sit at different heights across content slides, a content slide whose body ends high and leaves the bottom empty, pinned text close to the edge, empty image frames.

`check --json` prints the same as JSON.
