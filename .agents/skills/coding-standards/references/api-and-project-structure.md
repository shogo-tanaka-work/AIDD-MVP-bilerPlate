# API規約とファイル構成

endpoint設計・pagination・versioningの詳細は `api-design`、repository/service層は `backend-patterns` を一次情報源にする。ここではコード品質レビューで揃えるべき形式だけを扱う。

## REST APIの規約

```
GET    /api/markets              # 全marketの一覧取得
GET    /api/markets/:id          # 特定のmarketを取得
POST   /api/markets              # 新しいmarketを作成
PUT    /api/markets/:id          # marketを更新（全体）
PATCH  /api/markets/:id          # marketを更新（部分）
DELETE /api/markets/:id          # marketを削除

# 絞り込み用のquery parameter
GET /api/markets?status=active&limit=10&offset=0
```

## responseの形式

```typescript
// PASS: GOOD: 一貫したresponse構造
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// 成功response
return NextResponse.json({
  success: true,
  data: markets,
  meta: { total: 100, page: 1, limit: 10 }
})

// エラーresponse
return NextResponse.json({
  success: false,
  error: 'Invalid request'
}, { status: 400 })
```

## 入力検証

```typescript
import { z } from 'zod'

// PASS: GOOD: schemaによる検証
const CreateMarketSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  endDate: z.string().datetime(),
  categories: z.array(z.string()).min(1)
})

export async function POST(request: Request) {
  const body = await request.json()

  try {
    const validated = CreateMarketSchema.parse(body)
    // 検証済みdataで処理を続ける
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.issues
      }, { status: 400 })
    }
  }
}
```

## databaseのquery

```typescript
// PASS: GOOD: 必要なcolumnだけを選択する
const { data } = await supabase
  .from('markets')
  .select('id, name, status')
  .limit(10)

// FAIL: BAD: すべてを選択する
const { data } = await supabase
  .from('markets')
  .select('*')
```

## プロジェクト構造

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API route
│   ├── markets/           # marketページ
│   └── (auth)/           # 認証ページ（route group）
├── components/            # React component
│   ├── ui/               # 汎用UI component
│   ├── forms/            # form component
│   └── layouts/          # layout component
├── hooks/                # custom React hook
├── lib/                  # utilityと設定
│   ├── api/             # API client
│   ├── utils/           # helper関数
│   └── constants/       # 定数
├── types/                # TypeScriptの型
└── styles/              # global style
```

## ファイルの命名

```
components/Button.tsx          # componentはPascalCase
hooks/useAuth.ts              # camelCaseで'use'をprefixにする
lib/formatDate.ts             # utilityはcamelCase
types/market.types.ts         # camelCaseに.types suffixを付ける
```
