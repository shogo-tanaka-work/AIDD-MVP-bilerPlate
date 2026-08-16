---
name: database-migrations
description: PostgreSQL、MySQL、主要なORM（Prisma、Drizzle、Kysely、Django、TypeORM、golang-migrate）にまたがる、schema変更・data migration・rollback・zero-downtime deployのbest practice。schemaやdataのmigrationを書くとき、rollbackを計画するとき、zero-downtime deployを目指すときに使う。
metadata:
  origin: ECC
---

# Database Migration Patterns

production環境向けの、安全で巻き戻し可能なdatabase schema変更。

## 使う場面

- databaseのtableを作成・変更するとき
- 列やindexを追加・削除するとき
- data migration（backfill、変換）を実行するとき
- zero-downtimeのschema変更を計画するとき
- 新規プロジェクトにmigration toolingを導入するとき

## 基本原則

1. **すべての変更はmigrationとして行う** — production databaseを手作業で変更しない
2. **productionではmigrationは前進のみ** — rollbackは新しい前進migrationで行う
3. **schema migrationとdata migrationは分ける** — 一つのmigrationにDDLとDMLを混ぜない
4. **production相当のデータ量でmigrationを検証する** — 100行で動くmigrationも1000万行ではlockしうる
5. **deploy済みのmigrationは不変** — productionで実行済みのmigrationを編集しない

## Migration安全チェックリスト

migrationを適用する前に:

- [ ] migrationにUPとDOWNの両方がある（または明示的に不可逆と記されている）
- [ ] 大きなtableでfull table lockが発生しない（concurrentな操作を使う）
- [ ] 新しい列にdefaultがあるかnullableである（defaultなしのNOT NULLを追加しない）
- [ ] indexはconcurrentに作成する（既存tableではCREATE TABLEにインラインで書かない）
- [ ] data backfillはschema変更とは別のmigrationになっている
- [ ] production dataのコピーで検証済みである
- [ ] rollback計画が文書化されている

## PostgreSQLのパターン

### 列を安全に追加する

```sql
-- GOOD: nullableな列。lockなし
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- GOOD: default付きの列（Postgres 11以降は即座に完了し、書き換えなし）
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- BAD: 既存tableにdefaultなしのNOT NULL（全体の書き換えが必要）
ALTER TABLE users ADD COLUMN role TEXT NOT NULL;
-- tableをlockし、全行を書き換える
```

### ダウンタイムなしでindexを追加する

```sql
-- BAD: 大きなtableで書き込みをブロックする
CREATE INDEX idx_users_email ON users (email);

-- GOOD: 非ブロッキングで、並行した書き込みを許す
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- 注: CONCURRENTLYはtransaction block内で実行できない
-- 多くのmigration toolでは個別の対応が必要になる
```

### 列のrename（zero-downtime）

productionで直接renameしない。expand-contractパターンを使う:

```sql
-- Step 1: 新しい列を追加する（migration 001）
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Step 2: データをbackfillする（migration 002、data migration）
UPDATE users SET display_name = username WHERE display_name IS NULL;

-- Step 3: 両方の列を読み書きするようアプリケーションコードを更新する
-- アプリケーションの変更をdeployする

-- Step 4: 旧列への書き込みを止め、削除する（migration 003）
ALTER TABLE users DROP COLUMN username;
```

### 列を安全に削除する

```sql
-- Step 1: アプリケーション側のその列への参照をすべて除去する
-- Step 2: 列を参照しないアプリケーションをdeployする
-- Step 3: 次のmigrationで列を削除する
ALTER TABLE orders DROP COLUMN legacy_status;

-- Django: SeparateDatabaseAndStateを使い、DROP COLUMNを生成せずに
-- modelから外す（削除は次のmigrationで行う）
```

### 大規模なdata migration

```sql
-- BAD: 全行を一つのtransactionで更新する（tableをlockする）
UPDATE users SET normalized_email = LOWER(email);

-- GOOD: 進捗付きのバッチ更新
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE users
    SET normalized_email = LOWER(email)
    WHERE id IN (
      SELECT id FROM users
      WHERE normalized_email IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % rows', rows_updated;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

## Prisma（TypeScript/Node.js）

### ワークフロー

```bash
# schemaの変更からmigrationを作成する
npx prisma migrate dev --name add_user_avatar

# productionで未適用のmigrationを適用する
npx prisma migrate deploy

# databaseをリセットする（開発時のみ）
npx prisma migrate reset

# schema変更後にclientを生成する
npx prisma generate
```

### Schemaの例

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatarUrl String?  @map("avatar_url")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  orders    Order[]

  @@map("users")
  @@index([email])
}
```

### カスタムSQLのmigration

Prismaで表現できない操作（concurrentなindex、data backfill）向け:

```bash
# 空のmigrationを作成し、SQLを手で編集する
npx prisma migrate dev --create-only --name add_email_index
```

```sql
-- migrations/20240115_add_email_index/migration.sql
-- PrismaはCONCURRENTLYを生成できないため、手で記述する
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
```

## Drizzle（TypeScript/Node.js）

### ワークフロー

```bash
# schemaの変更からmigrationを生成する
npx drizzle-kit generate

# migrationを適用する
npx drizzle-kit migrate

# schemaを直接pushする（開発時のみ。migrationファイルなし）
npx drizzle-kit push
```

### Schemaの例

```typescript
import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

## Kysely（TypeScript/Node.js）

### ワークフロー（kysely-ctl）

```bash
# 設定ファイルを初期化する（kysely.config.ts）
kysely init

# 新しいmigrationファイルを作成する
kysely migrate make add_user_avatar

# 未適用のmigrationをすべて適用する
kysely migrate latest

# 直前のmigrationをrollbackする
kysely migrate down

# migrationの状態を表示する
kysely migrate list
```

### Migrationファイル

```typescript
// migrations/2024_01_15_001_create_user_profile.ts
import { type Kysely, sql } from 'kysely'

// 重要: 型付きのDB interfaceではなく、常にKysely<any>を使う。
// migrationはその時点で凍結され、現在のschema型に依存してはならない。
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user_profile')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('email', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('avatar_url', 'text')
    .addColumn('created_at', 'timestamp', (col) =>
      col.defaultTo(sql`now()`).notNull()
    )
    .execute()

  await db.schema
    .createIndex('idx_user_profile_avatar')
    .on('user_profile')
    .column('avatar_url')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_profile').execute()
}
```

### プログラムからのMigrator利用

```typescript
import { Migrator, FileMigrationProvider } from 'kysely'
import { promises as fs } from 'fs'
import * as path from 'path'
// ESM専用 — CJSでは__dirnameをそのまま使える
import { fileURLToPath } from 'url'
const migrationFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  './migrations',
)

// `db`はKysely<any>のdatabase instance
const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder,
  }),
  // 警告: 開発時のみ有効にする。timestamp順の検証が無効になり、
  // 環境間でschema driftを引き起こしうる。
  // allowUnorderedMigrations: true,
})

const { error, results } = await migrator.migrateToLatest()

results?.forEach((it) => {
  if (it.status === 'Success') {
    console.log(`migration "${it.migrationName}" executed successfully`)
  } else if (it.status === 'Error') {
    console.error(`failed to execute migration "${it.migrationName}"`)
  }
})

if (error) {
  console.error('migration failed', error)
  process.exit(1)
}
```

## Django（Python）

### ワークフロー

```bash
# modelの変更からmigrationを生成する
python manage.py makemigrations

# migrationを適用する
python manage.py migrate

# migrationの状態を表示する
python manage.py showmigrations

# カスタムSQL用に空のmigrationを生成する
python manage.py makemigrations --empty app_name -n description
```

### Data migration

```python
from django.db import migrations

def backfill_display_names(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    batch_size = 5000
    users = User.objects.filter(display_name="")
    while users.exists():
        batch = list(users[:batch_size])
        for user in batch:
            user.display_name = user.username
        User.objects.bulk_update(batch, ["display_name"], batch_size=batch_size)

def reverse_backfill(apps, schema_editor):
    pass  # data migrationのため、逆方向は不要

class Migration(migrations.Migration):
    dependencies = [("accounts", "0015_add_display_name")]

    operations = [
        migrations.RunPython(backfill_display_names, reverse_backfill),
    ]
```

### SeparateDatabaseAndState

databaseから即座に削除せず、Djangoのmodelからだけ列を外す:

```python
class Migration(migrations.Migration):
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name="user", name="legacy_field"),
            ],
            database_operations=[],  # DBにはまだ触れない
        ),
    ]
```

## golang-migrate（Go）

### ワークフロー

```bash
# migrationのペアを作成する
migrate create -ext sql -dir migrations -seq add_user_avatar

# 未適用のmigrationをすべて適用する
migrate -path migrations -database "$DATABASE_URL" up

# 直前のmigrationをrollbackする
migrate -path migrations -database "$DATABASE_URL" down 1

# versionを強制する（dirty状態の修復）
migrate -path migrations -database "$DATABASE_URL" force VERSION
```

### Migrationファイル

```sql
-- migrations/000003_add_user_avatar.up.sql
ALTER TABLE users ADD COLUMN avatar_url TEXT;
CREATE INDEX CONCURRENTLY idx_users_avatar ON users (avatar_url) WHERE avatar_url IS NOT NULL;

-- migrations/000003_add_user_avatar.down.sql
DROP INDEX IF EXISTS idx_users_avatar;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
```

## Zero-Downtime migrationの進め方

重要なproduction変更では、expand-contractパターンに従う:

```
Phase 1: EXPAND
  - 新しい列/tableを追加する（nullableまたはdefault付き）
  - deploy: アプリは旧と新の両方へ書き込む
  - 既存データをbackfillする

Phase 2: MIGRATE
  - deploy: アプリは新から読み、両方へ書き込む
  - データの整合性を確認する

Phase 3: CONTRACT
  - deploy: アプリは新のみを使う
  - 別のmigrationで旧列/tableを削除する
```

### タイムラインの例

```
1日目: migrationでnew_status列を追加する（nullable）
1日目: アプリv2をdeploy — statusとnew_statusの両方へ書き込む
2日目: 既存行のbackfill migrationを実行する
3日目: アプリv3をdeploy — new_statusのみを読む
7日目: migrationで旧status列を削除する
```

## アンチパターン

| アンチパターン | 失敗する理由 | より良い方法 |
|-------------|-------------|-----------------|
| productionでの手作業SQL | 監査証跡がなく、再現できない | 常にmigrationファイルを使う |
| deploy済みmigrationの編集 | 環境間でdriftが生じる | 代わりに新しいmigrationを作る |
| defaultなしのNOT NULL | tableをlockし、全行を書き換える | nullableで追加し、backfillしてから制約を付ける |
| 大きなtableへのインラインindex | 構築中に書き込みをブロックする | CREATE INDEX CONCURRENTLY |
| 一つのmigrationにschema + data | rollbackが難しく、transactionが長い | migrationを分ける |
| コード除去前の列削除 | 列がなくアプリがエラーになる | 先にコードを外し、次のdeployで列を削除する |
