---
name: swift-concurrency-6-2
description: Swift 6.2のApproachable Concurrency — デフォルトでsingle-thread、明示的なbackground offloadingのための@concurrent、main actor型のためのisolated conformance。Swift 6.2のconcurrencyを採用するとき、@concurrentでoffloadingするとき、main actor isolationの問題を解決するときに使う。
---

# Swift 6.2 Approachable Concurrency

デフォルトでコードがsingle-threadで動作し、concurrencyを明示的に導入するSwift 6.2のconcurrencyモデルを採用するためのパターン。performanceを犠牲にせず、よくあるdata race errorを解消する。

## いつ使うか

- Swift 5.xや6.0/6.1のプロジェクトをSwift 6.2へ移行するとき
- data race safetyのcompiler errorを解決するとき
- MainActorベースのアプリアーキテクチャを設計するとき
- CPU負荷の高い処理をbackground threadへoffloadするとき
- MainActorにisolateされた型でprotocol conformanceを実装するとき
- Xcode 26でApproachable Concurrencyのbuild設定を有効にするとき

## 中心的な問題: 暗黙のbackground offloading

Swift 6.1以前では、async関数が暗黙的にbackground threadへoffloadされ、一見安全に見えるコードでもdata race errorが発生しうる。

```swift
// Swift 6.1: ERROR
@MainActor
final class StickerModel {
    let photoProcessor = PhotoProcessor()

    func extractSticker(_ item: PhotosPickerItem) async throws -> Sticker? {
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }

        // Error: Sending 'self.photoProcessor' risks causing data races
        return await photoProcessor.extractSticker(data: data, with: item.itemIdentifier)
    }
}
```

Swift 6.2はこれを修正した。async関数はデフォルトで呼び出し元のactorに留まる。

```swift
// Swift 6.2: OK — asyncはMainActorに留まり、data raceは起きない
@MainActor
final class StickerModel {
    let photoProcessor = PhotoProcessor()

    func extractSticker(_ item: PhotosPickerItem) async throws -> Sticker? {
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
        return await photoProcessor.extractSticker(data: data, with: item.itemIdentifier)
    }
}
```

## 中心的なパターン — isolated conformance

MainActorの型が、isolateされていないprotocolへ安全にconformできるようになった。

```swift
protocol Exportable {
    func export()
}

// Swift 6.1: ERROR — main actorにisolateされたコードへ跨いでしまう
// Swift 6.2: isolated conformanceでOK
extension StickerModel: @MainActor Exportable {
    func export() {
        photoProcessor.exportAsPNG()
    }
}
```

compilerはconformanceがmain actor上でのみ使われることを保証する。

```swift
// OK — ImageExporterも@MainActor
@MainActor
struct ImageExporter {
    var items: [any Exportable]

    mutating func add(_ item: StickerModel) {
        items.append(item)  // 安全: 同じactor isolation
    }
}

// ERROR — nonisolatedなcontextではMainActor conformanceを使えない
nonisolated struct ImageExporter {
    var items: [any Exportable]

    mutating func add(_ item: StickerModel) {
        items.append(item)  // Error: Main actor-isolated conformance cannot be used here
    }
}
```

## 中心的なパターン — globalとstaticの変数

global/staticのstateをMainActorで保護する。

```swift
// Swift 6.1: ERROR — non-Sendableな型は共有可変stateを持ちうる
final class StickerLibrary {
    static let shared: StickerLibrary = .init()  // Error
}

// 修正: @MainActorを付ける
@MainActor
final class StickerLibrary {
    static let shared: StickerLibrary = .init()  // OK
}
```

### MainActorのデフォルト推論モード

Swift 6.2はMainActorをデフォルトで推論するモードを導入した。手動の注釈は不要になる。

```swift
// MainActorのデフォルト推論を有効にした場合:
final class StickerLibrary {
    static let shared: StickerLibrary = .init()  // 暗黙的に@MainActor
}

final class StickerModel {
    let photoProcessor: PhotoProcessor
    var selection: [PhotosPickerItem]  // 暗黙的に@MainActor
}

extension StickerModel: Exportable {  // 暗黙的に@MainActor conformance
    func export() {
        photoProcessor.exportAsPNG()
    }
}
```

このモードはopt-inであり、アプリ、スクリプト、その他の実行可能targetに推奨される。

## 中心的なパターン — background処理のための@concurrent

実際の並列性が必要なときは、`@concurrent`で明示的にoffloadする。

> **重要:** この例はApproachable Concurrencyのbuild設定 — SE-0466（MainActorのデフォルトisolation）とSE-0461（NonisolatedNonsendingByDefault）を必要とする。これらを有効にすると`extractSticker`は呼び出し元のactorに留まり、可変stateへのアクセスが安全になる。**これらの設定がない場合、このコードにはdata raceがある** — compilerが検出する。

```swift
nonisolated final class PhotoProcessor {
    private var cachedStickers: [String: Sticker] = [:]

    func extractSticker(data: Data, with id: String) async -> Sticker {
        if let sticker = cachedStickers[id] {
            return sticker
        }

        let sticker = await Self.extractSubject(from: data)
        cachedStickers[id] = sticker
        return sticker
    }

    // 高コストな処理をconcurrent thread poolへoffloadする
    @concurrent
    static func extractSubject(from data: Data) async -> Sticker { /* ... */ }
}

// 呼び出し側はawaitが必要
let processor = PhotoProcessor()
processedPhotos[item.id] = await processor.extractSticker(data: data, with: item.id)
```

`@concurrent`を使う手順:
1. 対象の型を`nonisolated`にする
2. 関数へ`@concurrent`を付ける
3. まだasyncでなければ`async`を付ける
4. 呼び出し箇所へ`await`を付ける

## 主要な設計判断

| 判断 | 根拠 |
|----------|-----------|
| デフォルトでsingle-thread | 自然に書いたコードの多くはdata race freeになり、concurrencyはopt-inになる |
| asyncは呼び出し元のactorに留まる | data race errorの原因だった暗黙のoffloadingを解消する |
| isolated conformance | MainActorの型が安全でない回避策なしにprotocolへconformできる |
| `@concurrent`による明示的なopt-in | background実行を偶発的でなく意図的なperformance上の選択にする |
| MainActorのデフォルト推論 | アプリtargetでの`@MainActor`注釈の定型を減らす |
| opt-inでの採用 | 破壊的でない移行経路 — 機能を段階的に有効化できる |

## 移行手順

1. **Xcodeで有効化**: Build SettingsのSwift Compiler > Concurrencyセクション
2. **SPMで有効化**: package manifestで`SwiftSettings` APIを使う
3. **移行ツールを使う**: swift.org/migrationによる自動コード変更
4. **MainActorのデフォルトから始める**: アプリtargetで推論モードを有効にする
5. **必要な箇所へ`@concurrent`を追加する**: まずprofileし、hot pathをoffloadする
6. **十分にテストする**: data raceの問題がcompile時のerrorになる

## ベストプラクティス

- **MainActorから始める** — まずsingle-threadで書き、後で最適化する
- **`@concurrent`はCPU負荷の高い処理にだけ使う** — 画像処理、圧縮、複雑な計算
- 主にsingle-threadなアプリtargetでは**MainActorの推論モードを有効にする**
- **offloadの前にprofileする** — Instrumentsで実際のボトルネックを見つける
- **globalをMainActorで保護する** — global/staticな可変stateにはactor isolationが必要
- `nonisolated`の回避策や`@Sendable`のラッパーではなく**isolated conformanceを使う**
- **段階的に移行する** — build設定で機能を一つずつ有効にする

## 避けるべきanti-pattern

- すべてのasync関数へ`@concurrent`を付ける（大半はbackground実行を必要としない）
- isolationを理解しないまま`nonisolated`でcompiler errorを抑え込む
- actorが同じ安全性を提供するのに旧来の`DispatchQueue`パターンを残す
- concurrency関連のFoundation Modelsコードで`model.availability`の確認を省く
- compilerと戦う — data raceが報告されたなら、実際にconcurrencyの問題がある
- すべてのasyncコードがbackgroundで動くと仮定する（Swift 6.2のデフォルトは呼び出し元のactorに留まる）

## 適用場面

- すべての新規Swift 6.2以降のプロジェクト（Approachable Concurrencyが推奨のデフォルト）
- Swift 5.xや6.0/6.1のconcurrencyから既存アプリを移行するとき
- Xcode 26採用時にdata race safetyのcompiler errorを解決するとき
- MainActor中心のアプリアーキテクチャを構築するとき（大半のUIアプリ）
- performance最適化 — 特定の重い計算をbackgroundへoffloadするとき
