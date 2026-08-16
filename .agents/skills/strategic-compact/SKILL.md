---
name: strategic-compact
description: 恣意的なauto-compactionに任せず、タスクの区切りで手動のcontext compactionを提案し、フェーズをまたいでcontextを維持する。セッションがcontext上限に近づき、タスクのフェーズが自然な区切りになっているときに使う。
metadata:
  origin: ECC
---

# Strategic Compact Skill

恣意的なauto-compactionに頼らず、workflowの戦略的なポイントで手動の`/compact`を提案する。

## 発動タイミング

- context上限（200K+ tokens）へ近づく長時間セッションを実行しているとき
- 複数フェーズのタスク（調査 → 計画 → 実装 → test）に取り組んでいるとき
- 同一セッション内で無関係なタスクへ切り替えるとき
- 大きなマイルストーンを終えて新しい作業を始めるとき
- 応答が遅くなる、または一貫性が落ちてきたとき（context圧迫）

## なぜ戦略的なcompactionか

Auto-compactionは恣意的なタイミングで発動する:
- タスクの途中で起きることが多く、重要なcontextを失う
- 論理的なタスク境界を認識しない
- 複雑な多段階の操作を中断しうる

論理的な境界での戦略的なcompaction:
- **探索の後、実行の前** — 調査contextをcompactし、実装計画を残す
- **マイルストーン完了後** — 次のフェーズを新しい状態で始める
- **大きなcontext切り替えの前** — 別タスクの前に探索contextを整理する

## 仕組み

`suggest-compact.js`スクリプトはPreToolUse（Edit/Write）で実行され、2つのシグナルを組み合わせる:

1. **contextサイズ（主）** — セッションのtranscript（hook payloadの`transcript_path`）から最新の`usage`レコードを読み、`input_tokens + cache_read_input_tokens + cache_creation_input_tokens`を合計する（そのturnの実際のcontextサイズ）。window規模に応じた閾値で`/compact`を提案し（200k windowでは160k tokens、1M windowでは250k。`[1m]`のmodel markerから検出するか、観測tokenがすでに200kを超えていれば推定する）、以降はcontextが60k tokens増えるごとに再通知する
2. **tool呼び出し回数（副）** — セッション中のtool呼び出しを数え、設定可能な閾値（既定: 50回）で提案し、以降は25回ごとに提案する

tool呼び出し回数だけではwindow圧迫の代理指標として弱い。大きなファイル読み取りやMCPの応答がわずかな呼び出しでwindowを埋めることもあれば、小さな呼び出しが多数あってもwindowがほぼ空のまま50回を超えることもある。contextサイズのシグナルは、実際に重要になったときに発火する。

## Hookの設定

**pluginとして導入した場合** 設定は不要。pluginの`hooks/hooks.json`がすでに`suggest-compact.js`を登録している（hook id `pre:edit-write:suggest-compact`、`standard`と`strict`のhook profileで有効）。下のブロックを`~/.claude/settings.json`へコピーしないこと。plugin導入では`~/.claude/scripts/`が存在せず、plugin hookを重複させると二重実行になる。

**手動で導入した場合**（`./install.sh`）、`~/.claude/settings.json`へ次を追加する:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "node ~/.claude/scripts/hooks/suggest-compact.js" }]
      },
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "node ~/.claude/scripts/hooks/suggest-compact.js" }]
      }
    ]
  }
}
```

## 設定

環境変数:
- `COMPACT_THRESHOLD` — 最初の提案までのtool呼び出し回数（既定: 50）
- `COMPACT_CONTEXT_THRESHOLD` — contextサイズによる提案までのcontext token数（既定: 200k windowで160000、1M windowで250000。`0`でcontextシグナルを無効化）
- `COMPACT_CONTEXT_INTERVAL` — 提案を繰り返すまでの追加context token数（既定: 60000）
- `COMPACT_STATE_TTL_DAYS` — tempディレクトリ内の古いセッション別state fileを掃除するまでの日数（既定: 14）
- `ECC_CONTEXT_WINDOW_TOKENS` — 自動検出を上書きするcontext windowサイズ（token単位）。報告されるidに`[1m]` markerがない大きなwindowのmodel（例: 400kのOpus 4.x、新しい1M window系）ではこれを設定し、既定の200kでcontext使用量を過大評価せず実際のwindowに合わせて閾値をスケールさせる。
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` — Claude Code本体のwindowサイズ上書き（token単位）。`ECC_CONTEXT_WINDOW_TOKENS`が未設定のときのフォールバックとして尊重される。

> それ以外の場合、context windowは`[1m]`のmodel markerから自動検出されるか、観測tokenがすでに200kを超えていれば推定される。どちらのシグナルも持たない大きなwindowのmodelでは、上記いずれかの上書きを設定して`/compact`の提案が適切なタイミングで発火するようにする。

## Compaction判断ガイド

いつcompactするかはこの表で判断する:

| フェーズ遷移 | compactする? | 理由 |
|-----------------|----------|-----|
| 調査 → 計画 | Yes | 調査contextはかさばる。計画はその蒸留された成果 |
| 計画 → 実装 | Yes | 計画はTodoWriteかファイルにある。コードのためにcontextを空ける |
| 実装 → test | Maybe | testが直近のコードを参照するなら残す。焦点が変わるならcompactする |
| debug → 次の機能 | Yes | debugの痕跡は無関係な作業のcontextを汚す |
| 実装の途中 | No | 変数名、ファイルパス、途中状態を失う代償が大きい |
| 失敗した方針の後 | Yes | 新しい方針を試す前に行き詰まった推論を消す |

## Compactionで残るもの

何が残るかを理解すれば、安心してcompactできる:

| 残る | 失われる |
|----------|------|
| CLAUDE.mdの指示 | 途中の推論と分析 |
| TodoWriteのタスク一覧 | 以前に読んだファイルの内容 |
| Memoryファイル（`~/.claude/memory/`） | 多段階の会話context |
| Gitの状態（commit、branch） | tool呼び出しの履歴と回数 |
| ディスク上のファイル | 口頭で述べられた細かなユーザーの好み |

## ベストプラクティス

1. **計画の後にcompactする** — TodoWriteで計画が確定したらcompactして新しく始める
2. **debugの後にcompactする** — 続ける前にエラー解決のcontextを消す
3. **実装の途中でcompactしない** — 関連する変更のためにcontextを維持する
4. **提案を読む** — hookは*いつ*かを伝える。*するかどうか*は自分で決める
5. **compact前に書き出す** — 重要なcontextはcompact前にファイルやmemoryへ保存する
6. **`/compact`に要約を添える** — カスタムメッセージを付ける: `/compact Focus on implementing auth middleware next`

## Token最適化パターン

### Trigger-Table Lazy Loading
セッション開始時にskillの全文を読み込むのではなく、キーワードとskillのpathを対応づけるtrigger tableを使う。skillはtriggerされたときだけ読み込まれ、ベースラインのcontextを50%以上削減する:

| Trigger | Skill | 読み込むタイミング |
|---------|-------|-----------|
| "test", "tdd", "coverage" | tdd-workflow | testに言及したとき |
| "security", "auth", "xss" | security-review | セキュリティ関連の作業 |
| "deploy", "ci/cd" | deployment-patterns | deployのcontext |

### Context構成の把握
context windowを何が消費しているかを監視する:
- **CLAUDE.mdファイル** — 常に読み込まれる。軽く保つ
- **読み込んだskill** — skill 1つあたり1〜5K tokens増える
- **会話履歴** — やり取りごとに増える
- **tool結果** — ファイル読み取りや検索結果がかさばる

### 重複指示の検出
contextが重複するよくある原因:
- `~/.claude/rules/`とプロジェクトの`.claude/rules/`に同じruleがある
- CLAUDE.mdの指示を繰り返しているskill
- 領域が重なる複数のskill

### Context最適化ツール
- `token-optimizer` MCP — 内容の重複排除により95%以上のtoken削減を自動化
- `context-mode` — contextの仮想化（315KBから5.4KBへの削減を実証）

## 関連

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) — token最適化のセクション
- Memory永続化のhook — compactionを越えて残る状態のために
- `continuous-learning` skill — セッション終了前にパターンを抽出する
