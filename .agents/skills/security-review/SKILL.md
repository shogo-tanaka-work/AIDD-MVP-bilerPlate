---
name: security-review
description: 認証の追加、ユーザー入力の処理、秘密情報の取り扱い、API endpointの作成、決済や機微な機能の実装を行うときにこのskillを使う。網羅的なセキュリティチェックリストとパターンを提供する。
metadata:
  origin: ECC
---

# Security Review Skill

このskillは、すべてのコードがセキュリティのbest practiceに従うことを保証し、潜在的な脆弱性を特定する。

## 発動タイミング

- 認証や認可を実装するとき
- ユーザー入力やファイルアップロードを扱うとき
- 新しいAPI endpointを作成するとき
- 秘密情報やcredentialsを扱うとき
- 決済機能を実装するとき
- 機微なデータを保存・送信するとき
- サードパーティAPIを連携するとき

## セキュリティチェックリスト

### 1. 秘密情報の管理

#### FAIL: 絶対にしないこと
```typescript
const apiKey = "sk-proj-xxxxx"  // ハードコードされた秘密情報
const dbPassword = "password123" // ソースコード内に記述
```

#### PASS: 常にこうする
```typescript
const apiKey = process.env.OPENAI_API_KEY
const dbUrl = process.env.DATABASE_URL

// 秘密情報が存在するか確認する
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

#### 確認手順
- [ ] APIキー、token、パスワードがハードコードされていない
- [ ] すべての秘密情報が環境変数にある
- [ ] `.env.local` が.gitignoreに入っている
- [ ] git履歴に秘密情報が残っていない
- [ ] 本番の秘密情報がホスティング基盤（Vercel、Railway）にある

### 2. 入力検証

#### ユーザー入力は常に検証する
```typescript
import { z } from 'zod'

// 検証schemaを定義する
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150)
})

// 処理前に検証する
export async function createUser(input: unknown) {
  try {
    const validated = CreateUserSchema.parse(input)
    return await db.users.create(validated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.issues }
    }
    throw error
  }
}
```

#### ファイルアップロードの検証
```typescript
function validateFileUpload(file: File) {
  // サイズ確認（最大5MB）
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error('File too large (max 5MB)')
  }

  // 種別確認
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type')
  }

  // 拡張子確認
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif']
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new Error('Invalid file extension')
  }

  return true
}
```

#### 確認手順
- [ ] すべてのユーザー入力をschemaで検証している
- [ ] ファイルアップロードを制限している（サイズ、種別、拡張子）
- [ ] ユーザー入力をqueryへ直接使っていない
- [ ] blacklistではなくwhitelistで検証している
- [ ] エラーメッセージが機微な情報を漏らさない

### 3. SQL Injectionの防止

#### FAIL: SQLを絶対に連結しない
```typescript
// 危険 - SQL Injectionの脆弱性
const query = `SELECT * FROM users WHERE email = '${userEmail}'`
await db.query(query)
```

#### PASS: 常にparameterized queryを使う
```typescript
// 安全 - parameterized query
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', userEmail)

// raw SQLの場合
await db.query(
  'SELECT * FROM users WHERE email = $1',
  [userEmail]
)
```

#### 確認手順
- [ ] すべてのDB queryがparameterized queryを使っている
- [ ] SQL内で文字列連結をしていない
- [ ] ORM・query builderを正しく使っている
- [ ] Supabaseのqueryが適切にsanitizeされている

### 4. 認証と認可

#### JWT tokenの扱い
```typescript
// FAIL: 誤り: localStorage（XSSに脆弱）
localStorage.setItem('token', token)

// PASS: 正しい: httpOnly cookie
res.setHeader('Set-Cookie',
  `token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`)
```

#### 認可チェック
```typescript
export async function deleteUser(userId: string, requesterId: string) {
  // 必ず最初に認可を確認する
  const requester = await db.users.findUnique({
    where: { id: requesterId }
  })

  if (requester.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    )
  }

  // 削除を実行する
  await db.users.delete({ where: { id: userId } })
}
```

#### Row Level Security（Supabase）
```sql
-- すべてのテーブルでRLSを有効にする
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のデータだけ閲覧できる
CREATE POLICY "Users view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- ユーザーは自分のデータだけ更新できる
CREATE POLICY "Users update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

#### 確認手順
- [ ] tokenをhttpOnly cookieに保存している（localStorageではない）
- [ ] 機微な操作の前に認可チェックがある
- [ ] SupabaseでRow Level Securityを有効にしている
- [ ] ロールベースのアクセス制御を実装している
- [ ] session管理が安全である

### 5. XSSの防止

#### HTMLのsanitize
```typescript
import DOMPurify from 'isomorphic-dompurify'

// ユーザー提供のHTMLは必ずsanitizeする
function renderUserContent(html: string) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p'],
    ALLOWED_ATTR: []
  })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```

#### Content Security Policy

厳しい設定から始め、撤去計画を文書化した場合だけ緩める。
`'unsafe-inline'` や `'unsafe-eval'` を既定にしない。これらはCSPの保護の多くを
無効化するため、一時的な互換性の負債として扱う。

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      base-uri 'self';
      object-src 'none';
      frame-ancestors 'none';
      script-src 'self';
      style-src 'self';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://api.example.com;
    `.replace(/\s{2,}/g, ' ').trim()
  }
]
```

#### 確認手順
- [ ] ユーザー提供のHTMLをsanitizeしている
- [ ] CSPヘッダを設定している
- [ ] 未検証の動的コンテンツを描画していない
- [ ] Reactの組み込みXSS保護を使っている

### 6. CSRF対策

#### CSRF token
```typescript
import { csrf } from '@/lib/csrf'

export async function POST(request: Request) {
  const token = request.headers.get('X-CSRF-Token')

  if (!csrf.verify(token)) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    )
  }

  // requestを処理する
}
```

#### SameSite cookie
```typescript
res.setHeader('Set-Cookie',
  `session=${sessionId}; HttpOnly; Secure; SameSite=Strict`)
```

#### 確認手順
- [ ] 状態を変更する操作にCSRF tokenがある
- [ ] すべてのcookieにSameSite=Strictを設定している
- [ ] double-submit cookieパターンを実装している

### 7. Rate Limiting

#### APIのrate limiting
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

#### コストの高い操作
```typescript
// 検索には厳しめのrate limiting
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分
  max: 10, // 1分当たり10 request
  message: 'Too many search requests'
})

app.use('/api/search', searchLimiter)
```

#### 確認手順
- [ ] すべてのAPI endpointにrate limitingがある
- [ ] コストの高い操作には厳しい上限を設けている
- [ ] IPベースのrate limitingがある
- [ ] ユーザーベースのrate limitingがある（認証済み）

### 8. 機微データの露出

#### ログ
```typescript
// FAIL: 誤り: 機微データをログ出力している
console.log('User login:', { email, password })
console.log('Payment:', { cardNumber, cvv })

// PASS: 正しい: 機微データをredactする
console.log('User login:', { email, userId })
console.log('Payment:', { last4: card.last4, userId })
```

#### エラーメッセージ
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

#### 確認手順
- [ ] ログにパスワード、token、秘密情報がない
- [ ] 利用者向けのエラーメッセージが一般的である
- [ ] 詳細なエラーはサーバーログにだけ出る
- [ ] stack traceを利用者へ露出していない

### 9. ブロックチェーンのセキュリティ（Solana）

#### walletの検証
```typescript
import { verify } from '@solana/web3.js'

async function verifyWalletOwnership(
  publicKey: string,
  signature: string,
  message: string
) {
  try {
    const isValid = verify(
      Buffer.from(message),
      Buffer.from(signature, 'base64'),
      Buffer.from(publicKey, 'base64')
    )
    return isValid
  } catch (error) {
    return false
  }
}
```

#### transactionの検証
```typescript
async function verifyTransaction(transaction: Transaction) {
  // 受取先を検証する
  if (transaction.to !== expectedRecipient) {
    throw new Error('Invalid recipient')
  }

  // 金額を検証する
  if (transaction.amount > maxAmount) {
    throw new Error('Amount exceeds limit')
  }

  // 残高が十分か検証する
  const balance = await getBalance(transaction.from)
  if (balance < transaction.amount) {
    throw new Error('Insufficient balance')
  }

  return true
}
```

#### 確認手順
- [ ] walletの署名を検証している
- [ ] transactionの内容を検証している
- [ ] transaction前に残高を確認している
- [ ] 内容を確認しないtransaction署名がない

### 10. 依存関係のセキュリティ

#### 定期的な更新
```bash
# 脆弱性を確認する
npm audit

# 自動修正できる問題を修正する
npm audit fix

# 依存関係を更新する
npm update

# 古いパッケージを確認する
npm outdated
```

#### Lockファイル
```bash
# lockファイルは必ずcommitする
git add package-lock.json

# 再現可能なbuildのためCI/CDで使う
npm ci  # npm installの代わりに
```

#### 確認手順
- [ ] 依存関係が最新である
- [ ] 既知の脆弱性がない（npm auditがクリーン）
- [ ] lockファイルをcommitしている
- [ ] GitHubでDependabotを有効にしている
- [ ] 定期的にセキュリティ更新をしている

## セキュリティテスト

### 自動セキュリティテスト
```typescript
// 認証のテスト
test('requires authentication', async () => {
  const response = await fetch('/api/protected')
  expect(response.status).toBe(401)
})

// 認可のテスト
test('requires admin role', async () => {
  const response = await fetch('/api/admin', {
    headers: { Authorization: `Bearer ${userToken}` }
  })
  expect(response.status).toBe(403)
})

// 入力検証のテスト
test('rejects invalid input', async () => {
  const response = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' })
  })
  expect(response.status).toBe(400)
})

// rate limitingのテスト
test('enforces rate limits', async () => {
  const requests = Array(101).fill(null).map(() =>
    fetch('/api/endpoint')
  )

  const responses = await Promise.all(requests)
  const tooManyRequests = responses.filter(r => r.status === 429)

  expect(tooManyRequests.length).toBeGreaterThan(0)
})
```

## deploy前のセキュリティチェックリスト

本番deployの前に必ず確認する。

- [ ] **秘密情報**: ハードコードされた秘密情報がなく、すべて環境変数にある
- [ ] **入力検証**: すべてのユーザー入力を検証している
- [ ] **SQL Injection**: すべてのqueryをparameterizeしている
- [ ] **XSS**: ユーザーコンテンツをsanitizeしている
- [ ] **CSRF**: 対策を有効にしている
- [ ] **認証**: tokenを適切に扱っている
- [ ] **認可**: ロールチェックを組み込んでいる
- [ ] **Rate Limiting**: すべてのendpointで有効にしている
- [ ] **HTTPS**: 本番で強制している
- [ ] **セキュリティヘッダ**: CSP、X-Frame-Optionsを設定している
- [ ] **エラー処理**: エラーに機微データが含まれない
- [ ] **ログ**: 機微データをログ出力していない
- [ ] **依存関係**: 最新で脆弱性がない
- [ ] **Row Level Security**: Supabaseで有効にしている
- [ ] **CORS**: 適切に設定している
- [ ] **ファイルアップロード**: 検証している（サイズ、種別）
- [ ] **walletの署名**: 検証している（ブロックチェーン利用時）

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/security)
- [Supabase Security](https://supabase.com/docs/guides/auth)
- [Web Security Academy](https://portswigger.net/web-security)

---

**留意**: セキュリティは任意ではない。脆弱性が一つあればプラットフォーム全体が危険にさらされる。迷ったら安全側に倒す。
