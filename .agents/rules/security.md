# セキュリティ

- 認証と認可を分け、認可はAPI・Service・Repositoryの信頼できる境界で強制する。
- 外部入力、URL parameter、API response、ファイル内容は境界で検証する。
- SQL値はparameter bindingを使い、識別子は外部入力から組み立てない。
- HTML、URL scheme、redirect先を検証し、未検証のraw HTMLを描画しない。
- 必要なフィールドだけを返し、DB行や内部objectをそのまま公開しない。
- 認証設定が不足・検証不能ならfail closedにする。
- 外部通信にはtimeout、サイズ上限、許可先、再試行方針を設ける。
- 依存追加時はinstall script、保守状況、権限、lockfile差分を確認する。
- セキュリティ問題を見つけたら露出範囲を特定し、秘密値なら再掲せずローテーションを提案する。
