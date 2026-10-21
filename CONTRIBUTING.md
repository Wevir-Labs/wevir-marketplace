# Contributing / 投稿

[English](#english) · [简体中文](#简体中文)

## English

Pull requests are welcome on GitHub, CNB and Gitee. Maintainers review and merge on GitHub; the mirrors follow.

### Submit a plugin

Add `plugins/<id>/` with:

- `wevir-plugin.json`: the manifest (`"$schema": "../../schemas/wevir-plugin.schema.json"` gives editor completion). `id` must equal the directory name.
- `README.md`: what it does, what it connects to, and how to get any keys it asks for.
- Optional: `skills/<name>/SKILL.md`, an icon (`.png` or `.svg`, at most 128 KiB), server files.

Optional manifest fields for the marketplace: `category` (an id from `catalog/categories.json`), `keywords`, `i18n` (localized `name` and `description`), `requires.runtimes` (such as `node>=20`).

### Submit a single skill

Add `skills/<name>/SKILL.md` with `name` (equal to the directory name) and `description` in the frontmatter. Set `metadata.version` to version it; otherwise changes ship as updates of `1.0.0`.

### Rules

- Every file lives in your directory. No references to other repositories, no downloads at install time.
- MCP servers run through a package runner must pin an exact version: `npx -y pkg@1.2.3`, `uvx pkg==1.2.3`. No `@latest`, no ranges.
- Raise `version` in `wevir-plugin.json` with every change.
- No secrets. Ask for keys with `inputs`.
- Limits per entry: 200 files, 1 MiB per file, 8 MiB in total.
- One pull request may change only your own entries; `catalog/`, `schemas/`, `scripts/` and workflows are for maintainers.

Run the checks locally:

```bash
npm ci
npm test
node scripts/validate.mjs --base origin/main
```

New entries are listed as community entries. Maintainers decide on featured placement and the official badge.

## 简体中文

GitHub、CNB 与 Gitee 都接受 PR。维护者在 GitHub 上审核与合并，镜像随后同步。

### 投稿插件

新建 `plugins/<id>/`，包含：

- `wevir-plugin.json`：清单（写上 `"$schema": "../../schemas/wevir-plugin.schema.json"` 可在编辑器里补全）。`id` 必须与目录名相同。
- `README.md`：做什么、连接什么、需要的密钥怎么获取。
- 可选：`skills/<name>/SKILL.md`、图标（`.png` 或 `.svg`，最大 128 KiB）、服务端文件。

市场用的可选清单字段：`category`（`catalog/categories.json` 里的 ID）、`keywords`、`i18n`（多语言的 `name` 与 `description`）、`requires.runtimes`（如 `node>=20`）。

### 投稿单个 skill

新建 `skills/<name>/SKILL.md`，frontmatter 里写 `name`（与目录名相同）和 `description`。要标版本就写 `metadata.version`，不写时改动按 `1.0.0` 的更新发布。

### 规则

- 全部文件放在自己的目录里。不引用其他仓库，安装时不下载额外内容。
- 用包运行器启动的 MCP 服务必须锁定确切版本：`npx -y pkg@1.2.3`、`uvx pkg==1.2.3`。不允许 `@latest` 和版本范围。
- 每次修改都要提高 `wevir-plugin.json` 的 `version`。
- 不放密钥。需要密钥时用 `inputs` 让用户填写。
- 每个条目最多 200 个文件、单个文件 1 MiB、合计 8 MiB。
- 一个 PR 只改自己的条目；`catalog/`、`schemas/`、`scripts/` 与工作流由维护者修改。

本地检查：

```bash
npm ci
npm test
node scripts/validate.mjs --base origin/main
```

新条目默认标为社区条目。推荐位与“官方”标识由维护者决定。
