# Wevir 插件市场

[English](README.md)

[Wevir](https://github.com/marvinli001/wevir) 的官方插件市场。Wevir 直接从本仓库及其镜像读取，不经过单独的服务器。

| 镜像 | 仓库 |
|---|---|
| GitHub（主仓库） | [Wevir-Labs/wevir-marketplace](https://github.com/Wevir-Labs/wevir-marketplace) |
| CNB | [wevir-labs/wevir-marketplace](https://cnb.cool/wevir-labs/wevir-marketplace) |
| Gitee | [wevir-labs/wevir-marketplace](https://gitee.com/wevir-labs/wevir-marketplace) |

每次发布后 CNB 与 Gitee 从 GitHub 自动同步。Wevir 首次使用时测出最快的镜像并记住，也可以在设置里手动选择。

## 目录

```
plugins/<id>/          Wevir 插件包（wevir-plugin.json、skills/、README.md、图标）
skills/<name>/         单个 skill：SKILL.md 及其文件
catalog/               仅维护者修改：
  categories.json        分类与显示顺序
  featured.json          推荐位：手工列出，或用 "auto": "recent" 自动取最新上架的条目
  entries/<id>.json      条目的分类、认证与上游
  patches/<id>/*.patch   我们对上游文件的改动，每次同步时打上
schemas/               wevir-plugin.json、index.json 与 catalog 条目的 JSON Schema
keys/                  索引签名用的公钥
scripts/               校验、生成索引、签名与上游同步
```

Wevir 安装的内容全部存放在本仓库里，条目不指向其他仓库。

## 目录数据（catalog）

- **分类：** 以 `catalog/entries/<id>.json` 为准；没有时用清单里作者建议的 `category`；都没有就是 `other`。
- **认证：** `verification.level` 是 `official`（Wevir 维护）或 `verified`（审核过质量与安全并核实了发布者身份，必须写 `publisher`）。Wevir 在名称旁显示徽章。认证跟条目走、不跟版本走，删掉这一项即撤销。
- **上架时间：** 条目目录在 `main` 上首次出现的提交时间，发布时从 git 历史算出。`featured.json` 里写 `{"auto": "recent", "limit": 6}` 就列出最新上架的条目。

## 上游同步

从开源项目搬来的条目在 `catalog/entries/<id>.json` 里登记 `upstream`：git 仓库（`repo`、可选的子目录 `path`、`track` 为 `release`、`branch:<名>` 或 `tag:<glob>`，`format` 为 `wevir`、`claude`、`codex` 或 `skill`），或 npm / PyPI 包（`package`，同步时只改连接器命令里锁定的版本）。`keep` 列出我们自己加的文件，`overlay` 合进转换出的 `wevir-plugin.json`，`catalog/patches/<id>/` 放我们的改动。

`upstream-sync` 工作流每天跑一次，也可以手动指定条目。上游有变化时，它把新版本转换进条目目录、打补丁、版本补丁位加一、跑校验，然后在 `sync/<id>` 分支开或更新 PR，并按发现的风险打标签（`risk:connector`、`risk:inputs`、`risk:license`、`risk:exec`、`risk:size`）。出错时开 issue `upstream: <id>`，问题消失后自动关闭。同步 PR 从不自动合并。有上游的条目必须保留上游的 LICENSE / NOTICE 文件。本地可以用 `node scripts/upstream-sync.mjs --check` 查看哪些条目落后于上游。

配置了 secrets `UPSTREAM_SYNC_APP_ID` 与 `UPSTREAM_SYNC_APP_KEY` 时，工作流用这个 GitHub App 的令牌开 PR，validate 工作流会在 PR 上运行；没有配置时用工作流自带的令牌，并把校验结果写进 PR 正文。另把仓库变量 `UPSTREAM_SYNC_BOT` 设成这个 App 的登录名（如 `wevir-upstream-sync[bot]`），校验才允许它修改所同步条目的 `catalog/entries/<id>.json`。

## Wevir 怎样读取

1. `dist` 分支上的 `index.json` 与 `index.json.sig`。每次推送到 `main`，CI 重新生成并用 ed25519 私钥签名；公钥放在 `keys/`，也编译进 Wevir。
2. 条目文件按索引里记录的 `main` 提交读取，逐个文件核对索引中的 sha256。

镜像只负责传输。签名与散列在 Wevir 内校验，过期或被篡改的镜像改变不了安装的内容。

## 投稿

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

脚本与目录数据使用 MIT 许可。每个条目使用自己的许可，写在清单或 SKILL.md 里；从上游搬来的条目保留上游的许可文件。
