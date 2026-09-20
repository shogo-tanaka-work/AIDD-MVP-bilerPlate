# 認証と認可の実装例

JWT検証（認証）とロールベースのアクセス制御（認可）。原則は常時ロードされる`.agents/rules/security.md`と`.agents/rules/secrets.md`に従う。

## JWT Tokenの検証

```typescript
import jwt from 'jsonwebtoken'

interface JWTPayload {
  userId: string
  email: string
  role: 'admin' | 'user'
}

export function verifyToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
    return payload
  } catch (error) {
    throw new ApiError(401, 'Invalid token')
  }
}

export async function requireAuth(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    throw new ApiError(401, 'Missing authorization token')
  }

  return verifyToken(token)
}

// API routeでの使い方
export async function GET(request: Request) {
  const user = await requireAuth(request)

  const data = await getDataForUser(user.userId)

  return NextResponse.json({ success: true, data })
}
```

`JWT_SECRET`は起動時にschemaで存在と長さを検証し、未設定なら起動を止める（fail closed）。

## ロールベースのアクセス制御

roleと権限の対応を1つの定数に集約し、認可はhandlerをラップする高階関数で強制する。

```typescript
type Permission = 'read' | 'write' | 'delete' | 'admin'

interface User {
  id: string
  role: 'admin' | 'moderator' | 'user'
}

const rolePermissions: Record<User['role'], Permission[]> = {
  admin: ['read', 'write', 'delete', 'admin'],
  moderator: ['read', 'write', 'delete'],
  user: ['read', 'write']
}

export function hasPermission(user: User, permission: Permission): boolean {
  return rolePermissions[user.role].includes(permission)
}

export function requirePermission(permission: Permission) {
  return (handler: (request: Request, user: User) => Promise<Response>) => {
    return async (request: Request) => {
      const user = await requireAuth(request)

      if (!hasPermission(user, permission)) {
        throw new ApiError(403, 'Insufficient permissions')
      }

      return handler(request, user)
    }
  }
}

// 使い方 - 高階関数がhandlerをラップする
export const DELETE = requirePermission('delete')(
  async (request: Request, user: User) => {
    // handlerは権限を検証済みの認証ユーザーを受け取る
    return new Response('Deleted', { status: 200 })
  }
)
```

role確認だけでは足りないリソース（他人の注文など）は、handler内で所有権（`resource.userId === user.id`）も確認する。
