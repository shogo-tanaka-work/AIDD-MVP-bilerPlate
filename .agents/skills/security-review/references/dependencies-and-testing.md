# 依存関係のセキュリティとセキュリティテスト

## 依存関係のセキュリティ

### 定期的な更新

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

### Lockファイル

```bash
# lockファイルは必ずcommitする
git add package-lock.json

# 再現可能なbuildのためCI/CDで使う
npm ci  # npm installの代わりに
```

### 確認手順

- [ ] 依存関係が最新である
- [ ] 既知の脆弱性がない（npm auditがクリーン）
- [ ] lockファイルをcommitしている
- [ ] GitHubでDependabotを有効にしている
- [ ] 定期的にセキュリティ更新をしている

## 秘密情報の確認手順

原則は `.agents/rules/secrets.md` に従う。レビュー時は次を確認する。

- [ ] APIキー、token、パスワードがハードコードされていない
- [ ] すべての秘密情報が環境変数にあり、存在しない場合は起動時に失敗する
- [ ] `.env.local` が.gitignoreに入っている
- [ ] git履歴に秘密情報が残っていない
- [ ] 本番の秘密情報がホスティング基盤（Vercel、Railway）にある

## 自動セキュリティテスト

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
