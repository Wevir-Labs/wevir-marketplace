# Document kinds

Starting structures, not forms to fill. Drop sections the material does not support; rename headings in the document's own terms ("What we found" beats "Findings" when the doc is informal). Lengths are typical, not targets.

## Decision memo (1–2 pages)

For a reader who must approve or choose.

1. **Recommendation:** the decision asked for, in one or two sentences, with the date it is needed by.
2. **Why:** the two or three reasons, strongest first; a table when options are compared (option, cost, effect, risk).
3. **Options considered:** what else was looked at and why it lost, one line each.
4. **Risks and mitigations.**
5. **Next steps:** owner and date per step.

Byline as a line under the title: `**To:** … · **From:** … · **Date:** …`. Statement headings work well here.

## Report (3–15 pages)

1. **Summary:** the findings and what they mean, readable alone (half a page at most).
2. **Background and scope:** what was asked, what was in and out of scope, period covered.
3. **Method / sources:** how the evidence was gathered, briefly.
4. **Findings:** one section per finding, each opening with the finding as a sentence, then the evidence (tables, figures).
5. **Recommendations:** numbered, each traceable to a finding.
6. **Appendix:** detailed tables, raw data, glossary.

Set `toc: true` past about six pages; `numbered: true` when people will cite sections.

## Proposal (2–8 pages)

1. **Summary:** what you propose, for whom, what it costs, what it returns.
2. **The problem or opportunity**, in the client's terms.
3. **Proposed approach:** phases or workstreams, each with its outcome.
4. **Timeline:** a table (phase, dates, deliverable).
5. **Team** (when relevant).
6. **Budget:** a table with totals; state currency and what is excluded.
7. **Assumptions and terms.**
8. **Next steps:** what the reader does to go ahead.

## PRD / product spec (3–10 pages)

1. **Summary:** the problem, who has it, the bet.
2. **Goals and non-goals:** bullets; non-goals are as important.
3. **Users and use cases / user stories.**
4. **Requirements:** a table (ID, requirement, priority P0–P2, notes), or numbered requirements grouped by area.
5. **User experience:** flows, states, edge cases; images of mockups when given.
6. **Success metrics:** metric, current value, target, how measured.
7. **Launch plan and open questions.**

## Technical design doc (3–12 pages)

1. **Context and problem.** 2. **Goals / non-goals.** 3. **Proposed design** (components, data flow, APIs; diagrams as images; code only where an interface needs it). 4. **Alternatives considered** (and why not). 5. **Rollout, migration, testing.** 6. **Risks, security, privacy.** 7. **Open questions.**

## Meeting notes / 会议纪要 (1–2 pages)

Front matter `title` = meeting name and date. Then:

1. **Attendees** (one line), **Purpose** (one line).
2. **Decisions:** numbered; each a full sentence.
3. **Action items:** a table (action, owner, due date). The most-read part: never vague owners ("team").
4. **Discussion:** short bullets per topic, only what someone not present needs.
5. **Open questions / next meeting.**

Chinese 会议纪要 conventionally uses 会议时间、地点、主持人、参会人员、会议议题、会议决定、待办事项.

## One-pager (1 page)

Title, a one-sentence summary in bold or a callout, then three to five short sections (Problem, Proposal, Impact, Cost, Ask), or a single table. Check with the exported PDF that it fits one page; cut, do not shrink fonts.

## Weekly / status update / 周报 (under 1 page)

1. **Headline:** on track / at risk / off track, and why, in one sentence.
2. **Done this week**, 3. **Next week**, 4. **Risks and help needed.** Bullets, each with a concrete outcome ("Signed the Acme renewal, ¥1.2 M"), not activity ("Worked on renewals").

## Letter (1 page)

Theme `classic`. No title block: leave `title` out of the front matter and start with the date line, the recipient, the salutation. Short paragraphs: why you write, the substance, what you ask, the close. Sign-off and name at the end, each on its own line (end lines with `\` for line breaks).

## How-to / SOP (1–5 pages)

1. **Purpose and scope** (one paragraph), **who does it**, **what you need** (bullets).
2. **Steps:** a numbered list; one action per step, imperative mood; a screenshot after a step only when the UI is not obvious; warnings as callouts before the step they concern.
3. **Troubleshooting:** a table (symptom, cause, fix).
