# Test Runnerの検出（Step 0）

`npm test`を前提にしない。手順と例では、プロジェクトの実際のrunnerのプレースホルダとして`<test>`、`<test-watch>`、`<coverage>`、`<lint>`を使う。開始前に一度解決する。

## 手順

1. **package managerを検出する。** ECC同梱の検出スクリプトがあれば使う:

   ```bash
   node scripts/setup-package-manager.js --detect
   ```

   これは`CLAUDE_PACKAGE_MANAGER`、`.claude/package-manager.json`、`package.json`の`packageManager`フィールド、lockfile、グローバル設定の順で解決する。スクリプトが無いプロジェクトでは、同じ順序で手動に判定する（lockfileの種類が最も確実な手がかり）。

2. **package managerとtest runnerを区別する — 両者は同じではない。** Bunで依存をインストールしつつ、JestやVitestを実行するプロジェクトもある。`package.json`の`scripts.test`とtestファイルを確認する:
   - `scripts.test`が`jest` / `vitest`を呼ぶ -> 検出したPM経由で実行する（`npm test`、`pnpm test`、`yarn test`、`bun run test`）。
   - `scripts.test`が`bun test`である、testファイルが`import { test, expect } from "bun:test"`している、jest/vitestの設定がなくBunが存在する -> **Bunのネイティブrunner**（`bun test`）を使う。

## Runnerコマンド対応表

| Runner | `<test>` | `<test-watch>` | `<coverage>` | `<lint>` |
|--------|----------|----------------|--------------|----------|
| npm | `npm test` | `npm test -- --watch` | `npm run test:coverage` | `npm run lint` |
| pnpm | `pnpm test` | `pnpm test --watch` | `pnpm test:coverage` | `pnpm lint` |
| yarn | `yarn test` | `yarn test --watch` | `yarn test:coverage` | `yarn lint` |
| Bun（scriptがjest/vitestを実行） | `bun run test` | `bun run test --watch` | `bun run test:coverage` | `bun run lint` |
| Bun（ネイティブ`bun:test`） | `bun test` | `bun test --watch` | `bun test --coverage` | `bun run lint` |

> `bun test`（Bun組み込みのrunner）は`bun run test`（`package.json`の`test` scriptを実行）と**同じではない**。取り違えはよくある失敗で、たとえばESM専用プロジェクトで`npx`/`bun run`経由でJestを起動すると壊れるが、`bun test`ならネイティブにsuiteが動く。RED gateの前にプロジェクトがどちらを想定しているか確認する。

## Bun Native Test Pattern（`bun:test`）

プロジェクトがBun組み込みのrunnerを使う場合、`bun:test`からimportし、`bun run test`ではなく`bun test`で実行する。APIはJestに似ており、`describe` / `it` / `expect`と大半のmatcherがそのまま使える。runtime、install、bundlerの詳細は`bun-runtime` skillが導入されていればそれを参照する。

```typescript
import { describe, it, expect, mock } from 'bun:test'
import { searchMarkets } from './search'

describe('searchMarkets', () => {
  it('returns an empty list for an empty query', async () => {
    expect(await searchMarkets('')).toEqual([])
  })

  it('sorts results by similarity score', async () => {
    const results = await searchMarkets('election')
    expect(results).toEqual([...results].sort((a, b) => b.score - a.score))
  })
})
```

```bash
bun test              # 一度だけ実行する（RED/GREEN gate）
bun test --watch      # 開発中のwatchモード
bun test --coverage   # coverageレポート
```

- moduleのmockは`jest.mock(...)`ではなく`bun:test`の`mock.module(...)` / `mock(...)`を使う。
- coverageの閾値はJestの`coverageThresholds`設定ブロックではなく、`bunfig.toml`の`[test]`配下（例: `coverageThreshold`）で設定する。

## 継続的なtesting

```bash
# 開発中のwatchモード（ファイル変更時にtestが自動実行される）
<test-watch>

# Pre-Commit Hook（commitのたびに実行される）
<test> && <lint>
```

```yaml
# GitHub Actions
- name: Run Tests
  run: <coverage>
- name: Upload Coverage
  uses: codecov/codecov-action@v3
```
