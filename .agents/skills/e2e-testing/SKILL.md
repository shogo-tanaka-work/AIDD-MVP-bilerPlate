---
name: e2e-testing
description: PlaywrightのE2E testパターン、Page Object Model、設定、CI/CD連携、artifact管理、flaky test対策。Playwrightのtestを書くとき、page objectを構成するとき、CIでflakyなE2E実行を直すときに使う。
metadata:
  origin: ECC
---

# E2E testパターン

安定・高速・保守しやすいE2E test suiteを構築するためのPlaywrightの判断基準。コード例・設定・テンプレートは`references/`にある。UI変更の検証範囲（主要viewport、keyboard操作、loading・empty・error状態）は常時ロードされる`.agents/rules/verification.md`に従う。

## 発動タイミング

- PlaywrightでE2E testを新規に書くとき
- page objectやfixtureの構成を決めるとき
- `playwright.config.ts`やCI workflowを整えるとき
- CIでE2E testが不安定（flaky）になったとき
- wallet接続や決済など、外部システムを伴う重要フローをテストするとき

## 設計の原則

- **重要なuser flowだけをE2Eにする。** 細かい分岐はunit / integration testに寄せ、E2Eは主要導線・認証・決済など壊れると致命的な経路に絞る
- **Page Object Modelで責務を分ける。** locatorと操作はpage objectへ、assertionはspecへ。操作メソッドは完了待ちまで責任を持つ
- **selectorは意味で選ぶ。** `data-testid`かaccessible role・テキストを使い、CSS classやDOM構造に依存しない
- **待機は条件で行う。** `waitForTimeout`のような固定sleepを書かず、自動待機するlocator操作と`await expect(locator)`、`waitForResponse`を使う
- **testを独立させる。** `beforeEach`で状態を作り直し、前のtestが作ったデータに依存しない
- **正常系と同じ場所に失敗経路を置く。** 結果なし・入力エラー・ネットワーク失敗をdescribe内に並べる
- **接続先や認証情報はtestコードへ埋め込まない。** `baseURL`・アカウントはCI変数やfixtureから渡す

## 設定とCIの原則

- `forbidOnly`で`test.only`の消し忘れを検出し、`retries`はCIだけに許す
- trace・screenshot・videoは失敗時（`on-first-retry` / `only-on-failure` / `retain-on-failure`）だけ残す
- 共有DB・サーバーを使うCIでは`workers: 1`から始め、環境を分離できてから並列化する
- CIでは`playwright install --with-deps`で依存を揃え、`if: always()`でレポートをartifactとして保存する
- 本番環境では、資金や不可逆処理が動くtestを`test.skip`で除外する

## flaky testへの対処手順

1. `--repeat-each=10`で再現率を測り、`--retries`で通るかを確認する（通るならタイミング・順序依存）
2. 原因を分類する: race condition / networkタイミング / animation / test間の状態共有 / 環境依存（viewport・timezone・外部API）
3. 固定sleepを条件待ちへ置き換え、locatorの自動待機を使う
4. すぐ直せないtestは`test.fixme`または`test.skip(condition, reason)`でissue番号付きで隔離し、issueクローズ時に外す

## チェックリスト

- [ ] E2E対象は主要導線・重要フローに絞られているか
- [ ] locatorは`data-testid`かroleで、assertionはspec側にあるか
- [ ] `waitForTimeout`など固定sleepが残っていないか
- [ ] 各testは`beforeEach`で状態を作り直し、独立して実行できるか
- [ ] 空状態・エラー経路のtestがあるか
- [ ] 設定に`forbidOnly`、失敗時artifact、`webServer`があるか
- [ ] CIで失敗時もレポートがartifactとして残るか
- [ ] 隔離したflaky testにissue番号と理由が付いているか

## 参照

- [references/structure-and-page-objects.md](references/structure-and-page-objects.md) — testファイル構成、Page Object Modelの実装、spec構造
- [references/playwright-config-and-ci.md](references/playwright-config-and-ci.md) — `playwright.config.ts`と各設定の意図、artifact管理、GitHub Actions workflow、testレポートテンプレート
- [references/flaky-tests.md](references/flaky-tests.md) — 隔離、再現率の測定、原因別の対処コード
- [references/domain-flows.md](references/domain-flows.md) — wallet / Web3のprovider mock、金融系・重要フローのtest
