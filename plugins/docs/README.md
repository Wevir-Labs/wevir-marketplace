# Docs

Write and revise documents with Wevir, and export them as Word, PDF or a single web page.

The agent drafts a Markdown file in your session folder (reports, decision memos, proposals, PRDs and design docs, meeting notes, one-pagers, status updates, letters), shares the outline first, and turns it into the formats you ask for. Revisions change only what you asked for, and every export is regenerated from the same Markdown, so Word and PDF always match.

## What it includes

- **The `docs` skill:** how to structure each kind of document, write it plainly, mark the figures you still have to fill in (`[¥__]`), handle Chinese typography, and deliver the files in the conversation.
- **A converter** (`skills/docs/scripts/doc.mjs`, no dependencies):
  - `check`: missing images, unsupported syntax, placeholders left in the text.
  - `docx`: a native Word file with real headings (navigation pane and contents), numbered and bulleted lists, tables with repeating header rows, footnotes, embedded images, links and page numbers.
  - `pdf`: a print-ready PDF with page numbers.
  - `html`: one self-contained page with images embedded.
- Three looks: `modern`, `classic` and `memo`; A4 or Letter.

## Requirements

- Node.js 22 or later.
- For PDF export (and for SVG or WebP images inside Word files): Google Chrome, Microsoft Edge, Chromium or Brave. Set `CHROME_PATH` if yours is installed somewhere unusual.

No network access, API keys or accounts are needed; nothing is downloaded when the plugin runs.

## Limits

No math typesetting, tracked changes, comments or company Word templates. The contents page in Word gets its page numbers when Word updates the field (it offers to when the file opens).

## License

MIT.
