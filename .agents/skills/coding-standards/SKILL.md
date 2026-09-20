---
name: coding-standards
description: 命名、可読性、不変性、コード品質レビューに関するプロジェクト横断のベースラインとなるコーディング規約。framework固有のパターンは詳細なfrontend・backendスキルを使う。適用できるframework固有スキルがない状態でコード品質や命名をレビューするときに使う。
metadata:
  origin: ECC
---

# Coding Standards & Best Practices

プロジェクト横断で適用できるベースラインのコーディング規約。

設計の一般原則（責務分離、副作用の境界化、早期return、重複の集約、抽象化の後出し、可変なモジュールスコープ状態の禁止）は常時ロードされる `.agents/rules/code-design.md` に従う。この skill はそれらを前提に、TypeScript / React / API / テストでの具体的な書き方（命名・不変性・型付け・構成）を扱う。

このスキルは共通の土台であり、framework別の詳細なplaybookではない。

- React、state、form、rendering、UIアーキテクチャには`vercel-react-best-practices`と`vercel-composition-patterns`を使う。
- repository/service層、endpoint設計、検証、server固有の関心事には`backend-patterns`または`api-design`を使う。
- エラー型・retry・利用者向けメッセージの実装は`error-handling`を使う。

## 発動タイミング

- 新しいプロジェクトやmoduleを始めるとき
- 品質と保守性の観点でコードをレビューするとき
- 規約に沿って既存コードをrefactorするとき
- 命名、formatting、構造の一貫性を徹底するとき
- lint、formatting、型検査のルールを設定するとき
- 新しいcontributorにコーディング規約を共有するとき

次の一次情報源としては使わない。

- Reactのcomposition、hook、renderingパターン
- backendアーキテクチャ、API設計、database層の設計
- より狭いECCスキルが既に存在するdomain固有のframework指針

## 判断基準

1. **可読性を最優先する** — コードは書かれる回数より読まれる回数が多い。コメントより自己説明的なコードを優先し、コメントはWHATではなくWHYを書く。
2. **KISS** — 動作する最もシンプルな解を選び、早すぎる最適化と賢いコードを避ける。
3. **YAGNI** — 必要になる前に機能や一般化を作らない。シンプルに始めて必要になったらrefactorする。
4. **説明的な命名** — 変数は意味が分かる名詞、関数は動詞＋名詞、booleanは `is` / `has` prefix。一文字や `flag` / `data` のような曖昧な名前を使わない。
5. **不変性をデフォルトにする** — object・配列はspreadで新しい値を作る。性能理由で意図的にmutateする場合はコメントで理由を残す。
6. **型で契約を表す** — `any` を使わず、union literalやinterfaceで取り得る値を絞る。外部入力はschemaで検証してから型を確定する。
7. **マジックナンバーを名前付き定数にする** — 単位をsuffixに含める（例: `DEBOUNCE_DELAY_MS`）。
8. **非同期は依存関係で並列化する** — 独立した処理は `Promise.all`、依存があるときだけ逐次にする。

## レビューチェックリスト

- [ ] 命名だけで用途が分かる（変数=名詞、関数=動詞＋名詞、boolean=`is`/`has`）
- [ ] 直接mutationがない、またはmutateする理由がコメントで説明されている
- [ ] `any` がなく、状態はunion literalで表現されている
- [ ] 説明のない数値・文字列リテラルがない
- [ ] 独立した `await` が不要に逐次実行されていない
- [ ] 公開APIにJSDoc（引数・戻り値・throws・example）がある
- [ ] ファイル名・配置が命名規約（component=PascalCase、hook=`use` prefix、utility=camelCase）に従う
- [ ] テスト名が「何をしたら何が起きるか」を説明し、AAAで構造化されている
- [ ] 関数が50行超・ネスト5段超になっていない（分割・早期returnの兆候）

## 参照

- [TypeScript規約](references/typescript-conventions.md) — 命名、不変性、async、型安全性、コメントとJSDoc
- [Reactパターン](references/react-patterns.md) — component構造、custom hook、state更新、条件付きrendering、memoization、遅延読み込み
- [API規約とファイル構成](references/api-and-project-structure.md) — REST規約、response形式、入力検証、プロジェクト構造、ファイル命名、DB query
- [テスト規約とcode smell](references/testing-and-code-smells.md) — AAAパターン、テスト命名、長い関数・深いネスト・マジックナンバーの改善例
