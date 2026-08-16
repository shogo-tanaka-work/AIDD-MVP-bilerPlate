---
name: ios-icon-gen
description: SF Symbols（Apple純正5000種以上）またはIconify API（200以上のコレクションから27.5万種以上のオープンソースicon）から、Xcodeのasset catalog向けにiOSアプリiconをPNG imagesetとして生成する。iconの生成、icon assetの作成、asset catalogへのicon追加、iOSプロジェクト向けiconの検索をするときに使う。
metadata:
  origin: community
---

# iOS Icon Generator

2つのソースから、Xcodeのasset catalog向けPNG icon imagesetを生成する。

## 発動タイミング

- iOS/macOSのXcodeプロジェクト向けにicon assetを生成するとき
- オープンソースのコレクションを横断してiconを検索するとき
- asset catalog向けにPNG imageset（1x、2x、3x）を作るとき
- placeholderのiconを本番品質のassetへ置き換えるとき
- Xcodeプロジェクトの既存iconのスタイルに合わせるとき

## 基本原則

### 1. 2つのソース、1つの出力形式
どちらのソースも同一のXcode互換imagesetを生成する。必要に応じて選ぶ。

| ソース | icon数 | 必要条件 | 向いている用途 |
|--------|-------|----------|----------|
| **Iconify API** | 200以上のコレクションから275,000以上 | インターネット接続 | 幅広い選択肢、特定のスタイル、オープンソースicon |
| **SF Symbols** | Appleのsymbol 5,000以上 | macOSのみ | Apple純正のスタイル、オフライン利用 |

### 2. 既存スタイルに必ず合わせる
生成前に、プロジェクトの既存iconのサイズ、色、weightの一貫性を確認する。

### 3. 出力構成
どちらの方法でも完全なXcode imagesetを生成する。

```
<output-dir>/<asset-name>.imageset/
  Contents.json
  <asset-name>.png        # 1x（既定68px）
  <asset-name>@2x.png     # 2x（既定136px）
  <asset-name>@3x.png     # 3x（既定204px）
```

## 例

### Step 1: 要件を把握する

iconの要件を決める。iconが何を表すか、好みのスタイル、対象の色、サイズ。

プロジェクトに既にiconがあれば、既存スタイルを確認する。
```bash
# 既存iconの寸法を確認する
sips -g pixelWidth -g pixelHeight path/to/existing@2x.png
```

### Step 2: iconを検索する

**Iconify API（幅広い選択肢が必要なとき推奨）:**
```bash
# 全コレクションを検索する
$SKILL_DIR/scripts/iconify_gen.sh search "receipt"

# 特定のコレクション内を検索する
$SKILL_DIR/scripts/iconify_gen.sh search "business card" --prefix mdi

# 利用可能なコレクションを一覧する
$SKILL_DIR/scripts/iconify_gen.sh collections
```

**SF Symbols（Apple純正スタイル向け）:**
SF Symbolsアプリで探すか、よく使う名前を参照する。

| 用途 | Symbol名 |
|----------|-------------|
| ドキュメント | `doc.text`, `doc.fill` |
| レシート | `doc.text.below.ecg`, `receipt` |
| 人物 | `person.crop.rectangle`, `person.text.rectangle` |
| カメラ | `camera`, `camera.fill` |
| スキャン | `doc.viewfinder`, `qrcode.viewfinder` |
| 設定 | `gearshape`, `slider.horizontal.3` |

### Step 3: プレビュー（任意）

```bash
# Iconifyのプレビュー
$SKILL_DIR/scripts/iconify_gen.sh preview mdi:receipt-text-outline
```

### Step 4: 生成する

**Iconify API:**
```bash
# 基本的な生成
$SKILL_DIR/scripts/iconify_gen.sh mdi:receipt-text-outline editTool_expenseReport

# 色と出力先を指定する
$SKILL_DIR/scripts/iconify_gen.sh mdi:receipt-text-outline myIcon --color 007AFF --output ./Assets.xcassets/icons
```

オプション: `--size <pt>`（既定: 68）、`--color <hex>`（既定: 8E8E93）、`--output <dir>`（既定: /tmp/icons）

**SF Symbols:**
```bash
# 基本的な生成
swift $SKILL_DIR/scripts/generate_icons.swift doc.text.below.ecg editTool_expenseReport

# 色、weight、出力先を指定する
swift $SKILL_DIR/scripts/generate_icons.swift person.crop.rectangle myIcon --color 007AFF --weight regular --output ./Assets.xcassets/icons
```

オプション: `--size <pt>`（既定: 68）、`--color <hex>`（既定: 8E8E93）、`--weight <name>`（既定: thin）、`--output <dir>`（既定: /tmp/icons）

### Step 5: 確認して組み込む

1. 生成された@2xのPNGを読み、見た目を確認する
2. 直接出力していない場合はasset catalogへコピーする:
   ```bash
   cp -r /tmp/icons/<name>.imageset path/to/Assets.xcassets/<group>/
   ```
3. プロジェクトをbuildし、Xcodeが新しいassetを認識することを確認する

## 主要なIconifyコレクション

| Prefix | 名称 | 数 | スタイル |
|--------|------|-------|-------|
| `mdi` | Material Design Icons | 7400+ | filledとoutlineの両方 |
| `ph` | Phosphor | 9000+ | icon当たり6種のweight |
| `solar` | Solar | 7400+ | bold、linear、outline |
| `tabler` | Tabler Icons | 6000+ | 一貫したstroke幅 |
| `lucide` | Lucide | 1700+ | クリーンでミニマル |
| `ri` | Remix Icon | 3100+ | filledとlineの両方 |
| `carbon` | Carbon | 2400+ | IBMのデザイン言語 |
| `heroicons` | HeroIcons | 1200+ | Tailwind CSSと相性が良い |

すべて見る: <https://icon-sets.iconify.design/>

## スクリプト一覧

| Script | ソース | Path |
|--------|--------|------|
| `iconify_gen.sh` | Iconify API（27.5万以上のicon） | `$SKILL_DIR/scripts/iconify_gen.sh` |
| `generate_icons.swift` | SF Symbols（5千以上のicon） | `$SKILL_DIR/scripts/generate_icons.swift` |

## ベストプラクティス

- **生成前に検索する** -- 利用可能なiconを見て最適なものを探す
- **既存プロジェクトのスタイルに合わせる** -- 生成前に既存iconの寸法、色、weightを確認する
- **多様性が要るならIconifyを使う** -- 200以上のコレクションがあり、必要なスタイルを見つけられる
- **Appleとの統一感にはSF Symbolsを使う** -- システムUIと完全に一致する
- **asset catalogへ直接生成する** -- `--output ./Assets.xcassets/icons`で手動コピーを省く
- **見た目を確認する** -- commit前に必ず@2xのPNGをプレビューする

## アンチパターン

- 既存プロジェクトのiconスタイルを確認せずにiconを生成する
- プロジェクトに定義されたカラーパレットがあるのに既定色を使う
- 誤ったサイズで生成する（先に既存iconを確認する）
- 見た目を確認せずに生成したiconをcommitする
