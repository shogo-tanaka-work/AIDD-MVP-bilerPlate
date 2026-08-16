@AGENTS.md

# Claude Code adapter

- 共通指示は`AGENTS.md`を正本とする。
- SkillsとRulesは`.claude/`から`.agents/`へのリンクを通して参照する。
- Claude固有のsubagent定義は`.claude/agents/`に置く。
- Hook登録は`.claude/settings.json`に置き、処理本体は`.agents/hooks/`を参照する。
