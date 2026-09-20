# Task Router: Direct / Loop / Subagent / Graph

ハーネスで最も重要なのは「何を使うか」より「何を使わないか」である。

## 判定の流れ

```text
Task
 |
 |-- 成功条件が明確で小さい？ ---------------- Yes --> Direct
 |
 No
 |
 |-- 同一エージェントの実行→検証→修正で収束できる？ -- Yes --> Loop
 |
 No
 |
 |-- 独立した調査/レビューを分離すれば十分？ -- Yes --> Subagent
 |
 No
 |
 |-- 複数workstreamの状態遷移/合流/選択的再実行が必要？ -- Yes --> Graph
 |
 No --> Direct/Loopに問題を分解し直す
```

## 採点の目安

モデルに絶対判定をさせるためではなく、過剰構成を防ぐための目安。

| Signal | Direct | Loop | Subagent | Graph |
|---|---:|---:|---:|---:|
| 変更ファイル 1〜3 | +2 | 0 | -1 | -2 |
| 機械的Verifierあり | 0 | +3 | 0 | +1 |
| 修正反復が予想される | 0 | +3 | 0 | +1 |
| 独立調査が1〜2本 | 0 | 0 | +3 | 0 |
| 独立workstream 3本以上 | -2 | 0 | +1 | +3 |
| Context isolationが重要 | 0 | 0 | +3 | +2 |
| fan-out / fan-inが必要 | -2 | -1 | +1 | +4 |
| branch別のretryが必要 | -2 | +1 | 0 | +4 |
| token予算が小さい | +3 | +1 | -1 | -4 |

同点なら、より単純な方式を選ぶ。

## 既定の予算

```yaml
single_agent: default
loop:
  max_iterations: 3
  same_error_limit: 2
subagents:
  max_parallel: 2
graph:
  enabled: false
  max_agents: 3
  max_branch_retries: 1
```

## 例

### Direct
- typo
- 小さな設定修正
- テストが明確な1 endpoint

### Loop
- 中規模の機能追加
- 再現テストのある不具合
- build/testのfeedbackを使う依存のmigration
- 矛盾する根拠を突き合わせる調査

### Subagent
- 本実装 + 独立したコードレビュー
- 本実装 + 隔離した依存調査
- 生の検索結果をmain contextへ入れたくない大規模なリポジトリ探索

### Graph
- architecture / security / costの専門branchを独立に走らせ、verifierが失敗を担当branchへ差し戻す
- 複数サブシステムにまたがるmigrationで、branchごとに完了状態が分かれる
