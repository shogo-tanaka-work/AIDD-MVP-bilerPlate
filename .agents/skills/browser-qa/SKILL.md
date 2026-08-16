---
name: browser-qa
description: 機能をdeployした後に、browser automationでvisual testingとUI操作検証を自動化するときにこのskillを使う。
metadata:
  origin: ECC
---

# Browser QA — 自動visual testingと操作検証

## 使う場面

- 機能をstaging/preview環境へdeployした後
- 複数ページにまたがるUI挙動を検証する必要があるとき
- 出荷前 — layout、form、操作が実際に動くことを確認する
- frontendコードに触れるPRをレビューするとき
- accessibility監査とresponsive testing

## 仕組み

browser automation MCP（claude-in-chrome、Playwright、Puppeteer）を使い、実際の利用者のようにlive pageを操作する。

### 安全性優先 — blast radius（既定はread-only）

Browser QAは実際の認証と実際のuser journeyを動かすため、blast radiusを明示的に扱う。
既定は **read-only** とする。**変更を伴う** journey（checkout、payment、削除、
一括更新）をproduction URLに対して実行しない。実行するには明示的なopt-in **かつ** staging/preview
URLを必須とする。seed済みの **test credentials** を使い、実際のproductionログインは使わない。screenshotを保存する前に
credentials・token・PIIを **redact** する。

### Phase 1: Smoke Test
```
1. 対象URLへ遷移する
2. console errorを確認する（analytics・third-partyのノイズは除外）
3. network requestに4xx/5xxがないことを確認する
4. desktopとmobile viewportでabove-the-foldのscreenshotを撮る
5. Core Web Vitalsを確認する: LCP < 2.5s, CLS < 0.1, INP < 200ms
   （INPは2024年3月にFIDを置き換えた。閾値はweb.devに準拠）
```

### Phase 2: 操作テスト
```
1. すべてのnav linkをクリックし、dead linkがないことを確認する
2. 妥当なデータでformを送信し、成功状態を確認する
3. 不正なデータでformを送信し、error状態を確認する
4. auth flowを確認する: login → 保護ページ → logout（test credentialsのみ。production資格情報は使わない）
5. 重要なuser journey（checkout、onboarding、search）を確認する
   — 既定はread-only。変更を伴うjourneyは明示的なopt-inのもとstagingに対してのみ実行する
     （上記「安全性優先」を参照）
```

### Phase 3: Visual Regression
```
1. 主要ページを3つのbreakpoint（375px、768px、1440px）でscreenshotする
2. コミット済みのbaseline screenshotと比較する
   — baselineがなければINCONCLUSIVEとして報告し、暗黙のPASSにしない
3. 5px超のlayout shift、要素欠落、overflowを指摘する
4. 該当する場合はdark modeを確認する
```

### Phase 4: Accessibility
```
1. 各ページでaxe-coreまたは同等のツールを実行する
2. WCAG 2.2 AA違反（contrast、label、focus順序）を指摘する
3. keyboard操作が端から端まで機能することを確認する
4. screen reader landmarkを確認する
```

> 注: axe-coreが自動的にカバーするのはWCAGのおよそ30〜40%にとどまる。クリーンな実行結果は **必要条件であって
> 十分条件ではない** — keyboard操作、focus順序、screen readerでの確認は手動チェックが必要になる。
> 自動実行の結果だけで「accessible」と報告しない。

## 出力形式

```markdown
## QA Report — [URL] — [timestamp]

### Smoke Test
- Console errors: 0 critical, 2 warnings (analytics noise)
- Network: all 200/304, no failures
- Core Web Vitals: LCP 1.2s ✓, CLS 0.02 ✓, INP 89ms ✓

### Interactions
- [✓] Nav links: 12/12 working
- [✗] Contact form: missing error state for invalid email
- [✓] Auth flow: login/logout working

### Visual
- [✗] Hero section overflows on 375px viewport
- [✓] Dark mode: all pages consistent

### Accessibility
- 2 AA violations: missing alt text on hero image, low contrast on footer links

### Verdict: SHIP WITH FIXES (2 issues, 0 blockers)
# verdict ∈ SHIP / SHIP WITH FIXES / DO NOT SHIP; visual baselineがない場合はINCONCLUSIVEを使う
```

## 連携

任意のbrowser MCPで動作する:
- `mChild__claude-in-chrome__*` tools（推奨 — 実際のChromeを使う）
- `mcp__browserbase__*` 経由のPlaywright
- 直接記述したPuppeteer script

deploy後の監視には `/canary-watch` と併用する。
