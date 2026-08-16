---
name: api-design
description: 本番APIのためのREST API設計パターン。リソース命名、status code、pagination、filtering、error response、versioning、rate limitingを扱う。REST endpoint、リソース名、status code、pagination、versioningを設計・レビューするときに使う。
metadata:
  origin: ECC
---

# API設計パターン

一貫性があり開発者にとって扱いやすいREST APIを設計するための規約とベストプラクティス。

## 発動タイミング

- 新しいAPI endpointを設計するとき
- 既存のAPI contractをレビューするとき
- pagination、filtering、sortingを追加するとき
- APIのerror handlingを実装するとき
- APIのversioning戦略を検討するとき
- 公開APIやパートナー向けAPIを構築するとき

## リソース設計

### URL構造

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

### 命名ルール

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

## HTTP methodとstatus code

### Methodの意味

| Method | 冪等 | 安全 | 用途 |
|--------|-----------|------|---------|
| GET | Yes | Yes | リソースの取得 |
| POST | No | No | リソースの作成、操作の実行 |
| PUT | Yes | No | リソースの全置換 |
| PATCH | No* | No | リソースの部分更新 |
| DELETE | Yes | No | リソースの削除 |

*PATCHは実装次第で冪等にできる

### Status codeリファレンス

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

### よくある誤り

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

## Response形式

### 成功response

```json
{
  "data": {
    "id": "abc-123",
    "email": "alice@example.com",
    "name": "Alice",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

### コレクションresponse（paginationあり）

```json
{
  "data": [
    { "id": "abc-123", "name": "Alice" },
    { "id": "def-456", "name": "Bob" }
  ],
  "meta": {
    "total": 142,
    "page": 1,
    "per_page": 20,
    "total_pages": 8
  },
  "links": {
    "self": "/api/v1/users?page=1&per_page=20",
    "next": "/api/v1/users?page=2&per_page=20",
    "last": "/api/v1/users?page=8&per_page=20"
  }
}
```

### エラーresponse

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address",
        "code": "invalid_format"
      },
      {
        "field": "age",
        "message": "Must be between 0 and 150",
        "code": "out_of_range"
      }
    ]
  }
}
```

### Response envelopeの選択肢

```typescript
// 選択肢A: dataでラップするenvelope（公開APIに推奨）
interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
  links?: PaginationLinks;
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: FieldError[];
  };
}

// 選択肢B: フラットなresponse（単純で、内部APIでよく使われる）
// 成功: リソースをそのまま返す
// エラー: errorオブジェクトを返す
// 区別はHTTP status codeで行う
```

## Pagination

### Offsetベース（シンプル）

```
GET /api/v1/users?page=2&per_page=20

# 実装
SELECT * FROM users
ORDER BY created_at DESC
LIMIT 20 OFFSET 20;
```

**利点:** 実装が容易、「N ページ目へ移動」に対応できる
**欠点:** 大きなoffsetで遅い（OFFSET 100000）、同時insertがあると結果が不安定

### Cursorベース（スケーラブル）

```
GET /api/v1/users?cursor=eyJpZCI6MTIzfQ&limit=20

# 実装
SELECT * FROM users
WHERE id > :cursor_id
ORDER BY id ASC
LIMIT 21;  -- has_next判定のため1件多く取得する
```

```json
{
  "data": [...],
  "meta": {
    "has_next": true,
    "next_cursor": "eyJpZCI6MTQzfQ"
  }
}
```

**利点:** 位置によらず性能が一定、同時insertがあっても安定
**欠点:** 任意のページへ移動できない、cursorが不透明

### 使い分け

| ユースケース | paginationの種類 |
|----------|----------------|
| 管理dashboard、小規模データ（1万件未満） | Offset |
| 無限スクロール、フィード、大規模データ | Cursor |
| 公開API | Cursor（既定）＋Offset（任意） |
| 検索結果 | Offset（利用者はページ番号を期待する） |

## Filtering、sorting、search

### Filtering

```
# 単純な等価
GET /api/v1/orders?status=active&customer_id=abc-123

# 比較演算子（bracket記法を使う）
GET /api/v1/products?price[gte]=10&price[lte]=100
GET /api/v1/orders?created_at[after]=2025-01-01

# 複数値（カンマ区切り）
GET /api/v1/products?category=electronics,clothing

# ネストしたフィールド（ドット記法）
GET /api/v1/orders?customer.country=US
```

### Sorting

```
# 単一フィールド（降順は先頭に-）
GET /api/v1/products?sort=-created_at

# 複数フィールド（カンマ区切り）
GET /api/v1/products?sort=-featured,price,-created_at
```

### 全文検索

```
# 検索用query parameter
GET /api/v1/products?q=wireless+headphones

# フィールド指定の検索
GET /api/v1/users?email=alice
```

### Sparse fieldset

```
# 指定したフィールドだけ返す（payloadを削減する）
GET /api/v1/users?fields=id,name,email
GET /api/v1/orders?fields=id,total,status&include=customer.name
```

## 認証と認可

### Tokenベース認証

```
# Authorizationヘッダのbearer token
GET /api/v1/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# API key（server間通信向け）
GET /api/v1/data
X-API-Key: sk_live_abc123
```

### 認可パターン

```typescript
// リソース単位: 所有権を確認する
app.get("/api/v1/orders/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: { code: "not_found" } });
  if (order.userId !== req.user.id) return res.status(403).json({ error: { code: "forbidden" } });
  return res.json({ data: order });
});

// roleベース: 権限を確認する
app.delete("/api/v1/users/:id", requireRole("admin"), async (req, res) => {
  await User.delete(req.params.id);
  return res.status(204).send();
});
```

## Rate limiting

### ヘッダ

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000

# 超過時
HTTP/1.1 429 Too Many Requests
Retry-After: 60
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 60 seconds."
  }
}
```

### Rate limitのtier

| Tier | 上限 | 単位期間 | ユースケース |
|------|-------|--------|----------|
| Anonymous | 30/min | IPごと | 公開endpoint |
| Authenticated | 100/min | ユーザーごと | 標準のAPIアクセス |
| Premium | 1000/min | API keyごと | 有料APIプラン |
| Internal | 10000/min | サービスごと | サービス間通信 |

## Versioning

### URL pathでのversioning（推奨）

```
/api/v1/users
/api/v2/users
```

**利点:** 明示的、routingが容易、cache可能
**欠点:** version間でURLが変わる

### ヘッダでのversioning

```
GET /api/users
Accept: application/vnd.myapp.v2+json
```

**利点:** URLがきれい
**欠点:** testしにくい、指定を忘れやすい

### Versioning戦略

```
1. /api/v1/ から始める — 必要になるまでversionを切らない
2. 同時に維持するactive versionは最大2つ（現行＋直前）
3. 廃止のタイムライン:
   - 廃止を告知する（公開APIは6か月前の予告）
   - Sunsetヘッダを追加する: Sunset: Sat, 01 Jan 2026 00:00:00 GMT
   - sunset日以降は410 Goneを返す
4. 破壊的でない変更に新versionは不要:
   - responseへのフィールド追加
   - 任意のquery parameterの追加
   - endpointの追加
5. 破壊的変更には新versionが必要:
   - フィールドの削除・改名
   - フィールド型の変更
   - URL構造の変更
   - 認証方式の変更
```

## 実装パターン

### TypeScript（Next.js API Route）

```typescript
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: parsed.error.issues.map(i => ({
          field: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      },
    }, { status: 422 });
  }

  const user = await createUser(parsed.data);

  return NextResponse.json(
    { data: user },
    {
      status: 201,
      headers: { Location: `/api/v1/users/${user.id}` },
    },
  );
}
```

### Python（Django REST Framework）

```python
from rest_framework import serializers, viewsets, status
from rest_framework.response import Response

class CreateUserSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=100)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "created_at"]

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return CreateUserSerializer
        return UserSerializer

    def create(self, request):
        serializer = CreateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = UserService.create(**serializer.validated_data)
        return Response(
            {"data": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/v1/users/{user.id}"},
        )
```

### Go（net/http）

```go
func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid_json", "Invalid request body")
        return
    }

    if err := req.Validate(); err != nil {
        writeError(w, http.StatusUnprocessableEntity, "validation_error", err.Error())
        return
    }

    user, err := h.service.Create(r.Context(), req)
    if err != nil {
        switch {
        case errors.Is(err, domain.ErrEmailTaken):
            writeError(w, http.StatusConflict, "email_taken", "Email already registered")
        default:
            writeError(w, http.StatusInternalServerError, "internal_error", "Internal error")
        }
        return
    }

    w.Header().Set("Location", fmt.Sprintf("/api/v1/users/%s", user.ID))
    writeJSON(w, http.StatusCreated, map[string]any{"data": user})
}
```

## API設計チェックリスト

新しいendpointをリリースする前に:

- [ ] リソースURLが命名規約に沿っている（複数形、kebab-case、動詞なし）
- [ ] 正しいHTTP methodを使っている（読み取りはGET、作成はPOSTなど）
- [ ] 適切なstatus codeを返している（何でも200にしていない）
- [ ] 入力をschemaで検証している（Zod、Pydantic、Bean Validation）
- [ ] error responseがcodeとmessageを含む標準形式に従っている
- [ ] 一覧endpointにpaginationを実装している（cursorまたはoffset）
- [ ] 認証が必要（または明示的に公開と示している）
- [ ] 認可を確認している（利用者は自分のリソースにのみアクセスできる）
- [ ] rate limitingを設定している
- [ ] responseが内部の詳細を漏らさない（stack trace、SQLエラー）
- [ ] 既存endpointと命名が一貫している（camelCaseかsnake_caseか）
- [ ] ドキュメント化されている（OpenAPI/Swagger仕様を更新済み）
