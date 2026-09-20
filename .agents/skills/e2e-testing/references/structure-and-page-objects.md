# testファイルの構成とPage Object Model

## testファイルの構成

```
tests/
├── e2e/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   ├── logout.spec.ts
│   │   └── register.spec.ts
│   ├── features/
│   │   ├── browse.spec.ts
│   │   ├── search.spec.ts
│   │   └── create.spec.ts
│   └── api/
│       └── endpoints.spec.ts
├── fixtures/
│   ├── auth.ts
│   └── data.ts
└── playwright.config.ts
```

- `e2e/`配下は機能領域ごとにディレクトリを切る
- 認証状態やテストデータの準備は`fixtures/`へ隔離し、各specから再利用する
- page objectは`pages/`（または`tests/pages/`）に置き、specから相対importする

## Page Object Model (POM)

ページ固有のlocatorと操作をクラスへ閉じ込め、specは「利用者の操作」と「期待」だけを書く。

```typescript
import { Page, Locator } from '@playwright/test'

export class ItemsPage {
  readonly page: Page
  readonly searchInput: Locator
  readonly itemCards: Locator
  readonly createButton: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.locator('[data-testid="search-input"]')
    this.itemCards = page.locator('[data-testid="item-card"]')
    this.createButton = page.locator('[data-testid="create-btn"]')
  }

  async goto() {
    await this.page.goto('/items')
    await this.page.waitForLoadState('networkidle')
  }

  async search(query: string) {
    await this.searchInput.fill(query)
    await this.page.waitForResponse(resp => resp.url().includes('/api/search'))
    await this.page.waitForLoadState('networkidle')
  }

  async getItemCount() {
    return await this.itemCards.count()
  }
}
```

- locatorは`constructor`で一度だけ定義し、操作メソッドはlocatorを再利用する
- 操作メソッドは「完了を待つ」ところまで責任を持つ（`waitForResponse`など）。呼び出し側に恣意的な待機を書かせない
- assertionはpage objectに入れず、specに置く

## testの構造

```typescript
import { test, expect } from '@playwright/test'
import { ItemsPage } from '../../pages/ItemsPage'

test.describe('Item Search', () => {
  let itemsPage: ItemsPage

  test.beforeEach(async ({ page }) => {
    itemsPage = new ItemsPage(page)
    await itemsPage.goto()
  })

  test('should search by keyword', async ({ page }) => {
    await itemsPage.search('test')

    const count = await itemsPage.getItemCount()
    expect(count).toBeGreaterThan(0)

    await expect(itemsPage.itemCards.first()).toContainText(/test/i)
    await page.screenshot({ path: 'artifacts/search-results.png' })
  })

  test('should handle no results', async ({ page }) => {
    await itemsPage.search('xyznonexistent123')

    await expect(page.locator('[data-testid="no-results"]')).toBeVisible()
    expect(await itemsPage.getItemCount()).toBe(0)
  })
})
```

- `beforeEach`でpage objectを生成し初期ページへ遷移する。testごとに状態を作り直し、test間の依存を持たない
- 正常系だけでなく「結果なし」などの空状態・失敗経路を同じdescribeに並べる
- 期待値には自動待機する`await expect(locator)`系のassertionを使う
