# 入力検証とSQL Injection対策

## ユーザー入力は常に検証する

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

## ファイルアップロードの検証

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

### 確認手順

- [ ] すべてのユーザー入力をschemaで検証している
- [ ] ファイルアップロードを制限している（サイズ、種別、拡張子）
- [ ] ユーザー入力をqueryへ直接使っていない
- [ ] blacklistではなくwhitelistで検証している
- [ ] エラーメッセージが機微な情報を漏らさない

## SQL Injectionの防止

### FAIL: SQLを絶対に連結しない

```typescript
// 危険 - SQL Injectionの脆弱性
const query = `SELECT * FROM users WHERE email = '${userEmail}'`
await db.query(query)
```

### PASS: 常にparameterized queryを使う

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

### 確認手順

- [ ] すべてのDB queryがparameterized queryを使っている
- [ ] SQL内で文字列連結をしていない
- [ ] ORM・query builderを正しく使っている
- [ ] Supabaseのqueryが適切にsanitizeされている
