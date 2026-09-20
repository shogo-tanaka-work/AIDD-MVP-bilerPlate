# flaky testのパターン

## 隔離

原因調査中のtestはsuite全体を止めないよう隔離し、必ずissue番号を残す。

```typescript
test('flaky: complex search', async ({ page }) => {
  test.fixme(true, 'Flaky - Issue #123')
  // testコード...
})

test('conditional skip', async ({ page }) => {
  test.skip(process.env.CI, 'Flaky in CI - Issue #123')
  // testコード...
})
```

- `test.fixme`: 実装側に問題があり、修正までtestを実行しない
- `test.skip(condition, reason)`: 特定環境だけで不安定なとき。理由を必ず書く
- 隔離したままにしない。issueをクローズするときにfixme/skipを外す

## flakyさの特定

```bash
npx playwright test tests/search.spec.ts --repeat-each=10
npx playwright test tests/search.spec.ts --retries=3
```

- `--repeat-each`: 同じtestを繰り返し、再現率を測る
- `--retries`: 再試行で通るかを見る。通るなら順序・タイミング依存が疑わしい
- `trace: 'on-first-retry'`と組み合わせ、失敗した回のtraceを見る

## よくある原因と対処

### race condition

```typescript
// Bad: 要素が準備できている前提
await page.click('[data-testid="button"]')

// Good: 自動待機するlocatorを使う
await page.locator('[data-testid="button"]').click()
```

### networkのタイミング

```typescript
// Bad: 恣意的なtimeout
await page.waitForTimeout(5000)

// Good: 特定の条件を待つ
await page.waitForResponse(resp => resp.url().includes('/api/data'))
```

### animationのタイミング

```typescript
// Bad: animation中にクリックする
await page.click('[data-testid="menu-item"]')

// Good: 安定するまで待つ
await page.locator('[data-testid="menu-item"]').waitFor({ state: 'visible' })
await page.waitForLoadState('networkidle')
await page.locator('[data-testid="menu-item"]').click()
```

### test間の状態共有

- 前のtestが作ったデータに依存すると、並列実行や順序変更で壊れる
- `beforeEach`で状態を作り直し、testごとに一意なデータ（タイムスタンプやUUID）を使う
- 共有サーバーやDBを使うCIでは`workers: 1`にするか、testごとにテナントを分ける

### 環境依存

- viewportやtimezone、localeが未固定だとレイアウトや日付表示が揺れる。`use`で明示的に固定する
- `baseURL`や外部APIの応答が環境で異なる場合は、`page.route`でmockし決定的にする
