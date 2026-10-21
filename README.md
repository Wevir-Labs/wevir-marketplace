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
catalog/               Categories, featured groups and trust levels (maintainers only)
schemas/               JSON Schemas for wevir-plugin.json and index.json
keys/                  Public keys that sign the index
scripts/               Validation, index generation and signing
```

Everything Wevir installs is stored in this repository; entries never point to other repositories.

## How Wevir reads it

1. `index.json` and `index.json.sig` on the `dist` branch. CI rebuilds them on every push to `main` and signs `index.json` with an ed25519 key whose public half is in `keys/` and built into Wevir.
2. Entry files by the `main` commit recorded in the index, checked against the sha256 of every file listed there.

A mirror only carries bytes; the signature and hashes are checked inside Wevir, so a stale or altered mirror cannot change what gets installed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

The scripts and catalog are MIT licensed. Each entry carries its own license, given in its manifest or SKILL.md.
