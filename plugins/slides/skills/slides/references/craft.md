# Writing a good deck

SKILL.md has the checklist; this page has the reasoning behind it. Read it before the first deck of a session, when the user questions a design choice, or for a kind of deck the checklist does not cover (keynote, lecture, training, investor pitch).

## Think like a presentation designer

A slide is a poster seen from the back of a room, not a web page. Aim for clarity, a story that holds together, and readability at a distance. Each slide should make sense on its own.

Ask only what you cannot work out (questions.md). A topic and an occasion are enough to draft.

## Outline and titles first

Write the outline before any slide. The slide titles alone should tell the story, like a table of contents a reader could skim.

Pick ONE title grammar for the whole deck:

- **Topic titles:** short and capitalized, such as "Market Research", "Team Structure", "Next Steps".
- **Action titles:** short claims, such as "Asia is our largest market", "but Eastern Europe grows fastest".

Read the titles in sequence; if the story does not come through, fix the outline, not the slides. Share the title list in chat before or while you build.

Titles to avoid, because they sound machine-written: titles that deliver a verdict or a punchline, staged tension ("It's not X. It's Y."), heavy reframing, faux insight ("The magic moment", "Here's the thing"). A title introduces the slide; the presenter makes the point.

For Chinese decks the same holds: 标题用一种句式贯穿全篇（全用名词短语，或全用观点句）；避免“不是……而是……”式的反转、“真正的答案是”式的揭晓腔和四字口号堆砌。

## Less text, more structure

Decide for each slide whether it is a table, a diagram, a quote, an image, a card row, a big number, or a short statement. Mix them: full-image slides, two background tones, a number slide, a quote, a table. Avoid a short block of text hanging under the heading with nothing below it; spread the body down the slide instead.

Keep the design parallel: section openers look alike, repeated elements stay in the same place, and slides of the same kind share markup (padding, gap, sizes).

No web density: the smallest text is 24px. If something only fits at 20px, there is too much on the slide.

## Commit to a system

Say, at least to yourself, the system before writing:

- a layout for each kind of slide: cover, section opener, content, image, statement, closing;
- two to four text sizes plus a display size, reused everywhere;
- one dark, one light and one or two accent colors in hex; two background tones for content plus the accent for one statement slide; the dark tone for cover and closing;
- variety and rhythm on purpose: no three identical layouts in a row unless they are a deliberate series.

Set `background` explicitly on every section. Choose typefaces by mood (fonts.md); vary them between decks.

## Composition

There is no automatic fit, so decide each slide's composition as you write it.

- A title or statement slide with open space is right.
- A content slide whose body stops at 60% of the height looks unfinished, and so does one whose body is pushed to the bottom with a hole above it. Make the body big enough to own the space (larger type and numbers, taller cards, a takeaway line), keeping the heading at the top margin.
- Center content vertically only on slides without a heading above the body.
- Text columns are 800–1000px wide; display lines up to about 1400px.
- Sizes from the user in points convert as px = pt × 2.

## Speaker notes

Only when the user asks. Then the deck turns visual-first: notes hold the full script as the presenter will say it (conversational sentences, not bullets), one `<aside>` per slide, last in the section. Take paragraphs off the slides; use large figures, quotes, images, diagrams and one-line headlines. If a slide carries a lot of text, the script has leaked onto the slide.

## Content rules for every deck

- **No filler.** No placeholder sections, dummy text, decorative stats or icons added to fill space. If a slide looks empty, solve it with layout, not invented content.
- **Never invent facts.** No made-up statistics, quotes, customers, logos or sources. Missing figures become bracketed placeholders (`[€__]`, `[客户名称]`) and you list them in your reply.
- **Ask before adding.** Extra sections, an appendix, an agenda slide the user did not ask for: suggest them, do not add them.
- **Targeted changes stay targeted.** A request to change some text, a color or one element changes only that. A redesign request is different; then change what it asks for.
- **Follow an existing look.** When extending a deck or a brand, match its type, palette, density, spacing and voice before your own taste.
- **Recreate from source.** When the user gives you a deck, document or brand guide, take wording, numbers and colors from it exactly rather than from memory.
- **No template tells:** gradients everywhere, emoji (unless the brand uses them), rounded cards with a colored left border, the most common font pairing every time, every slide centered.
- **Do not copy someone else's distinctive design** (a company's branded slide system or visual identity) unless the user says they work there; make an original design that serves the same purpose.
