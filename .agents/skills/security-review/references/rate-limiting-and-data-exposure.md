# Rate Limitingと機微データの露出防止

## Rate Limiting

### APIのrate limiting

```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // window当たり100 request
  message: 'Too many requests'
})

// routeへ適用する
app.use('/api/', limiter)
```

### コストの高い操作

```typescript
// 検索には厳しめのrate limiting
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分
  max: 10, // 1分当たり10 request
  message: 'Too many search requests'
})

app.use('/api/search', searchLimiter)
```

### 確認手順

- [ ] すべてのAPI endpointにrate limitingがある
- [ ] コストの高い操作には厳しい上限を設けている
- [ ] IPベースのrate limitingがある
- [ ] ユーザーベースのrate limitingがある（認証済み）

## 機微データの露出

### ログ

```typescript
// FAIL: 誤り: 機微データをログ出力している
console.log('User login:', { email, password })
console.log('Payment:', { cardNumber, cvv })

// PASS: 正しい: 機微データをredactする
console.log('User login:', { email, userId })
console.log('Payment:', { last4: card.last4, userId })
```

### エラーメッセージ

```typescript
// FAIL: 誤り: 内部の詳細を露出している
catch (error) {
  return NextResponse.json(
    { error: error.message, stack: error.stack },
    { status: 500 }
  )
}

// PASS: 正しい: 一般的なエラーメッセージ
catch (error) {
  console.error('Internal error:', error)
  return NextResponse.json(
    { error: 'An error occurred. Please try again.' },
    { status: 500 }
  )
}
```

### 確認手順

- [ ] ログにパスワード、token、秘密情報がない
- [ ] 利用者向けのエラーメッセージが一般的である
- [ ] 詳細なエラーはサーバーログにだけ出る
- [ ] stack traceを利用者へ露出していない
