# Writing a skill

A skill is a folder with a `SKILL.md`: YAML frontmatter, then instructions the agent reads when the skill applies. Wevir uses the same format as Codex and Claude Code, so a skill that works there works here. In a plugin each skill is `skills/<name>/`; a single-skill entry is `skills/<name>/` at the top of this repository.

## Frontmatter

```yaml
---
name: release-notes
description: "Write release notes and changelogs from git history: commits, tags and merged pull requests since the last release, grouped into features, fixes and breaking changes for users. Use when asked for release notes, a changelog, 更新日志, or what changed between two versions."
metadata:
  version: "1.0.0"
---
```

- `name`: at most 64 characters. For a single-skill entry it equals the directory name and follows the id rules (lowercase, hyphens, not starting with `wevir`). Inside a plugin it must not clash with skills users already have, so make it specific.
- `description`: at most 1024 characters, and the most important text you write. The agent sees only the names and descriptions of installed skills and decides from them whether to open one. Say what it produces and list the words people use for the task, in the languages your users speak. Name the cases where it should be used, including follow-ups ("or to change a deck made this way").
- `metadata.version`: for single-skill entries; without it every change ships as an update of `1.0.0`. Plugins version through `wevir-plugin.json`.
- `metadata.short-description`: optional one-line summary for compact lists.
- `metadata.category`: a single-skill entry's suggested category.

## Body

- Write for an agent that is capable but new to this task. Lead with the result to produce and the steps in order; put the judgement calls next to the step they belong to.
- Keep `SKILL.md` short enough to read every time, roughly under 300 lines. Move detail into `references/*.md` and link it from the step that needs it, so the agent reads it only then.
- Give concrete defaults (sizes, file names, where to save output) instead of options. Say what to ask the user and what to decide alone.
- Say what to do when something fails: a missing tool, no network, a command that needs approval.
- End with how the agent checks its own work before reporting, and what it should tell the user (where the files are, what it assumed).

## Bundled scripts

Scripts make a skill reliable where prose would be fragile: converting formats, checking output, calling an API the same way every time.

- Put them under the skill folder (`scripts/`) and refer to them by a path relative to `SKILL.md`; the agent knows where the skill lives and runs them through its shell.
- Ship them ready to run. No `npm install` or `pip install` step: use Node or Python standard libraries, or commit a single bundled file within the size limits. Declare the runtime in `requires.runtimes`.
- The agent's shell may run in a sandbox that blocks network access or writes outside the project, and each blocked command asks the user for approval. Keep network use to what the task needs, say in the README which hosts are contacted, and write output inside the user's project or the session folder.
- Print short, actionable results (`slide 3: text overflows by 40px at line 112`) so the agent can fix problems itself.
- Keep license files of anything you vendor next to it, and credit it in the README.

## Testing a skill

1. Install the entry in Wevir (Plugins → Add → Install from file → Choose folder). To update after an edit, install the same folder again and confirm the upgrade; a single-skill entry has to be removed first.
2. In a new session, send each example prompt without naming the skill. If the agent does not pick it up, rewrite the description, not the prompt.
3. Try one follow-up edit and one request that is close to the skill but outside it; the skill should handle the first and stay out of the second.
4. Check the files it produced by opening them, not only by reading the agent's summary.
