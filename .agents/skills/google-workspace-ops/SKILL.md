---
name: google-workspace-ops
description: Google Drive・Docs・Sheets・Slidesを、計画・トラッカー・deck・共有ドキュメントのための一つのworkflow surfaceとして横断的に操作する。raw tool callへ落とさずにGoogle Workspaceのassetを検索・要約・編集・移行・整理したいときに使う。
metadata:
  origin: ECC
---

# Google Workspace Ops

このskillは、共有ドキュメント・スプレッドシート・deckを、単一ファイルの編集ではなく動いているシステムとして操作するためのもの。

## いつ使うか

- ドキュメント・シート・deckを見つけて、その場で更新する必要があるとき
- Google Driveにある計画・トラッカー・メモ・顧客リストを統合するとき
- 共有スプレッドシートを整理・再構成するとき
- Google Slidesのdeckをimport・修復・再フォーマットするとき
- 意思決定のためにDocs・Sheets・Slidesから要約を作るとき

## 優先するtool surface

Google Driveを入口にし、そこから適切な専用toolへ切り替える。

- テキスト中心のドキュメントはGoogle Docs
- 表・数式・チャートの作業はGoogle Sheets
- deck、import、テンプレート移行、整理はGoogle Slides

ファイル名だけから構造を推測しない。先に中身を確認する。

## Workflow

### 1. assetを見つける

Driveの検索surfaceから始めて、次を特定する。

- 目的のファイルそのもの
- 関連するasset
- 重複の可能性があるもの
- 直近で更新されたバージョン

似たドキュメントが複数あるときは、タイトル・所有者・更新時刻・フォルダで確定する。

### 2. 編集前に確認する

変更前に次を行う。

- 現在の構造を要約する
- タブ・見出し・スライド数を把握する
- 局所的な整理なのか構造的な手術なのかを判別する

作業を安全に実行できる最小のtoolを選ぶ。

### 3. 正確に編集する

- Docs: 曖昧な書き直しではなく、indexを意識した編集を行う
- Sheets: 明示したタブとrangeに対して操作する
- Slides: 内容の編集と、見た目の整理・テンプレート移行を区別する

依頼が視覚やレイアウトに影響するものなら、巨大な一括更新ではなく、確認と検証を挟んで反復する。

### 4. 動いているシステムを清潔に保つ

ファイルが大きなworkflowの一部であるときは、次も併せて示す。

- 重複したトラッカー
- 古くなったdeck
- 陳腐化したドキュメントと正本ドキュメントの違い
- そのassetをarchive・統合・改名すべきかどうか

## 出力形式

次を使う。

```text
ASSET
- file name
- type
- why this is the right file

CURRENT STATE
- structure summary
- key problems or blockers

ACTION
- edits made or recommended

FOLLOW-UPS
- archive / merge / duplicate cleanup / next file to update
```

## 適したユースケース

- 「現行の計画ドキュメントを見つけて要約して」
- 「この顧客スプレッドシートを整理して、解約リスクの行を見せて」
- 「このdeckをSlidesへimportして、見せられる状態にして」
- 「古い重複ではなく、現行のトラッカーを見つけて」
