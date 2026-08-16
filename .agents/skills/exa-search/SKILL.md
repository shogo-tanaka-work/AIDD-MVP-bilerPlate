---
name: exa-search
description: Exa MCPによるweb・コード・企業リサーチのneural search。web検索、コード例、企業情報、人物調査、Exaのneural search engineを使ったAIによる深掘りリサーチが必要なときに使う。
metadata:
  origin: ECC
---

# Exa Search

> **陳腐化しやすいskill。** Exa MCPのtool名、parameter、アカウント上限は
> 変わりうる。特定の検索mode、category、livecrawlの挙動に依存する前に、
> 公開されているtoolの構成と最新のExaドキュメントを確認する。

Exa MCP serverを介した、webコンテンツ・コード・企業・人物のneural search。

## 発動タイミング

- 最新のweb情報やニュースが必要なとき
- コード例、APIドキュメント、技術リファレンスを探すとき
- 企業、競合、市場のプレイヤーを調べるとき
- ある分野の専門家プロフィールや人物を探すとき
- 開発タスクの事前リサーチを行うとき
- ユーザーが「検索して」「調べて」「探して」「最新はどうなっている」と言ったとき

## MCPの要件

Exa MCP serverの設定が必要。`~/.claude.json`へ追加する。

```json
"exa-web-search": {
  "command": "npx",
  "args": ["-y", "exa-mcp-server"],
  "env": { "EXA_API_KEY": "YOUR_EXA_API_KEY_HERE" }
}
```

APIキーは[exa.ai](https://exa.ai)で取得する。
このリポジトリの現在のExa設定は、ここに記載したtool構成を前提とする: `web_search_exa`と`get_code_context_exa`。
自分のExa serverが追加のtoolを公開している場合は、ドキュメントやpromptで依存する前に正確な名前を確認する。

## 中核のtool

### web_search_exa
最新情報、ニュース、事実を調べる一般的なweb検索。

```
web_search_exa(query: "latest AI developments 2026", numResults: 5)
```

**parameter:**

| Param | Type | Default | 備考 |
|-------|------|---------|-------|
| `query` | string | 必須 | 検索query |
| `numResults` | number | 8 | 結果件数 |
| `type` | string | `auto` | 検索mode |
| `livecrawl` | string | `fallback` | 必要に応じてlive crawlを優先する |
| `category` | string | なし | `company`や`research paper`などの任意の絞り込み |

### get_code_context_exa
GitHub、Stack Overflow、ドキュメントサイトからコード例とドキュメントを探す。

```
get_code_context_exa(query: "Python asyncio patterns", tokensNum: 3000)
```

**parameter:**

| Param | Type | Default | 備考 |
|-------|------|---------|-------|
| `query` | string | 必須 | コードまたはAPIの検索query |
| `tokensNum` | number | 5000 | コンテンツのtoken数（1000-50000） |

## 利用パターン

### 手早い確認
```
web_search_exa(query: "Node.js 22 new features", numResults: 3)
```

### コードのリサーチ
```
get_code_context_exa(query: "Rust error handling patterns Result type", tokensNum: 3000)
```

### 企業・人物のリサーチ
```
web_search_exa(query: "Vercel funding valuation 2026", numResults: 3, category: "company")
web_search_exa(query: "site:linkedin.com/in AI safety researchers Anthropic", numResults: 5)
```

### 技術の深掘り
```
web_search_exa(query: "WebAssembly component model status and adoption", numResults: 5)
get_code_context_exa(query: "WebAssembly component model examples", tokensNum: 4000)
```

## Tips

- 最新情報、企業調査、広い探索には`web_search_exa`を使う
- `site:`、引用符付きフレーズ、`intitle:`などの検索演算子で結果を絞る
- 絞り込んだコード断片には`tokensNum`を下げ（1000-2000）、包括的な文脈には上げる（5000以上）
- 一般的なwebページではなくAPIの使い方やコード例が必要なときは`get_code_context_exa`を使う

## 関連skill

- `deep-research` — firecrawlとexaを組み合わせたリサーチworkflow全体
- `market-research` — 意思決定フレームワークを備えたビジネス向けリサーチ
