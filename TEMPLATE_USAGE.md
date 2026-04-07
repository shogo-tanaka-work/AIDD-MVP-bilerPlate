# ボイラープレート利用ガイド

AI駆動開発（AIDD）でMVPを量産するためのテンプレートリポジトリ。
特定のAIツールに依存しない構成になっており、Claude Code / Cursor / Copilot / Cline 等で利用できる。

## クイックスタート

### 1. テンプレートから新規プロジェクトを作成

```bash
# ワンコマンドで新規プロジェクトを作成（Git履歴なし）
./init.sh my-new-app
cd my-new-app
```

> `init.sh` はボイラープレートのファイルをコピーし、Git履歴をリセットして
> 新規リポジトリとして初期化します。テンプレート用ファイルも自動で削除されます。
> GitHub に public リポジトリを作成し、プッシュまで自動で行います。
>
> **前提:** `gh`（GitHub CLI）がインストール・認証済みであること。
> 未認証の場合は先に `gh auth login` を実行してください。

### 2. GitHubリポジトリを設定する（5分）

`docs/GITHUB_SETUP.md` に従い、以下を設定する:

- mainブランチの保護（Rulesets）
- マージ戦略（Squash merge のみ）
- Dependabot有効化
- ANTHROPIC_API_KEY Secret（Claude Code Action使用時）

> これらはリポジトリのコードに含まれないため、プロジェクトごとに手動設定が必要。

### 3. SPEC.md を書く（15～30分）

`docs/SPEC.md` を開き、以下を埋める:

- 目的（1行）
- 技術スタック（フロント / バック / DB / 認証 / デプロイ / テスト）
- コア機能（3〜5個）
- やらないこと
- 完了の定義

**これが最も重要なステップ。** SPEC.md がないまま実装を始めてはいけない。

### 4. AIエージェントに投げる

#### Claude Code（CLI）の場合

```
docs/SPEC.md と CLAUDE.md を読んでください。
読み終えたら、まずプランモードで以下を確認してください：
1. 実装する機能の一覧と順序
2. 必要なファイルの構成
3. 懸念点があれば指摘
承認後、TDDで実装を開始してください。
```

#### GitHub連携（Claude Code Action）の場合

1. GitHub Secrets に `ANTHROPIC_API_KEY` を登録
2. `00_initial` イシューテンプレートで SPEC.md の内容を貼り付け
3. コメントで `@claude 初期セットアップを実行してください`
4. 以降は機能ごとにイシュー → `@claude` → PR のループ

#### Cursor / Copilot / Cline 等の場合

1. `CLAUDE.md` をそのツールのルールファイルとして読み込ませる
   - Cursor: `.cursorrules` にコピーまたはシンボリックリンク
   - その他: プロジェクトルールとして指定
2. `docs/SPEC.md` と `CLAUDE.md` を読ませてから実装を指示する
3. `.claude/rules/` 配下のルールも適宜参照させる

## テンプレートの構成

```
my-app/
├── CLAUDE.md                    ← AIエージェントへの実装ルール
├── docs/
│   ├── SPEC.md                  ← 1枚もの仕様（技術スタックもここで決める）
│   └── ARCH.md                  ← アーキテクチャ決定記録
├── src/                         ← アプリ本体（SPEC.md のスタックで構成が決まる）
├── tests/                       ← テスト群（src/ と同じ階層構造）
├── .claude/
│   ├── settings.json            ← 権限設定（Claude Code CLI 用ガードレール）
│   ├── rules/                   ← 詳細ルール（コーディング規約・テスト・設計）
│   └── agents/                  ← 専門サブエージェント（レビュー・セキュリティ）
├── .github/
│   ├── ISSUE_TEMPLATE/          ← イシューテンプレート（初期/機能/バグ/リファクタ）
│   ├── workflows/               ← GitHub Actions（CI・自動実装・自動レビュー）
│   └── pull_request_template.md
├── .env.example                 ← 環境変数テンプレート
├── .gitignore
└── README.md                    ← プロジェクトのREADME（初期化時に書き換える）
```

## 開発フローの全体像

```
SPEC.md を書く
  ↓
AIエージェントに投げる（プランモードで設計確認）
  ↓
TDDループ（テスト先行 → 実装 → テスト通過）
  ↓
PR作成 → CI通過 → 人間がレビュー → マージ
  ↓
次の機能へ（イシュー単位で繰り返す）
```

## 核心ルール

1. **SPEC.md なしで実装を始めない**
2. **テストを先に書く（TDD必須）**
3. **仕様にない機能を先取りしない**
4. **main への直接プッシュ禁止（必ずPR経由）**

## カスタマイズのポイント

| ファイル | いつ変更するか |
|---|---|
| `docs/SPEC.md` | プロジェクト開始時に必ず書く |
| `CLAUDE.md` の基本コマンド欄 | スタック確定後に書き換え |
| `.claude/rules/` | スタック固有のルール追加時 |
| `.claude/settings.json` の allow | Python/Rust 等のコマンド追加時 |
| `.github/workflows/` | スタックに応じてセットアップ手順を変更 |
