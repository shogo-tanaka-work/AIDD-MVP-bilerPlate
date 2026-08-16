# [プロジェクト名]

## 最初に確認するもの

1. `docs/SPEC.md` — 仕様と技術スタック
2. `docs/ARCH.md` — アーキテクチャ判断
3. `.agents/rules/` — 共通ルールと採用profile
4. `.agents/memory/MEMORY.md` — このプロジェクト固有の継続情報

作業単位が完了したら`.agents/memory/MEMORY.md`の現在地・次にやること・未解決の課題を更新する。仕様と設計判断は`docs/`が正本なので、memoryへ二重に書かない。

## 作業原則

- 複雑な変更は、対象・変更方針・検証方法を示してから着手する。
- 仕様外の機能を先取りしない。必要な抽象化だけを追加する。
- 既存の動作と未コミット差分を尊重し、関係のない変更を混ぜない。
- 副作用は境界へ寄せ、業務ロジックは可能な限り純粋関数として書く。
- 外部入力は信頼せず、境界で検証して型を狭める。
- エラーを握りつぶさず、操作の文脈を付けて扱う。
- 変更後は、対象に応じてテスト・型検査・lint・build・差分確認を行う。

## Subagentの使いどころ

以下に該当する場合、指示を待たずに該当subagentへ委譲する。定義は`.claude/agents/`と`.codex/agents/`にある。

- 変更前に実行経路・依存・既存規約を把握する必要があるとき → `explorer`
- 複数ファイルへ渡る変更や、コア機能の実装を終えたとき → `code-reviewer`
- 認証・認可、外部入力の処理、秘密値の扱いに触れたとき → `security-auditor`
- 未知のAPI・framework・versionの挙動を前提に実装するとき → `docs-researcher`

いずれも読み取り専用で、変更の採否は親エージェントが判断する。報告を鵜呑みにせず、根拠を確認してから反映する。

## Git

- Conventional Commitsを使い、本文は日本語で書く。
- ユーザー確認なしにcommit・pushしない。
- mainへ直接pushしない。

## 秘密情報

- `.env`、秘密鍵、credentialsファイルを読まない・表示しない・検索しない。
- 実値ではなく`.env.example`や変数名だけを参照する。
- ログ、例外、APIレスポンスへ秘密情報や個人情報を含めない。

## 共通資産の参照

- Skills: `.agents/skills/<skill-name>/SKILL.md`
- Rules: `.agents/rules/*.md` と `.agents/rules/profiles/`
- Hooks正本: `.agents/hooks/`（登録は`.claude/`・`.codex/`で個別に行う）
- Subagents: `.claude/agents/` と `.codex/agents/`（各AIの定義形式に分離する）

技術profileは採用したものだけ参照する。プロジェクト固有の数値目標・パス・運用判断は共通資産へ混ぜず、`docs/`または`.agents/memory/`へ置く。
