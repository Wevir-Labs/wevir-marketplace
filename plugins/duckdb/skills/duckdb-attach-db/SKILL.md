---
name: duckdb-attach-db
description: "Attach existing local DuckDB database files read-only, list tables and views, inspect schemas and prepare queries across databases. Use when asked to open a .duckdb database, attach-db, 查看数据库 or 挂载数据库. Does not create databases, store session state or manage credentials."
compatibility: "DuckDB CLI 2.0 or later, installed by the user and available to the shell."
---

<!-- Adapted from duckdb/duckdb-skills, skills/attach-db/SKILL.md at 7feda8e01e22bc0886c86123f3884947e36d8c69 (MIT; see ../../LICENSE). -->

# Attach a local DuckDB database

Read [local CLI execution](../../references/local-cli.md) before running commands.

1. Resolve the existing database path. If it does not exist, stop with the missing path; do not let DuckDB create it. Use an explicit simple alias such as `source`, or `source_a` and `source_b` for multiple inputs.
2. Start in `:memory:` with the shared init and allow-list each selected database plus its exact `.wal` and `.wal.checkpoint` companion paths. For this example use `/absolute/data/analytics.duckdb`, `/absolute/data/analytics.duckdb.wal` and `/absolute/data/analytics.duckdb.wal.checkpoint`. Attach each database read-only in the task SQL file:

   ```sql
   ATTACH '/absolute/data/analytics.duckdb' AS source (READ_ONLY);
   SELECT database_name, schema_name, table_name, column_count, estimated_size
   FROM duckdb_tables()
   WHERE database_name = 'source'
   ORDER BY schema_name, table_name;
   SELECT database_name, schema_name, view_name
   FROM duckdb_views()
   WHERE database_name = 'source' AND NOT internal
   ORDER BY schema_name, view_name;
   ```

3. Inspect relevant tables with fully qualified names, such as `DESCRIBE source.main.sales;`. `estimated_size` is an estimated row count, not bytes. Run exact `count(*)` only for requested tables or a reasonably small database. Keep samples bounded and do not execute stored macros or view definitions just to list metadata.
4. Report absolute paths, aliases, schema/table names and any exact or estimated counts. An empty database is a valid result. On locks, corruption, a non-DuckDB file or a storage-version mismatch, report the error; do not retry in write mode or migrate it.
5. For follow-up `duckdb-query` work, repeat the same allow-list and read-only attachments in the new CLI process. Attachments end when the process exits. Do not promise a persistent connection or write `.duckdb-skills/state.sql`, home-directory state or credentials.

For a local file-backed view, a separately authorized source file also needs its own exact allow-list entry. Do not automatically grant every path named by a database view. SQLite and remote database attachments are outside this plugin.
