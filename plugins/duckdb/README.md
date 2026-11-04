# DuckDB Local

Explore local data and answer SQL questions with a separately installed [DuckDB CLI](https://duckdb.org/install/). [中文说明](README.zh-CN.md).

| Skill | Result |
|---|---|
| `duckdb-read-file` | Columns, row counts and bounded samples from CSV, TSV, JSON/JSONL/NDJSON and Parquet |
| `duckdb-attach-db` | Read-only local DuckDB attachments and schema inspection |
| `duckdb-query` | SQL or natural-language analysis, joins and explicit local exports |

## Requirements and use

Install DuckDB CLI **2.0.0 or later** yourself and make `duckdb` available to the agent's shell. This plugin includes no CLI binary and performs no installation, download, package-runner execution or update. No Node, Python, account, API key, OAuth app or Wevir-hosted service is required by the plugin.

Install the `plugins/duckdb` folder through Wevir's plugin import when ready to use it. Then try:

- “Explore ./data/sales.csv: show the columns, row count and a small sample without changing the file.”
- “Attach ./analytics.duckdb read-only, list its tables and inspect the sales table schema.”
- “Using ./data/sales.parquet, find the five regions with the highest total revenue and show the SQL.”

The files must exist; the last example expects `region` and numeric `revenue` columns. The skills inspect the schema and adapt to the actual data. A follow-up can reuse paths and aliases from the conversation, but every CLI invocation reattaches databases; there is no persistent connection.

## Data and network behavior

SQL runs in the local DuckDB process. No remote storage, hosted documentation search, cloud fallback or telemetry endpoint is part of the plugin. URLs, cloud schemes, network shares and remote database connections are outside its scope. Mounted filesystems can still be network-backed.

The bundled `defaults.sql` replaces the user's `.duckdbrc`, disables extension auto-install/auto-load and persistent secrets, and loads the CLI's built-in JSON and Parquet extensions. Task SQL lists exact allowed local paths, disables other external access and locks the configuration. Attachments use `READ_ONLY`. These are execution instructions and DuckDB settings, not a security sandbox for hostile SQL. Additional extension formats, including Excel, SQLite, Avro and spatial data, are not supported.

The agent creates temporary task SQL under the user's task folder and removes it after use. Only explicitly requested exports are kept. No shared `state.sql`, home-directory state, credentials or Claude conversation memory is read or written. Input files and existing databases are preserved; exports need an explicit destination and do not silently overwrite files.

**The model remains the model selected in Wevir.** Schemas, samples, queries and results shown to the agent enter its conversation and may be sent to that model's provider and retained by Wevir's normal session storage. Local SQL execution does not make model processing fully offline.

## Platforms and verification

The shared batch command uses UTF-8 SQL files instead of shell-specific heredocs. It is intended for macOS/Linux shells and Windows PowerShell with a suitable DuckDB CLI. Release checks exercised DuckDB 2.0.0 on macOS arm64 with temporary CSV, TSV, JSONL, Parquet and DuckDB fixtures, read-only attachments and a local export. Linux, Windows, other CLI versions and end-to-end installation/skill selection in Wevir have not been verified.

## Source and license

Adapted from the official [duckdb/duckdb-skills](https://github.com/duckdb/duckdb-skills) repository at fixed commit [`7feda8e01e22bc0886c86123f3884947e36d8c69`](https://github.com/duckdb/duckdb-skills/tree/7feda8e01e22bc0886c86123f3884947e36d8c69):

- `skills/read-file/SKILL.md` → `skills/duckdb-read-file/SKILL.md`
- `skills/attach-db/SKILL.md` → `skills/duckdb-attach-db/SKILL.md`
- `skills/query/SKILL.md` → `skills/duckdb-query/SKILL.md`
- `LICENSE` → [`LICENSE`](LICENSE), preserved verbatim (MIT, Copyright 2018–2025 Stichting DuckDB Foundation).

Adaptations rename skills to avoid generic-name collisions, remove Claude-specific arguments/tool declarations, keep only local built-in readers, replace automatic state persistence with explicit per-command attachments, and add read-only access, bounded results, path quoting and local-only execution guidance. Cloud storage, credentials, documentation search, installation helpers and Claude session-memory skills are omitted. The manifest, translations, shared execution files and original SVG listing icon were added for this marketplace adaptation, which is distributed under MIT. This is an adaptation, not an unchanged upstream release.
