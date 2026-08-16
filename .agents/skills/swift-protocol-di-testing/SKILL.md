---
name: swift-protocol-di-testing
description: テスト可能なSwiftコードのためのprotocolベースdependency injection — 小さく責務を絞ったprotocolとSwift Testingでfile system、network、外部APIをmockする。Swiftコードのテストが必要で、file system・network・外部APIをmockする必要があるときに使う。
metadata:
  origin: ECC
---

# Swift のProtocolベースDependency Injectionによるテスト

外部依存（file system、network、iCloud）を小さく責務を絞ったprotocolの背後へ抽象化し、Swiftコードをテスト可能にするためのパターン。I/Oなしで決定的なテストを実現する。

## 発動タイミング

- file system、network、外部APIへアクセスするSwiftコードを書くとき
- 実際の障害を起こさずにエラー処理経路をテストしたいとき
- 複数環境（アプリ、テスト、SwiftUI preview）で動くモジュールを構築するとき
- Swift concurrency（actor、Sendable）でテスト可能なアーキテクチャを設計するとき

## 基本パターン

### 1. 小さく責務を絞ったprotocolを定義する

各protocolは外部関心事をちょうど一つだけ扱う。

```swift
// file systemへのアクセス
public protocol FileSystemProviding: Sendable {
    func containerURL(for purpose: Purpose) -> URL?
}

// ファイルの読み書き操作
public protocol FileAccessorProviding: Sendable {
    func read(from url: URL) throws -> Data
    func write(_ data: Data, to url: URL) throws
    func fileExists(at url: URL) -> Bool
}

// bookmarkの保存（sandboxedアプリなど）
public protocol BookmarkStorageProviding: Sendable {
    func saveBookmark(_ data: Data, for key: String) throws
    func loadBookmark(for key: String) throws -> Data?
}
```

### 2. デフォルト（本番用）実装を作る

```swift
public struct DefaultFileSystemProvider: FileSystemProviding {
    public init() {}

    public func containerURL(for purpose: Purpose) -> URL? {
        FileManager.default.url(forUbiquityContainerIdentifier: nil)
    }
}

public struct DefaultFileAccessor: FileAccessorProviding {
    public init() {}

    public func read(from url: URL) throws -> Data {
        try Data(contentsOf: url)
    }

    public func write(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
    }

    public func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }
}
```

### 3. テスト用のmock実装を作る

```swift
public final class MockFileAccessor: FileAccessorProviding, @unchecked Sendable {
    public var files: [URL: Data] = [:]
    public var readError: Error?
    public var writeError: Error?

    public init() {}

    public func read(from url: URL) throws -> Data {
        if let error = readError { throw error }
        guard let data = files[url] else {
            throw CocoaError(.fileReadNoSuchFile)
        }
        return data
    }

    public func write(_ data: Data, to url: URL) throws {
        if let error = writeError { throw error }
        files[url] = data
    }

    public func fileExists(at url: URL) -> Bool {
        files[url] != nil
    }
}
```

### 4. デフォルト引数で依存をinjectする

本番コードはデフォルトを使い、テストはmockをinjectする。

```swift
public actor SyncManager {
    private let fileSystem: FileSystemProviding
    private let fileAccessor: FileAccessorProviding

    public init(
        fileSystem: FileSystemProviding = DefaultFileSystemProvider(),
        fileAccessor: FileAccessorProviding = DefaultFileAccessor()
    ) {
        self.fileSystem = fileSystem
        self.fileAccessor = fileAccessor
    }

    public func sync() async throws {
        guard let containerURL = fileSystem.containerURL(for: .sync) else {
            throw SyncError.containerNotAvailable
        }
        let data = try fileAccessor.read(
            from: containerURL.appendingPathComponent("data.json")
        )
        // データを処理する...
    }
}
```

### 5. Swift Testingでテストを書く

```swift
import Testing

@Test("Sync manager handles missing container")
func testMissingContainer() async {
    let mockFileSystem = MockFileSystemProvider(containerURL: nil)
    let manager = SyncManager(fileSystem: mockFileSystem)

    await #expect(throws: SyncError.containerNotAvailable) {
        try await manager.sync()
    }
}

@Test("Sync manager reads data correctly")
func testReadData() async throws {
    let mockFileAccessor = MockFileAccessor()
    mockFileAccessor.files[testURL] = testData

    let manager = SyncManager(fileAccessor: mockFileAccessor)
    let result = try await manager.loadData()

    #expect(result == expectedData)
}

@Test("Sync manager handles read errors gracefully")
func testReadError() async {
    let mockFileAccessor = MockFileAccessor()
    mockFileAccessor.readError = CocoaError(.fileReadCorruptFile)

    let manager = SyncManager(fileAccessor: mockFileAccessor)

    await #expect(throws: SyncError.self) {
        try await manager.sync()
    }
}
```

## ベストプラクティス

- **単一責務**: 各protocolは関心事を一つだけ扱う — メソッドを詰め込んだ「神protocol」を作らない
- **Sendable準拠**: protocolをactor境界を越えて使う場合に必要
- **デフォルト引数**: 本番コードは既定で実装を使い、mockを指定するのはテストだけにする
- **エラーのシミュレーション**: 失敗経路をテストできるよう、mockには設定可能なエラープロパティを持たせる
- **境界だけをmockする**: 外部依存（file system、network、API）をmockし、内部の型はmockしない

## 避けるべきアンチパターン

- すべての外部アクセスを網羅する巨大なprotocolを一つ作る
- 外部依存を持たない内部型をmockする
- 適切なdependency injectionの代わりに `#if DEBUG` 条件分岐を使う
- actorと併用する際に `Sendable` 準拠を忘れる
- 過剰設計: 外部依存を持たない型にprotocolは不要

## 利用場面

- file system、network、外部APIに触れるあらゆるSwiftコード
- 実環境では起こしにくいエラー処理経路のテスト
- アプリ、テスト、SwiftUI previewの各コンテキストで動く必要があるモジュールの構築
- テスト可能なアーキテクチャが必要な、Swift concurrency（actor、structured concurrency）を使うアプリ
