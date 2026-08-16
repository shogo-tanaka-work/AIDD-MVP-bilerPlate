---
name: clickhouse-io
description: 高performanceな分析workload向けのClickHouseのデータベースパターン、query最適化、分析、データエンジニアリングのベストプラクティス。ClickHouseのschemaやqueryを書くとき、または分析queryが遅いときに使う。
metadata:
  origin: ECC
---

# ClickHouse分析パターン

高performanceな分析とデータエンジニアリングのためのClickHouse固有のパターン。

## 発動タイミング

- ClickHouseのtable schemaを設計するとき（MergeTree engineの選択）
- 分析query（集計、window関数、join）を書くとき
- query performanceを最適化するとき（partition pruning、projection、materialized view）
- 大量データを投入するとき（batch insert、Kafka連携）
- 分析用途でPostgreSQL/MySQLからClickHouseへ移行するとき
- リアルタイムdashboardや時系列分析を実装するとき

## 概要

ClickHouseはonline analytical processing（OLAP）向けのcolumn指向データベース管理システム（DBMS）である。大規模データセットに対する高速な分析queryに最適化されている。

**主な特徴:**
- column指向storage
- データ圧縮
- 並列query実行
- 分散query
- リアルタイム分析

## table設計パターン

### MergeTree engine（最も一般的）

```sql
CREATE TABLE markets_analytics (
    date Date,
    market_id String,
    market_name String,
    volume UInt64,
    trades UInt32,
    unique_traders UInt32,
    avg_trade_size Float64,
    created_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, market_id)
SETTINGS index_granularity = 8192;
```

### ReplacingMergeTree（重複排除）

```sql
-- 重複が生じうるデータ向け（複数ソースからの取り込みなど）
CREATE TABLE user_events (
    event_id String,
    user_id String,
    event_type String,
    timestamp DateTime,
    properties String
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, event_id, timestamp)
PRIMARY KEY (user_id, event_id);
```

### AggregatingMergeTree（事前集計）

```sql
-- 集計済みmetricsを保持する用途
CREATE TABLE market_stats_hourly (
    hour DateTime,
    market_id String,
    total_volume AggregateFunction(sum, UInt64),
    total_trades AggregateFunction(count, UInt32),
    unique_users AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, market_id);

-- 集計データのquery
SELECT
    hour,
    market_id,
    sumMerge(total_volume) AS volume,
    countMerge(total_trades) AS trades,
    uniqMerge(unique_users) AS users
FROM market_stats_hourly
WHERE hour >= toStartOfHour(now() - INTERVAL 24 HOUR)
GROUP BY hour, market_id
ORDER BY hour DESC;
```

## query最適化パターン

### 効率的な絞り込み

```sql
-- PASS: GOOD: index対象のcolumnを先に使う
SELECT *
FROM markets_analytics
WHERE date >= '2025-01-01'
  AND market_id = 'market-123'
  AND volume > 1000
ORDER BY date DESC
LIMIT 100;

-- FAIL: BAD: index対象でないcolumnを先に絞り込む
SELECT *
FROM markets_analytics
WHERE volume > 1000
  AND market_name LIKE '%election%'
  AND date >= '2025-01-01';
```

### 集計

```sql
-- PASS: GOOD: ClickHouse固有の集計関数を使う
SELECT
    toStartOfDay(created_at) AS day,
    market_id,
    sum(volume) AS total_volume,
    count() AS total_trades,
    uniq(trader_id) AS unique_traders,
    avg(trade_size) AS avg_size
FROM trades
WHERE created_at >= today() - INTERVAL 7 DAY
GROUP BY day, market_id
ORDER BY day DESC, total_volume DESC;

-- PASS: percentileにはquantileを使う（percentileより効率的）
SELECT
    quantile(0.50)(trade_size) AS median,
    quantile(0.95)(trade_size) AS p95,
    quantile(0.99)(trade_size) AS p99
FROM trades
WHERE created_at >= now() - INTERVAL 1 HOUR;
```

### window関数

```sql
-- 累計を計算する
SELECT
    date,
    market_id,
    volume,
    sum(volume) OVER (
        PARTITION BY market_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_volume
FROM markets_analytics
WHERE date >= today() - INTERVAL 30 DAY
ORDER BY market_id, date;
```

## データ投入パターン

### bulk insert（推奨）

```typescript
import { createClient } from '@clickhouse/client'

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD
})

// PASS: batch insert（効率的）
async function bulkInsertTrades(trades: Trade[]) {
  await clickhouse.insert({
    table: 'trades',
    values: trades.map(trade => ({
      id: trade.id,
      market_id: trade.market_id,
      user_id: trade.user_id,
      amount: trade.amount,
      timestamp: trade.timestamp.toISOString()
    })),
    format: 'JSONEachRow'
  })
}

// FAIL: 1件ずつのinsert（遅い）
async function insertTrade(trade: Trade) {
  // これをloopの中で実行しない!
  await clickhouse.insert({
    table: 'trades',
    values: [{
      id: trade.id,
      market_id: trade.market_id,
      user_id: trade.user_id,
      amount: trade.amount,
      timestamp: trade.timestamp.toISOString()
    }],
    format: 'JSONEachRow'
  })
}
```

### streaming insert

```typescript
// 継続的なデータ取り込み向け
import { Readable } from 'node:stream'

async function streamInserts(dataSource: AsyncIterable<Record<string, unknown>>) {
  await clickhouse.insert({
    table: 'trades',
    values: Readable.from(dataSource, { objectMode: true }),
    format: 'JSONEachRow'
  })
}
```

## Materialized View

### リアルタイム集計

```sql
-- 時間単位statsのmaterialized viewを作る
CREATE MATERIALIZED VIEW market_stats_hourly_mv
TO market_stats_hourly
AS SELECT
    toStartOfHour(timestamp) AS hour,
    market_id,
    sumState(amount) AS total_volume,
    countState() AS total_trades,
    uniqState(user_id) AS unique_users
FROM trades
GROUP BY hour, market_id;

-- materialized viewへのquery
SELECT
    hour,
    market_id,
    sumMerge(total_volume) AS volume,
    countMerge(total_trades) AS trades,
    uniqMerge(unique_users) AS users
FROM market_stats_hourly
WHERE hour >= now() - INTERVAL 24 HOUR
GROUP BY hour, market_id;
```

## performance監視

### queryのperformance

```sql
-- 遅いqueryを確認する
SELECT
    query_id,
    user,
    query,
    query_duration_ms,
    read_rows,
    read_bytes,
    memory_usage
FROM system.query_log
WHERE type = 'QueryFinish'
  AND query_duration_ms > 1000
  AND event_time >= now() - INTERVAL 1 HOUR
ORDER BY query_duration_ms DESC
LIMIT 10;
```

### tableの統計

```sql
-- tableサイズを確認する
SELECT
    database,
    table,
    formatReadableSize(sum(bytes)) AS size,
    sum(rows) AS rows,
    max(modification_time) AS latest_modification
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY sum(bytes) DESC;
```

## よくある分析query

### 時系列分析

```sql
-- 日次アクティブユーザー
SELECT
    toDate(timestamp) AS date,
    uniq(user_id) AS daily_active_users
FROM events
WHERE timestamp >= today() - INTERVAL 30 DAY
GROUP BY date
ORDER BY date;

-- リテンション分析
SELECT
    signup_date,
    countIf(days_since_signup = 0) AS day_0,
    countIf(days_since_signup = 1) AS day_1,
    countIf(days_since_signup = 7) AS day_7,
    countIf(days_since_signup = 30) AS day_30
FROM (
    SELECT
        user_id,
        min(toDate(timestamp)) AS signup_date,
        toDate(timestamp) AS activity_date,
        dateDiff('day', signup_date, activity_date) AS days_since_signup
    FROM events
    GROUP BY user_id, activity_date
)
GROUP BY signup_date
ORDER BY signup_date DESC;
```

### ファネル分析

```sql
-- コンバージョンファネル
SELECT
    countIf(step = 'viewed_market') AS viewed,
    countIf(step = 'clicked_trade') AS clicked,
    countIf(step = 'completed_trade') AS completed,
    round(clicked / viewed * 100, 2) AS view_to_click_rate,
    round(completed / clicked * 100, 2) AS click_to_completion_rate
FROM (
    SELECT
        user_id,
        session_id,
        event_type AS step
    FROM events
    WHERE event_date = today()
)
GROUP BY session_id;
```

### コホート分析

```sql
-- 登録月ごとのユーザーコホート
SELECT
    toStartOfMonth(signup_date) AS cohort,
    toStartOfMonth(activity_date) AS month,
    dateDiff('month', cohort, month) AS months_since_signup,
    count(DISTINCT user_id) AS active_users
FROM (
    SELECT
        user_id,
        min(toDate(timestamp)) OVER (PARTITION BY user_id) AS signup_date,
        toDate(timestamp) AS activity_date
    FROM events
)
GROUP BY cohort, month, months_since_signup
ORDER BY cohort, months_since_signup;
```

## データパイプラインのパターン

### ETLパターン

```typescript
// Extract, Transform, Load
async function etlPipeline() {
  // 1. ソースから抽出する
  const rawData = await extractFromPostgres()

  // 2. 変換する
  const transformed = rawData.map(row => ({
    date: new Date(row.created_at).toISOString().split('T')[0],
    market_id: row.market_slug,
    volume: parseFloat(row.total_volume),
    trades: parseInt(row.trade_count)
  }))

  // 3. ClickHouseへload する
  await bulkInsertToClickHouse(transformed)
}

// 定期実行する
setInterval(etlPipeline, 60 * 60 * 1000)  // 1時間ごと
```

### Change Data Capture (CDC)

```typescript
// PostgreSQLの変更を購読してClickHouseへ同期する
import { Client } from 'pg'

const pgClient = new Client({ connectionString: process.env.DATABASE_URL })

pgClient.query('LISTEN market_updates')

pgClient.on('notification', async (msg) => {
  const update = JSON.parse(msg.payload)

  await clickhouse.insert({
    table: 'market_updates',
    values: [
      {
        market_id: update.id,
        event_type: update.operation,  // INSERT, UPDATE, DELETE
        timestamp: new Date(),
        data: JSON.stringify(update.new_data)
      }
    ],
    format: 'JSONEachRow'
  })
})
```

## ベストプラクティス

### 1. partition戦略
- 時間（通常は月または日）でpartitionする
- partitionを増やしすぎない（performanceに影響する）
- partition keyにはDATE型を使う

### 2. ordering key
- 絞り込みに最も多く使うcolumnを先頭に置く
- cardinalityを考慮する（高cardinalityを先に）
- 並び順は圧縮率に影響する

### 3. データ型
- 適切な最小の型を使う（UInt64よりUInt32）
- 繰り返しの多い文字列にはLowCardinalityを使う
- カテゴリ値にはEnumを使う

### 4. 避けること
- SELECT *（columnを明示する）
- FINAL（queryの前にmergeさせる）
- 過剰なJOIN（分析用途では非正規化する）
- 小さいinsertの多発（batchにする）

### 5. 監視
- query performanceを追跡する
- disk使用量を監視する
- merge操作を確認する
- 遅いqueryのlogを見直す

**留意点**: ClickHouseは分析workloadに強い。queryパターンに合わせてtableを設計し、insertをbatch化し、リアルタイム集計にはmaterialized viewを活用する。
