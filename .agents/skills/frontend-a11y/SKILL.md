---
name: frontend-a11y
description: >
  ReactとNext.jsのaccessibilityパターン — semantic HTML、ARIA属性、
  formのlabel付け、keyboard navigation、focus管理、screen reader対応。
  interactiveなUI componentやformを実装するときに使う。
metadata:
  origin: community
---

# フロントエンドaccessibilityパターン

ReactとNext.jsの実践的なaccessibilityパターン。code reviewで最も多く指摘される問題を扱う。formのlabel欠落、誤ったARIAの使い方、semanticでないinteractive要素、壊れたkeyboard navigation。

semantic HTMLとkeyboard操作を先に満たしARIAはnative要素で表せない場合に限る、という原則は常時ロードされる`.agents/rules/profiles/frontend.md`に従う。このskillはその原則をReactで実装するときの判断基準と具体例を補う。

## 発動タイミング

- form component（`<input>`、`<select>`、`<textarea>`）を実装・レビューする
- interactiveな要素（modal、dropdown、tooltip、tab）を作る
- `<div>`や`<span>`に`onClick`を付ける
- 要素に`aria-*`属性を追加する
- keyboard navigationやfocus管理を実装する
- code reviewツール（CodeRabbit、ESLint a11y）からaccessibilityの指摘を受ける
- screen reader対応が必要なcomponentを実装する

## 判断基準

### form

- `<label htmlFor>`と`id`を必ず対応させる。placeholderはlabelの代用にならない
- 必須は`required`（browser標準validation）と`aria-required`の両方で伝え、見た目の`*`は`aria-hidden="true"`にする
- エラーメッセージは`aria-describedby`でinputへ紐付け、`aria-invalid`で状態を伝え、`role="alert"`で読み上げさせる。エラーがないときは存在しないidを参照させない
- 自前でvalidationするformは`noValidate`を付け、`autoComplete`を設定する

### semantic HTML

- click可能なものは`<button type="button">`、遷移は`<a href>`。`<div onClick>`は`role`・`tabIndex`・`onKeyDown`が揃っていても最後の手段
- 見出しレベルを飛ばさない（h1の次はh2）

### ARIA

- 可視labelがない → `aria-label`。可視のテキストを参照できる → `aria-labelledby`。補足説明 → `aria-describedby`
- ページ再読み込みなしに更新される内容は`aria-live`。`polite`が既定、`assertive`は緊急のエラーだけ
- 開閉UIは`aria-expanded`と`aria-controls`で状態と対象を結び、idは`useId`で生成する
- `role`のない`<div>`への`aria-label`、focus可能な要素への`aria-hidden`、正の`tabIndex`は誤用

### keyboard navigationとfocus

- custom widget（dropdown、combobox等）はArrow / Enter / Space / Escapeを自前で処理し、`tabIndex={0}`で到達可能にする
- modalは開いたときにfocusを移し、閉じたときに開いた要素へ戻す。Tab/Shift+Tab循環を含む完全なfocus trapは`focus-trap-react`などのライブラリに任せる

### 画像・アイコン・モーション

- 装飾画像は`alt=""`と`aria-hidden="true"`。意味のある画像は内容を説明する`alt`
- アイコンのみのbuttonは`aria-label`を付け、アイコン側を`aria-hidden="true"`にする
- animationは`prefers-reduced-motion`を尊重する

## チェックリスト

interactiveなcomponentをレビューへ出す前に確認する。

- [ ] すべての`<input>`、`<select>`、`<textarea>`が`htmlFor`/`id`で`<label>`と紐付いている
- [ ] エラーメッセージが`aria-describedby`で紐付き、`role="alert"`が付いている
- [ ] `role`、`tabIndex`、`onKeyDown`なしの`<div>`・`<span>`への`onClick`がない
- [ ] アイコンのみのbuttonに`aria-label`がある
- [ ] 装飾画像が`alt=""`と`aria-hidden="true"`を使っている
- [ ] modalが閉じるときにfocusを復元する（Tab/Shift+Tab循環を含む完全なfocus trapには`focus-trap-react`のようなライブラリを使う）
- [ ] 動的なコンテンツ更新が`aria-live`を使っている
- [ ] animationで`prefers-reduced-motion`を尊重している

## 参照

- [references/forms.md](references/forms.md) — label / 必須 / エラーメッセージのBAD・GOOD例と、accessibleなLoginFormの完成例
- [references/semantic-html-and-aria.md](references/semantic-html-and-aria.md) — semantic要素の選び方、ARIA属性ごとの使用例、画像・アイコン、アンチパターン集
- [references/navigation-and-focus.md](references/navigation-and-focus.md) — keyboard対応dropdown、modalのfocus復元、`useReducedMotion` hook

## 関連skill

- `vercel-composition-patterns` — 一般的なReact componentとstateのパターン
- `design-system` — design tokenとcomponentの一貫性
- `accessibility` — WCAG 2.2に基づく設計・監査の手引き
