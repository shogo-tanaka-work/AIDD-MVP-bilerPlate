# Frontend profile

- UI変更前にプロジェクト固有のdesign正本を確認する。存在しなければ既存UIを基準にする。
- componentは表示責務を中心にし、data取得と副作用をhookまたはadapterへ隔離する。
- stateを必要最小限にし、導出値を重複保存しない。
- semantic HTMLとkeyboard操作を先に満たし、ARIAはnative要素で表せない場合に使う。
- loading、empty、error、disabled、focus状態を設計する。
- viewport幅だけを理由に重要な情報や操作を消さず、ページ全体の不要な横scrollを防ぐ。
- 未検証のHTMLやURLを描画しない。
- testはaccessible roleと利用者操作を優先し、実装詳細に依存しない。
