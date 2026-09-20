# Playwrightの設定、artifact管理、CI/CD連携

## Playwrightの設定

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
    ['json', { outputFile: 'playwright-results.json' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

設定の意図:

- `forbidOnly`: `test.only`の消し忘れをCIで検出する
- `retries`: CIだけ再試行を許し、ローカルではflakyを隠さない
- `workers: 1`（CI）: 共有DBやサーバーに対する並列競合を避ける。独立した環境があれば増やしてよい
- `trace` / `screenshot` / `video`: 失敗時だけ残し、artifactの容量を抑える
- `projects`: desktop 3ブラウザ + mobileを最低限の組み合わせとし、必要な範囲だけに絞る
- `webServer`: ローカルでは起動済みサーバーを再利用し、CIでは毎回起動する

## artifact管理

### screenshot

```typescript
await page.screenshot({ path: 'artifacts/after-login.png' })
await page.screenshot({ path: 'artifacts/full-page.png', fullPage: true })
await page.locator('[data-testid="chart"]').screenshot({ path: 'artifacts/chart.png' })
```

### trace

```typescript
await browser.startTracing(page, {
  path: 'artifacts/trace.json',
  screenshots: true,
  snapshots: true,
})
// ... testの操作 ...
await browser.stopTracing()
```

通常は設定の`trace: 'on-first-retry'`で十分。手動traceは特定の失敗を深掘りするときに使う。

### 動画

```typescript
// playwright.config.ts内
use: {
  video: 'retain-on-failure',
  videosPath: 'artifacts/videos/'
}
```

## CI/CD連携

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

- `playwright install --with-deps`でブラウザとOS依存を揃える
- `if: always()`で失敗時もレポートをartifactとして残す
- 接続先URLはCIの変数（`vars`）から渡し、testコードへ埋め込まない

## testレポートのテンプレート

```markdown
# E2E testレポート

**日時:** YYYY-MM-DD HH:MM
**所要時間:** Xm Ys
**状態:** PASSING / FAILING

## 概要
- 合計: X | 成功: Y (Z%) | 失敗: A | flaky: B | skip: C

## 失敗したtest

### test-name
**ファイル:** `tests/e2e/feature.spec.ts:45`
**エラー:** Expected element to be visible
**screenshot:** artifacts/failed.png
**推奨する修正:** [説明]

## artifact
- HTMLレポート: playwright-report/index.html
- screenshot: artifacts/*.png
- 動画: artifacts/videos/*.webm
- trace: artifacts/*.zip
```
