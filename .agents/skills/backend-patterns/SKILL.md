---
name: backend-patterns
description: Node.js、Express、Next.js API routeのためのbackendアーキテクチャパターン、API設計、database最適化、server-sideのベストプラクティス。Node.js、Express、Next.jsのAPI routeとそのdata accessを実装・レビューするときに使う。
metadata:
  origin: ECC
---

# Backend開発パターン

スケールするserver-sideアプリケーションのためのbackendアーキテクチャパターン。判断基準を本文に置き、実装例は`references/`に分ける。

## 適用する場面

- REST・GraphQLのAPI endpointを設計するとき
- repository、service、controller層を実装するとき
- database queryを最適化するとき（N+1、index、connection pooling）
- cacheを追加するとき（Redis、in-memory、HTTP cache header）
- background jobや非同期処理を構築するとき
- APIのエラー処理とvalidationを構造化するとき
- middlewareを実装するとき（認証、logging、rate limiting）

## 判断基準

副作用の境界寄せ、エラーの文脈付与、入力検証、認可の強制、秘密値の扱いは常時ロードされる`.agents/rules/`（code-design / error-handling / security / secrets）に従う。ここではbackend固有の判断だけを扱う。

### 層の分離

- Route/Controllerは入力取得・検証・Service呼び出し・response変換に限定する。
- 業務ロジックはServiceに置き、data accessはRepository interfaceの背後に隠す。Serviceは具象DBクライアントを直接触らない。
- 横断関心（認証、logging、rate limiting）はmiddlewareまたは高階関数でhandlerをラップする。
- URLはリソース名詞ベースにし、filter・sort・paginationはquery parameterで表す。HTTP契約の詳細は`api-design` skillに従う。

### Data access

- 必要なカラムだけをselectし、一覧queryには必ずlimitを付ける。
- ループ内でqueryを発行しない。IDを集めて一括取得し、Mapで結合する。
- 複数テーブルへの書き込みはtransaction（DB関数・RPC）で原子性を保証する。
- cacheはRepositoryをラップするdecoratorとして実装し、TTLとinvalidation経路をセットで設計する。cache miss時のみDBへ行く（cache-aside）。

### エラー処理と再試行

- HTTP status code付きの`ApiError`とvalidation errorの変換を、1つのerror handlerに集約する。
- 外部呼び出しの再試行は指数バックオフで上限回数を設け、冪等な操作にだけ適用する。

### 認証・認可・rate limiting

- token検証（認証）と権限判定（認可）を別関数に分け、認可はhandlerをラップする高階関数で強制する。roleと権限の対応は1つの定数に集約する。
- rate limitingは共有store（Redis、gateway、プラットフォーム標準のlimiter）で行う。プロセスごとのin-memory counterはdeployでリセットされ、replica間で分断され、serverlessではfail openになるため本番で使わない。悪用ケースのレビューは`security-review`を使う。

### Background jobとlogging

- 時間のかかる処理はqueueへ積み、request handlerはjob受付だけを返す。本番は永続queue（DB、Redis、マネージドqueue）を使い、in-memory queueは開発・検証用途に留める。
- ログは1行1JSONの構造化ログにし、requestIdで一連の処理を追えるようにする。

## チェックリスト

- [ ] Route/Controllerに業務ロジックやSQLが漏れていない
- [ ] RepositoryがinterfaceでServiceから分離されている
- [ ] 一覧queryにlimitと必要カラムの指定がある
- [ ] ループ内query・ループ内awaitによるN+1が無い
- [ ] 複数テーブル更新がtransactionで包まれている
- [ ] cacheにTTLとinvalidation経路がある
- [ ] error handlerが集約され、500で内部詳細を返さない
- [ ] 認可がhandler境界で強制されている
- [ ] rate limitingが共有storeで動く
- [ ] ログが構造化され、requestIdを持つ

## 参照

- [references/layering.md](references/layering.md) — RESTful構造、Repository・Service・Middlewareの実装例
- [references/data-access.md](references/data-access.md) — query最適化、N+1回避、transaction、Redis cache層とcache-aside
- [references/error-handling.md](references/error-handling.md) — 集約error handlerと指数バックオフ再試行
- [references/auth.md](references/auth.md) — JWT検証とロールベースアクセス制御
- [references/jobs-and-logging.md](references/jobs-and-logging.md) — queueによる非同期処理と構造化logging
