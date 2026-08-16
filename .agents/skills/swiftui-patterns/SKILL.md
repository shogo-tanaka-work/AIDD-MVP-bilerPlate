---
name: swiftui-patterns
description: SwiftUIのアーキテクチャパターン、@Observableによるstate管理、view composition、navigation、performance最適化、モダンなiOS/macOS UIのベストプラクティス。SwiftUIのview、@Observableのstate、navigation、render performanceを実装・レビューするときに使う。
---

# SwiftUI Patterns

Appleプラットフォームで宣言的かつ高performanceなUIを構築するためのモダンなSwiftUIパターン。Observation framework、view composition、型安全なnavigation、performance最適化を扱う。

## 適用する場面

- SwiftUIのviewを実装し、stateを管理するとき（`@State`、`@Observable`、`@Binding`）
- `NavigationStack`でnavigationフローを設計するとき
- view modelとデータフローを構造化するとき
- listや複雑なレイアウトのrendering performanceを最適化するとき
- SwiftUIでenvironment値とdependency injectionを扱うとき

## State管理

### Property Wrapperの選択

条件に合う最も単純なwrapperを選ぶ。

| Wrapper | 用途 |
|---------|------|
| `@State` | view内に閉じた値型（toggle、formフィールド、sheetの表示） |
| `@Binding` | 親の`@State`への双方向参照 |
| `@Observable` class + `@State` | 複数プロパティを持つ、所有するmodel |
| `@Observable` class（wrapperなし） | 親から渡される読み取り専用の参照 |
| `@Bindable` | `@Observable`のプロパティへの双方向binding |
| `@Environment` | `.environment()`で注入される共有dependency |

### @Observable ViewModel

`ObservableObject`ではなく`@Observable`を使う。プロパティ単位で変更を追跡するため、変更されたプロパティを読むviewだけが再renderされる。

```swift
@Observable
final class ItemListViewModel {
    private(set) var items: [Item] = []
    private(set) var isLoading = false
    var searchText = ""

    private let repository: any ItemRepository

    init(repository: any ItemRepository = DefaultItemRepository()) {
        self.repository = repository
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await repository.fetchAll()) ?? []
    }
}
```

### ViewModelを使うView

```swift
struct ItemListView: View {
    @State private var viewModel: ItemListViewModel

    init(viewModel: ItemListViewModel = ItemListViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        List(viewModel.items) { item in
            ItemRow(item: item)
        }
        .searchable(text: $viewModel.searchText)
        .overlay { if viewModel.isLoading { ProgressView() } }
        .task { await viewModel.load() }
    }
}
```

### Environmentによる注入

`@EnvironmentObject`を`@Environment`へ置き換える。

```swift
// 注入
ContentView()
    .environment(authManager)

// 利用
struct ProfileView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        Text(auth.currentUser?.name ?? "Guest")
    }
}
```

## View Composition

### Subviewへ切り出して無効化範囲を狭める

viewを小さく責務の絞られたstructへ分割する。stateが変わったとき、そのstateを読むsubviewだけが再renderされる。

```swift
struct OrderView: View {
    @State private var viewModel = OrderViewModel()

    var body: some View {
        VStack {
            OrderHeader(title: viewModel.title)
            OrderItemList(items: viewModel.items)
            OrderTotal(total: viewModel.total)
        }
    }
}
```

### 再利用可能なstyleのためのViewModifier

```swift
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardModifier())
    }
}
```

## Navigation

### 型安全なNavigationStack

プログラム制御で型安全なroutingのため、`NavigationStack`と`NavigationPath`を使う。

```swift
@Observable
final class Router {
    var path = NavigationPath()

    func navigate(to destination: Destination) {
        path.append(destination)
    }

    func popToRoot() {
        path = NavigationPath()
    }
}

enum Destination: Hashable {
    case detail(Item.ID)
    case settings
    case profile(User.ID)
}

struct RootView: View {
    @State private var router = Router()

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Destination.self) { dest in
                    switch dest {
                    case .detail(let id): ItemDetailView(itemID: id)
                    case .settings: SettingsView()
                    case .profile(let id): ProfileView(userID: id)
                    }
                }
        }
        .environment(router)
    }
}
```

## Performance

### 大きなコレクションにはLazyコンテナを使う

`LazyVStack`と`LazyHStack`は表示されるときにだけviewを生成する。

```swift
ScrollView {
    LazyVStack(spacing: 8) {
        ForEach(items) { item in
            ItemRow(item: item)
        }
    }
}
```

### 安定した識別子

`ForEach`では常に安定した一意のIDを使う。配列のindexは使わない。

```swift
// Identifiableへの準拠か明示的なidを使う
ForEach(items, id: \.stableID) { item in
    ItemRow(item: item)
}
```

### bodyで重い処理をしない

- `body`内でI/O、network呼び出し、重い計算を行わない
- 非同期処理には`.task {}`を使う。viewが消えると自動的にキャンセルされる
- scroll view内では`.sensoryFeedback()`と`.geometryGroup()`を控えめに使う
- listでの`.shadow()`、`.blur()`、`.mask()`は最小限にする。offscreen renderingを誘発する

### Equatableへの準拠

bodyが重いviewは`Equatable`へ準拠させ、不要な再renderを避ける。

```swift
struct ExpensiveChartView: View, Equatable {
    let dataPoints: [DataPoint] // DataPointはEquatableへ準拠している必要がある

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.dataPoints == rhs.dataPoints
    }

    var body: some View {
        // 複雑なchartのrendering
    }
}
```

## Previews

素早く反復するため、`#Preview`マクロとインラインのmockデータを使う。

```swift
#Preview("Empty state") {
    ItemListView(viewModel: ItemListViewModel(repository: EmptyMockRepository()))
}

#Preview("Loaded") {
    ItemListView(viewModel: ItemListViewModel(repository: PopulatedMockRepository()))
}
```

## 避けるべきアンチパターン

- 新規コードで`ObservableObject` / `@Published` / `@StateObject` / `@EnvironmentObject`を使う — `@Observable`へ移行する
- 非同期処理を`body`や`init`へ直接置く — `.task {}`か明示的なloadメソッドを使う
- データを所有しない子viewの中でview modelを`@State`として生成する — 親から渡す
- `AnyView`による型消去を使う — 条件付きviewには`@ViewBuilder`か`Group`を優先する
- actorとの間でデータを受け渡す際に`Sendable`要件を無視する

## 参照

actorベースの永続化パターンはskill: `swift-actor-persistence`を参照。
protocolベースのDIとSwift Testingでのテストはskill: `swift-protocol-di-testing`を参照。
