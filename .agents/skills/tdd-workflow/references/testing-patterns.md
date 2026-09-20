# Testingのパターン

## Testファイルの構成

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx          # Unit test
│   │   └── Button.stories.tsx       # Storybook
│   └── MarketCard/
│       ├── MarketCard.tsx
│       └── MarketCard.test.tsx
├── app/
│   └── api/
│       └── markets/
│           ├── route.ts
│           └── route.test.ts         # Integration test
└── e2e/
    ├── markets.spec.ts               # E2E test
    ├── trading.spec.ts
    └── auth.spec.ts
```

## Unit Testのパターン（Jest/Vitest）

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click</Button>)

    fireEvent.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

Bunネイティブrunner（`bun:test`）の例は`test-runner-detection.md`を参照する。

## API Integration Testのパターン

```typescript
import { NextRequest } from 'next/server'
import { GET } from './route'

describe('GET /api/markets', () => {
  it('returns markets successfully', async () => {
    const request = new NextRequest('http://localhost/api/markets')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })

  it('validates query parameters', async () => {
    const request = new NextRequest('http://localhost/api/markets?limit=invalid')
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('handles database errors gracefully', async () => {
    // databaseの失敗をmockする
    const request = new NextRequest('http://localhost/api/markets')
    // errorハンドリングのテスト
  })
})
```

## E2E Testのパターン（Playwright）

Page Object Model、設定、flaky対策の詳細は`e2e-testing` skillを参照する。

```typescript
import { test, expect } from '@playwright/test'

test('user can search and filter markets', async ({ page }) => {
  await page.goto('/')
  await page.click('a[href="/markets"]')
  await expect(page.locator('h1')).toContainText('Markets')

  // marketを検索する
  await page.fill('input[placeholder="Search markets"]', 'election')

  // 検索結果が表示されたことを確認する（自動待機するassertionを使い、固定sleepは避ける）
  const results = page.locator('[data-testid="market-card"]')
  await expect(results).toHaveCount(5, { timeout: 5000 })
  await expect(results.first()).toContainText('election', { ignoreCase: true })

  // statusで絞り込む
  await page.click('button:has-text("Active")')
  await expect(results).toHaveCount(3)
})

test('user can create a new market', async ({ page }) => {
  await page.goto('/creator-dashboard')

  await page.fill('input[name="name"]', 'Test Market')
  await page.fill('textarea[name="description"]', 'Test description')
  await page.fill('input[name="endDate"]', '2025-12-31')
  await page.click('button[type="submit"]')

  await expect(page.locator('text=Market created successfully')).toBeVisible()
  await expect(page).toHaveURL(/\/markets\/test-market/)
})
```

## 外部サービスのmock

### Supabaseのmock

```typescript
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({
          data: [{ id: 1, name: 'Test Market' }],
          error: null
        }))
      }))
    }))
  }
}))
```

### Redisのmock

```typescript
jest.mock('@/lib/redis', () => ({
  searchMarketsByVector: jest.fn(() => Promise.resolve([
    { slug: 'test-market', similarity_score: 0.95 }
  ])),
  checkRedisHealth: jest.fn(() => Promise.resolve({ connected: true }))
}))
```

### OpenAIのmock

```typescript
jest.mock('@/lib/openai', () => ({
  generateEmbedding: jest.fn(() => Promise.resolve(
    new Array(1536).fill(0.1) // 1536次元embeddingのmock
  ))
}))
```

## 避けるべきよくあるtestの誤り

### 実装の詳細ではなく、利用者に見える振る舞いをテストする

```typescript
// 誤り: 内部stateをテストしている
expect(component.state.count).toBe(5)

// 正しい: 利用者が見るものをテストする
expect(screen.getByText('Count: 5')).toBeInTheDocument()
```

### 壊れやすいselectorではなく、意味のあるselectorを使う

```typescript
// 誤り: CSS classはすぐ壊れる
await page.click('.css-class-xyz')

// 正しい: テキストやdata-testidは変更に強い
await page.click('button:has-text("Submit")')
await page.click('[data-testid="submit-button"]')
```

### testを互いに依存させず、各testが自前のデータを用意する

```typescript
// 誤り: 前のtestが作ったデータに依存している
test('creates user', () => { /* ... */ })
test('updates same user', () => { /* 前のtestに依存している */ })

// 正しい: 各testが独立している
test('creates user', () => {
  const user = createTestUser()
  // テストのロジック
})

test('updates user', () => {
  const user = createTestUser()
  // 更新のロジック
})
```
