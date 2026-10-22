# Diagrams

Flowcharts, process steps, trees, org charts, swimlanes, timelines and system maps: boxes joined by lines. **Write the boxes first, then the lines**, reading every line's coordinates off the boxes you wrote.

## Pick the layout

1. **A straight chain, or a small tree (two levels, up to four leaves): flow.** Boxes in a row (`display:flex; align-items:center; gap:24px`) or column, with a sized connector between them: `<x-connector style="width:96px"></x-connector>` in a row, `<x-connector style="width:24px; height:56px"></x-connector>` in a column (it runs along the longer side). Branches are columns inside the row. Nothing can overlap and text changes reflow.
2. **Anything bigger, or lines that join, cross or loop back: pin boxes in one host.** `<div style="position:relative; width:1664px; height:700px">` holding boxes with exact `left`/`top`/`width`/`height`, then connectors, then labels, in that order. Above the host, keep a comment listing every box: `<!-- A 0,0,320,120  B 448,0,320,120 … -->`. All coordinates are relative to the host.
3. **Curved lines:** an `<svg>` covering the host (below).

Slide budget: title about 70px, a 40px gap, a 700px host = 810px of the 824px. With a footer, 16px gap and 680px host. Use the whole host: the lowest row ends below y 600.

## Boxes

- **Grid:** one column pitch and one row pitch. For example 320px boxes at left 0, 448, 896, 1344; 120px boxes at top 0, 290, 580. At least 32px between boxes. Nodes of one kind share one size.
- **Width:** at 24px text a box is at least 200px wide (holds a 10-letter word); add 16px per letter beyond 10. At 28px: 232px plus 18px per extra letter. Bold or capitals: 10% more. Two lines of 24px need about 100px of height.
- **Too many columns for those widths:** stack consecutive steps that belong to different lanes in one column; wrap a long chain into two rows (left to right, then back right to left below); merge steps ("Validate & register"); shorten labels. Never narrower boxes or smaller text. A 1664px host holds at most 7 columns of 200px boxes with 44px gaps (lefts 0, 244, 488, 732, 976, 1220, 1464).
- A box is a painted `<p>`: `position:absolute; left; top; width; height; background; border; border-radius; padding:24px; display:flex; align-items:center; justify-content:center; text-align:center`.
- Questions in a decision tree are rounded boxes; a `<x-shape kind="diamond">` holds only one short line (≤12 characters at 24px in 320×120), with the text as a `<p>` pinned over it.

## Connectors

```html
<x-connector x1="320" y1="60" x2="448" y2="60"></x-connector>
<x-connector x1="608" y1="120" x2="896" y2="300" route="vh" style="color:#2b6f6d; border-width:3px"></x-connector>
<x-connector x1="160" y1="120" x2="160" y2="260" head="none" style="border-style:dashed; color:#8a9199"></x-connector>
```

- Coordinates in px (or %) of the host, or of the slide when the connector sits directly in the section. All four of x1 y1 x2 y2, or none (a sized flow connector, which runs corner to corner per `from="tl|tr|bl|br"`, or along its length by default).
- `route`: `straight` (default), `hv` (across then down), `vh` (down then across), `elbow` (three segments bending at the midpoint of the longer run).
- `head="end"` (default) `both` `none`; or per end, `head-start` / `head-end` = `none|open|filled`. Heads are about four stroke widths long.
- `color` sets the line; `border-width` its weight (2px default); `border-style:dashed|dotted`.

**Endpoints are edge midpoints.** Right edge: `(left + width, top + height/2)`. Bottom edge: `(left + width/2, top + height)`. Copy the numbers from your box list; never "about there". When two lines leave one edge, use other points on it.

**Routes:**

- Same row or column: straight.
- Top/bottom edge into a side edge: `vh`. Side edge into a top/bottom edge: `hv`.
- Side edge to side edge across rows and columns, when the horizontal distance is at least the vertical one and the column gap is at least 96px: `elbow`. Otherwise use three straight segments through the gaps.
- Never join a bottom edge to a top edge with `hv`, `vh` or `elbow` (one leg lies on a box border): use a bus.
- Horizontal legs run in the gaps between rows, vertical legs in the gaps between columns or at a column's center where they enter a box. Nothing runs through a box.
- Loop back (last step to first): down from the last box, along a clear strip below the row, up into the first box: three straight connectors, `head="none"`, `"none"`, `"end"`, each one's end exactly the next one's start.

**Bus (one parent to several children).** Parent bottom at y = P, center x = PC; children's tops at y = C, centers C1…Cn; bus at y = B = C − 24:

```html
<x-connector x1="PC" y1="P" x2="PC" y2="B" head="none"></x-connector>   <!-- drop -->
<x-connector x1="C1" y1="B" x2="Cn" y2="B" head="none"></x-connector>   <!-- bar -->
<x-connector x1="C1" y1="B" x2="C1" y2="C"></x-connector>               <!-- one stub per child -->
```

Keep at least 48px between the parent's bottom and the children's tops. An org chart uses `head="none"` on the stubs too. Several boxes into one: the same shape mirrored.

## Trees, org charts, decision trees

Each level is one row of the 700px host. Count the leaves first; they set the columns.

| Leaves in a row | Box width | Lefts |
|---|---|---|
| 4 | 380 | 0, 428, 856, 1284 |
| 5 | 300 | 0, 341, 682, 1023, 1364 |
| 6 | 240 | 0, 285, 570, 854, 1139, 1424 |

| Rows | Box height | Tops |
|---|---|---|
| 3 | 120 | 0, 290, 580 |
| 4 | 96 | 0, 200, 400, 600 |
| 5 | 80 | 0, 155, 310, 465, 620 |

- Center each parent over its children: `left = (first child left + last child right − parent width) / 2`, or make the parent span its children exactly (a category band).
- More than six leaves: fold the last yes/no into the leaf card ("Normal → t-test" over "Not normal → Mann–Whitney"), or split across two slides.
- Yes/No labels go inside the top of the child box as a small first line, so no line crosses them.
- Dotted or secondary relationships route like solid ones, dashed with no head; never a diagonal across other boxes.

## Labels

Labels are `<p>` pinned beside their line, at least 8px clear of the line and of every box, with a set `width`. Keep edge labels in reading order after the boxes. Along a timeline, period names sit inside or just under the track; milestone labels sit at the end of their own leader line, alternating two leader lengths or two sides so neighbors cannot touch.

## Swimlanes, timelines, system maps

- **Swimlane:** lanes are full-width painted bands pinned first (alternate two light tones), each with its name in a gutter on the left (200–240px). Steps sit in their lane's band; a hand-off between lanes is a `vh` from the bottom edge into the next step's side, or a straight vertical when stacked.
- **Timeline:** a horizontal track (a painted 4–6px `<div>` or `<hr>`) across the host; ticks or dots as small pinned circles (`border-radius:50%`) on it; dates under it, events above, alternating heights when crowded. Long periods are painted bars on the track.
- **System map / architecture:** group related boxes in painted containers (a lighter fill, the group name as an eyebrow inside its top), lines between containers' edges, at most one line between any two boxes, labels on the line only when the relationship is not obvious.

## Curves

Only when a line must curve: one `<svg>` covering the host, listed first in it so it paints under the boxes, its numbers matching the box list.

```html
<!-- A 0,0,320,120  B 896,0,320,120: arc from A's right midpoint (320,60) to B's left midpoint (896,60) -->
<svg style="position:absolute; left:0; top:0" width="1664" height="700" viewBox="0 0 1664 700" aria-label="Feedback loop from B back to A">
  <defs><marker id="h" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill="#2b6f6d"/></marker></defs>
  <path d="M 320 60 Q 608 200 888 60" fill="none" stroke="#2b6f6d" stroke-width="4" marker-end="url(#h)"/>
</svg>
```

Only the control point is free (80–160px off the straight line). End the path two stroke widths short of the target edge so the marker's tip touches it. No `<text>` in the SVG; labels are `<p>`s.

## Before you finish a diagram

Go down the box list once: every connector endpoint is an edge midpoint or a bus point; legs run in gaps; labels are clear of lines and boxes; boxes are at least 32px apart and inside the host. Then run `check` (it measures overlaps between text boxes and anything off the slide), and render the slide once with `png --slides N` to look at the lines, which `check` cannot judge.
