# ボイラープレート利用ガイド

AI駆動開発（AIDD）でMVPを量産するためのテンプレートリポジトリ。
特定のAIツールに依存しない構成になっており、Claude Code / Cursor / Copilot / Cline 等で利用できる。

## セットアップ（初回のみ）

ボイラープレートを clone し、`aidd` コマンドを PATH へ通す。

```bash
git clone https://github.com/shogo-tanaka-work/AIDD-MVP-bilerPlate.git ~/開発/AIDD-MVP-bilerPlate
chmod +x ~/開発/AIDD-MVP-bilerPlate/bin/aidd ~/開発/AIDD-MVP-bilerPlate/scripts/apply-project-harness.sh
mkdir -p ~/bin && ln -sfn ~/開発/AIDD-MVP-bilerPlate/bin/aidd ~/bin/aidd
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
```

グローバルharness（`~/.agents`・`~/.claude`・`~/.codex`）を使う場合は、あわせて一度だけ実行する。

```bash
aidd apply-home
```

## クイックスタート

### 1. プロジェクトへ適用する

```bash
cd ~/開発/my-new-app      # 空でも、作り始めた後でもよい
aidd apply
```

技術profileが決まっていれば、対応するSkillとRuleも一緒に入る。

```bash
aidd apply --profile frontend
aidd apply --list-profiles     # 利用可能なprofile一覧
```

> **既存ファイルは上書きしません。** 手で書いた `AGENTS.md` などはそのまま残り、
> 差分があるものは「据え置き」として報告されます。`.gitignore` は不足行だけを追記します。
> 内容だけ先に見たいときは `--dry-run` を付けてください。

後日ボイラープレートを更新したら、同じコマンドで取り込める。

```bash
aidd apply --update       # 差分を .agents/backups/ へ退避してから更新
```

Gitリポジトリはプロジェクト側の判断で作る。

```bash
git init -b main && git add -A && git commit -m "init: AIDDボイラープレートを適用"
gh repo create my-new-app --private --source=. --push
```

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
docs/SPEC.md と AGENTS.md を読んでください。
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

1. `AGENTS.md` をそのツールのルールファイルとして読み込ませる
   - AGENTS.md を直接読むツールはそのまま使える
   - その他: プロジェクトルールとして指定するか、ルールファイルへコピーまたはシンボリックリンク
2. `docs/SPEC.md` と `AGENTS.md` を読ませてから実装を指示する
3. `.agents/rules/` 配下のルールも適宜参照させる

## テンプレートの構成

```
my-app/
├── AGENTS.md                    ← AIエージェントへの実装ルール（Claude Code / Codex 共通）
├── docs/
│   ├── SPEC.md                  ← 1枚もの仕様（技術スタックもここで決める）
│   └── ARCH.md                  ← アーキテクチャ決定記録
├── src/                         ← アプリ本体（SPEC.md のスタックで構成が決まる）
├── tests/                       ← テスト群（src/ と同じ階層構造）
├── .agents/                     ← AIツール非依存の正本
│   ├── rules/                   ← 共通ルールと技術profile
│   ├── skills/                  ← 再利用可能なスキル群
│   ├── memory/MEMORY.md         ← セッションをまたぐ継続情報（作業完了ごとに更新）
│   └── hooks/                   ← フック処理の本体
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
| `AGENTS.md` の基本コマンド欄 | スタック確定後に書き換え |
| `.agents/rules/` | スタック固有のルール追加時 |
| `.claude/settings.json` の allow | Python/Rust 等のコマンド追加時 |
| `.github/workflows/` | スタックに応じてセットアップ手順を変更 |
