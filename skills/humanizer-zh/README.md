# humanizer-zh

A Chinese editing skill that removes empty phrases, repetition and template wording from articles, comments and documents, keeping the facts, the degree of certainty and the writer's voice. It is guidance for the agent, not a detector: it cannot tell who wrote a text and does not promise to pass any AI detector. Written by [op7418](https://github.com/op7418), based on [blader/humanizer](https://github.com/blader/humanizer), and copied here unchanged.

## Source

- Repository: [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh), branch `main`
- First imported from commit [`f4518a8eab97b8bfebc66a89d34320a89bef6930`](https://github.com/op7418/Humanizer-zh/tree/f4518a8eab97b8bfebc66a89d34320a89bef6930) (2026-09-23)
- License: MIT, see [`LICENSE`](LICENSE)

The marketplace follows upstream `main`: when it changes, a sync pull request brings the new files here and is reviewed before it is published. The commit currently in use is recorded in `catalog/entries/humanizer-zh.json` and shown on the store page.

## Notes for Wevir

- The `allowed-tools` list in the `SKILL.md` frontmatter uses Claude Code's tool names (`Read`, `Write`, `Edit`, `AskUserQuestion`). The skill only needs to read and edit text and, now and then, ask you a question.
- `tests/` is the upstream author's structure check and sample cases; the skill never runs it.
- Upstream's Chinese README, which covers installing in other agents, is replaced by this file; `CHANGELOG.md` is kept.

## Requirements and privacy

Nothing to install, no account or key. The skill is instructions only: it contacts no service and stores nothing besides the text you ask it to edit.
