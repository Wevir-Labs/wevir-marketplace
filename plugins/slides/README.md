# Slides

Makes and revises presentation decks. Ask for a deck in plain words ("eight slides for Thursday's team update from these notes", "a pitch deck from our README") and the agent plans the outline, designs and writes the slides, checks their layout in a browser, and hands you the files.

Maintained by Wevir. The skill and its scripts run entirely on your computer.

## What you get

- **An HTML deck** that works anywhere, offline: fonts and images are inside the file. Open it in Wevir or any browser and present with the arrow keys, click, **F** for full screen, **N** for speaker notes and **G** for all slides.
- **A PDF**, one page per slide.
- **A PowerPoint file (.pptx)**, one full-slide picture per slide with the speaker notes as notes. The pictures look exactly like the deck, but their text cannot be edited in PowerPoint; ask the agent for changes instead.

The deck's source is a single `deck.html` in a folder next to your conversation's files, so later changes ("make slide 4 a table", "use our brand colors") edit only what you name.

## Requirements

- **Node.js 22 or later** to run the bundled scripts.
- **Google Chrome, Microsoft Edge, Chromium or Brave** for the layout check and for PDF and PowerPoint export. Set `CHROME_PATH` if yours is somewhere unusual. Without one, the agent can still produce the HTML deck.
- **Network, once per typeface:** fonts from Google Fonts are downloaded subset to the characters a deck uses and cached in your user cache folder. Offline, decks fall back to basic system faces.

## How it works

The agent writes slides in a small, strict HTML subset: one 1920×1080 `<section>` per slide, inline styles only, plus a few elements for shapes, icons and connector lines. `scripts/deck.mjs check` lints the file and measures every slide in a headless browser, reporting overflow, words wider than their boxes, text under 24px, low contrast, overlapping text and missing files with line numbers, so the agent fixes problems before you see them. `export` writes the HTML, PDF and PowerPoint files into the deck's `dist/` folder.

## Privacy

Your slides never leave your computer. Fetching a Google font sends Google the font name and the set of characters the deck uses (not the text itself in order). Use local font files or basic faces to avoid that.

## Credits

Icons from [Lucide](https://lucide.dev) (ISC License; some derived from Feather, MIT License), see `skills/slides/scripts/LICENSE-lucide.txt`.
