# Wevir Marketplace

[简体中文](README.zh-CN.md)

The official plugin marketplace for [Wevir](https://github.com/marvinli001/wevir). Wevir reads it directly from this repository and its mirrors; there is no separate server.

| Mirror | Repository |
|---|---|
| GitHub (primary) | [Wevir-Labs/wevir-marketplace](https://github.com/Wevir-Labs/wevir-marketplace) |
| CNB | [wevir-labs/wevir-marketplace](https://cnb.cool/wevir-labs/wevir-marketplace) |
| Gitee | [wevir-labs/wevir-marketplace](https://gitee.com/wevir-labs/wevir-marketplace) |

CNB and Gitee are synced from GitHub after every publish. Wevir picks the fastest mirror on first use and remembers it; you can choose one in Settings.

## Layout

```
plugins/<id>/          Wevir plugin packages (wevir-plugin.json, skills/, README.md, icon)
skills/<name>/         Single skills: a SKILL.md and its files
catalog/               Maintainers only:
  categories.json        Categories in display order
  featured.json          Featured groups: listed by hand, or "auto": "recent" for the newest entries
  entries/<id>.json      Per-entry category, verification badge and upstream
  patches/<id>/*.patch   Our changes to upstream files, applied on every sync
schemas/               JSON Schemas for wevir-plugin.json, index.json and catalog entries
keys/                  Public keys that sign the index
scripts/               Validation, index generation, signing and upstream sync
```

Everything Wevir installs is stored in this repository; entries never point to other repositories.

## Catalog

- **Category:** `catalog/entries/<id>.json` decides; otherwise the manifest's `category` is taken as a suggestion; otherwise `other`.
- **Verification:** `verification.level` is `official` (maintained by Wevir) or `verified` (reviewed, publisher identity confirmed; `publisher` is required). Wevir shows a badge next to the name. It belongs to the entry, not a version; removing it revokes it.
- **Listing time:** the time an entry directory first appeared on `main`, computed from git history at publish. `{"auto": "recent", "limit": 6}` in `featured.json` lists the newest entries.

## Upstream sync

Entries copied from open-source projects register their source as `upstream` in `catalog/entries/<id>.json`: a git repository (`repo`, optional `path`, `track` of `release`, `branch:<name>` or `tag:<glob>`, and `format` of `wevir`, `claude`, `codex` or `skill`) or an npm / PyPI `package` whose pinned version is updated in the connector command. `keep` lists files we added, `overlay` is merged into a generated `wevir-plugin.json`, and `catalog/patches/<id>/` holds our changes.

The `upstream-sync` workflow runs daily (or by hand for chosen entries). For every upstream that moved it converts the new version into the entry directory, applies the patches, raises the patch version, runs the validation and opens or updates a pull request on `sync/<id>` labelled with the risks it found (`risk:connector`, `risk:inputs`, `risk:license`, `risk:exec`, `risk:size`). Failures open an issue `upstream: <id>` that closes itself once the entry syncs again. Sync pull requests are never merged automatically. Entries with an upstream keep its LICENSE / NOTICE files. Check what is out of date locally with `node scripts/upstream-sync.mjs --check`.

The workflow uses a GitHub App token from the secrets `UPSTREAM_SYNC_APP_ID` and `UPSTREAM_SYNC_APP_KEY` when they are set, so the validate workflow runs on its pull requests; without them it uses the workflow token and writes the validation result into the pull request. Set the repository variable `UPSTREAM_SYNC_BOT` to the app's login (such as `wevir-upstream-sync[bot]`) so validation lets it update `catalog/entries/<id>.json` for the entries it syncs.

## How Wevir reads it

1. `index.json` and `index.json.sig` on the `dist` branch. CI rebuilds them on every push to `main` and signs `index.json` with an ed25519 key whose public half is in `keys/` and built into Wevir.
2. Entry files by the `main` commit recorded in the index, checked against the sha256 of every file listed there.

A mirror only carries bytes; the signature and hashes are checked inside Wevir, so a stale or altered mirror cannot change what gets installed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

The scripts and catalog are MIT licensed. Each entry carries its own license, given in its manifest or SKILL.md, and entries copied from upstream projects keep the upstream's license files.
