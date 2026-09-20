# Pagination、filtering、sorting、search

offset / cursor paginationの実装と比較、query parameterの記法。

## Offsetベース（シンプル）

```
GET /api/v1/users?page=2&per_page=20

# 実装
SELECT * FROM users
ORDER BY created_at DESC
LIMIT 20 OFFSET 20;
```

**利点:** 実装が容易、「N ページ目へ移動」に対応できる
**欠点:** 大きなoffsetで遅い（OFFSET 100000）、同時insertがあると結果が不安定

## Cursorベース（スケーラブル）

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

## 使い分け

| ユースケース | paginationの種類 |
|----------|----------------|
| 管理dashboard、小規模データ（1万件未満） | Offset |
| 無限スクロール、フィード、大規模データ | Cursor |
| 公開API | Cursor（既定）＋Offset（任意） |
| 検索結果 | Offset（利用者はページ番号を期待する） |

## Filtering

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

## Sorting

```
# 単一フィールド（降順は先頭に-）
GET /api/v1/products?sort=-created_at

# 複数フィールド（カンマ区切り）
GET /api/v1/products?sort=-featured,price,-created_at
```

sort可能なフィールドは許可リストで限定し、任意のカラム名を受け付けない。

## 全文検索

```
# 検索用query parameter
GET /api/v1/products?q=wireless+headphones

# フィールド指定の検索
GET /api/v1/users?email=alice
```

## Sparse fieldset

```
# 指定したフィールドだけ返す（payloadを削減する）
GET /api/v1/users?fields=id,name,email
GET /api/v1/orders?fields=id,total,status&include=customer.name
```
