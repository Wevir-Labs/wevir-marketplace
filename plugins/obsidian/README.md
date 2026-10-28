# Obsidian

Agent skills for working in an [Obsidian](https://obsidian.md) vault, written by Steph Ango ([kepano](https://github.com/kepano)) and copied here unchanged.

## Source

- Repository: [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills), branch `main`
- First imported from commit [`3ccff5338ea700537839b21900aa5358a0402c98`](https://github.com/kepano/obsidian-skills/tree/3ccff5338ea700537839b21900aa5358a0402c98) (2026-09-15)
- License: MIT, see [`LICENSE`](LICENSE)

The marketplace follows upstream `main`: when it changes, a sync pull request brings the new files here and is reviewed before it is published. The commit currently in use is recorded in `catalog/entries/obsidian.json` and shown on the store page.

## Skills

| Skill | What it does | Needs |
|---|---|---|
| `obsidian-markdown` | Obsidian Flavored Markdown: wikilinks, embeds, callouts, properties, tags | nothing |
| `obsidian-bases` | Bases (`.base`): views, filters, formulas, summaries | nothing |
| `json-canvas` | JSON Canvas (`.canvas`): nodes, edges, groups | nothing |
| `obsidian-cli` | Reads, creates, searches and manages notes in a running Obsidian app; plugin and theme development | Obsidian with its [command line interface](https://help.obsidian.md/cli) turned on, and the app open |
| `defuddle` | Saves a web page as clean Markdown | the [Defuddle](https://github.com/kepano/defuddle) CLI (`npm install -g defuddle`) |
| `knap` | Renders Markdown templates from JSON or CSV data | the [Knap](https://github.com/obsidianmd/knap) CLI (`npm install -g knap`, Node.js 20 or later) |

The first three only write files, so they work on any folder of Markdown, with or without Obsidian installed.

## Network and installs

- `obsidian-cli` talks to the Obsidian app on your computer and nothing else.
- `defuddle` downloads the pages you ask for.
- When Defuddle or Knap is missing, the skills tell the agent to install it globally with npm, which contacts the npm registry. Wevir asks before running such a command; you can also install them yourself.

No account, key or token is needed, and the skills store nothing outside the files you ask for.

## Notes for Wevir

- The skill text is upstream's and sometimes names another agent's tools: "Prefer over WebFetch" in `defuddle` means the agent's own web fetch tool.
- Upstream's Claude Code marketplace files are not included, and this README replaces upstream's, which only covers installing in other agents.
