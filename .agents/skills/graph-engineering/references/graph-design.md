# Graph設計の指針

## 定義

このハーネスでのGraph Engineeringとは、モデルに「Subagentを使って」と頼むことではなく、**複数のエージェント/作業Nodeとその状態遷移を明示的に設計すること**を指す。

## 単純な委譲とGraphの違い

単純な委譲:

```text
Main
 ├─ Researcherに依頼
 └─ Reviewerに依頼
Mainが結果を統合する
```

Graph:

```text
Planner
 ├─ A
 ├─ B
 └─ C
   ↓
Fan-in
   ↓
Verifier
 ├─ pass → Final
 └─ fail → 失敗を担当branchへ差し戻し → 再検証
```

後者には明示的な状態・遷移・所有権・retryの意味論が必要になる。

## 基本形

```text
Planner
→ fan-out
→ specialists
→ fan-in
→ verifier
→ selective retry
→ final
```

Graph全体を無条件に再実行せず、失敗したbranchだけretryする。

## 状態schemaの例

```yaml
objective: string
acceptance_criteria: []
branches:
  architecture:
    status: pending|running|passed|failed
    evidence: []
    retries: 0
  security:
    status: pending|running|passed|failed
    evidence: []
    retries: 0
verifier:
  status: pending
budget:
  max_agents: 3
  max_branch_retries: 1
  max_total_iterations: 6
```

## 必須の不変条件

- 1つの失敗に所有者は1人
- 上限なしのfan-outを作らない
- 上限なしのretryを作らない
- 最終verifierには全transcriptではなく要約と根拠を渡す
- fan-in前に衝突解決の方法を決めておく
- Graphは部分成功・失敗の状態で終了できる

## Subagentを増やすほど増えるもの

- 入力context
- エージェント間のhandoff
- 重複調査
- verifierの再読込
- 実行時間
- token / rate-limitの消費
- failure mode

普通の開発タスクでは、単一エージェント + Loopの方が単純で安い。
