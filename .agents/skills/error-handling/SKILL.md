---
name: error-handling
description: TypeScript、Python、Goにまたがる堅牢なエラー処理のパターン。型付きエラー、error boundary、retry、circuit breaker、利用者向けエラーメッセージを扱う。TypeScript・Python・Goでエラー型、retry、circuit breaker、利用者向けの失敗メッセージを設計するときに使う。
metadata:
  origin: ECC
---

# エラー処理パターン

本番アプリケーション向けの一貫した堅牢なエラー処理パターン。

エラー処理の原則（握りつぶさない、文脈を付けて再throwする、継続不能と縮退可能を区別する、Promiseを浮かせない、ログへ秘密値や個人情報を出さない）は常時ロードされる `.agents/rules/error-handling.md` に従う。この skill はそれらを前提に、言語別の実装パターン（エラー型の設計、APIでの変換、retry、利用者向け文言）を扱う。

## 発動タイミング

- 新しいモジュールやサービスのエラー型・例外階層を設計するとき
- 不安定な外部依存に対してretryやcircuit breakerを追加するとき
- API endpointにエラー処理の漏れがないかレビューするとき
- 利用者向けのエラーメッセージやフィードバックを実装するとき
- 連鎖的な障害やエラーの握りつぶしをデバッグするとき

## 判断基準

1. **文字列メッセージより型付きエラー** — エラーは `code` と `statusCode` を持つ構造化された第一級の値として設計する。判定は `instanceof` / `errors.Is` で行い、メッセージ文字列の比較に頼らない。
2. **エラーはAPI契約の一部** — クライアントが受け取り得るエラーコードを列挙し、envelope `{ error: { code, message, details? } }` へ統一する。想定外のエラーは境界で一般的な `INTERNAL_ERROR` へ変換する。
3. **throwとResultを使い分ける** — 失敗が想定内かつ頻繁な操作（parse、外部呼び出し）は `Result` 型で返し、呼び出し側に処理を強制する。継続不能な失敗はthrowで境界まで伝播させる。
4. **retryは一時的な失敗だけ** — network・5xx・timeoutをexponential backoff＋jitterで再試行し、4xxのクライアントエラーや検証エラーは再試行しない。上限回数と最大遅延を必ず設ける。
5. **利用者向け文言はエラーコードから引く** — コードと文言の対応表を一箇所に置き、未知のコードは汎用文言へfallbackする。技術的詳細はサーバー側のログにだけ残す。
6. **描画エラーはError Boundaryで局所化する** — component treeの一部の失敗が画面全体を壊さないよう、fallback UIを用意する。

## エラー処理チェックリスト

エラー処理に触れるコードをmergeする前に確認する。

- [ ] APIエラーが標準のenvelope `{ error: { code, message } }` に従う
- [ ] カスタムエラークラスが `code` フィールドを持つ基底 `AppError` を継承する（Goはsentinel error＋`%w` wrap）
- [ ] 想定外のエラーが境界で一般的なメッセージへ変換され、詳細はサーバー側でログに残る
- [ ] 利用者向けメッセージにstack traceや内部詳細が含まれない
- [ ] retry処理がretry可能なエラーだけをretryし、上限回数・最大遅延・jitterを持つ
- [ ] Reactのcomponentが描画エラーに備えて `ErrorBoundary` で包まれている
- [ ] `Result` を返す関数の呼び出し側が `ok` 判定を省略していない

## 参照

- [TypeScript](references/typescript.md) — `AppError` 階層、`Result` パターン、APIエラーハンドラ（Next.js / Express）、React Error Boundary
- [Retryと利用者向けメッセージ](references/retry-and-user-messages.md) — exponential backoff付き `withRetry`、エラーコードから文言への対応表
- [Python](references/python.md) — カスタム例外階層、FastAPIのグローバル例外ハンドラ
- [Go](references/go.md) — sentinel error、`%w` によるwrap、handler層での `errors.Is` 判定
