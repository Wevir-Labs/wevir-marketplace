# Contributing / 投稿

[English](#english) · [简体中文](#简体中文)

## English

Pull requests are welcome on GitHub, CNB and Gitee. Maintainers review and merge on GitHub; the mirrors follow.

### Submit a plugin

Add `plugins/<id>/` with:

- `wevir-plugin.json`: the manifest (`"$schema": "../../schemas/wevir-plugin.schema.json"` gives editor completion). `id` must equal the directory name.
- `README.md`: what it does, what it connects to, and how to get any keys it asks for.
- Optional: `skills/<name>/SKILL.md`, an icon (`.png` or `.svg`, at most 128 KiB), server files.

Optional manifest fields for the marketplace: `category` (an id from `catalog/categories.json`; a suggestion, maintainers may file the entry elsewhere), `keywords`, `examples` (up to 3 example prompts, 200 characters each), `i18n` (localized `name`, `description` and `examples`), `privacyPolicy` and `termsOfService` (http(s) links), `requires.runtimes` (such as `node>=20`).

Categories: `productivity`, `communication`, `creative`, `developer-tools`, `data`, `writing`, `research`, `education`, `business`, `finance`, `health`, `travel`, `entertainment`, `security`, `other`.

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

### Your own repository

If the plugin lives in a repository of yours, you can keep sending pull requests, or ask the maintainers to register it as an upstream: a daily job then opens a sync pull request whenever your repository changes, and maintainers review it like any other. Wevir plugins, Claude and Codex plugins and single skills can be synced, as can an npm or PyPI package behind a connector. The license must allow redistribution, and its LICENSE / NOTICE files are kept with the entry.

### Category, featuring and verification

Entries are listed without a badge. Maintainers decide the final category, featured placement and verification (`official` for entries Wevir maintains, `verified` once the publisher's identity is confirmed); these live in `catalog/` and cannot be changed by entry authors.

## 简体中文

GitHub、CNB 与 Gitee 都接受 PR。维护者在 GitHub 上审核与合并，镜像随后同步。

### 投稿插件

新建 `plugins/<id>/`，包含：

- `wevir-plugin.json`：清单（写上 `"$schema": "../../schemas/wevir-plugin.schema.json"` 可在编辑器里补全）。`id` 必须与目录名相同。
- `README.md`：做什么、连接什么、需要的密钥怎么获取。
- 可选：`skills/<name>/SKILL.md`、图标（`.png` 或 `.svg`，最大 128 KiB）、服务端文件。

市场用的可选清单字段：`category`（`catalog/categories.json` 里的 ID；只是建议，维护者可以归到别的类）、`keywords`、`examples`（最多 3 条示例 prompt，每条最长 200 字）、`i18n`（多语言的 `name`、`description` 与 `examples`）、`privacyPolicy` 与 `termsOfService`（http(s) 链接）、`requires.runtimes`（如 `node>=20`）。

分类：`productivity`（效率）、`communication`（沟通）、`creative`（创意与设计）、`developer-tools`（开发者工具）、`data`（数据与分析）、`writing`（写作）、`research`（搜索与研究）、`education`（教育）、`business`（业务与运营）、`finance`（金融）、`health`（健康）、`travel`（旅行）、`entertainment`（娱乐）、`security`（安全）、`other`（其他）。

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

### 自己有仓库的作者

插件放在自己仓库里的，可以照旧提 PR，也可以请维护者把它登记为上游：之后你的仓库有变化，每日任务会自动开同步 PR，由维护者像其他 PR 一样审核。可同步的有 Wevir 插件、Claude 与 Codex 插件、单个 skill，以及连接器背后的 npm / PyPI 包。许可必须允许再分发，LICENSE / NOTICE 文件随条目保留。

### 分类、推荐与认证

新条目不带徽章。最终分类、推荐位与认证（`official` 表示 Wevir 维护，`verified` 表示核实了发布者身份）由维护者决定，写在 `catalog/` 里，作者改不了。
