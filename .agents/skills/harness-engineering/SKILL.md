---
name: harness-engineering
description: AIエージェントのハーネス（AGENTS.md / CLAUDE.md、Rules、Skills、Hooks、permissions、MCP、Loop、Subagent、Graph）を設計・追加・棚卸し・評価するときに使う。「どこに書くべきか」の責務分離、導入順、deny/ask/allowの考え方、月次レビュー、削除基準、CLI更新時のチェック、before/after評価の最小手順を提供する。
---

# Harness Engineering

ハーネスは「設定を増やすプロジェクト」ではなく、エージェントの成功率・安全性・コストを継続的に最適化する薄い実行基盤である。良いハーネスとは、モデルを縛る大量設定ではなく、必要なときだけ正しい制御が働く状態を指す。

## 発動タイミング

- ルール・Skill・Hook・Subagentを新しく追加したい
- 既存ハーネスが重い・誤検知が多い・使われていないと感じた
- Codex / Claude Codeの大型更新に追従する
- ハーネス変更の効果を測りたい

## 責務分離: どこに書くか

| 性質 | 置き場所 |
|---|---|
| 常時守る少量の原則、build/test/lintコマンド、repo構造 | `AGENTS.md` / `CLAUDE.md` |
| 特定ファイル・技術にだけ効くルール | `.agents/rules/`（profile） |
| 再利用可能な手順 | Skill（必要時だけ本体を読む） |
| モデル判断に依存させたくない強制・自動検証 | Hook / permissions / sandbox |
| 外部システム | MCP（プロジェクトごとに必要なserverだけ） |
| 反復による修正 | Loop（loop-engineering skill） |
| 独立したcontextでの調査・レビュー | Subagent |
| 明示的な複数エージェントの状態遷移 | Graph（graph-engineering skill） |

常時contextは小さく保つ。長い手順はSkillへ、絶対に守らせたいことはHookへ移す。

## 導入順

最初から全部を有効にしない。

1. `AGENTS.md` / `CLAUDE.md`
2. PreToolUseの安全guard
3. 軽量なPostToolUse検証
4. loop-engineering
5. Research / Code Review
6. MCP profile
7. Subagent
8. Graph（必要性が実測できてから）

Hookはモデルより強い制御で、誤検知するとエージェントが作業不能になる。`log only → ask → deny` の順で強める。

## 安全性の考え方

- `deny`: 秘密情報、破壊的操作、不可逆操作
- `ask`: 影響が大きいが正当な用途がある操作
- `allow`: 通常の開発操作

自律性（Loop、Skill、tool、Subagent）と安全性（sandbox、permissions、PreToolUse Hook、秘密情報保護、network policy）は別の仕組みで扱う。自律性を上げるために安全境界を緩めるのではなく、安全境界の内側を広く自律運転させる。

## 変更ポリシー

ハーネスの変更は quality / reliability / safety / latency / token効率 / 人の介入率 / 保守性 のいずれかを改善しなければならない。改善理由を説明できない設定は追加しない。大きい変更はADR（Decision / Reason / Evidence / Revisit）を残す。

## 参照

- [references/philosophy.md](references/philosophy.md) — なぜこの構成か（常時contextの最小化、Loop優先、Graphを常用しない理由、MCP最小接続）
- [references/maintenance.md](references/maintenance.md) — 月次レビュー項目、削除基準、CLI更新時チェックリスト
- [references/evaluation.md](references/evaluation.md) — before/after評価の最小実験と計測項目
- [references/sources.md](references/sources.md) — 設計の根拠にした公式資料と、資料の優先順位
