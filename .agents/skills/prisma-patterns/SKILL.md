---
name: prisma-patterns
description: TypeScript backend向けのPrisma ORMパターン — schema設計、query最適化、transaction、pagination、そしてupdateManyがrecordではなくcountを返す、$transactionのtimeout、migrate devがDBをresetする、bulk書き込みで@updatedAtが更新されない、serverlessでのconnection枯渇といった重大な落とし穴。Prismaのschemaやqueryを書くとき、transaction・migration・serverlessのconnection上限をdebugするときに使う。
metadata:
  origin: ECC
---

# Prismaパターン

TypeScript backendにおけるPrisma ORMの本番パターンと、気づきにくい落とし穴。

> **パターンを適用する前にversionを確認する。** PrismaのAPI表面はメジャーリリースごとに変化してきた。
>
> ```bash
> npx prisma --version
> ```
>
> version間の主なAPIの違い:
> - `relationJoins`はrelationを別queryではなくJOINで読み込めるが、大きな1:N relationや深い`include`では行数が爆発することがある — 両方をbenchmarkする
> - `omit`フィールド修飾子と`prisma.$extends`のClient Extensions APIが追加された
> - **新しめのinstall**: packageが`@prisma/client`ではなく`prisma`という名前のことがある。`PrismaClient`がdriver adapter（例: `@prisma/adapter-pg`）を要求することがある。`datasource.url`が`schema.prisma`ではなく`prisma.config.ts`にあることがある
> - CLIコマンド（`migrate dev`、`migrate deploy`、`generate`）はversion間で変わらない

## 発動タイミング

- Prisma schemaのmodelやrelationを設計・変更するとき
- query、transaction、paginationのロジックを書くとき
- `updateMany`、`deleteMany`、その他のbulk操作を使うとき
- database migrationを実行・計画するとき
- serverless環境（Vercel、Lambda、Cloudflare Workers）へdeployするとき
- soft deleteやmulti-tenantの行フィルタリングを実装するとき

## 中心となる概念

### ID戦略

| 戦略 | 使う場面 | 避ける場面 |
|---|---|---|
| `@default(cuid())` | 既定の選択 — URL-safe、sortable、衝突しない | 外部システム向けに連番IDが必要な場合 |
| `@default(uuid())` | Prisma以外のシステムとの相互運用が必要な場合 | 書き込みの多いテーブル（ランダムUUIDはB-tree indexを断片化する） |
| `@default(autoincrement())` | 内部のjoinテーブル、監査ログ | 外部公開するID（レコード数が露出する） |

### Schemaの既定

```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique  // @uniqueは既にindexを作る — @@indexは不要
  name      String
  role      Role      @default(USER)
  posts     Post[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([createdAt])
  @@index([deletedAt, createdAt]) // soft-delete + sort queryのための複合index
}
```

- すべての外部キーと、`WHERE`や`ORDER BY`で使う列に`@@index`を付ける。
- soft deleteが見込まれる要件なら`deletedAt DateTime?`を最初から宣言する — 後から追加すると稼働中テーブルへのmigrationが必要になる。
- `updatedAt @updatedAt`はPrismaが`update`と`upsert`のときだけ自動設定する（bulk updateの落とし穴はアンチパターンを参照）。

### `include` と `select`

| | `include` | `select` |
|---|---|---|
| 返すもの | 全scalarフィールド＋指定したrelation | 指定したフィールドのみ |
| 使う場面 | ほとんどのフィールドとrelationが必要なとき | hot path、大きなテーブル、over-fetchの回避 |
| 性能 | 横に広いテーブルでover-fetchしうる | payloadが最小、大規模データで高速 |
| Prisma 5の注記 | 既定でJOINを使う（`relationJoins`） | 同じ |

```ts
// include — 全列 + relation
const user = await prisma.user.findUnique({
  where: { id },
  include: { posts: { select: { id: true, title: true } } },
});

// select — 明示的な許可リスト
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true },
});
```

生のPrisma entityをAPI responseで返さない。露出するフィールドを制御するためresponse DTOへmapする。

```ts
// BAD: passwordHash、deletedAt、内部フィールドが漏れる
return await prisma.user.findUniqueOrThrow({ where: { id } });

// GOOD: 明示的なDTOマッピング
const user = await prisma.user.findUniqueOrThrow({ where: { id } });
return { id: user.id, name: user.name, email: user.email };
```

### Transaction形式の選択

| 状況 | 使うもの |
|---|---|
| 互いに依存しない独立した操作 | 配列形式 |
| 後の処理が前の結果に依存する | interactive形式 |
| 外部呼び出し（メール、HTTP）を含む | transactionの外へ出す |

```ts
// 配列形式 — 1往復でまとめて実行される
const [user, post] = await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { name } }),
  prisma.post.create({ data: { title, authorId: id } }),
]);

// interactive形式 — txクライアントだけを使い、外側のprismaクライアントは使わない
const post = await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({ where: { id } });
  if (user.role !== 'ADMIN') throw new Error('Forbidden');
  return tx.post.create({ data: { title, authorId: user.id } });
});
```

### PrismaClientのsingleton

`PrismaClient`のインスタンスはそれぞれ独自のconnection poolを開く。生成は一度だけにする。

```ts
// lib/prisma.ts

// 選択肢A — adapterベースの初期化（新しめのPrisma installで必要）
import { PrismaClient } from '@prisma/client'; // または環境に応じた生成clientのpath
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// 選択肢B — 直接初期化（古いinstall、adapter不要）
// import { PrismaClient } from '@prisma/client';
// export const prisma = globalForPrisma.prisma ?? new PrismaClient({ ... });
```

Prismaのinstallが`PrismaClient`のコンストラクタに`adapter`引数を要求するなら選択肢Aを使う。
`new PrismaClient()`が引数なしで動くなら選択肢Bを使う。どちらが正しいかはコンパイラに判断させる。

`globalThis`パターンはhot reload（Next.js、nodemon、ts-node-dev）中の重複インスタンス生成を防ぐ。

### N+1問題

loopの中でrelationを読み込むと、行ごとに1 queryが発行される。

```ts
// BAD: N+1 — userごとに追加のqueryが1本ずつ走る
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { authorId: user.id } });
}

// GOOD: 単一query
const users = await prisma.user.findMany({ include: { posts: true } });
```

Prisma 5以降の`relationJoins`では、`include`形式は単一のJOINを使う。大きな1:Nでは結果セットが膨らむことがある — 親1件あたり多数の行を返しうるrelationなら両方をbenchmarkする。

## コード例

### Cursor pagination（フィードや大規模データに推奨）

```ts
async function getPosts(cursor?: string, limit = 20) {
  const items = await prisma.post.findMany({
    where: { published: true },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' }, // 第2ソートキーがtimestamp重複時の不安定なpaginationを防ぐ
    ],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasNextPage = items.length > limit;
  if (hasNextPage) items.pop();

  return { items, nextCursor: hasNextPage ? items[items.length - 1].id : null };
}
```

`limit + 1`件を取得してpopするのが、追加のcount queryなしに`hasNextPage`を判定する定石。複数行が同じtimestampを持つときの不安定なpaginationを防ぐため、常に一意のフィールド（例: `id`）を第2の`orderBy`に含める。offset paginationは利用者が任意のページへ移動する必要がある場合（管理テーブル）だけ使う。

### Soft delete

```ts
// 常に明示的にフィルタする — middlewareに頼らない（挙動が隠れ、debugしにくい）
const activeUsers = await prisma.user.findMany({ where: { deletedAt: null } });

await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
await prisma.user.update({ where: { id }, data: { deletedAt: null } }); // 復元
```

### エラー処理

```ts
import { Prisma } from '@prisma/client'; // または環境に応じた生成clientのpath

try {
  await prisma.user.create({ data: { email } });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') throw new ConflictError('Email already exists');
    if (e.code === 'P2025') throw new NotFoundError('Record not found');
    if (e.code === 'P2003') throw new BadRequestError('Referenced record does not exist');
  }
  throw e;
}
```

主なcode: `P2002` 一意制約違反 · `P2025` 見つからない · `P2003` 外部キー違反。

serviceの境界でcatchし、domain errorへ変換する。生のPrismaのメッセージをAPI利用者へ露出しない。

### Connection pool — serverless

connectionのパラメータは`DATABASE_URL`へ直接埋め込む。URLに既にquery parameter（例: `?schema=public`）がある場合、文字列連結は壊れる。

```bash
# .env — 推奨: パラメータをURLへ埋め込む
DATABASE_URL="postgresql://user:pass@host/db?connection_limit=1&pool_timeout=20"

# 外部pooler（PgBouncer、Supabase pooler）を使う場合
DATABASE_URL="postgresql://user:pass@host/db?pgbouncer=true&connection_limit=1"
```

```ts
// Vercel、AWS Lambdaなどのserverless runtime:
// インスタンスあたりのpoolを1に抑える。connection_limitとpool_timeoutはDATABASE_URLで制御する

// adapterベースの構成（Prismaのinstallがadapterを要求する場合）:
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// 直接構成（Prismaのinstallがadapterを要求しない場合）:
// const prisma = new PrismaClient();
```

## アンチパターン

### `updateMany`はrecordではなくcountを返す

```ts
// BAD: 結果は { count: 2 } — users[0]はundefined
const users = await prisma.user.updateMany({ where: { role: 'GUEST' }, data: { role: 'USER' } });

// GOOD: 先にIDを取得し、更新し、対象行だけを取り直す
const targets = await prisma.user.findMany({
  where: { role: 'GUEST' },
  select: { id: true },
});
const ids = targets.map((u) => u.id);
await prisma.user.updateMany({ where: { id: { in: ids } }, data: { role: 'USER' } });
const updated = await prisma.user.findMany({ where: { id: { in: ids } } });
```

`deleteMany`も同様 — `{ count: n }`を返し、削除された行は決して返さない。

### `$transaction`のinteractive形式は5秒でtimeoutする

```ts
// BAD: transaction内の外部呼び出しが既定の5秒を超える → "Transaction already closed"
await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({ where: { id } });
  await sendWelcomeEmail(user.email); // 外部呼び出し
  await tx.user.update({ where: { id }, data: { emailSent: true } });
});

// GOOD: 外部呼び出しはtransactionの外へ
const user = await prisma.user.findUniqueOrThrow({ where: { id } });
await sendWelcomeEmail(user.email);
await prisma.user.update({ where: { id }, data: { emailSent: true } });

// bulk処理で本当に必要なときだけtimeoutを引き上げる
await prisma.$transaction(async (tx) => { ... }, { timeout: 30_000 });
```

### `migrate dev`はdatabaseをresetしうる

`migrate dev`はschemaのdriftを検知し、DBのresetを促してすべてのデータを削除することがある。

```bash
# 共有dev、staging、productionでは絶対に実行しない
npx prisma migrate dev --name add_column

# ローカルの単独開発以外ではこちらが安全
npx prisma migrate deploy

# 適用せずにdriftを確認する
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL"
```

### migrationファイルを手で編集すると以後のdeployが壊れる

Prismaはすべてのmigrationファイルのchecksumを取る。適用後に編集すると、元のmigrationが既に実行済みのすべての環境で`P3006 checksum mismatch`が発生する。代わりに新しいmigrationを作る。

### 破壊的なschema変更は多段階migrationが必要

既存列への`NOT NULL`追加や、1回のmigrationでの列名変更は、テーブルをロックするかデータを失わせる。expand-and-contractを使う。

```bash
# Step 1: ローカルでmigrationを作成し、次にdeployする
npx prisma migrate dev --name add_new_column   # ローカルのみ
npx prisma migrate deploy                       # staging / production
```

```ts
// Step 2: データをbackfillする（shellではなくscriptまたはmigration jobで実行する）
await prisma.user.updateMany({ data: { newColumn: derivedValue } });
```

```bash
# Step 3: NOT NULL制約のmigrationをローカルで作成し、次にdeployする
npx prisma migrate dev --name make_new_column_required  # ローカルのみ
npx prisma migrate deploy                               # staging / production
```

### `@updatedAt`は`updateMany`で発火しない

`@updatedAt`は`update`と`upsert`でのみ自動設定される。bulk書き込みでは古い値のまま残る。

```ts
// BAD: updatedAtが古い値のまま
await prisma.post.updateMany({ where: { authorId }, data: { published: true } });

// GOOD
await prisma.post.updateMany({
  where: { authorId },
  data: { published: true, updatedAt: new Date() },
});
```

### soft delete + `findUniqueOrThrow`は削除済みrecordを漏らす

`findUniqueOrThrow`は行がDBに存在しない場合にのみ`P2025`を投げる。soft deleteされた行は存在するため、エラーにならず返る。

`findUniqueOrThrow`は`where`に一意制約フィールドを要求するため、`id`に加えて`deletedAt: null`を書くと`{ id, deletedAt }`が複合一意制約でないため型が壊れる。代わりに`findFirstOrThrow`を使う。

```ts
// BAD: soft deleteされたuserを返す
const user = await prisma.user.findUniqueOrThrow({ where: { id } });

// BAD: Prismaの型エラー — { id, deletedAt } は一意制約ではない
const user = await prisma.user.findUniqueOrThrow({ where: { id, deletedAt: null } });

// GOOD: findFirstOrThrowは任意のwhere条件に対応する
const user = await prisma.user.findFirstOrThrow({ where: { id, deletedAt: null } });
```

### `where`なしの`deleteMany`は全行を削除する

```ts
// BAD: 無言でテーブルを空にする
await prisma.post.deleteMany();

// GOOD
await prisma.post.deleteMany({ where: { authorId: userId } });
```

## ベストプラクティス

| ルール | 理由 |
|---|---|
| CI/CDでは`migrate deploy`、`migrate dev`はローカルのみ | `migrate dev`はdrift時にDBをresetしうる |
| entityをresponse DTOへmapする | 内部フィールドの漏洩を防ぐ |
| serviceの境界で`PrismaClientKnownRequestError`をcatchする | domain errorへ変換する |
| 手動のnullチェックより`*OrThrow`メソッドを優先する | P2025が自動で投げられる。一意でないフィールドで絞る場合は`findFirstOrThrow`を使う |
| serverlessでは`connection_limit=1`＋外部pooler | connectionの枯渇を防ぐ |
| `deleteMany`には必ず`where`を指定する | 誤ってテーブルを空にするのを防ぐ |
| `updateMany`では`updatedAt: new Date()`を手動で設定する | `@updatedAt`はbulk書き込みをスキップする |

## 関連skill

- `nestjs-patterns` — Prismaを統合するNestJSのservice層
- `postgres-patterns` — PostgreSQLレベルのindexとconnectionのチューニング
- `database-migrations` — 本番向けの多段階migration計画
- `backend-patterns` — 一般的なAPIとservice層の設計
