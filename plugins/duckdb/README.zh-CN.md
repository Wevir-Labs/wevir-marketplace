# DuckDB 本地分析

通过自行安装的 [DuckDB CLI](https://duckdb.org/install/) 探索本地文件、检查数据库并执行 SQL。

| Skill | 能力 |
|---|---|
| `duckdb-read-file` | 查看 CSV、TSV、JSON/JSONL/NDJSON 和 Parquet 的字段、行数与少量样本 |
| `duckdb-attach-db` | 只读挂载本地 DuckDB 数据库，检查表与视图结构 |
| `duckdb-query` | 用 SQL 或自然语言分析、关联数据，按明确要求导出本地文件 |

## 环境与示例

需自行安装 **DuckDB CLI 2.0.0 或更高版本**，并让会话的 shell 能找到 `duckdb`。插件不附带 CLI，不执行安装、下载、包运行器或更新；不需要 Node、Python、账号、API Key、OAuth 应用或 Wevir 托管服务。

使用时通过 Wevir 插件导入功能选择 `plugins/duckdb` 目录，再发送请求：

- “探索 ./data/sales.csv，列出字段、行数和少量样本，保留原文件。”
- “只读挂载 ./analytics.duckdb，列出表并查看 sales 表结构。”
- “根据 ./data/sales.parquet，找出总收入最高的五个地区，并展示 SQL。”

示例文件需已存在；第三条示例使用 `region` 与数值型 `revenue` 字段。Agent 会先检查实际结构。后续请求可沿用对话中的路径与别名，但每次 CLI 调用都会重新挂载，没有常驻连接。

## 数据与网络

SQL 在本机 DuckDB 进程执行。插件不接入远程存储、联网文档搜索、云端回退或遥测服务；URL、云存储协议、网络共享与远程数据库不在范围内。已挂载的文件系统仍可能使用网络存储。

随包 `defaults.sql` 替代用户的 `.duckdbrc`，关闭扩展自动安装、自动加载与持久化凭据，仅加载 CLI 内置的 JSON、Parquet 扩展。任务 SQL 只允许明确列出的本地文件路径，再关闭其他外部访问并锁定配置。数据库使用 `READ_ONLY` 挂载。这些执行约定与 DuckDB 设置不能替代恶意 SQL 的安全沙箱。需要额外扩展的 Excel、SQLite、Avro、空间数据等格式不受支持。

Agent 在任务目录创建临时 SQL 文件，用后删除；仅保留明确要求的导出文件。不读写共享 `state.sql`、用户主目录状态、凭据或 Claude 会话记忆。原始文件和现有数据库保持不变，导出需明确目标且不静默覆盖。

**模型仍由 Wevir 当前会话选择。** 展示给 Agent 的字段、样本、SQL 与结果会进入对话，可能发送给所选模型的服务商，并由 Wevir 按正常会话机制保存。本地执行 SQL 不等于模型处理与数据全程离线。

## 平台与验证

共用命令使用 UTF-8 SQL 文件，避免依赖特定 shell 的 heredoc；面向 macOS/Linux shell 和安装相应 CLI 的 Windows PowerShell。发版检查在 macOS arm64、DuckDB 2.0.0 上使用临时 CSV、TSV、JSONL、Parquet 与 DuckDB 数据验证文件读取、只读挂载和本地导出。Linux、Windows、其他 CLI 版本，以及 Wevir 中的安装与技能自动选择尚未验证。

## 来源与许可

基于官方 [duckdb/duckdb-skills](https://github.com/duckdb/duckdb-skills) 固定提交 [`7feda8e01e22bc0886c86123f3884947e36d8c69`](https://github.com/duckdb/duckdb-skills/tree/7feda8e01e22bc0886c86123f3884947e36d8c69) 的 `skills/read-file/SKILL.md`、`skills/attach-db/SKILL.md`、`skills/query/SKILL.md`。MIT [LICENSE](LICENSE) 原样保留，版权为 2018–2025 Stichting DuckDB Foundation。

适配时增加 `duckdb-` 名称前缀，移除 Claude 专用参数与工具声明，仅保留本地内置读取器，以每次重新挂载替代自动保存状态，并增加只读访问、结果限量、路径转义和本地执行约定。未引入云存储、凭据、联网文档、安装助手和 Claude 会话记忆。市场清单、本地化、共用执行文件与原创 SVG 图标为此次适配新增，按 MIT 分发。完整来源映射见 [README](README.md#source-and-license)。
