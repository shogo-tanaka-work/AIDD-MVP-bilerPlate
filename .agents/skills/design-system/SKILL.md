---
name: design-system
description: design systemの生成・監査、視覚的一貫性の確認、stylingに触れるPRのレビューにこのスキルを使う。design systemを生成・監査するとき、視覚的一貫性を確認するとき、stylingに触れるPRをレビューするときに使う。
metadata:
  origin: ECC
---

# Design System — 視覚システムの生成と監査

## いつ使うか

- design systemが必要な新しいプロジェクトを始めるとき
- 既存のコードベースを視覚的一貫性の観点で監査するとき
- redesignの前 — 現状を把握するとき
- UIが「なんとなくおかしい」が原因を特定できないとき
- stylingに触れるPRをレビューするとき

## 仕組み

### Mode 1: design systemの生成

コードベースを分析し、一貫したdesign systemを生成する。

```
1. CSS/Tailwind/styled-componentsをscanして既存パターンを把握する
2. 抽出する: 色、typography、spacing、border-radius、shadow、breakpoint
3. 参考として競合サイト3件をリサーチする（browser MCP経由）
4. design token一式を提案する（JSON + CSS custom properties）
5. 各判断の根拠を記したDESIGN.mdを生成する
6. インタラクティブなHTMLプレビューページを作成する（self-contained、依存なし）
```

出力: `DESIGN.md` + `design-tokens.json` + `design-preview.html`

### Mode 2: 視覚監査

UIを10の観点で採点する（各0〜10）。

```
1. 色の一貫性 — palette を使っているか、それとも場当たりのhex値か
2. typographyの階層 — h1 > h2 > h3 > body > captionが明確か
3. spacingのリズム — 一貫したscale（4px/8px/16px）か、恣意的か
4. componentの一貫性 — 似た要素は似て見えるか
5. レスポンシブ挙動 — 流動的か、breakpointで崩れるか
6. dark mode — 完全か、中途半端か
7. animation — 目的があるか、無駄か
8. accessibility — コントラスト比、focus state、タッチターゲット
9. 情報密度 — 雑然としているか、整理されているか
10. 仕上げ — hover state、transition、loading state、empty state
```

各観点にスコア、具体例、file:line付きの修正案を付ける。

### Mode 3: AIスロップの検出

AI生成にありがちな汎用的なdesignパターンを検出する。

```
- 何にでも無意味にgradientをかける
- purple-to-blueのデフォルト配色
- 目的のない「glass morphism」カード
- 角丸にすべきでないものへの角丸
- スクロール時の過剰なanimation
- ストック風gradient上に中央寄せテキストを置いた汎用hero
- 個性のないsans-serifのfont stack
```

## 例

**SaaSアプリ向けに生成する:**
```
/design-system generate --style minimal --palette earth-tones
```

**既存UIを監査する:**
```
/design-system audit --url http://localhost:3000 --pages / /pricing /docs
```

**AIスロップを確認する:**
```
/design-system slop-check
```
