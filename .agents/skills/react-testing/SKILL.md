---
name: react-testing
description: React Testing Library、Vitest/Jest、network mockingのMSW、axeによるaccessibility assertion、component testとPlaywright/CypressのE2Eの境界を扱うReact componentのテスト。Reactのcomponent、hook、pageのテストを書く・修正するときに使う。
metadata:
  origin: ECC
---

# React Testing

振る舞い中心のcomponent test、custom hook test、accessibility assertion、networkレイヤのmockingを網羅するReactテストパターン。

accessible roleと利用者操作を優先し実装詳細に依存しないというテストの原則、および検証の進め方（変更範囲に近い検証から実行する、coverage率だけを目的にしない、価値の高い境界・失敗経路を優先する）は、常時ロードされる`.agents/rules/profiles/frontend.md`と`.agents/rules/verification.md`に従う。このskillはそれをReact Testing Libraryで実践するときの判断基準と具体例を補う。

## 適用する場面

- React component、custom hook、pageのテストを書くとき
- テストのない既存componentにテストを追加するとき
- Enzymeやclass component時代のパターンからReact Testing Libraryへ移行するとき
- 新規ReactプロジェクトでVitestやJestを設定するとき
- テスト内でHTTP requestをmockするとき
- accessibility違反をassertするとき
- RTL、Playwright Component Testing、フルE2Eのどれに属するテストか判断するとき

## 判断基準

### テストが見るもの

- 本番と同じproviderでrenderし、目に見える出力と観測可能な副作用（callbackの発火、requestの送信）をassertする
- componentのstate、子へ渡されたprops、呼ばれたhook、render回数、利用者に影響しないDOM構造は調べない
- React自体やframeworkのhookをmockしない。子componentも既定ではmockせず、重い副作用がある場合だけmockする

### ライブラリの選択

| Runner | 適する場面 | 備考 |
|---|---|---|
| **Vitest** | Vite、Remix、モダンな構成 | 高速、ネイティブESM、Jest互換API |
| **Jest** | Next.js、CRA、既存repo | 多くのReactプロジェクトの既定 |
| **Playwright Component Testing** | 実ブラウザエンジンが必要なとき | JSDOMに必要な機能がない場合に使う |
| **Cypress Component Testing** | 実ブラウザ、Cypressを既に使用 | Playwright CTの代替 |

一つを選ぶ。明確な棲み分けがない限り、同じrepoでRTL + VitestとPlaywright CTを併用しない。

### Queryと操作

- query優先順位: `getByRole` / `getByLabelText`等のaccessibleなquery → `getByAltText` / `getByTitle` → `getByTestId`（最後の手段）
- 「存在しないこと」は`queryBy*`、非同期に現れる要素は`findBy*`で待つ。`setTimeout` + assertは使わない
- `fireEvent`ではなく`userEvent.setup()`で得た`user`を使い、呼び出しは必ず`await`する

### mockとprovider

- HTTPはMSWでnetworkレイヤをmockし、`onUnhandledRequest: "error"`で未mockのrequestを失敗させる。テスト固有の応答は`server.use`で上書きする
- providerは`test-utils.tsx`の`renderWithProviders`に一度だけまとめる
- custom hookは`renderHook`で公開APIだけを通して検証し、stateを変える呼び出しは`act`で包む。contextが要るhookには`wrapper`を渡し、`QueryClient`はwrapperの外で生成する

### Snapshot・実ブラウザ・E2Eの境界

- renderされた出力のsnapshotは使わない。純粋なデータ整形関数や生成される設定ファイルにだけ許容する。visual regressionは画像差分（Playwright/Cypress、Percy/Chromatic）で取る
- hook、表示中心のcomponent、ロジックのあるform → RTL
- レイアウト（flexbox、grid、viewport）、animation、scroll、drag-and-drop、clipboard、iframe、cross-originなどJSDOMにないものが要る → Playwright CT
- 複数ページにまたがる利用者フロー全体 → Playwright/CypressのE2E（`e2e-testing` skill）
- interactiveなcomponentのテストではaxe（`jest-axe` / `vitest-axe`）を実行する。色コントラストはJSDOMでは限定的で、視覚的な検証はPlaywrightの担当

## チェックリスト

- [ ] `container.querySelector`ではなくaccessibleなqueryで要素を取得している
- [ ] `userEvent`の呼び出しをすべて`await`している
- [ ] 未mockのrequestが失敗するようMSWを設定している
- [ ] `act()`の警告を無視していない（unmount後のstate更新や非同期のラップ漏れの兆候）
- [ ] テスト間で可変stateを共有していない
- [ ] `it.skip()`を外しても通るテスト（意図した内容をassertしていない）がない
- [ ] interactiveなcomponentにaxeのassertがある

## 参照

- [references/queries-and-interaction.md](references/queries-and-interaction.md) — query優先順位、`userEvent`、非同期matcher、snapshotを避ける理由
- [references/msw-and-providers.md](references/msw-and-providers.md) — MSWのセットアップと上書き、`renderWithProviders`、form送信の例
- [references/hooks-a11y-boundaries.md](references/hooks-a11y-boundaries.md) — `renderHook`、axeによるassert、Error boundary / Suspenseのテスト
- [references/coverage-and-commands.md](references/coverage-and-commands.md) — レイヤ別coverage参考値と設定、TDDワークフロー、Vitest / Jestコマンド

## 関連skill

- `vercel-composition-patterns` — component設計とstateのパターン
- `accessibility` — WCAG 2.2に基づくa11yテストの手引き
- `e2e-testing` — Playwright / CypressによるE2E
- `tdd-workflow` — RED → GREEN → REFACTORの進め方
