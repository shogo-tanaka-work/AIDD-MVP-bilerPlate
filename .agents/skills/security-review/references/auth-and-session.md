# 認証・認可・CSRF

## JWT tokenの扱い

```typescript
// FAIL: 誤り: localStorage（XSSに脆弱）
localStorage.setItem('token', token)

// PASS: 正しい: httpOnly cookie
res.setHeader('Set-Cookie',
  `token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`)
```

## 認可チェック

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

## Row Level Security（Supabase）

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

### 確認手順

- [ ] tokenをhttpOnly cookieに保存している（localStorageではない）
- [ ] 機微な操作の前に認可チェックがある
- [ ] SupabaseでRow Level Securityを有効にしている
- [ ] ロールベースのアクセス制御を実装している
- [ ] session管理が安全である

## CSRF対策

### CSRF token

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

### SameSite cookie

```typescript
res.setHeader('Set-Cookie',
  `session=${sessionId}; HttpOnly; Secure; SameSite=Strict`)
```

### 確認手順

- [ ] 状態を変更する操作にCSRF tokenがある
- [ ] すべてのcookieにSameSite=Strictを設定している
- [ ] double-submit cookieパターンを実装している
