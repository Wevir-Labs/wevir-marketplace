# Images and SVG

## Where images come from

Only from the user: files they attached or named, files in their project, or pages they point you to (save the image beside the deck first). Never invent an image, never draw decorative art they did not ask for, and never link an image from the web: Wevir's preview and offline viewers load nothing from the network, and `check` treats a URL in `src` as an error.

No images is a fine deck. Good structure (big numbers, tables, diagrams, statements) beats stock decoration. Icons (`<x-icon>`) sparingly.

## Files

Put each image file in the deck's folder (or a subfolder) and reference it by relative path: `<img src="photos/reef.jpg" alt="…">`. `build`/`export` inline every image into the HTML deck, so the outputs stand alone.

- png, jpg, webp, gif, svg work as they are. Convert anything else (heic, bmp, tiff) to png or jpg first.
- A photo much larger than its box is worth shrinking to about twice the box size before it goes in (`sips -Z 2400 photo.jpg` on macOS); a deck's size is mostly its images.
- Use one file several times instead of several crops of it.
- No file yet: an empty frame `<img alt="Team photo" style="width:720px; height:480px">` with no `src` holds the space; list it in your reply. `check` notes empty frames.

## Display

Look at each image before placing it.

- Photos fill their box: `object-fit:cover`. Choose the crop with `object-position` (`50% 30%` keeps faces).
- Screenshots, charts and diagrams fit inside it: `object-fit:contain`, on a contrasting background or card, with nothing on top except labels.
- Text over a photo needs protection, the same way every time in a deck: a card, a scrim (`background:rgba(20,20,19,.6)`), or a frosted panel (`backdrop-filter:blur(16px)` over a translucent background).
- A full-bleed photo: pinned first in the section, `left:0; top:0; width:1920px; height:1080px; object-fit:cover`.
- `border`, `border-radius` and `box-shadow` work on images; keep shadows soft (`0 4px 24px rgba(0,0,0,.08)`).
- `alt` describes what the image shows; it becomes the description in the PowerPoint file too. Decorative images get `alt=""`.

## SVG

Use SVG for crisp vector art: logos, charts, curved arrows, simple illustrations. Either an `.svg` file in `<img>` or `<svg>…</svg>` written into the slide.

- No `<script>`, no event handlers, no `<foreignObject>`, no links to other files.
- Fonts do not reach inside an SVG, so keep text out of it: draw the shapes in SVG and pin `<p>` labels over it (layout.md, "Labels over an image").
- Inline SVG: set `width`/`height` equal to the `viewBox` size, an `aria-label` when it carries meaning, and write characters literally or as numeric entities (`&#8212;`); a bare `&` breaks it.
- Prefer presentation attributes (`fill`, `stroke`, `stroke-width`) to a `<style>` inside the SVG.

## Charts

Simple bar charts are plain `<div>` bars (layout.md, "Bar chart"). Line, area and scatter charts are an inline `<svg>` of paths sized to the plotting area, with axis labels, values and the legend as `<p>`s around or over it. Every chart says in text what it shows (title or caption) and labels values directly where it can, instead of relying on a legend or on color alone.
