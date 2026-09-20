---
name: loop-engineering
description: 中〜大規模のタスクで、Goal→Act→Verify→Repairの有界ループを設計・実行する。テスト・lint・typecheck・buildなど機械的に判定できるverifierがあり、複数エージェントのGraph orchestrationを使わずに反復で品質を上げたいときに使う。Direct / Loop / Subagent / Graphの選択基準もここにある。
---

# Loop Engineering

反復は「測れる改善」があるときだけ使う。無限に試行させるのではなく、Goal・Verifier・予算・停止条件を先に決めてから回す。

## 発動タイミング

- 変更が複数ファイルにまたがり、テスト・lint・typecheck・buildで成否を判定できる
- 再現可能な不具合を修正する
- build/testのfeedbackを使って依存のmigrationを進める
- 矛盾する情報源を突き合わせる調査

小さく成功条件が明確なタスク（typo、設定1行、テスト付きの1 endpoint）はLoopを使わず直接実行する。

## 実行方式の選択

```text
成功条件が明確で小さい               → Direct
同一エージェントの実行→検証→修正で収束 → Loop
独立した調査・レビューの分離で足りる   → Subagent
複数workstreamの分岐・合流・選択的再実行 → Graph（graph-engineering skill）
```

同点ならより単純な方式を選ぶ。採点の目安は[references/task-router.md](references/task-router.md)。

## Loopに必須の項目

| 項目 | 内容 |
|---|---|
| Goal | 要求された振る舞いを最小の一貫した変更で満たす |
| 受け入れ基準 | 着手前に内部で言い直す |
| Verifier | 可能な限り機械判定（exit code、schema一致、snapshot差分なし） |
| 反復予算 | 既定3回 |
| 同一根本原因の上限 | 2回 |
| 停止（成功） | 受け入れ基準と選んだ検証が全て通る |
| 停止（エスカレーション） | 予算切れ・同一原因の反復・外部credential要・安全境界を越える・前提が実装と矛盾 |
| エスカレーション報告 | 観測した失敗・推定根本原因・試したこと・根拠・推奨する次の手 |

## 既定の予算

- 最大反復: 3
- 同一根本原因: 2
- 高コストなverifier（full test suite、build）は最後に1回
- Graph / Subagentへの昇格は明確な利点があるときだけ

## Loopテンプレート

用途に合わせて次を読む。

- [loops/implement-and-verify.md](loops/implement-and-verify.md) — 複数ファイルにまたがる機能追加・refactor
- [loops/bugfix.md](loops/bugfix.md) — 再現→切り分け→修正→回帰の証明
- [loops/research-verify.md](loops/research-verify.md) — 一次資料で裏付けた結論を出す調査
- [loops/business-review.md](loops/business-review.md) — 提案書・見積・請求・記事などの成果物レビュー

## 検証の順序と報告

format → lint → typecheck → 対象テスト → 統合テスト → build → 差分レビューの順で、安価なものから実行する。実行順の詳細、差分レビューの観点、報告テンプレートは[references/verification-report.md](references/verification-report.md)。PRを作る前の最終確認にもこれを使う。

## 良いVerifierと悪いVerifier

良い: `npm test` exit 0、`tsc --noEmit` exit 0、HTTP 200 + schema一致、snapshot差分なし、期待ファイルの存在

悪い: 「いい感じになった」「十分高品質」「必要ならもう少し直す」

## アンチパターン

- 上限なしの「通るまで試す」
- テストで判定できるのにLLMだけで検証する
- 毎回の編集後にfull test suiteを回す
- 通らないからと受け入れ基準を黙って変える
- 忙しく見せるためだけにSubagentを起動する
