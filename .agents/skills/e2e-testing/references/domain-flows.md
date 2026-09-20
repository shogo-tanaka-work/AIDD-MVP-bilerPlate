# ドメイン固有フローのtest

## wallet / Web3のtest

ブラウザ拡張（MetaMask等）を実際に動かさず、`window.ethereum`をmockしてwallet接続フローを検証する。

```typescript
test('wallet connection', async ({ page, context }) => {
  // wallet providerをmockする
  await context.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts')
          return ['0x1234567890123456789012345678901234567890']
        if (method === 'eth_chainId') return '0x1'
      }
    }
  })

  await page.goto('/')
  await page.locator('[data-testid="connect-wallet"]').click()
  await expect(page.locator('[data-testid="wallet-address"]')).toContainText('0x1234')
})
```

- `context.addInitScript`はページ読み込み前に実行されるため、アプリ初期化時のprovider検出を通せる
- 署名やトランザクション送信の`method`も同じmockで分岐させ、拒否（ユーザーキャンセル）の経路もテストする

## 金融系・重要フローのtest

実際の資金・不可逆な処理が動くフローは、本番環境では実行しない。

```typescript
test('trade execution', async ({ page }) => {
  // 本番ではskipする（実際の資金が動くため）
  test.skip(process.env.NODE_ENV === 'production', 'Skip on production')

  await page.goto('/markets/test-market')
  await page.locator('[data-testid="position-yes"]').click()
  await page.locator('[data-testid="trade-amount"]').fill('1.0')

  // previewを検証する
  const preview = page.locator('[data-testid="trade-preview"]')
  await expect(preview).toContainText('1.0')

  // 確定し、blockchainの応答を待つ
  await page.locator('[data-testid="confirm-trade"]').click()
  await page.waitForResponse(
    resp => resp.url().includes('/api/trade') && resp.status() === 200,
    { timeout: 30000 }
  )

  await expect(page.locator('[data-testid="trade-success"]')).toBeVisible()
})
```

- 確定前のpreview表示を検証し、入力値が正しく反映されていることを確認してから確定する
- 外部システム（blockchain、決済API）の応答は長くなりうるため、その待機だけtimeoutを個別に延ばす
- テスト用アカウント・テスト用資金の識別子はfixtureや環境変数から渡し、testコードに実値を書かない
