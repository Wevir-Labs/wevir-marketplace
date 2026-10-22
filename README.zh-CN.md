# Wevir 插件市场

[![条目](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FWevir-Labs%2Fwevir-marketplace%2Fdist%2Findex.json&query=%24.entries.length&label=%E6%9D%A1%E7%9B%AE&color=0969da&cacheSeconds=3600)](https://github.com/Wevir-Labs/wevir-marketplace/blob/dist/index.json)
[![索引](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FWevir-Labs%2Fwevir-marketplace%2Fdist%2Findex.json&query=%24.sequence&label=%E7%B4%A2%E5%BC%95&prefix=%23&color=6e7781&cacheSeconds=3600)](https://github.com/Wevir-Labs/wevir-marketplace/tree/dist)
[![签名](https://img.shields.io/badge/%E7%AD%BE%E5%90%8D-ed25519-2da44e)](keys/)
[![Validate](https://img.shields.io/github/actions/workflow/status/Wevir-Labs/wevir-marketplace/validate.yml?branch=main&event=push&label=validate)](https://github.com/Wevir-Labs/wevir-marketplace/actions/workflows/validate.yml)
[![Publish](https://img.shields.io/github/actions/workflow/status/Wevir-Labs/wevir-marketplace/publish.yml?branch=main&label=publish)](https://github.com/Wevir-Labs/wevir-marketplace/actions/workflows/publish.yml)
[![License](https://img.shields.io/github/license/Wevir-Labs/wevir-marketplace?color=6e7781)](LICENSE)

[English](README.md) · 简体中文

[Wevir](https://github.com/marvinli001/wevir) 官方插件与 skill 目录。以静态文件形式由本仓库及镜像分发，索引签名、逐文件散列校验，无后端服务。

| 镜像 | 仓库 | 角色 |
|---|---|---|
| GitHub | [Wevir-Labs/wevir-marketplace](https://github.com/Wevir-Labs/wevir-marketplace) | 主仓库，审核与合并 |
| CNB | [wevir-labs/wevir-marketplace](https://cnb.cool/wevir-labs/wevir-marketplace) | 镜像 |
| Gitee | [wevir-labs/wevir-marketplace](https://gitee.com/wevir-labs/wevir-marketplace) | 镜像 |

每次发布后同步 `main` 与 `dist` 至各镜像。Wevir 首次使用时测速选定镜像，可在设置中指定。

## 目录结构

```
plugins/<id>/            插件包：wevir-plugin.json、skills/、README.md、图标
skills/<name>/           单个 skill：SKILL.md 及附属文件
catalog/                 维护者专用
  categories.json          分类及显示顺序
  featured.json            推荐位：显式列表或 {"auto": "recent"}
  entries/<id>.json        条目的分类、认证与上游
  patches/<id>/*.patch     本地改动，每次上游同步时重新应用
schemas/                 JSON Schema：wevir-plugin.json、index.json、catalog 条目
keys/                    索引签名公钥
scripts/                 校验、索引构建、签名、上游同步
authoring/               供 coding agent 制作与投稿条目的 skill
```

可安装内容全部存放于本仓库；条目不引用其他仓库，安装时不下载外部文件。

## 目录元数据

| 字段 | 来源 | 规则 |
|---|---|---|
| 分类 | `catalog/entries/<id>.json` → 清单 `category` → `other` | 按序取首个有效值；清单中的值仅作建议 |
| 认证 | `catalog/entries/<id>.json` 的 `verification.level` | `official`：Wevir 维护。`verified`：已审核、发布者身份已核实，须填 `publisher`。认证随条目而非版本，删除即撤销 |
| 上架时间 | 条目目录首次出现在 `main` 的提交时间 | 发布时计算；`featured.json` 中 `{"auto": "recent", "limit": 6}` 列出最新条目 |

## 分发与完整性

1. **索引：** 孤立分支 `dist` 上的 `index.json` 与 `index.json.sig`，`main` 每次推送后重建并以 ed25519 签名。公钥位于 `keys/`，同时内置于 Wevir。
2. **文件：** 按索引记录的 `main` 提交获取，逐个核对索引中的 sha256。

签名与散列校验在 Wevir 内完成，过期或被篡改的镜像无法改变安装内容。

## 上游同步

| 项目 | 规格 |
|---|---|
| 来源 | `catalog/entries/<id>.json` 的 `upstream`。Git：`repo`、可选 `path`、`track`（`release`、`branch:<名>`、`tag:<glob>`）、`format`（`wevir`、`claude`、`codex`、`skill`）。软件包：npm 或 PyPI `package`，同步时改写连接器命令中锁定的版本 |
| 本地改动 | `keep`：本方新增的文件。`overlay`：合并进生成的 `wevir-plugin.json`。`catalog/patches/<id>/`：补丁 |
| 调度 | `upstream-sync` 工作流，每日运行，或手动指定条目 |
| 产出 | 转换条目、应用补丁、补丁版本号加一、运行校验；在 `sync/<id>` 开启或更新 PR，不自动合并 |
| 风险标签 | `risk:connector`、`risk:inputs`、`risk:license`、`risk:exec`、`risk:size` |
| 失败处理 | 开启 issue `upstream: <id>`，下次同步成功后自动关闭 |
| 许可 | 保留上游 `LICENSE` / `NOTICE` 文件 |
| 凭据 | 配置 secrets `UPSTREAM_SYNC_APP_ID` 与 `UPSTREAM_SYNC_APP_KEY` 时使用 GitHub App 令牌，`validate` 在同步 PR 上运行；否则使用工作流令牌，校验结果写入 PR 正文。仓库变量 `UPSTREAM_SYNC_BOT`（如 `wevir-upstream-sync[bot]`）授权其修改所同步条目的 `catalog/entries/<id>.json` |

本地检查：`node scripts/upstream-sync.mjs --check`。

## 使用 agent 制作

[`authoring/`](authoring/SKILL.md) 是面向 coding agent（Claude Code、Codex、Wevir 等）的 skill，涵盖清单格式、MCP 服务与输入项、skill 编写、校验与投稿。提示词模板，替换首行：

```text
帮我做一个 Wevir 插件市场的插件：<它要做什么>。

1. Fork https://github.com/Wevir-Labs/wevir-marketplace 并克隆我的 fork（已经克隆过就用现有的）。
2. 阅读仓库里的 authoring/SKILL.md 并照着做，需要的参考文档它会链接到。
3. 条目放在 plugins/<id>/（单个 skill 放 skills/<name>/），目录以外的文件一律不动。
4. 跑它列出的检查直到全部通过，然后告诉我怎样在 Wevir 里安装这个文件夹、要试哪些说法。
5. 等我确认能用，把分支推到我的 fork，向 Wevir-Labs/wevir-marketplace 开 PR 并填好模板。不要合并任何东西。
```

长期安装：Wevir → 插件 → 添加 → 从文件安装 → 选择文件夹 → `authoring/`，或复制到 agent 的 skills 目录。

## 投稿流程

| 阶段 | 操作 |
|---|---|
| 创建 | 在 fork 的分支上编写 `plugins/<id>/` 或 `skills/<name>/` |
| 检查 | `npm ci && npm test && node scripts/validate.mjs --base upstream/main` |
| 试用 | 在 Wevir 中安装该文件夹，逐一运行示例提示 |
| 提交 | 在 GitHub 向 `main` 开 PR 并填写模板，CI 运行相同检查 |
| 审核 | 文件、命令、网络访问与许可。分类、推荐位与认证由维护者设定 |
| 发布 | 合并后签发新索引；Wevir 刷新后可见（每小时，或手动刷新） |
| 更新 | 提高 `version` 后再开 PR |

规则与字段参考：[CONTRIBUTING.md](CONTRIBUTING.md)、[authoring/references/submit.md](authoring/references/submit.md)。

## 许可

脚本与目录数据：[MIT](LICENSE)。各条目在清单或 `SKILL.md` 中声明自身许可；源自上游的条目保留上游许可文件。
