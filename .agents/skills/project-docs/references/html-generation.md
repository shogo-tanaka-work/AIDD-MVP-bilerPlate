# 閲覧用 HTML と目次の生成

## 生成スクリプトの要件

- 入力は番号付きフォルダ（`^\d{2}_`）の中の md だけ。`閲覧用HTML/` や番号のない下書きフォルダは対象外。
- 出力は `docs/目次.md` と `docs/閲覧用HTML/<md と同じパス>.html`、`閲覧用HTML/index.html`（目次）。
- md の相対リンクは、HTML の置き場所から見たリンクに張り替える。md へのリンクは HTML 版へ向ける。
- 見出し（h2・h3）のアンカーは GitHub と同じ規則にし、md のページ内リンクが GitHub でも HTML でも同じ節を指すようにする。
- 生の HTML は通さない（エスケープする）。外部の CSS・JS・フォントは読まず、CSP を `default-src 'none'` にする。
- レイアウトは 3 列（左: フォルダとページのナビ・絞り込み、中央: 本文、右: このページの内容）。狭い画面ではナビを開閉式にし、横にはみ出さない。ダークモードに対応する。
- コードが正本の生成物（コマンド一覧・スキーマ表）もここで作る。
- `--check` で、書き出さずに生成物が最新かだけを確かめられる。md を消した・名前を変えたときに残った古い HTML も「古い」とみなし、書き出し時に消す。
- 生成の計算は純粋関数にし、ファイルの読み書きは入口の関数だけで行う（テストしやすくするため）。
- macOS のファイル名は NFD のことがあるので、パスは NFC にそろえて扱う。

## 導入手順（Python の PJ）

1. `scripts/docs_build.py`（このスキルにある）を PJ の `scripts/` にコピーする。
2. 開発用の依存に `markdown-it-py` を足す。
3. 入口を作る。

   ```make
   docs: ## docs の目次・コマンド一覧・閲覧用HTML を作り直す
   	python scripts/docs_build.py --title "<PJ名> ドキュメント" --build-command "make docs" --argparse <pkg>.cli:build_parser
   ```

   CLI がなければ `--argparse` を外す。typer・click など argparse 以外なら、`command_reference_markdown` を PJ の CLI に合わせて書き換える。
4. 生成物が最新かを確かめるテストを足す（`--check` を呼ぶ、または `build_site` と `stale_files` を直接呼ぶ）。
5. フォルダの中の並び順を決めたいときは `--order "02_アーキテクチャ=システム構成.md,処理の流れ.md"` を渡す。

## 他の言語の PJ

- Node.js の PJ なら、同じ要件を `markdown-it`（npm）で移植する。関数の分け方（パスとリンク、md → HTML、目次、組み立て、入出力）はそのまま使える。
- 生成スクリプトを入れない段階では、`目次.md` を手で保ち、HTML は作らない。md だけでも運用は回る。HTML が欲しくなった時点で生成スクリプトを入れ、目次を生成に切り替える。

## 実例

- horse-racing-jev: `src/docs_site.py`（純粋関数）と `src/cli.py` の `docs-build` コマンド（入出力）。スキーマ表はテーブル定義から生成し、手描きの図の HTML を静的ページとしてナビに載せている。
- YouTube文字起こし君: `scripts/docs_build.py` と `make docs`・`make docs-check`。コマンド一覧は argparse の定義から生成し、`tests/test_docs.py` で生成物が最新かを確かめている。
