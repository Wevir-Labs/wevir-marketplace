# Layout

Read this when a slide needs more than a heading over a column of blocks or a card row. The exact CSS is in format.md.

## Flow first, pin on purpose

A `<section>` is a 1920×1080 canvas. Its `padding` is the margin (128px standard), and its `display`, `gap` and `justify-content` arrange its children.

- **Flow** children sit one after another and size to their content unless given `width`, `height` or `flex`. Use flow for nearly everything: it keeps spacing consistent and adapts when text changes.
- **Pinned** children (`position:absolute`) leave the flow and sit where `left`/`top`/`right`/`bottom` put them, measured from the slide edge. Use them only for:
  - a footer row (source, page number, logo),
  - a badge or sticker over a corner,
  - a full-bleed photo behind everything (`left:0; top:0; width:1920px; height:1080px; object-fit:cover`, listed first),
  - labels over an image or a diagram,
  - elements that build in on click.

Source order is paint order; there is no `z-index`. Keep pinned elements inside the 128px margins (left + width ≤ 1792, top + height ≤ 952) unless they are a backdrop or the footer.

## Flex idioms

- **Card row:** `<div style="display:flex; gap:32px">` with `flex:1` on each card. Cards stretch to the tallest one. A card is a `<div>` with `display:flex; flex-direction:column; gap:12px` plus its paint (`background`, `border`, `border-radius`, `padding`).
- **Unequal columns:** `flex:2` and `flex:1`, or a fixed `width:800px` beside a `flex:1`.
- **Push apart:** `justify-content:space-between` on the parent, or an empty `<div style="flex:1"></div>` between siblings.
- **Anchor a block low:** a `flex:1` spacer above it (there is no margin).
- **Centered block:** `justify-content:center` on the section, only for slides with no heading above the body: a statement, a quote, a closing line.
- **A run of content slides:** the heading sits at the top margin on every one, at the same height. Leave the column top-aligned. Centering a column that has a heading makes the heading jump 20–60px from slide to slide; `check` notes it.
- **The body fills the space below the heading.** Size it to the space: bigger numbers and type, taller cards (`flex:1` on the row inside a column), a chart track of 400–500px. `justify-content:space-between` is right when there are three or more blocks to spread; with a heading and one short row it just opens a hole (`check` warns on gaps over 240px). A body that is genuinely small goes in a `flex:1` wrapper with `justify-content:center`, so it sits in the middle of the remaining space.
- **Align a row:** `align-items:center` for mixed heights, `baseline` for text of different sizes on one line.
- **Big number + caption:** a column with `gap:8px`, the number at 140–200px with `line-height:1`, the caption at 28–32px in the softened text color.
- **Bar chart:** every bar stands on one baseline. Make a track of fixed height with `display:flex; align-items:flex-end; gap:…` holding the bars, each bar's `height` = value × one scale for the slide. Values sit above the bars, category labels in a separate row below the track with the same column widths. Several small charts on one slide share the track height and the scale. Never top-align bars (they hang); a waterfall is the one chart whose middle bars float.
- **Widths:** every column, card, pill and legend item must be wider than its longest word (about 0.6 × font size per Latin character, more for bold or capitals). Count before choosing the number of columns: at 44px, five cards across 1664px hold about 11 characters each.

A plain grouping `<div>` costs nothing visually. Past three or four levels of nesting the slide wants splitting.

## Grid idioms

`display:grid; grid-template-columns:repeat(3, 1fr); gap:32px` fills cells in reading order; `grid-column:span 2` widens one. Use it for KPI tiles, photo grids and feature matrices, with `aspect-ratio` on tiles that should stay square or 4:3.

**A matrix is one grid.** Three columns of chip + blurb + card are a 3-column grid of nine children in row order, not three separate column stacks; separate stacks drift out of line as their text lengths differ. Parallel content (a before/after pair, two languages) shares rows the same way. When the content is tabular, a `<table>` is better than a grid of text cells.

## Footer band

A footer is one pinned 24px row at `bottom:64px` (y ≈ 982–1016), the same on every slide that has one: a source line, a page number, a logo no taller than the text. That slide uses `padding:128px 128px 160px`, so flow stops at y 920 (a 792px budget); keep pinned content above 920 too.

## Labels over an image

Wrap the image in `<div style="position:relative; width:…; height:…">` and pin the labels inside it: badges, callouts, or a caption bar (`left:0; right:0; bottom:0; padding:24px 32px; background:rgba(20,20,19,.6); color:#f4f1ea`). Labels are real `<p>` text over the picture, never text drawn inside an SVG or baked into the image.

## The vertical budget

Inside 128px margins there are 824px (792px with a footer). Estimate before writing:

- one line of text ≈ font size × line height: a two-line 96px title at 1.1 ≈ 210px;
- a table row ≈ 2.1 × font size per line of text (32px → 70px; nine rows ≈ 630px, which does not fit under a large title);
- a card ≈ lines × font size × line height + its padding; never give a text box a `height` smaller than that, leave the height out.

When it does not fit: shorten, use 24–28px for dense tables, or split the slide. `check` reports overflow in pixels.

## Example: flow plus pin

```html
<section id="kpis" style="background:#fbfbf8; padding:128px 128px 160px; display:flex; flex-direction:column; justify-content:space-between">
  <div style="display:flex; flex-direction:column; gap:16px">
    <p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#2b6f6d">Q3 in numbers</p>
    <h2 style="font-size:64px; font-weight:600; line-height:1.15">Onboarding Results</h2>
  </div>
  <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:32px">
    <div style="background:#ffffff; border:1px solid #e3e6e4; border-radius:16px; padding:40px; display:flex; flex-direction:column; gap:8px">
      <p style="font-size:140px; font-weight:600; line-height:1">41%</p>
      <p style="font-size:28px; color:#4a5568">faster ramp</p>
    </div>
    <!-- two more tiles alike -->
  </div>
  <p style="position:absolute; left:128px; bottom:64px; width:1200px; font-size:24px; color:#6a7179">Source: People Ops survey (n=212)</p>
</section>
```
