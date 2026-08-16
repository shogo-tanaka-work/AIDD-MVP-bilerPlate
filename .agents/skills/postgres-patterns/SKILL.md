---
name: postgres-patterns
description: query最適化、schema設計、index、セキュリティのためのPostgreSQLパターン。Supabaseのベストプラクティスに基づく。PostgreSQLのschema、index、RLS policyを設計するとき、またはqueryが遅いときに使う。
metadata:
  origin: ECC
---

# PostgreSQL Patterns

PostgreSQLのベストプラクティスのクイックリファレンス。詳細な指針が必要なときは`database-reviewer` agentを使う。

## 適用する場面

- SQL queryやmigrationを書くとき
- databaseのschemaを設計するとき
- 遅いqueryを調査するとき
- Row Level Securityを実装するとき
- connection poolingを設定するとき

## クイックリファレンス

### Index早見表

| Queryパターン | Indexの種類 | 例 |
|--------------|------------|---------|
| `WHERE col = value` | B-tree（既定） | `CREATE INDEX idx ON t (col)` |
| `WHERE col > value` | B-tree | `CREATE INDEX idx ON t (col)` |
| `WHERE a = x AND b > y` | 複合 | `CREATE INDEX idx ON t (a, b)` |
| `WHERE jsonb @> '{}'` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| `WHERE tsv @@ query` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| 時系列の範囲 | BRIN | `CREATE INDEX idx ON t USING brin (col)` |

### データ型早見表

| 用途 | 適切な型 | 避ける型 |
|----------|-------------|-------|
| ID | `bigint` | `int`、ランダムなUUID |
| 文字列 | `text` | `varchar(255)` |
| タイムスタンプ | `timestamptz` | `timestamp` |
| 金額 | `numeric(10,2)` | `float` |
| フラグ | `boolean` | `varchar`、`int` |

### 共通パターン

**複合Indexの列順:**
```sql
-- 等価比較の列を先に、範囲比較の列を後に
CREATE INDEX idx ON orders (status, created_at);
-- 対象: WHERE status = 'pending' AND created_at > '2024-01-01'
```

**Covering Index:**
```sql
CREATE INDEX idx ON users (email) INCLUDE (name, created_at);
-- SELECT email, name, created_at でテーブル参照を避けられる
```

**部分Index:**
```sql
CREATE INDEX idx ON users (email) WHERE deleted_at IS NULL;
-- indexが小さくなり、有効なユーザーだけを含む
```

**RLS Policy（最適化版）:**
```sql
CREATE POLICY policy ON orders
  USING ((SELECT auth.uid()) = user_id);  -- SELECTで包むこと
```

**UPSERT:**
```sql
INSERT INTO settings (user_id, key, value)
VALUES (123, 'theme', 'dark')
ON CONFLICT (user_id, key)
DO UPDATE SET value = EXCLUDED.value;
```

**カーソルpagination:**
```sql
SELECT * FROM products WHERE id > $last_id ORDER BY id LIMIT 20;
-- O(1)。OFFSETはO(n)
```

**Queue処理:**
```sql
UPDATE jobs SET status = 'processing'
WHERE id = (
  SELECT id FROM jobs WHERE status = 'pending'
  ORDER BY created_at LIMIT 1
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

### アンチパターンの検出

```sql
-- indexのないforeign keyを探す
SELECT conrelid::regclass, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
  );

-- 遅いqueryを探す
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- テーブルのbloatを確認する
SELECT relname, n_dead_tup, last_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

### 設定テンプレート

```sql
-- 接続数の上限（RAMに応じて調整する）
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET work_mem = '8MB';

-- タイムアウト
ALTER SYSTEM SET idle_in_transaction_session_timeout = '30s';
ALTER SYSTEM SET statement_timeout = '30s';

-- モニタリング
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- セキュリティの既定値
REVOKE ALL ON SCHEMA public FROM public;

SELECT pg_reload_conf();
```

## 関連

- Agent: `database-reviewer` - databaseレビューの全体workflow
- Skill: `clickhouse-io` - ClickHouseの分析パターン
- Skill: `backend-patterns` - APIとbackendのパターン

---

*Supabase Agent Skillsに基づく（credit: Supabase team）（MIT License）*
