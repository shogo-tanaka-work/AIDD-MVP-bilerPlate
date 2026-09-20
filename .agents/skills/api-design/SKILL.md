---
name: api-design
description: 本番APIのためのREST API設計パターン。リソース命名、status code、pagination、filtering、error response、versioning、rate limitingを扱う。REST endpoint、リソース名、status code、pagination、versioningを設計・レビューするときに使う。
metadata:
  origin: ECC
---

# API設計パターン

一貫性があり開発者にとって扱いやすいREST APIを設計するための規約。判断基準を本文に置き、形式の詳細と言語別の実装例は`references/`に分ける。

## 発動タイミング

- 新しいAPI endpointを設計するとき
- 既存のAPI contractをレビューするとき
- pagination、filtering、sortingを追加するとき
- APIのerror handlingを実装するとき
- APIのversioning戦略を検討するとき
- 公開APIやパートナー向けAPIを構築するとき

## 設計原則

入力検証、認可の強制、内部詳細の非露出、エラーの文脈付与は常時ロードされる`.agents/rules/security.md`と`.agents/rules/error-handling.md`に従う。ここではHTTP契約の判断だけを扱う。

### リソースとmethod

- リソースは名詞・複数形・小文字・kebab-case。URLに動詞を入れず、所有関係はnested resource（`/users/:id/orders`）で表す。
- CRUDに収まらない操作だけ`POST /orders/:id/cancel`のように動詞を末尾に置く。
- GET / PUT / DELETEは冪等、POSTは非冪等、PATCHは部分更新。副作用のある操作にGETを使わない。

### Status code

- 作成は`201`＋`Location`ヘッダ、bodyなしの削除・置換は`204`。
- 検証失敗は`400`（構文）または`422`（意味）でフィールド単位の詳細を返す。`401`は未認証、`403`は権限不足、`409`は状態競合、`429`はrate limit超過。
- 「何でも200」にしない。`503`には`Retry-After`を付ける。

### Response形式

- 成功は`{ "data": ... }`、コレクションは`data`＋`meta`＋`links`、エラーは`{ "error": { "code", "message", "details" } }`に統一する。
- 公開APIはenvelope、内部APIはフラットでもよいが、同一API内で混在させない。
- フィールド命名（camelCase / snake_case）は既存endpointと揃える。

### Pagination・filtering・sorting

| ユースケース | pagination |
|---|---|
| 管理dashboard、小規模データ（1万件未満）、検索結果 | Offset |
| 無限スクロール、フィード、大規模データ | Cursor |
| 公開API | Cursor（既定）＋Offset（任意） |

- filterはquery parameter（比較は`price[gte]=10`、複数値はカンマ区切り、ネストはドット記法）。
- sortは`sort=-created_at,price`、全文検索は`q=`、必要フィールドの限定は`fields=`。sort・filter可能なフィールドは許可リストで限定する。

### 認証・rate limiting・versioning

- bearer tokenを`Authorization`ヘッダで受け取り、server間はAPI keyを使う。リソース単位の所有権確認とrole確認を分ける。
- rate limitは`X-RateLimit-*`ヘッダで残量を返し、超過時は`429`＋`Retry-After`。tierはanonymous / authenticated / premium / internalで分ける。
- versionはURL path（`/api/v1/`）で表し、active versionは最大2つ。破壊的変更（削除・改名・型変更・URL変更・認証方式変更）だけ新versionを切り、追加は同versionで行う。廃止は告知 → `Sunset`ヘッダ → `410 Gone`。

## API設計チェックリスト

新しいendpointをリリースする前に、security ruleの入力検証・認可・内部詳細の非露出に加えて確認する。

- [ ] リソースURLが命名規約に沿っている（複数形、kebab-case、動詞なし）
- [ ] 正しいHTTP methodを使っている（読み取りはGET、作成はPOSTなど）
- [ ] 適切なstatus codeを返している（何でも200にしていない）
- [ ] error responseがcodeとmessageを含む標準形式に従っている
- [ ] 一覧endpointにpaginationを実装している（cursorまたはoffset）
- [ ] 認証が必要（または明示的に公開と示している）
- [ ] rate limitingを設定している
- [ ] 既存endpointと命名が一貫している（camelCaseかsnake_caseか）
- [ ] ドキュメント化されている（OpenAPI/Swagger仕様を更新済み）

## 参照

- [references/resources-and-status.md](references/resources-and-status.md) — URL構造、命名の良否例、HTTP method表、status code一覧、よくある誤り
- [references/response-format.md](references/response-format.md) — 成功・コレクション・エラーresponseの具体形とenvelope型定義
- [references/pagination-and-filtering.md](references/pagination-and-filtering.md) — offset / cursor paginationの実装と比較、filtering・sorting・検索・sparse fieldsetの記法
- [references/auth-ratelimit-versioning.md](references/auth-ratelimit-versioning.md) — token形式、認可のコード例、rate limitヘッダとtier、versioning戦略
- [references/implementation-examples.md](references/implementation-examples.md) — TypeScript（Next.js）、Python（DRF）、Go（net/http）の実装例
