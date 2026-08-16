---
name: architecture-decision-records
description: Claude Codeのセッション中に行われたアーキテクチャ上の決定を、構造化されたADRとして記録する。決定の瞬間を自動検出し、背景・検討した代替案・根拠を残す。ADRログを維持し、なぜコードベースが現在の形なのかを後の開発者が理解できるようにする。
metadata:
  origin: ECC
---

# Architecture Decision Records

コーディングセッション中に起きたアーキテクチャ上の決定をその場で記録する。決定がSlackのスレッドやPRコメント、誰かの記憶の中だけに留まるのではなく、このskillはコードと並んで存在する構造化されたADRドキュメントを生成する。

## 発動タイミング

- ユーザーが明示的に「この決定を記録して」「ADRにして」と言ったとき
- ユーザーが重要な選択肢（framework、library、pattern、database、API設計）から選ぶとき
- ユーザーが「〜することにした」「YではなくXにする理由は〜」と言ったとき
- ユーザーが「なぜXを選んだのか？」と尋ねたとき（既存ADRを読む）
- 計画段階でアーキテクチャのトレードオフを議論しているとき

## ADRのフォーマット

Michael Nygardが提案した軽量なADRフォーマットを、AI支援開発向けに調整して使う:

```markdown
# ADR-NNNN: [Decision Title]

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | deprecated | superseded by ADR-NNNN
**Deciders**: [who was involved]

## Context

この決定や変更を促している、いま見えている課題は何か。

[状況、制約、働いている力を2〜5文で記述する]

## Decision

提案あるいは実施しようとしている変更は何か。

[決定を1〜3文で明確に述べる]

## Alternatives Considered

### Alternative 1: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

### Alternative 2: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

## Consequences

この変更によって何がやりやすくなり、何がやりにくくなるか。

### Positive
- [benefit 1]
- [benefit 2]

### Negative
- [trade-off 1]
- [trade-off 2]

### Risks
- [risk and mitigation]
```

## ワークフロー

### 新しいADRを記録する

決定の瞬間を検出したら:

1. **初期化（初回のみ）** — `docs/adr/`が存在しない場合、ディレクトリ、index表のヘッダーを入れた`README.md`（後述のADR Index Formatを参照）、手動用の空の`template.md`を作る前にユーザーの確認を取る。明示的な同意なしにファイルを作らない。
2. **決定を特定する** — 行われているアーキテクチャ上の選択の核心を抽出する
3. **背景を集める** — どんな問題がきっかけか。どんな制約があるか
4. **代替案を記録する** — 他にどんな選択肢を検討したか。なぜ却下したか
5. **結果を述べる** — どんなトレードオフがあるか。何がやりやすく/やりにくくなるか
6. **番号を割り当てる** — `docs/adr/`の既存ADRを走査して採番する
7. **確認して書く** — ADRのドラフトをユーザーに提示してレビューを受ける。明示的な承認を得てから`docs/adr/NNNN-decision-title.md`へ書く。ユーザーが断った場合はファイルを書かずにドラフトを破棄する。
8. **indexを更新する** — `docs/adr/README.md`へ追記する

### 既存のADRを読む

ユーザーが「なぜXを選んだのか？」と尋ねたら:

1. `docs/adr/`があるか確認する。なければ「このプロジェクトにADRは見つかりません。アーキテクチャ上の決定の記録を始めますか？」と返す
2. あれば`docs/adr/README.md`のindexから該当するエントリを探す
3. 一致したADRファイルを読み、ContextとDecisionのセクションを提示する
4. 一致がなければ「その決定のADRは見つかりません。いま記録しますか？」と返す

### ADRのディレクトリ構成

```
docs/
└── adr/
    ├── README.md              ← 全ADRのindex
    ├── 0001-use-nextjs.md
    ├── 0002-postgres-over-mongo.md
    ├── 0003-rest-over-graphql.md
    └── template.md            ← 手動用の空テンプレート
```

### ADR indexのフォーマット

```markdown
# Architecture Decision Records

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-use-nextjs.md) | Use Next.js as frontend framework | accepted | 2026-01-15 |
| [0002](0002-postgres-over-mongo.md) | PostgreSQL over MongoDB for primary datastore | accepted | 2026-01-20 |
| [0003](0003-rest-over-graphql.md) | REST API over GraphQL | accepted | 2026-02-01 |
```

## 決定を検出するシグナル

会話の中でアーキテクチャ上の決定を示す次のパターンに注意する:

**明示的なシグナル**
- 「Xでいこう」
- 「YではなくXを使うべきだ」
- 「〜という理由でこのトレードオフは受け入れられる」
- 「これをADRとして記録して」

**暗黙的なシグナル**（ADRの記録を提案する。ユーザーの確認なしに自動作成しない）
- 2つのframeworkやlibraryを比較して結論に至る
- 根拠を伴うdatabase schemaの設計判断を行う
- アーキテクチャパターンを選ぶ（monolith対microservices、REST対GraphQL）
- 認証・認可の戦略を決める
- 代替案を評価した上でdeploy基盤を選ぶ

## 良いADRの条件

### すること
- **具体的にする** — 「ORMを使う」ではなく「Prisma ORMを使う」
- **理由を記録する** — 何をしたかより、なぜそうしたかが重要
- **却下した代替案を含める** — 後の開発者は何が検討されたかを知る必要がある
- **結果を正直に述べる** — あらゆる決定にトレードオフがある
- **短く保つ** — ADRは2分で読める分量にする
- **現在形で書く** — 「Xを使う予定だ」ではなく「Xを使う」

### しないこと
- 些細な決定を記録しない — 変数名やフォーマットの選択にADRは不要
- 長文を書かない — Contextセクションが10行を超えたら長すぎる
- 代替案を省かない — 「なんとなく選んだ」は妥当な根拠ではない
- 印なしに遡って記録しない — 過去の決定を記録する場合は元の日付を記す
- ADRを陳腐化させない — 置き換えられた決定は後継への参照を持たせる

## ADRのライフサイクル

```
proposed → accepted → [deprecated | superseded by ADR-NNNN]
```

- **proposed**: 決定は議論中で、まだ確定していない
- **accepted**: 決定は有効で、実際に従われている
- **deprecated**: 決定はもはや関係ない（例: 機能が削除された）
- **superseded**: 新しいADRがこれを置き換える（必ず後継へリンクする）

## 記録する価値のある決定のカテゴリ

| カテゴリ | 例 |
|----------|---------|
| **技術選定** | framework、言語、database、クラウドプロバイダ |
| **アーキテクチャパターン** | monolith対microservices、event-driven、CQRS |
| **API設計** | REST対GraphQL、versioning戦略、認証方式 |
| **データモデリング** | schema設計、正規化の判断、caching戦略 |
| **インフラ** | deployモデル、CI/CD pipeline、monitoring構成 |
| **セキュリティ** | 認証戦略、暗号化方針、secretの管理 |
| **テスト** | test framework、coverage目標、E2Eとintegrationの比重 |
| **プロセス** | branch戦略、レビュー手順、リリース頻度 |

## 他skillとの連携

- **Planner agent**: plannerがアーキテクチャ変更を提案したら、ADRの作成を提案する
- **Code reviewer agent**: 対応するADRなしにアーキテクチャ変更を持ち込むPRを指摘する
