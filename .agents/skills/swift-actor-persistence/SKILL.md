---
name: swift-actor-persistence
description: Swift の actor によるthread-safeなデータ永続化 — in-memory cacheとfile-backed storageを組み合わせ、data raceを設計段階で排除する。Swiftでデータを永続化するとき、data raceやthread-safetyの問題を設計で解消したいときに使う。
metadata:
  origin: ECC
---

# Swift Actors によるThread-Safeな永続化

Swift の actor を使ってthread-safeなデータ永続化層を構築するためのパターン。in-memory cacheとfile-backed storageを組み合わせ、actor modelによってdata raceをコンパイル時に排除する。

## 発動タイミング

- Swift 5.5+ でデータ永続化層を構築するとき
- 共有可変状態へのthread-safeなアクセスが必要なとき
- 手動の同期処理（lock、DispatchQueue）を排除したいとき
- ローカルストレージを使うoffline-firstアプリを構築するとき

## 基本パターン

### Actorベースの Repository

actor modelは直列化されたアクセスを保証する。data raceは発生せず、コンパイラが強制する。

```swift
public actor LocalRepository<T: Codable & Identifiable> where T.ID == String {
    private var cache: [String: T] = [:]
    private let fileURL: URL

    public init(directory: URL = .documentsDirectory, filename: String = "data.json") {
        self.fileURL = directory.appendingPathComponent(filename)
        // init中の同期ロード（actor isolationはまだ有効でない）
        self.cache = Self.loadSynchronously(from: fileURL)
    }

    // MARK: - Public API

    public func save(_ item: T) throws {
        cache[item.id] = item
        try persistToFile()
    }

    public func delete(_ id: String) throws {
        cache[id] = nil
        try persistToFile()
    }

    public func find(by id: String) -> T? {
        cache[id]
    }

    public func loadAll() -> [T] {
        Array(cache.values)
    }

    // MARK: - Private

    private func persistToFile() throws {
        let data = try JSONEncoder().encode(Array(cache.values))
        try data.write(to: fileURL, options: .atomic)
    }

    private static func loadSynchronously(from url: URL) -> [String: T] {
        guard let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder().decode([T].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
    }
}
```

### 使い方

actor isolationにより、すべての呼び出しは自動的にasyncになる。

```swift
let repository = LocalRepository<Question>()

// 読み取り — in-memory cacheからのO(1)の高速lookup
let question = await repository.find(by: "q-001")
let allQuestions = await repository.loadAll()

// 書き込み — cacheを更新し、atomicにファイルへ永続化する
try await repository.save(newQuestion)
try await repository.delete("q-001")
```

### @Observable ViewModelとの組み合わせ

```swift
@Observable
final class QuestionListViewModel {
    private(set) var questions: [Question] = []
    private let repository: LocalRepository<Question>

    init(repository: LocalRepository<Question> = LocalRepository()) {
        self.repository = repository
    }

    func load() async {
        questions = await repository.loadAll()
    }

    func add(_ question: Question) async throws {
        try await repository.save(question)
        questions = await repository.loadAll()
    }
}
```

## 主要な設計判断

| 判断 | 理由 |
|----------|-----------|
| class + lockではなくactor | コンパイラが強制するthread safety、手動同期が不要 |
| in-memory cache + file永続化 | cacheからの高速な読み取りとディスクへの永続的な書き込み |
| initでの同期ロード | 非同期初期化の複雑さを避ける |
| IDをキーとしたDictionary | 識別子によるO(1)のlookup |
| `Codable & Identifiable` に対するgeneric | どのmodel型でも再利用できる |
| atomicなファイル書き込み（`.atomic`） | クラッシュ時の部分書き込みを防ぐ |

## ベストプラクティス

- actor境界を越えるすべてのデータに **`Sendable` 型を使う**
- **actorのpublic APIを最小限に保つ** — 永続化の詳細ではなくドメイン操作だけを公開する
- 書き込み途中のクラッシュによるデータ破損を防ぐため **`.atomic` 書き込みを使う**
- **`init` で同期的にロードする** — 非同期initializerはローカルファイルに対して利点が小さく複雑さだけ増える
- リアクティブなUI更新のため **`@Observable`** ViewModelと組み合わせる

## 避けるべきアンチパターン

- 新しいSwift concurrencyのコードでactorではなく `DispatchQueue` や `NSLock` を使う
- 内部のcache dictionaryを外部の呼び出し側へ公開する
- 検証なしにファイルURLを設定可能にする
- actorのメソッド呼び出しがすべて `await` であることを忘れる — 呼び出し側はasync contextを扱う必要がある
- actor isolationを迂回するために `nonisolated` を使う（目的を損なう）

## 利用場面

- iOS/macOSアプリのローカルデータ保存（ユーザーデータ、設定、キャッシュ済みコンテンツ）
- 後からサーバーへ同期するoffline-firstアーキテクチャ
- アプリの複数箇所から並行アクセスされる共有可変状態
- 旧来の `DispatchQueue` ベースのthread safetyを現代的なSwift concurrencyへ置き換える
