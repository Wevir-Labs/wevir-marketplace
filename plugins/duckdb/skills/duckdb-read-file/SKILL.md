---
name: duckdb-read-file
description: "Explore local CSV, TSV, JSON, JSONL, NDJSON and Parquet datasets with DuckDB: inspect columns, count rows and show small samples without changing the source. Use for data-file previews, profiling, 数据探索, 查看字段 or 数据行数. For existing DuckDB databases use duckdb-attach-db; for SQL questions use duckdb-query."
compatibility: "DuckDB CLI 2.0 or later, installed by the user and available to the shell."
---

<!-- Adapted from duckdb/duckdb-skills, skills/read-file/SKILL.md at 7feda8e01e22bc0886c86123f3884947e36d8c69 (MIT; see ../../LICENSE). -->

# Explore a local data file

Read [local CLI execution](../../references/local-cli.md) before running commands. Resolve the user's path and question from the conversation, without assuming Claude slash-command arguments or tools.

1. Check the file and CLI. Use the shared batch invocation and allow-list the exact input path. Do not convert the file or import it into a persistent database just to inspect it.
2. Choose a reader using the table below. Prefer a specific reader over a macro that binds unrelated readers or extensions.
3. Run `DESCRIBE SELECT * FROM <reader>;` and `SELECT * FROM <reader> LIMIT 20;`. Count rows with `SELECT count(*) AS row_count FROM <reader>;` when requested or the file is reasonably small. On a large dataset, report a bounded preview first and make the cost of a full scan clear. Run `SUMMARIZE SELECT * FROM <reader>;` only when a statistical profile is needed.
4. Answer the user's question with the schema, sample and measured count if available. Identify inferred types and missing values that affect interpretation. For further analysis, use `duckdb-query` with the same path and reader options.

| Local format | Reader |
|---|---|
| CSV | `read_csv('/absolute/data/sales.csv')` |
| TSV / TAB | `read_csv('/absolute/data/sales.tsv', delim = '\t')` |
| JSON, JSONL, NDJSON | `read_json_auto('/absolute/data/sales.json')` |
| Parquet / PQ | `read_parquet('/absolute/data/sales.parquet')` |

For JSONL use `format = 'newline_delimited'` if inference fails. For nested JSON inspect the inferred STRUCT/LIST types before flattening. For CSV identifiers such as ZIP codes, use explicit types when inference would drop leading zeros.

Avro, Excel, SQLite, spatial files, notebooks and remote URLs are outside this skill. Explain the supported local formats instead of installing an extension or querying a remote reader.
