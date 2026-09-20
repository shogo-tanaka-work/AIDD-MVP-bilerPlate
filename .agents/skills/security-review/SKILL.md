---
name: security-review
description: 認証の追加、ユーザー入力の処理、秘密情報の取り扱い、API endpointの作成、決済や機微な機能の実装を行うときにこのskillを使う。網羅的なセキュリティチェックリストとパターンを提供する。
metadata:
  origin: ECC
---

# Security Review Skill

このskillは、すべてのコードがセキュリティのbest practiceに従うことを保証し、潜在的な脆弱性を特定する。

セキュリティの原則（認証と認可の分離、境界での入力検証、SQLのparameter binding、raw HTMLの非描画、最小限のfield公開、fail closed、外部通信のtimeout・上限、依存追加時の確認）は常時ロードされる `.agents/rules/security.md` に、秘密情報の扱い（`.env` を読まない、平文保存しない、Secrets機能へ保存、client公開prefixを使わない、漏えい時のローテーション）は `.agents/rules/secrets.md` に従う。この skill はそれらを前提に、Web / API実装での具体的な対策パターンとレビュー用チェックリストを扱う。

## 発動タイミング

- 認証や認可を実装するとき
- ユーザー入力やファイルアップロードを扱うとき
- 新しいAPI endpointを作成するとき
- 秘密情報やcredentialsを扱うとき
- 決済機能を実装するとき
- 機微なデータを保存・送信するとき
- サードパーティAPIを連携するとき
- クラウドインフラ・CI/CD・IAMを設定するとき（[クラウドインフラのセキュリティ](cloud-infrastructure-security.md) を併用する）

## 判断基準

1. **whitelistで検証する** — 許可する形式・種別・拡張子・値域を列挙し、blacklistで弾かない。ファイルアップロードはサイズ・MIME種別・拡張子の3点を確認する。
2. **tokenはhttpOnly cookieに置く** — `HttpOnly; Secure; SameSite=Strict` を既定にし、localStorageへ保存しない。
3. **認可は操作の直前に、データ層でも二重にかける** — handlerでのroleチェックに加え、SupabaseならRow Level Securityを全テーブルで有効にする。
4. **状態変更はCSRF対策とセットにする** — CSRF token（double-submit cookie）とSameSite cookieを組み合わせる。
5. **CSPは厳しい設定から始める** — `'unsafe-inline'` / `'unsafe-eval'` を既定にせず、緩める場合は撤去計画を文書化した一時的な負債として扱う。
6. **rate limitingは全endpointに、高コスト操作はさらに厳しく** — IPベースと認証済みユーザーベースの両方を持つ。
7. **エラーは一般的な文言で返し、詳細はサーバーログだけに残す** — stack trace・内部メッセージ・機微データをresponseへ含めない。
8. **署名や残高はサーバー側で検証する** — ブロックチェーン連携では、wallet署名・受取先・金額・残高を確認せずにtransactionへ署名しない。

## セキュリティチェックリスト

- [ ] APIキー・token・パスワードがコードにもgit履歴にも残っていない（`.env.local` が.gitignoreにある）
- [ ] すべてのユーザー入力をschemaで検証し、ファイルアップロードはサイズ・種別・拡張子を制限している
- [ ] DB queryがparameterized query / ORMを使い、文字列連結がない
- [ ] tokenをhttpOnly cookieに保存し、機微な操作の前に認可チェックがある
- [ ] SupabaseでRow Level Securityを有効にし、ロールベースのアクセス制御がある
- [ ] ユーザー提供のHTMLをsanitizeし、CSPヘッダを設定している
- [ ] 状態を変更する操作にCSRF tokenがあり、cookieに `SameSite=Strict` を設定している
- [ ] すべてのAPI endpointにrate limitingがあり、コストの高い操作には厳しい上限がある
- [ ] ログにパスワード・token・秘密情報がなく、利用者向けエラーがstack traceを露出しない
- [ ] `npm audit` がクリーンで、lockファイルをcommitし、Dependabotを有効にしている
- [ ] （ブロックチェーン利用時）wallet署名とtransaction内容を検証している

## deploy前のセキュリティチェックリスト

本番deployの前に必ず確認する。

- [ ] **HTTPS**: 本番で強制している
- [ ] **セキュリティヘッダ**: CSP、X-Frame-Optionsを設定している
- [ ] **CORS**: 許可originを明示している
- [ ] **認証・認可・入力検証・XSS・CSRF・Rate Limiting・依存関係**: 上記チェックリストが全項目PASSしている
- [ ] **セキュリティテスト**: 認証・認可・入力検証・rate limitingの自動テストがCIで通っている

## 参照

- [入力検証とSQL Injection対策](references/input-validation.md) — zodによるschema検証、ファイルアップロード検証、parameterized query
- [認証・認可・CSRF](references/auth-and-session.md) — httpOnly cookie、認可チェック、Row Level Security、CSRF token、SameSite cookie
- [XSS対策とCSP](references/xss-and-csp.md) — DOMPurifyによるsanitize、Content Security Policyの設定例
- [Rate Limitingと機微データの露出防止](references/rate-limiting-and-data-exposure.md) — express-rate-limit、ログのredact、エラーメッセージ
- [依存関係とセキュリティテスト](references/dependencies-and-testing.md) — npm audit、lockファイル、認証・認可・入力検証・rate limitingの自動テスト
- [ブロックチェーン（Solana）](references/blockchain-solana.md) — wallet署名の検証、transactionの検証
- [クラウドインフラのセキュリティ](cloud-infrastructure-security.md) — deploy、IAM、CI/CD、logging/monitoring

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/security)
- [Supabase Security](https://supabase.com/docs/guides/auth)
- [Web Security Academy](https://portswigger.net/web-security)

**留意**: セキュリティは任意ではない。脆弱性が一つあればプラットフォーム全体が危険にさらされる。迷ったら安全側に倒す。
