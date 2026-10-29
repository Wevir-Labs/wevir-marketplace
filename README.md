# Wevir Marketplace

[![Entries](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FWevir-Labs%2Fwevir-marketplace%2Fdist%2Findex.json&query=%24.entries.length&label=entries&color=0969da&cacheSeconds=3600)](https://github.com/Wevir-Labs/wevir-marketplace/blob/dist/index.json)
[![Index](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FWevir-Labs%2Fwevir-marketplace%2Fdist%2Findex.json&query=%24.sequence&label=index&prefix=%23&color=6e7781&cacheSeconds=3600)](https://github.com/Wevir-Labs/wevir-marketplace/tree/dist)
[![Signature](https://img.shields.io/badge/signature-ed25519-2da44e)](keys/)
[![Validate](https://img.shields.io/github/actions/workflow/status/Wevir-Labs/wevir-marketplace/validate.yml?branch=main&event=push&label=validate)](https://github.com/Wevir-Labs/wevir-marketplace/actions/workflows/validate.yml)
[![Publish](https://img.shields.io/github/actions/workflow/status/Wevir-Labs/wevir-marketplace/publish.yml?branch=main&label=publish)](https://github.com/Wevir-Labs/wevir-marketplace/actions/workflows/publish.yml)
[![License](https://img.shields.io/github/license/Wevir-Labs/wevir-marketplace?color=6e7781)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-group-26A5E4?logo=telegram&logoColor=white)](https://t.me/darkfiber_labs)

English · [简体中文](README.zh-CN.md)

Official plugin and skill catalog for [Wevir](https://github.com/marvinli001/wevir). Served as static files from this repository and its mirrors, with a signed index and per-file hashes; no backend.

| Mirror | Repository | Role |
|---|---|---|
| GitHub | [Wevir-Labs/wevir-marketplace](https://github.com/Wevir-Labs/wevir-marketplace) | Primary; review and merge |
| CNB | [wevir-labs/wevir-marketplace](https://cnb.cool/wevir-labs/wevir-marketplace) | Mirror |
| Gitee | [wevir-labs/wevir-marketplace](https://gitee.com/wevir-labs/wevir-marketplace) | Mirror |

Mirrors receive `main` and `dist` after every publish. Wevir selects the fastest mirror on first use; override in Settings.

## Layout

```
plugins/<id>/            Plugin packages: wevir-plugin.json, skills/, README.md, icon
skills/<name>/           Single skills: SKILL.md and supporting files
catalog/                 Maintainer-owned
  categories.json          Categories, in display order
  featured.json            Featured groups: explicit lists or {"auto": "recent"}
  entries/<id>.json        Category, verification and upstream per entry
  patches/<id>/*.patch     Local changes reapplied on every upstream sync
schemas/                 JSON Schemas: wevir-plugin.json, index.json, catalog entries
keys/                    Public keys for index signatures
scripts/                 Validation, index build, signing, upstream sync
authoring/               Agent skill for building and submitting entries
```

All installable content is stored in this repository. Entries never reference other repositories or download at install time.

## Catalog metadata

| Field | Source | Rule |
|---|---|---|
| Category | `catalog/entries/<id>.json` → manifest `category` → `other` | First match wins; the manifest value is a suggestion |
| Verification | `verification.level` in `catalog/entries/<id>.json` | `official`: maintained by Wevir. `verified`: reviewed, publisher confirmed, `publisher` required. Bound to the entry, not a version; removal revokes |
| Listed at | First commit on `main` containing the entry directory | Computed at publish; `{"auto": "recent", "limit": 6}` in `featured.json` lists the newest |

## Distribution and integrity

1. **Index:** `index.json` and `index.json.sig` on the orphan `dist` branch, rebuilt on every push to `main` and signed with ed25519. The public key ships in `keys/` and in Wevir.
2. **Files:** fetched at the `main` commit recorded in the index and verified against the sha256 of each listed file.

Signature and hash checks run inside Wevir; a stale or modified mirror cannot alter installed content.

## Upstream sync

| Aspect | Specification |
|---|---|
| Source | `upstream` in `catalog/entries/<id>.json`. Git: `repo`, optional `path`, `track` (`release`, `branch:<name>`, `tag:<glob>`), `format` (`wevir`, `claude`, `codex`, `skill`). Package: npm or PyPI `package`, pinned version rewritten in the connector command |
| Layout | `skill` goes to `skills/<id>/` as it is; with `"asPlugin": true` it becomes a plugin in `plugins/<id>/` whose `wevir-plugin.json` comes from the `SKILL.md` frontmatter (`name`, `description`, `license`, `metadata.version`). Every other format is a plugin. A `SKILL.md` in a plugin's root moves to `skills/<name>/` with the `references/`, `scripts/` and `assets/` directories it mentions. Turning `asPlugin` on or off moves the entry under the same id; the sync carries over its version and `keep` files |
| Local changes | `keep`: files added on our side. `overlay`: merged into the generated `wevir-plugin.json` (`claude`, `codex`, `skill` with `asPlugin`). `catalog/patches/<id>/`: patches |
| Schedule | `upstream-sync` workflow, daily or on demand for selected entries |
| Output | Converted entry, patches applied, patch version raised, validation run; pull request on `sync/<id>`. Never merged automatically |
| Risk labels | `risk:connector`, `risk:inputs`, `risk:license`, `risk:exec`, `risk:size` |
| Failures | Issue `upstream: <id>`, closed automatically on the next successful sync |
| Licensing | Upstream `LICENSE` / `NOTICE` files retained |
| Credentials | GitHub App via secrets `UPSTREAM_SYNC_APP_ID` and `UPSTREAM_SYNC_APP_KEY`, so `validate` runs on sync pull requests; otherwise the workflow token, with results written to the pull request body. Variable `UPSTREAM_SYNC_BOT` (e.g. `wevir-upstream-sync[bot]`) authorizes edits to synced `catalog/entries/<id>.json` |

Local status: `node scripts/upstream-sync.mjs --check`.

## Authoring with an agent

[`authoring/`](authoring/SKILL.md) is a skill for coding agents (Claude Code, Codex, Wevir and others) covering the manifest, MCP servers and inputs, skill writing, checks and submission. Prompt template; replace the first line:

```text
Build a Wevir marketplace plugin that <what it should do>.

1. Fork https://github.com/Wevir-Labs/wevir-marketplace and clone the fork (or use my existing clone).
2. Read authoring/SKILL.md in that repository and follow it; it links to the references you need.
3. Put the entry in plugins/<id>/ (or a single skill in skills/<name>/) and change nothing outside it.
4. Run the checks it lists until they pass, then tell me how to install the folder in Wevir and what to try.
5. When I confirm it works, push a branch to my fork and open a pull request to Wevir-Labs/wevir-marketplace with the template filled in. Do not merge anything.
```

Persistent install: Wevir → Plugins → Add → Install from file → Choose folder → `authoring/`, or copy it into the agent's skills directory.

## Submission

| Stage | Action |
|---|---|
| Create | `plugins/<id>/` or `skills/<name>/` on a branch of your fork |
| Check | `npm ci && npm test && node scripts/validate.mjs --base upstream/main` |
| Test | Install the folder in Wevir; run the example prompts |
| Submit | Pull request against `main` on GitHub, template completed; CI runs the same checks |
| Review | Files, commands, network access and license. Category, featuring and verification are set by maintainers |
| Publish | Merge signs a new index; visible in Wevir after refresh (hourly, or Refresh) |
| Update | New pull request with a higher `version` |

Rules and field reference: [CONTRIBUTING.md](CONTRIBUTING.md), [authoring/references/submit.md](authoring/references/submit.md).

## License

Scripts and catalog data: [MIT](LICENSE). Each entry declares its own license in its manifest or `SKILL.md`; upstream-derived entries retain upstream license files.
