# Humanizer

Rewrites English text that sounds AI-written so it reads like the writer, without changing what it says. Written by [blader](https://github.com/blader) and copied here unchanged.

Ask for it in plain words ("humanize this draft", "check this for AI tells"). The skill works through 26 patterns in six groups, based on Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), such as not-X-but-Y contrasts, one-line closers, staged openers, forced triads, dashes everywhere, inflated claims, sales language, stock AI words, bold labels and filler. It keeps the facts and the writer's voice and does not invent anything. For Chinese text, use the separate `humanizer-zh` skill.

## Source

- Repository: [blader/humanizer](https://github.com/blader/humanizer), latest release
- First imported from release [`v3.1.0`](https://github.com/blader/humanizer/releases/tag/v3.1.0), commit [`225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`](https://github.com/blader/humanizer/tree/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8)
- License: MIT, see [`LICENSE`](LICENSE)

The marketplace follows upstream releases: each new release becomes a sync pull request that is reviewed before it is published. The commit currently in use is recorded in `catalog/entries/humanizer.json` and shown on the store page.

## Layout

Upstream keeps `SKILL.md` at the root of its repository. Wevir loads plugin skills from `skills/<name>/`, so the file sits at `skills/humanizer/SKILL.md`; `catalog/patches/humanizer/` moves it there on every sync without touching its text. `AGENTS.md`, `CHANGELOG.md`, `.cursor-plugin/` and `scripts/validate-package.py` come from upstream unchanged and are not used by Wevir; the validation script is for the upstream maintainers and the skill never runs it. Upstream's `agents/openai.yaml` and Claude Code marketplace files are left out, and this README replaces upstream's.

## Requirements and privacy

Nothing to install, no account or key. The skill is instructions only: it contacts no service and stores nothing besides the text you ask it to edit.
