# リソース設計とHTTP method・status code

URL構造、命名の良否例、methodの意味、status codeの一覧とよくある誤り。

## URL構造

```
# リソースは名詞・複数形・小文字・kebab-case
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PUT    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

# 関連を表すsub-resource
GET    /api/v1/users/:id/orders
POST   /api/v1/users/:id/orders

# CRUDに対応しない操作（動詞は控えめに使う）
POST   /api/v1/orders/:id/cancel
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
```

## 命名ルール

```
# GOOD
/api/v1/team-members          # 複数語のリソースはkebab-case
/api/v1/orders?status=active  # filteringはquery param
/api/v1/users/123/orders      # 所有関係はnested resource

# BAD
/api/v1/getUsers              # URLに動詞
/api/v1/user                  # 単数形（複数形を使う）
/api/v1/team_members          # URLにsnake_case
/api/v1/users/123/getOrders   # nested resourceに動詞
```

## Methodの意味

| Method | 冪等 | 安全 | 用途 |
|--------|-----------|------|---------|
| GET | Yes | Yes | リソースの取得 |
| POST | No | No | リソースの作成、操作の実行 |
| PUT | Yes | No | リソースの全置換 |
| PATCH | No* | No | リソースの部分更新 |
| DELETE | Yes | No | リソースの削除 |

*PATCHは実装次第で冪等にできる

## Status codeリファレンス

```
# 成功
200 OK                    — GET、PUT、PATCH（response bodyあり）
201 Created               — POST（Locationヘッダを含める）
204 No Content            — DELETE、PUT（response bodyなし）

# クライアントエラー
400 Bad Request           — 検証失敗、不正なJSON
401 Unauthorized          — 認証情報が無い、または無効
403 Forbidden             — 認証済みだが権限が無い
404 Not Found             — リソースが存在しない
409 Conflict              — 重複登録、状態の競合
422 Unprocessable Entity  — 意味的に不正（JSONは妥当、データが不正）
429 Too Many Requests     — rate limit超過

# サーバーエラー
500 Internal Server Error — 想定外の失敗（詳細を決して露出しない）
502 Bad Gateway           — 上流サービスの失敗
503 Service Unavailable   — 一時的な過負荷、Retry-Afterを含める
```

## よくある誤り

```
# BAD: 何でも200
{ "status": 200, "success": false, "error": "Not found" }

# GOOD: HTTP status codeを意味に沿って使う
HTTP/1.1 404 Not Found
{ "error": { "code": "not_found", "message": "User not found" } }

# BAD: 検証エラーに500
# GOOD: フィールド単位の詳細を伴う400または422

# BAD: 作成したリソースに200
# GOOD: Locationヘッダ付きの201
HTTP/1.1 201 Created
Location: /api/v1/users/abc-123
```
