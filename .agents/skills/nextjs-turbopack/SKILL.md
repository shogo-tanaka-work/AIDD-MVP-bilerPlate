---
name: nextjs-turbopack
description: Next.js 16以降とTurbopack — incremental bundling、FS caching、dev速度、Turbopackとwebpackの使い分け。
metadata:
  origin: ECC
---

# Next.jsとTurbopack

Next.js 16以降はlocal developmentでTurbopackを既定で使う。Rustで書かれたincremental bundlerで、dev起動とhot updateを大きく高速化する。

## 使いどころ

- **Turbopack（devの既定）**: 日常の開発で使う。特に大規模appでcold startとHMRが速い。
- **Webpack（legacy dev）**: Turbopackのbugに当たった場合や、devでwebpack専用pluginに依存する場合だけ使う。`--webpack`（またはNext.jsのversionにより`--no-turbopack`。利用中のreleaseのdocsを確認する）で無効化する。
- **Production**: production build（`next build`）の挙動はNext.jsのversionによりTurbopackかwebpackのどちらかを使う。利用中のversionの公式Next.js docsを確認する。

使う場面: Next.js 16以降のappを開発・debugするとき、dev起動やHMRの遅さを診断するとき、production bundleを最適化するとき。

## 仕組み

- **Turbopack**: Next.js dev向けのincremental bundler。file-system cachingにより再起動が大幅に速い（大規模projectで5〜14倍など）。
- **devの既定**: Next.js 16から、`next dev`は無効化しない限りTurbopackで動く。
- **File-system caching**: 再起動時に以前の処理結果を再利用する。cacheは通常`.next`配下にあり、基本用途では追加設定は不要。
- **Bundle Analyzer（Next.js 16.1以降）**: 出力を調べて重い依存を見つける実験的なBundle Analyzer。configまたはexperimental flagで有効化する（利用中のversionのNext.js docsを参照）。

## 例

### コマンド

```bash
next dev
next build
next start
```

### 使い方

local developmentでは`next dev`をTurbopackで実行する。Bundle Analyzer（Next.js docsを参照）でcode-splittingを最適化し、大きな依存を削る。可能な限りApp Routerとserver componentsを優先する。

## Middlewareのファイル名

Next.js 16はmiddlewareのファイル名として`proxy.ts`を導入し、従来の`middleware.ts`規約を置き換えた。

- **Next.js 16以降**: project rootに`proxy.ts`を置く
- **Next.js 16より前**: project rootに`middleware.ts`を置く

このファイル名変更は**Next.jsのversion**に紐づくものであり、使用するbundler（Turbopackかwebpackか）とは無関係。レビュー対象のversionの公式docsを必ず確認する。

**Next.js 16のprojectで`proxy.ts`を、名前が誤っている・middlewareファイルが無いと指摘してはならない。** このファイルは正しく意図的なもの。`middleware.ts`へのrenameを提案するとmiddlewareの実行が壊れる。

参照: [Next.js proxy docs](https://nextjs.org/docs/app/getting-started/proxy)

## ベストプラクティス

- Turbopackとcachingの挙動が安定しているNext.js 16.xの新しいversionに留まる。
- devが遅い場合は、Turbopack（既定）で動いているか、cacheが不必要に消されていないかを確認する。
- production bundle sizeの問題には、利用中のversionの公式Next.js bundle分析ツールを使う。
