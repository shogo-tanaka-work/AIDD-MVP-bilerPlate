---
name: git-workflow
description: ブランチ戦略、commit規約、merge対rebase、コンフリクト解消、あらゆる規模のチーム向けの共同開発ベストプラクティスを含むGitワークフローパターン。ブランチ戦略を選ぶとき、commit規約を定めるとき、mergeとrebaseを判断するとき、コンフリクトを解消するときに使う。
metadata:
  origin: ECC
---

# Git Workflow Patterns

Gitのバージョン管理、ブランチ戦略、共同開発の判断基準。具体的なコマンド・テンプレートは`references/`にある。プロジェクトの`AGENTS.md`にGit運用の指示（commit・pushの確認、mainへの直接push禁止など）があれば、そちらを優先する。

## 起動タイミング

- 新規プロジェクトのGitワークフローを整えるとき
- ブランチ戦略（GitFlow、trunk-based、GitHub flow）を決めるとき
- commitメッセージやPR説明を書くとき
- mergeコンフリクトを解消するとき
- リリースとバージョンタグを管理するとき
- 新メンバーへGit運用を説明するとき

## ブランチ戦略の選び方

| 戦略 | チーム規模 | リリース頻度 | 適する対象 |
|----------|-----------|-----------------|----------|
| GitHub Flow | 任意 | 継続的 | SaaS、Webアプリ、スタートアップ。迷ったらこれ |
| Trunk-Based | 熟練5名以上 | 1日複数回 | 強いCI/CDとfeature flagがあるチーム |
| GitFlow | 10名以上 | 計画的 | エンタープライズ、規制業種 |

共通の原則:

- `main`は常にデプロイ可能に保ち、protected branchへ直接commitしない
- feature branchは小さく短命（数日）に保ち、未完成の作業はfeature flagで隠す
- ブランチ名は`<type>/<summary>`（`feature/`、`fix/`、`hotfix/`、`release/`、`experiment/`）

## commitとPRの原則

- Conventional Commits（`<type>(<scope>): <subject>`）を使う。subjectは命令形・50文字以内、本文は「なぜ」を書く
- 1 commit = 1 論理変更。`update`や`WIP`だけのメッセージを残さない
- PRは単一の機能・修正に絞り、500行未満を目安に分割する
- PRタイトルもConventional Commits形式にし、What / Why / How / Testingを説明に書く
- 生成物（`dist/`、`node_modules/`）をcommitしない。秘密情報の扱いは常時ロードされる`.agents/rules/secrets.md`に従う
- レビュー依頼前にセルフレビューとCI（テスト・lint・型検査）を通す。検証の基準は`.agents/rules/verification.md`に従う

## mergeとrebaseの判断

| 状況 | 選択 |
|------|------|
| feature branchを`main`へ取り込む | merge（履歴を保持） |
| ローカル限定のfeature branchを最新`main`へ追従させる | rebase（直線的な履歴） |
| 複数人が作業した、またはpush済みで他人が上に作業している可能性がある | merge。rebaseしない |
| protected branch（`main`、`develop`）、merge済みブランチ | 絶対にrebaseしない |

- rebase後のpushは`--force-with-lease`を使い、`--force`は使わない
- 公開済み履歴を取り消すときは`reset`ではなく`revert`を使う

## コンフリクト解消の原則

1. `git status`でコンフリクトファイルを特定し、両側の意図を理解してから解消する
2. 片側採用（`--ours` / `--theirs`）は、相手側の変更を捨ててよいと確信できるときだけ使う
3. 解消後はテストを再実行してからcommitする
4. 予防策: ブランチを短命に保つ、`main`へ頻繁にrebaseする、共有ファイルの変更をチームへ共有する、PRを速やかにレビューしmergeする

## リリース管理の原則

- セマンティックバージョニング（MAJOR: 破壊的変更 / MINOR: 後方互換の機能追加 / PATCH: 後方互換の修正）
- リリースは注釈付きタグ（`git tag -a`）で作り、changelogはConventional Commitsの履歴から生成する

## チェックリスト

- [ ] 作業ブランチは`main`から作った小さなfeature branchか
- [ ] commitメッセージはConventional Commits形式で、理由が書かれているか
- [ ] rebaseするブランチは未push・自分だけの作業か
- [ ] コンフリクト解消後にテストを再実行したか
- [ ] 生成物・秘密情報がstage対象に含まれていないか
- [ ] PRは単一目的で、説明にWhat / Why / How / Testingがあるか

## 参照

- [references/branching-strategies.md](references/branching-strategies.md) — GitHub Flow / Trunk-Based / GitFlowの図とルール、命名規約、ブランチ整理
- [references/commit-and-pr.md](references/commit-and-pr.md) — type一覧、良い例・悪い例、`.gitmessage`、PR説明テンプレート、レビューチェックリスト、新機能開始〜PRの手順
- [references/merge-rebase-conflicts.md](references/merge-rebase-conflicts.md) — merge / rebaseのコマンド、コンフリクトの把握・解消・予防、forkのupstream同期
- [references/daily-operations.md](references/daily-operations.md) — stash、失敗の取り消し、Git Hooks、クイックリファレンス
- [references/release-and-config.md](references/release-and-config.md) — semver、タグ、changelog生成、Git設定、alias、gitignoreパターン
