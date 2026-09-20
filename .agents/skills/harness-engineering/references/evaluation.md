# ハーネスの評価

## なぜ

ハーネス変更を「エージェントが賢くなった気がする」で判断しない。測る。

## 最小の実験

ハーネスを変更したら、最低3ケースでbefore / afterを測る。

1. 小さなbugfix
2. 5〜10ファイルのfeature
3. deep research / review

同一タスクを次の構成で走らせる。

- A. Vanilla（ハーネスなし）
- B. Harness
- C. Harness + Loop
- D. Harness + Subagent / Graph（関係するときだけ）

Graphを追加するなら、Graphなしの基準ケースと比較する。

## 計測項目

- task success
- 受け入れ基準の通過数
- テスト通過数
- regression数
- 人の介入回数
- iteration数
- tool call数
- Subagent数
- 経過時間
- input / output token（取得できれば）
- 推定コスト（取得できれば）

## eval caseの例

```yaml
id: feature-001
name: add-api-endpoint
category: coding

acceptance:
  - target_test_passes
  - typecheck_passes
  - no_unrelated_files_changed

variants:
  - vanilla
  - harness
  - harness_loop

capture:
  - success
  - iterations
  - tool_calls
  - subagent_count
  - elapsed_seconds
  - input_tokens
  - output_tokens
  - human_interventions

notes: "全variantで同一のリポジトリ状態とタスクpromptを使う。"
```

## 判断

重要な指標を1つ以上改善し、cost / latency / safety / usabilityに許容できない後退がないときだけ、その機能を残す。
