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
catalog/               分类、推荐位与信任级别（仅维护者修改）
schemas/               wevir-plugin.json 与 index.json 的 JSON Schema
keys/                  索引签名用的公钥
scripts/               校验、生成索引与签名
```

Wevir 安装的内容全部存放在本仓库里，条目不指向其他仓库。

## Wevir 怎样读取

1. `dist` 分支上的 `index.json` 与 `index.json.sig`。每次推送到 `main`，CI 重新生成并用 ed25519 私钥签名；公钥放在 `keys/`，也编译进 Wevir。
2. 条目文件按索引里记录的 `main` 提交读取，逐个文件核对索引中的 sha256。

镜像只负责传输。签名与散列在 Wevir 内校验，过期或被篡改的镜像改变不了安装的内容。

## 投稿

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

脚本与目录数据使用 MIT 许可。每个条目使用自己的许可，写在清单或 SKILL.md 里。
