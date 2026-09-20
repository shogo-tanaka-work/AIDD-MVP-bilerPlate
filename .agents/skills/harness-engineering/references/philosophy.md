# 設計思想: なぜこのハーネスなのか

## 1. 「賢いプロンプト」ではなく「良い実行環境」を作る

AI駆動開発ではモデル性能だけでなく、モデルの外側にある実行環境が品質を大きく左右する。

```text
Model
  + Context
  + Rules
  + Skills
  + Tools / MCP
  + Hooks
  + Sandbox / Permissions
  + Verification
  + Retry / Stop
  + Observability
= 実際に使えるエージェント
```

この外側をハーネスと呼ぶ。

## 2. 常時contextを小さくする

常に大量のルールを入れると、tokenだけでなく「どの命令が重要か」の判別コストも増える。

- 常時必要 → `AGENTS.md` / `CLAUDE.md`
- 特定ファイルだけ → path scopedなrule
- 再利用可能な手順 → Skill
- 絶対に強制したい → Hook / permissions / sandbox
- 外部データ → MCP
- 繰り返し → Loop
- 並列分離 → Subagent
- 複雑な状態遷移 → Graph

root instructionは常時contextを消費し、Skillは必要時に本体が読み込まれ、Hookはmain contextの外で決定論的に動く。この差を使い分ける。

## 3. Loop Engineeringを中心にする理由

多くのエンジニアリングタスクは複数エージェントを必要とせず、**同じエージェントが結果を観測し、修正して再検証すること**で品質が上がる。

```text
Goal
 ↓
Act
 ↓
Observe
 ↓
Verify
 ├─ success → Stop
 └─ failure → Diagnose → Fix ─┐
                              └→ Verify
```

重要なのは無限反復ではなく、Goal・機械判定できる基準・retry予算・時間/token予算・同一エラー検知・エスカレーション・停止条件を持つこと。だからLoopをGraphより先に導入する。

## 4. Graphを常用しない理由

Subagentを増やすほど、入力context・handoff・重複調査・verifierの再読込・実行時間・token消費・failure modeが増える。普通の開発タスクでは単一エージェント + Loopの方が単純で安い。

Graphを使う条件:

1. 3つ以上の独立workstreamがある
2. Context isolationの価値が大きい
3. 並列化で実時間を大きく短縮できる
4. 独立verifierが必要
5. 分岐・合流・再実行先を明示的に管理する必要がある
6. 単一エージェント / Loop / 単純なSubagentでは品質不足が実測されている

## 5. 自律性と安全性を同じ仕組みにしない

自律性: Loop、Skill、tool availability、Subagent

安全性: sandbox、permissions、PreToolUse Hook、秘密情報保護、network policy

自律性を上げるために安全境界を緩めるのではなく、安全境界の内側を広く自律運転させる。bounded environmentの内側では低リスク操作を滑らかに進め、高リスク操作だけをapprovalで止める。

## 6. MCPを全部つながない理由

MCPは能力を増やすが、接続するほどtool schemaが増え、tool choiceが難しくなり、context / metadataが増え、誤操作面とprompt injection / data exfiltrationの影響面が広がる。

MCPは「個人の全toolセット」ではなく、プロジェクトの用途ごとに必要なserverだけを有効化する。

- 常時必要なもの（例: filesystem、github）だけを既定で有効にする
- browserなど外部情報が必要なときだけ有効にするものを分ける
- production DB、cloud admin、email送信、publishingなどの書き込み系は既定で無効にし、明示的な操作だけ許可する
- read-only scopeで足りるならwrite scopeを与えない

## 7. 評価可能であることを最重要にする

「なんとなく強くなった」ではハーネス改善にならない。同一課題をVanilla / Harness / Harness + Loop / Harness + Subagent / Harness + Graphで比較できるようにする。詳細は[evaluation.md](evaluation.md)。

## 8. 最強設定とは「追加」ではなく「削除できる設定」

ハーネスは増築し続けると必ず重くなる。月1回程度、常時ruleを削れないか、Skillへ移せないか、Hookが重複していないか、MCPを常時接続する必要があるか、Loop retryが多すぎないか、Subagentが品質に寄与したか、Graphが本当に必要だったかをレビューする。詳細は[maintenance.md](maintenance.md)。
