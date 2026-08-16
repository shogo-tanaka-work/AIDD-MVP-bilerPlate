---
name: security-scan
description: AgentShieldを使い、Claude Codeの設定（.claude/ディレクトリ）の脆弱性・設定ミス・injectionリスクをscanする。CLAUDE.md、settings.json、MCP server、hook、agent定義を確認する。.claude/ディレクトリ（CLAUDE.md、settings.json、MCP server、hook、agent定義）を監査するときに使う。
metadata:
  origin: ECC
---

# security scan skill

[AgentShield](https://github.com/affaan-m/agentshield)を使ってClaude Codeの設定のセキュリティ問題を監査する。

## 発動タイミング

- Claude Codeのプロジェクトを新規に立ち上げる
- `.claude/settings.json`、`CLAUDE.md`、MCP設定を変更した後
- 設定変更をcommitする前
- 既存のClaude Code設定があるリポジトリに参加したとき
- 定期的なセキュリティ衛生チェック

## scan対象

| ファイル | 確認内容 |
|------|--------|
| `CLAUDE.md` | ハードコードされた秘密値、自動実行の指示、prompt injectionパターン |
| `settings.json` | 過度に緩いallow list、deny listの欠落、危険なbypass flag |
| `mcp.json` | リスクのあるMCP server、ハードコードされたenvの秘密値、npxのsupply chainリスク |
| `hooks/` | 展開によるcommand injection、データ持ち出し、エラーの黙殺 |
| `agents/*.md` | 無制限のtoolアクセス、prompt injectionの攻撃面、model指定の欠落 |

## 前提条件

AgentShieldがインストールされている必要がある。確認し、必要ならインストールする。

```bash
# インストール済みか確認する
npx ecc-agentshield --version

# グローバルにインストールする（推奨）
npm install -g ecc-agentshield

# もしくはnpxで直接実行する（インストール不要）
npx ecc-agentshield scan .
```

## 使い方

### 基本のscan

現在のプロジェクトの`.claude/`ディレクトリに対して実行する。

```bash
# 現在のプロジェクトをscanする
npx ecc-agentshield scan

# 特定のpathをscanする
npx ecc-agentshield scan --path /path/to/.claude

# 最小severityで絞り込んでscanする
npx ecc-agentshield scan --min-severity medium
```

### 出力形式

```bash
# ターミナル出力（既定）— 評点付きのカラーレポート
npx ecc-agentshield scan

# JSON — CI/CD連携向け
npx ecc-agentshield scan --format json

# Markdown — ドキュメント向け
npx ecc-agentshield scan --format markdown

# HTML — 自己完結したdark themeレポート
npx ecc-agentshield scan --format html > security-report.html
```

### 自動修正

安全な修正を自動適用する（auto-fixable と判定されたものだけ）。

```bash
npx ecc-agentshield scan --fix
```

このとき次を行う。
- ハードコードされた秘密値を環境変数参照へ置き換える
- wildcardのpermissionをscope付きの代替へ狭める
- 手動対応のみの提案は変更しない

### Opus 4.6による深掘り解析

敵対的な3エージェントpipelineを実行し、より深く解析する。

```bash
# ANTHROPIC_API_KEYが必要
export ANTHROPIC_API_KEY=your-key
npx ecc-agentshield scan --opus --stream
```

実行内容は次のとおり。
1. **Attacker (Red Team)** — 攻撃経路を洗い出す
2. **Defender (Blue Team)** — 堅牢化を提案する
3. **Auditor (Final Verdict)** — 両者の視点を統合する

### 安全な設定の初期化

安全な`.claude/`設定を一から生成する。

```bash
npx ecc-agentshield init
```

生成されるもの。
- scope付きpermissionとdeny listを持つ`settings.json`
- セキュリティのベストプラクティスを記載した`CLAUDE.md`
- `mcp.json`のプレースホルダ

### GitHub Action

CI pipelineへ追加する。

```yaml
- uses: affaan-m/agentshield@v1
  with:
    path: '.'
    min-severity: 'medium'
    fail-on-findings: true
```

## severityの水準

| 評点 | スコア | 意味 |
|-------|-------|---------|
| A | 90-100 | 安全な設定 |
| B | 75-89 | 軽微な問題 |
| C | 60-74 | 要注意 |
| D | 40-59 | 重大なリスク |
| F | 0-39 | 致命的な脆弱性 |

## 結果の読み方

### Critical（ただちに修正する）
- 設定ファイル内のハードコードされたAPI keyやtoken
- allow listの`Bash(*)`（無制限のshellアクセス）
- hook内の`${file}`展開によるcommand injection
- shellを起動するMCP server

### High（本番前に修正する）
- CLAUDE.md内の自動実行の指示（prompt injectionの経路）
- permissionにdeny listがない
- 不要なBashアクセスを持つagent

### Medium（対応を推奨する）
- hook内でのエラーの黙殺（`2>/dev/null`、`|| true`）
- PreToolUseのセキュリティhookがない
- MCP server設定での`npx -y`による自動インストール

### Info（把握しておく）
- MCP serverのdescriptionがない
- 禁止事項の指示が良い実践として正しく検出されている

## リンク

- **GitHub**: [github.com/affaan-m/agentshield](https://github.com/affaan-m/agentshield)
- **npm**: [npmjs.com/package/ecc-agentshield](https://www.npmjs.com/package/ecc-agentshield)
