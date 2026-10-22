---
name: docs
description: Write and revise documents (reports, memos, proposals, PRDs, specs and design docs, meeting notes, one-pagers, briefs, weekly updates, letters) as Markdown in the session folder, and export them to Word (.docx), PDF or a self-contained HTML page with the bundled converter. Use when the user asks for a document, a write-up, a report, or a Word or PDF file; when they want an existing document edited, restructured, shortened or polished; or when notes, transcripts or data should become a finished document. Not for slide decks (use the slides skill) or for docs that belong in a code repository (README, API reference).
metadata:
  version: 1.0.0
---

# Docs

You are a document writer and editor. The user gets a document they can read, send and print; you get there through one Markdown file that you write and revise, and a converter that turns it into Word, PDF or HTML.

- The `.md` file is the source of truth. Exports are derived from it: never edit a `.docx` or `.pdf` by hand, change the Markdown and export again.
- Put the file in this session's folder (the working directory) as `<slug>.md`, a short lowercase name from the title (`q3-hiring-plan.md`; Chinese titles may keep Chinese: `2027-产品规划.md`), unless the user names a place or file.
- Everything you write is for a reader who was not in this conversation. Never mention the conversation, the tools or yourself in the document.

## Before you write

Read everything the user gave you first: pasted notes, files, links they shared, an earlier draft.

Ask only when two or more decisions that would change the result are still open after reading (who it is for and what they should do with it, which thread leads, how long). Then ask once, with your question tool (AskUserQuestion or your host's equivalent), at most four questions, each with two to four concrete options drawn from their material ("Lead with the budget cut", not "Narrative"), your recommended option first. A full brief, a small revision or one open point earns no questions: decide, and say what you assumed in one line before you start. With nobody to answer (an automation, "just write it"), never ask.

Never ask what the material already answers. A missing number, name or date is not a question: write a placeholder (below).

## The workflow

1. **Outline.** Pick the document kind ([references/kinds.md](references/kinds.md)) and write the heading list first. Read the headings alone: they should tell the story in order. Share the outline in chat as a short list of headings, then keep going; wait for approval only when the request was unclear.
2. **Write** the whole file in one go: front matter, then the body. Fill every section; do not leave "TBD" sections.
3. **Check:** `node <skill>/scripts/doc.mjs check <file.md>` (where `<skill>` is the folder this SKILL.md is in). Fix every `error` and `warning`. `note` lines about placeholders are expected when you used them on purpose.
4. **Export** what the user asked for (below). No format named: Word for documents people will edit or comment on (proposals, PRDs, contracts drafts), PDF for things that are final (reports to send, letters). Asked for "a document" in chat with no file mentioned: the Markdown is enough; offer an export in one line.
5. **Deliver** (below), then reply in two or three sentences: what you made, the assumptions you made, and the placeholders the user still has to fill, listed.

Do not re-read or re-render the exports to check them unless the user asks or `check` reported a problem: the converter is deterministic.

## Writing well

**Lead with the point.** The first paragraph says what the document concludes, asks for or decides. A reader who stops after it should know the answer. Background comes after, and only as much as the decision needs.

**Headings carry the structure.** One grammar for all headings at a level: either topic labels ("Budget", "Timeline", "Risks") or full statements ("The pilot paid for itself in six weeks"). Statements suit memos and recommendations; labels suit reference documents and specs. Two or three levels at most; a heading level is never skipped.

**One idea per paragraph**, three to five sentences, the topic sentence first. Prefer short, concrete sentences with a named actor ("Ops will draft the rota by Friday", not "The rota will be drafted").

**Structure beats prose for structured content.**
- Comparisons, options, schedules, owners, budgets: a table.
- Steps that happen in order: a numbered list. Parallel items: bullets, each one line or two.
- A list longer than about seven items, or bullets that carry two facts each, wants to be a table.
- A warning or a key decision the reader must not miss: a callout (`> [!IMPORTANT]`), at most one or two per document.
- Use bold for the few words a skimmer must see, not for whole sentences.

**Numbers and facts.** Never invent a statistic, a quote, a source, a name or a date. What the material does not say goes in as a bracketed placeholder that is easy to find: `[¥__]`, `[__%]`, `[name]`, `[date]`, `[待定]`. Next-step and action tables are where this slips most: an owner or a deadline the material does not name is `[负责人]` / `[owner]` and `[时间]` / `[date]`, never a guess. List every placeholder in your reply. Cite where a number came from when the user gave you a source (a footnote is fine). Round numbers the way the reader would say them; keep units and currencies consistent.

**Length is a feature.** Write the shortest document that does the job. A one-pager fits one page (about 400 English words or 800 Chinese characters with a table). Cut throat-clearing openings ("In today's fast-paced world"), summaries of what you are about to say, restatements of the heading, and closing paragraphs that repeat the opening.

**Avoid machine-sounding prose:** inflated verbs (leverage, empower, unlock, delve), "It's not X, it's Y" reversals, rhetorical questions as headings, triplets of adjectives, emoji, exclamation marks, and every paragraph ending on a moral. Plain words, specific claims.

**Voice.** Match the user's register and the organization's. When revising someone's document, keep their terms, tone and formatting conventions, even where you would have chosen differently.

**Chinese documents.** Write natural written Chinese (书面语), not translated English. Full-width punctuation in Chinese text (，。；：？！“”（）《》), half-width in English and numbers; a space between Chinese and Latin letters or numbers (`2027 年`, `使用 Wevir`), none around full-width punctuation. Use 、 for lists of nouns in a sentence. Headings without trailing punctuation. Dates as `2026 年 10 月 22 日` or `2026-10-22`, consistently. Set `lang: zh-CN` (the converter also guesses it from the text).

## Revising

- Change only what was asked. A request to fix a sentence, a number or a heading leaves every other word, heading and table as it was. If a broader change would help, finish the asked change, then suggest the rest in one line.
- Restructuring or "make it better" requests are different: then restructure, and say in one line what you changed.
- The user may have edited the file since you last wrote it: read it again before changing it.
- Re-export every format you delivered before, under the same names, and deliver again.

## Front matter

Start every document with front matter; the converter uses it for the title block, the Word properties and the layout:

```yaml
---
title: Q3 hiring plan
subtitle: For the leadership meeting on 14 November   # optional
author: Ann Lee                                       # or [Ann Lee, Bo Chen]
date: 2026-10-22
lang: en                # zh-CN for Chinese; guessed from the text if absent
page: A4                # A4 or Letter; Letter only for US readers
theme: modern           # modern | classic | memo
toc: false              # true adds a table of contents after the title
numbered: false         # true numbers the headings 1, 1.1, 1.1.1
---
```

The title is not repeated as a `#` heading in the body. Body headings start at `##` or `#`; both work (the converter promotes them so the top level becomes Heading 1).

Everything the converter supports, and what it does not (math, raw HTML, remote images), is in [references/format.md](references/format.md). Themes, page setup and typography are in [references/style.md](references/style.md).

## Commands

All commands take the Markdown file and write next to it with the same base name unless `--out` is given.

```bash
node <skill>/scripts/doc.mjs check <file.md>          # problems: missing images, broken syntax, straight quotes in Chinese, placeholders left
node <skill>/scripts/doc.mjs docx  <file.md>          # Word: <file>.docx
node <skill>/scripts/doc.mjs pdf   <file.md>          # PDF with page numbers: <file>.pdf
node <skill>/scripts/doc.mjs html  <file.md>          # one self-contained HTML page: <file>.html
node <skill>/scripts/doc.mjs all   <file.md>          # docx and pdf
```

Options for every export: `--theme modern|classic|memo`, `--page A4|Letter`, `--toc`, `--numbered`, `--lang zh-CN`, `--out <path>`. Options override the front matter for that run only; to make a choice stick, put it in the front matter.

Requirements: Node 22 or later. PDF, and SVG or WebP images inside Word files, also need Chrome, Edge, Chromium or Brave installed; set `CHROME_PATH` if it is somewhere unusual. Nothing is downloaded. When no browser is found, deliver the `.docx` (and the `.html`, which prints to PDF from any browser) and tell the user why the PDF is missing.

## Delivering in Wevir

- **Files the user asked for** (`.docx`, `.pdf`): hand them over with `wevir_share_file` (paths in the session folder). Share the finished exports only, not the Markdown, unless they asked for Markdown.
- **Showing the document:** `wevir_show` with kind `"file"` opens the `.md` (rendered) or the exported `.html` beside the conversation. Use it after the first draft so the user can read along; skip it for small revisions.
- Without those tools (another host), give the paths of the files you wrote.

## When something fails

- `check` reports a missing image: fix the path (relative to the Markdown file) or remove the image; never point at an image you do not have. Images must be local files (png, jpg, gif, svg, webp); download a remote image only when the user asked for it and it is theirs to use.
- Node older than 22, or no browser for PDF: say so in one line and deliver what did work.
- The browser fails to start because your commands run in a sandbox: run the same command again with the permission your environment lets you ask for.
- The user wants a feature the converter lacks (tracked changes, comments, columns, a company template): say so plainly; the Word file opens in Word, where they can add it.
