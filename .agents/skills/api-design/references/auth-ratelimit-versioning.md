# 認証・rate limiting・versioning

token形式、認可のコード例、rate limitヘッダとtier、versioning戦略。認証と認可の分離や入力検証の原則は常時ロードされる`.agents/rules/security.md`に従う。

## Tokenベース認証

```
# Authorizationヘッダのbearer token
GET /api/v1/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# API key（server間通信向け）
GET /api/v1/data
X-API-Key: sk_live_abc123
```

## 認可パターン

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

他人のリソースの存在を隠したい場合は、403ではなく404を返す方針をAPI全体で統一する。

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

数値は出発点。実際の上限はプロジェクトの`docs/`で決める。

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
