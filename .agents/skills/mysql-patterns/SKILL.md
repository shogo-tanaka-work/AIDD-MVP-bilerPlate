---
name: mysql-patterns
description: 本番backend向けのMySQL・MariaDBのschema、query、index、transaction、replication、connection poolのパターン。MySQLやMariaDBのschemaとindexを設計するとき、またはquery・transaction・replicaに遅延があるときに使う。
metadata:
  origin: ECC
---

# MySQL Patterns

MySQLまたはMariaDBのschema設計、migration、slow queryの調査、queue形式の
transaction、connection pool、本番databaseの設定に取り組むときにこのスキルを使う。
MySQLとMariaDBはいくつかのSQLの詳細で分岐しているため、機能固有のパターンを
適用する前に正確なバージョンを確認する。

## 発動条件

- MySQLまたはMariaDBのtable、index、constraintを設計するとき
- 大きな本番tableで実行する前のmigrationをレビューするとき
- slow query、lock wait、deadlock、connection枯渇をデバッグするとき
- keyset pagination、upsert、full-text search、JSON column、queueを追加するとき
- アプリケーションのconnection pool、read replica、TLS、slow logを設定するとき

## バージョン確認

まずエンジンとバージョンを特定する。

```sql
SELECT VERSION();
SHOW VARIABLES LIKE 'version_comment';
```

構文が異なる場合、MySQLとMariaDBの指針を分けて扱う。

- MySQLは`ON DUPLICATE KEY UPDATE`における`VALUES(col)`の置き換えとして
  row aliasを文書化している。`VALUES(col)`はそこでは非推奨である。
- MariaDBは`ON DUPLICATE KEY UPDATE`でinsert値を参照する方法として
  `VALUES(col)`を文書化している。エンジン横断の互換性のために使う。
- `SKIP LOCKED`はqueueのような処理にだけ適する。lockされた行をスキップし
  一貫性のないビューを返しうるため、一般的な会計処理や整合性が重要な読み取りには
  使わない。

## schemaのデフォルト

```sql
CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(32) NOT NULL,
    total DECIMAL(15, 2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_orders_account_status_created (account_id, status, created_at),
    KEY idx_orders_active (account_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

デフォルトの選択:

| ユースケース | 推奨 | 回避 |
| --- | --- | --- |
| 代理primary key | `BIGINT UNSIGNED AUTO_INCREMENT` | 20億行を超えうるtableへの`INT` |
| UUIDの検索key | 変換helper付きの`BINARY(16)` | hot tableでの`VARCHAR(36)` primary key |
| 金額と正確な数量 | `DECIMAL(p, s)` | `FLOAT`や`DOUBLE` |
| 利用者向けテキスト | `utf8mb4`のtableとindex | MySQLの`utf8` / `utf8mb3`デフォルト |
| アプリケーションのtimestamp | アプリ側でUTC管理する`DATETIME` | `DATETIME`がtime zone情報を保持すると仮定すること |
| 論理削除 | `deleted_at DATETIME NULL`とスコープ付きindex | indexなしで論理削除行を絞り込むこと |
| 拡張しうるstatus値 | lookup tableまたは制約付き`VARCHAR` | 値が頻繁に変わるときの`ENUM` |

## index

複合indexの順序は通常、等価述語を先に、その後にrangeやsort用のcolumnを置く。

```sql
CREATE INDEX idx_orders_account_status_created
    ON orders (account_id, status, created_at);

SELECT id, total
FROM orders
WHERE account_id = ?
  AND status = 'pending'
  AND created_at >= ?
ORDER BY created_at DESC
LIMIT 50;
```

indexを追加・変更する前に`EXPLAIN`を使う。

```sql
EXPLAIN
SELECT id, total
FROM orders
WHERE account_id = 123 AND status = 'pending'
ORDER BY created_at DESC
LIMIT 50;
```

調査すべきシグナル:

| フィールド | リスクのシグナル |
| --- | --- |
| `type` | 大きなtableでの`ALL` |
| `key` | 選択性の高い述語があるのに`NULL` |
| `rows` | 対話的な経路での非常に大きな行数見積もり |
| `Extra` | `Using temporary`、`Using filesort`、広範な`Using where` |

やみくもにindexを追加しない。indexごとに書き込みコスト、migration時間、
backupサイズ、buffer poolへの圧迫が増える。

## queryのパターン

### upsert

エンジン横断で互換性のある形式:

```sql
INSERT INTO user_settings (user_id, setting_key, setting_value)
VALUES (?, ?, ?)
ON DUPLICATE KEY UPDATE
    setting_value = VALUES(setting_value),
    updated_at = CURRENT_TIMESTAMP;
```

MySQLのrow alias形式:

```sql
INSERT INTO user_settings (user_id, setting_key, setting_value)
VALUES (?, ?, ?) AS new
ON DUPLICATE KEY UPDATE
    setting_value = new.setting_value,
    updated_at = CURRENT_TIMESTAMP;
```

row alias形式は対象がMySQLだと確認できた場合にだけ使う。MariaDBや
MySQL/MariaDB混在環境では`VALUES(col)`を使う。

### keyset pagination

```sql
SELECT id, name, created_at
FROM products
WHERE (created_at, id) < (?, ?)
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

cursorに一致するindexで裏付ける。

```sql
CREATE INDEX idx_products_created_id ON products (created_at, id);
```

大きなtableで深い`OFFSET`のpaginationを使わない。ページを返す前に行を
スキャンして捨てることになる。

### JSONフィールド

JSON columnは拡張データ用に使い、重いリレーショナルな絞り込みやconstraintが
必要なフィールドには使わない。

```sql
CREATE TABLE events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payload JSON NOT NULL,
    event_type VARCHAR(64)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.type'))) STORED,
    KEY idx_events_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

頻繁にqueryするJSONパスは、generated columnとして露出させindexを張る。
外部key、所有権、テナンシー、ライフサイクルのフィールドはリレーショナルに保つ。

### full-text search

```sql
ALTER TABLE articles ADD FULLTEXT KEY ft_articles_title_body (title, body);

SELECT id, title, MATCH(title, body) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
FROM articles
WHERE MATCH(title, body) AGAINST (? IN NATURAL LANGUAGE MODE)
ORDER BY score DESC
LIMIT 20;
```

typo許容、複雑なranking、table横断のfacet、組み込みfull-textを超える
言語固有の解析が必要なら外部の検索エンジンを使う。

## transaction

transactionは短く保ち、行を一貫した順序でlockする。

```sql
START TRANSACTION;

SELECT id, balance
FROM accounts
WHERE id IN (?, ?)
ORDER BY id
FOR UPDATE;

UPDATE accounts SET balance = balance - ? WHERE id = ?;
UPDATE accounts SET balance = balance + ? WHERE id = ?;

COMMIT;
```

deadlockとlock waitのチェックリスト:

- コード経路をまたいで決定的な順序で行をlockする。
- 外部API呼び出しはtransaction内ではなく、開始前に行う。
- `UPDATE`、`DELETE`、locking readで使う述語にindexを張る。
- deadlock時はrollbackし、上限を設けたretry予算でtransaction全体を再実行する。
- deadlock直後に`SHOW ENGINE INNODB STATUS\G`を取得する。後続のイベントで
  上書きされる。

queue形式のworkerによる取得:

```sql
START TRANSACTION;

SELECT id
FROM jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;

UPDATE jobs
SET status = 'processing', started_at = CURRENT_TIMESTAMP
WHERE id = ?;

COMMIT;
```

`SKIP LOCKED`は、lockされた行のスキップが許容されるqueue的なワークロードに
だけ使う。通常のtransaction整合性の代替ではない。

## connection pool

SQLAlchemyの例:

```python
from sqlalchemy import create_engine

engine = create_engine(
    "mysql+mysqlconnector://app:secret@db.internal/app",
    pool_size=10,
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=240,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)
```

Node.jsの`mysql2`の例:

```javascript
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});

const [rows] = await pool.execute(
  'SELECT id, total FROM orders WHERE account_id = ? LIMIT 50',
  [accountId],
);
```

アプリケーションのpool recycleはサーバーの`wait_timeout`より短く保つ。
サーバーが`wait_timeout = 300`なら`pool_recycle`は240秒程度が整合する。
`pool_pre_ping`はネットワーク障害やfailoverからの回復に依然として役立つ。

## 診断

一次調査に有用なコマンド:

```sql
SHOW FULL PROCESSLIST;
SHOW ENGINE INNODB STATUS\G;
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
```

管理された環境でslow logを有効にする。

```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
SET GLOBAL log_queries_not_using_indexes = 'ON';
```

`EXPLAIN ANALYZE`はqueryを実行しても安全な場合にだけ使う。文を実際に実行するため、
本番規模のデータでは高コストになりうる。

## replication

read replicaは遅延しうる。書き込み直後にread-your-own-writeの経路、checkoutフロー、
権限チェック、idempotency keyの読み取りをreplicaへ振り分けない。

```sql
-- MySQLの旧来の用語。既存環境では今も一般的
SHOW SLAVE STATUS\G;

-- サポートされる環境での新しい用語
SHOW REPLICA STATUS\G;
```

どちらのコマンドに統一するかを決める前にエンジンとバージョンを確認する。TCP接続が
生きているかだけでなく、replicaのSQL threadとIO threadの健全性、遅延を監視する。

## セキュリティ

```sql
CREATE USER 'app'@'%' IDENTIFIED BY 'use-a-secret-manager';
GRANT SELECT, INSERT, UPDATE, DELETE ON appdb.* TO 'app'@'%';

ALTER USER 'app'@'%' REQUIRE SSL;

SELECT user, host
FROM mysql.user
WHERE user = '';

DROP USER IF EXISTS ''@'localhost';
DROP USER IF EXISTS ''@'%';
```

セキュリティレビューの観点:

- アプリケーションユーザーに`ALL PRIVILEGES`や`*.*`を付与しない。
- 通信がホストやネットワークをまたぐ場合、アプリケーションユーザーにTLSを必須にする。
- credentialは実行基盤のsecret managerへ保存する。例、スクリプト、リポジトリ内の
  ファイルへ置かない。
- migration/管理用ユーザーと実行時のアプリケーションユーザーを分ける。
- performanceを調整する前に、公開ネットワークへの露出とbind addressを監査する。

## 設定

専用のdatabaseホスト向けの出発点の例:

```ini
[mysqld]
innodb_buffer_pool_size = 4G
innodb_flush_log_at_trx_commit = 1
sync_binlog = 1

max_connections = 300
thread_cache_size = 50

wait_timeout = 300
interactive_timeout = 300
innodb_lock_wait_timeout = 10

slow_query_log = ON
long_query_time = 1
log_queries_not_using_indexes = ON

log_bin = mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 604800
```

設定値は普遍的なpresetではなくレビューのきっかけとして扱う。メモリ、接続数、
ログ保持、耐久性の設定は、ワークロード、ハードウェア、backupポリシー、
復旧目標から決める。

## anti-pattern

| anti-pattern | リスク | より良いパターン |
| --- | --- | --- |
| hot pathでの`SELECT *` | 過剰取得と壊れやすいclient | 明示的なcolumnを選択する |
| 深い`OFFSET` pagination | 線形スキャンと遅いページ | keyset pagination |
| 外部keyのjoinにindexがない | 遅いjoinとlockの多い削除 | FK columnへ意図的にindexを張る |
| 長いtransaction | lock waitと巨大なundo履歴 | 小さな単位でcommitする |
| `mysql.user`への直接DML | grant tableの破損リスク | `CREATE USER`、`ALTER USER`、`DROP USER`を使う |
| 管理権限を持つアプリケーションユーザー | 影響範囲が大きい | 最小権限の実行時ユーザー |
| `wait_timeout`より長いpool recycle | 古いpool接続 | timeoutより短くrecycleしpre-pingする |
| 書き込み直後のreplica読み取り | 利用者に見える古い状態 | read-after-writeのフローをprimaryへ固定する |

## 出力の期待値

このスキルをレビューに使うときは、次を返す。

1. エンジン／バージョンの前提。
2. 最もリスクの高い正しさ、lock、セキュリティ、migrationの問題。
3. 安全な経路のための正確なSQLまたはコード変更。
4. 検証計画: `EXPLAIN`、migrationのdry run、lock/deadlockチェック、
   rollback基準。
5. 推奨内容に影響するMySQL/MariaDBの構文差異。

## 関連

- Skill: `postgres-patterns` - PostgreSQL固有のschemaとqueryのパターン
- Skill: `database-migrations` - migrationの計画と展開の安全性
- Skill: `backend-patterns` - APIとservice層のパターン
- Skill: `security-review` - secretの扱い、認証、最小権限
- Agent: `database-reviewer` - より広いdatabaseレビューのworkflow
