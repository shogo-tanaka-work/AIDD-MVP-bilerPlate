---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript security

- `JSON.parse`、request body、query、storage値、外部API responseは`unknown`として検証する。
- 環境変数は起動境界で検証し、未設定を空文字や認証skipへ変換しない。
- private値をclient向けenvironment prefixやbundleへ含めない。
- untrusted objectを検証せずspreadしない。
- secretや個人情報を含むobject全体をloggerへ渡さない。
