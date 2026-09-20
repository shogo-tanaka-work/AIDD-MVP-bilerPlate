# ハーネス保守のPlaybook

## 週次で見るもの

- Hookのfalse-positive
- エージェントの停止理由
- retry回数
- MCPの誤選択

## 月次レビュー

### Rules
- 常時ロードする必要があるか
- Skillへ移せないか
- 同じ意味のルールが重複していないか
- プロジェクト固有なのにglobalに置かれていないか

### Skills
- 1か月間一度も呼ばれなかったSkill
- descriptionが広すぎて誤発火していないか
- 他Skillと統合できないか
- SKILL.md本体が長すぎないか

### Hooks
- false-positive数
- 平均実行時間
- 毎Editで重いテストをしていないか
- モデル判断で十分なものをHook化していないか
- denyよりaskが妥当な操作はないか

### MCP
- 常時有効である必要があるか
- write scopeをread-onlyへ落とせないか
- 使われていないserverはないか
- network accessを狭められないか

### Loops
- iteration平均
- retry 3回目の成功率
- 同一エラーで無駄に回っていないか
- verifierが高コストすぎないか

### Subagent / Graph
- エージェント数の増加に対して品質が上がったか
- main contextの削減につながったか
- 重複調査が発生していないか
- Graphなしでも同等品質ではないか

## CLI更新時のチェックリスト

Codex / Claude Codeの更新時:

1. release notes / changelogを確認する
2. config schemaを確認する
3. Hook event / payloadの変更を確認する
4. permission syntaxを確認する
5. Skill frontmatterを確認する
6. MCP設定形式を確認する
7. sandbox / network policyを確認する
8. `aidd verify` を実行する
9. 小さなevalを3件回す
10. 本番用ハーネスへ反映する

## 削除基準

次のいずれかなら削除候補にする。

- 30日利用なし
- 公式機能に置き換えられた
- false-positive > benefit
- token / cost増に対して成功率改善が測れない
- 2つ以上の他機能と責務が重複

## ハーネスADR

大きい変更はADRを残す。

```text
Decision: Stop hookを既定OFFにする
Reason: 自律性より無限loop回避を優先
Evidence: evalで失敗時の無駄retryが増加
Revisit: Codex / Claude側にnativeなbounded goal controlが十分実装されたとき
```
