# Mobile / iOS profile

- native buildを含むprojectはASCIIだけのpathへ置く。
- tokenなどの秘密値はKeychain・Keystore相当のsecure storageへ保存する。
- local DB migrationは既存dataを保持し、適用済みmigrationを書き換えない。
- offline writeと同期の責任を分け、未送信状態を利用者に見える形で扱う。
- timer、subscription、listenerは画面破棄時にcleanupする。
- background処理、通知、network失敗はOS制約と再試行方針を明示する。
- Swift concurrencyではactor isolationとcancellationを確認し、UI更新を適切なactorへ限定する。
