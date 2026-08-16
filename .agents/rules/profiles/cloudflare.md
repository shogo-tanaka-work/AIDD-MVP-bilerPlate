# Cloudflare + Hono profile

- Hono Routeは入力取得・検証・Service呼び出し・HTTP response変換に限定する。
- D1 queryはRepositoryへ集約し、値はprepared statementでbindする。
- Cloudflare serviceは可能な限りbinding経由で利用し、binding型を正本から生成する。
- request固有の可変状態をmodule scopeへ置かない。
- Promiseは`await`、`return`、`waitUntil`のいずれかで追跡する。
- error response形式とstatus codeの使い分けをproject内で統一する。
- binding、migration、Cron、compatibility設定の変更後はWranglerのdry-runまたはpreviewで検証する。
- deploy失敗時に無制限の自動retryを行わない。
