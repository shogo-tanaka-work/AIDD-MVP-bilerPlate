# Response形式

成功・コレクション・エラーresponseの具体形と、envelopeの選択肢。

## 成功response

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

## コレクションresponse（paginationあり）

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

## エラーresponse

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

`code`は機械判定用の安定した識別子、`message`は人向けの説明。`details`は検証エラーなどフィールド単位の情報がある場合だけ含める。

## Response envelopeの選択肢

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

どちらを選んでも、同一API内で混在させない。
