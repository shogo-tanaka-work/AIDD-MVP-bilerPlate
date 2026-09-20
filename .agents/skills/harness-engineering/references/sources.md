# 設計の根拠にした資料

確認日: 2026-09-09

設定例のコピペではなく、公式の設計原則を優先して構成している。Codex / Claude Codeは更新が速いため、Hook event名や設定キーは導入時にインストール済みversionの公式ドキュメントと照合する。

## OpenAI / Codex

### Running Codex safely at OpenAI
https://openai.com/index/running-codex-safely/

- sandboxとapprovalを分離する
- bounded environmentの内側では低リスク操作を滑らかに実行する
- high-risk操作はreviewする
- network accessを無制限にしない
- telemetry / auditability

### Unrolling the Codex agent loop
https://openai.com/index/unrolling-the-codex-agent-loop/

- sandbox / permission / developer instructions / user instructionsがagent loopへ入る構造
- AGENTS.md discovery
- context injectionをboundedにする

### OpenAI Codex repository
https://github.com/openai/codex

- `codex-rs/core/config.schema.json`
- AGENTS.md
- 現行のfeature flag / hooks / multi-agent実装

## Anthropic / Claude Code

### Steering Claude Code: when to use CLAUDE.md, skills, hooks, and subagents
https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more

- root CLAUDE.mdは常時context costが高い
- 手順はSkillへ
- 決定論的な自動化はHookへ
- 絶対的なguardrailはpermission / Hookへ
- Subagentは隔離contextと並列の副タスクへ

### Agent Skills overview
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

- progressive disclosure
- name / descriptionでdiscoveryし、本体は必要時にロード
- filesystemベースの再利用可能なworkflow

### Claude Code documentation
https://code.claude.com/docs

- hooks、permissions、skills、subagents、MCP、security、changelog

## 資料の優先順位

ハーネス更新時は次の順で確認する。

1. 公式docs
2. 公式のソースリポジトリ / schema
3. 公式のengineering blog
4. 保守されているサードパーティ実装
5. 挙動差に関するissue / discussion
