---
name: graph-engineering
description: 独立または相互依存する複数workstream、明示的な状態遷移、fan-out/fan-in、branch別の選択的retry、独立verifierが本当に必要な複雑タスクに限って、複数エージェントのGraphを設計する。既定では無効で、単一エージェント・Loop・単純なSubagent委譲で足りる場合は使わない。
---

# Graph Engineering

Graph orchestrationは任意機能で、既定では無効。Subagentが使えるからという理由でGraphを作らない。

## 発動の門

次のうち3つ以上が真のときだけ使う。

- 意味のあるworkstreamが3本以上ある
- 並列実行で実時間が大きく縮む
- Context isolationで品質が上がる
- 独立したverifierに価値がある
- 明示的なfan-out / fan-inが必要
- branch単位の選択的retryが必要
- エージェントのstep間で状態を持ち越す必要がある

それ以外は単一エージェント、Loop（loop-engineering skill）、単純なSubagent委譲を使う。

## 実行前に決めること

1. Node
2. 各Nodeの入力と出力
3. 状態schema
4. Edge / 遷移条件
5. 失敗の所有者（誰が直すか）
6. branchごとのretry予算
7. fan-in時の衝突解決
8. 全体の停止条件
9. token / エージェント数の予算

設計の詳細と状態schemaの例は[references/graph-design.md](references/graph-design.md)。

## コスト規律

- Subagentは既定で最大3
- 共有の要約で足りるなら、全エージェントにリポジトリを読ませない
- 生のtranscriptではなく構造化した要約を返す
- 失敗したbranchだけretryする
- Graphを恒久化する前に効果を実測する

## 使わない場面

- 単一の不具合
- 1つのAPI endpoint
- CSS / UIの調整
- 素直なrefactor
- 意味のある並列性がないタスク
- 単一エージェントのLoopで既に安定して成功しているタスク
