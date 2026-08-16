---
name: workspace-surface-audit
description: 作業中のrepo、MCP server、plugin、connector、環境変数のsurface、harness構成を監査し、価値の高いECC-nativeなskill・hook・agent・運用workflowを提案する。ユーザーがClaude Codeのセットアップを求めるとき、自分の環境で実際に使える機能を把握したいときに使う。
metadata:
  origin: ECC
---

# workspace surface監査

「このworkspaceとマシンは今実際に何ができるのか、次に何を追加・有効化すべきか」に答えるための読み取り専用の監査skill。

setup-audit系pluginに対するECC-nativeな答えにあたる。ユーザーが明示的に後続の実装を求めない限りファイルを変更しない。

## 使いどころ

- ユーザーが「Claude Codeをセットアップして」「自動化を提案して」「どのpluginやMCPを使うべき？」「何が足りていない？」と言ったとき
- skill、hook、connectorを追加インストールする前にマシンやrepoを監査する
- 公式marketplaceのpluginとECC-nativeの守備範囲を比較する
- `.env`、`.mcp.json`、plugin設定、連携アプリのsurfaceを確認し、欠けているworkflow層を見つける
- ある機能をskill、hook、agent、MCP、外部connectorのどれにすべきか判断する

## 譲れないルール

- 秘密値を出力しない。provider名、機能名、ファイルpath、keyや設定の有無だけを示す。
- ECCが妥当に担える領域では、一般的な「別のpluginを入れる」助言よりECC-nativeなworkflowを優先する。
- 外部pluginはベンチマークと着想源として扱い、製品境界の正解とはみなさない。
- 次の3つを明確に分ける。
  - すでに今使えるもの
  - 使えるがECCで十分に包めていないもの
  - 使えず、新規の統合が必要なもの

## 監査の入力

問いに十分答えるために必要なファイルと設定だけを確認する。

1. repoのsurface
   - `package.json`、lockfile、言語マーカー、framework設定、`README.md`
   - `.mcp.json`、`.lsp.json`、`.claude/settings*.json`、`.codex/*`
   - `AGENTS.md`、`CLAUDE.md`、インストールmanifest、hook設定
2. 環境のsurface
   - 作業中のrepoと明らかに隣接するECC workspaceの`.env*`ファイル
   - `STRIPE_API_KEY`、`TWILIO_AUTH_TOKEN`、`FAL_KEY`のようなkey名だけを示す
3. 連携toolのsurface
   - インストール済みplugin、有効なconnector、MCP server、LSP、アプリ連携
4. ECCのsurface
   - 既にそのニーズを満たしているskill、command、hook、agent、インストールmodule

## 監査の進め方

### Phase 1: 存在するものを棚卸しする

簡潔なインベントリを作る。

- 有効なharnessの対象
- インストール済みpluginと連携アプリ
- 設定済みMCP server
- 設定済みLSP server
- key名から推測されるenv由来のサービス
- workspaceに関係する既存のECC skill

primitiveとしてしか存在しないsurfaceは明示する。例:

- 「Stripeは連携アプリ経由で使えるが、ECCにbilling-operator skillがない」
- 「Google Driveは連携済みだが、ECC-nativeなGoogle Workspaceの運用workflowがない」

### Phase 2: 公式・インストール済みsurfaceと比較する

workspaceを次と比較する。

- セットアップ、レビュー、docs、design、workflow品質と重なる公式Claude plugin
- ClaudeまたはCodexにローカルインストールされたplugin
- ユーザーが現在連携しているアプリのsurface

名前を並べるだけにしない。比較ごとに次へ答える。

1. 実際に何をするのか
2. ECCが既に同等か
3. ECCがprimitiveしか持っていないか
4. ECCがそのworkflowを丸ごと欠いているか

### Phase 3: ギャップをECCの判断へ落とす

実在するギャップごとに、正しいECC-nativeな形を提案する。

| ギャップの種類 | 適したECCの形 |
|----------|---------------------|
| 反復可能な運用workflow | Skill |
| 自動的な強制や副作用 | Hook |
| 専門的な委譲役割 | Agent |
| 外部toolの橋渡し | MCP serverまたはconnector |
| インストール・初期構築の案内 | セットアップまたは監査skill |

ニーズがインフラ面ではなく運用面なら、既存toolを組み合わせる利用者向けskillを既定とする。

## 出力形式

次の順で5つのセクションを返す。

1. **現状のsurface**
   - 今すぐ使えるもの
2. **同等性**
   - ECCが既にベンチマークと同等以上の領域
3. **primitiveのみのギャップ**
   - toolはあるが、ECCに整理された運用skillがない
4. **欠けている統合**
   - まだ使えない機能
5. **次の一手3〜5件**
   - 影響度順に並べた具体的なECC-nativeな追加

## 提案のルール

- カテゴリごとに価値の高い案を1〜2件までに絞る。
- 利用者の意図とビジネス価値が明確なskillを優先する。
  - セットアップ監査
  - 課金・顧客対応
  - issue・プログラム運用
  - Google Workspace運用
  - deploy・運用制御
- 企業固有のconnectorは、実際に利用可能か、ユーザーのworkflowに明確に有用な場合だけ提案する。
- ECCに強力なprimitiveが既にあるなら、新しいサブシステムを作らずwrapper skillを提案する。

## 良い成果の条件

- ユーザーが、何が連携済みで、何が欠けていて、次にECCが何を担うべきかをすぐ把握できる。
- 提案が、再調査なしでrepoへ実装できる程度に具体的である。
- 最終回答がAPIブランドではなくworkflowを軸に整理されている。
