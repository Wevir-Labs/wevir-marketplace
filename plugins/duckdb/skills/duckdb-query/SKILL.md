---
name: duckdb-query
description: "Answer SQL or natural-language questions over local DuckDB databases and CSV, TSV, JSON or Parquet files. Use for filtering, joins, aggregations, rankings, SQL查询 or 数据分析, including follow-ups after duckdb-read-file or duckdb-attach-db. Shows the executed SQL and bounded results; can export results to an explicitly requested local file."
compatibility: "DuckDB CLI 2.0 or later, installed by the user and available to the shell."
---

<!-- Adapted from duckdb/duckdb-skills, skills/query/SKILL.md at 7feda8e01e22bc0886c86123f3884947e36d8c69 (MIT; see ../../LICENSE). -->

# Query local data

Read [local CLI execution](../../references/local-cli.md) before running commands.

1. Identify the files or database paths from the request and conversation. Without an input, constant SQL such as `SELECT 42;` can use memory only; a question about an unknown table needs its database path. Never load an existing shared `state.sql`.
2. Inspect the relevant schema using `duckdb-read-file` or `duckdb-attach-db`. Use actual column names and types. Resolve ambiguous measures, date ranges or join keys from the task context; ask only when the answer would materially change the calculation.
3. Translate natural language into SQL, or inspect supplied SQL before execution. Use `read_csv`, `read_json_auto` and `read_parquet` directly for local files. For databases, repeat `ATTACH ... AS source (READ_ONLY);` and qualify tables with catalog and schema. Use read queries and transient views only. Database mutations, remote reads, `INSTALL`, additional `LOAD`, `CREATE SECRET` and shell dot commands are outside this workflow.
4. Execute with the shared batch command, exact file allow-list and locked settings. Bound the output to 100 rows unless a complete local export was requested. Use aggregates when only totals are needed. Check join cardinality, NULL handling and numeric/date conversions before interpreting the result.
5. Report the executed SQL, concise results, units and material assumptions. Mark samples or truncated output. Do not claim that a successful query proves the dataset is complete or correct.

Prefer these DuckDB idioms where they simplify the query:

```sql
SELECT region, sum(revenue) AS total_revenue
FROM read_parquet('/absolute/data/sales.parquet')
GROUP BY ALL
ORDER BY total_revenue DESC, region
LIMIT 5;
```

`count(*) FILTER (WHERE condition)` handles conditional counts. `SELECT * EXCLUDE (column)` trims wide previews. Use explicit column names and aggregation keys when `GROUP BY ALL` would obscure the intended grain.

For an explicitly requested export, add the chosen output file to `allowed_paths` before disabling external access, then use `COPY (SELECT ...) TO '/absolute/output/result.csv' (FORMAT CSV, HEADER);` or `(FORMAT PARQUET)`. Check whether the destination exists and choose a new path unless replacement was requested. Do not export elsewhere or broaden the allow-list. Verify the saved output with a bounded read, and report its path and row count when measured. Remove temporary SQL, keeping the requested export.
