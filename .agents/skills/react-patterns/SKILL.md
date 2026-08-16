---
name: react-patterns
description: hookの規律、server/client componentの境界、Suspense + error boundary、form action、data fetching、state管理の判断ツリー、accessibility優先のcompositionを含むReact 18/19のパターン。React componentを書く・レビューするときに使う。
metadata:
  origin: ECC
---

# React Patterns

堅牢でaccessibleかつ高performanceなcomponentツリーを構築するための、React 18/19の慣用的パターン。

## 起動タイミング

- React関数component、custom hook、componentツリーを書く・変更するとき
- JSX/TSXファイルをレビューするとき
- stateの形やcomponentのcompositionを設計するとき
- class componentや古い`forwardRef`/`useEffect`中心のコードを移行するとき
- local state、lifted state、context、外部storeを選ぶとき
- Server Component / Client Component（Next.js App Router、RSC）を扱うとき
- React 19のactionまたはcontrolled inputでformを実装するとき
- TanStack Query / SWR / RSCでdata fetchingを組むとき

## 中核原則

### 1. renderはpropsとstateの純粋関数

```tsx
// Good: render中に導出する
function Cart({ items }: { items: CartItem[] }) {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return <span>{formatMoney(total)}</span>;
}

// Bad: 導出stateを別途保持する
function Cart({ items }: { items: CartItem[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((sum, i) => sum + i.price * i.qty, 0));
  }, [items]);
  return <span>{formatMoney(total)}</span>;
}
```

`useEffect`での導出stateはrenderを1周期増やし、ずれを生み、データの流れを不明瞭にする。

### 2. 副作用はrenderの外へ

effect、mutation、network呼び出し、subscriptionはevent handlerか`useEffect`に置く。renderの本体には決して置かない。

### 3. 継承よりcomposition

Reactにcomponentの継承モデルはない。`children`、render prop、component propsで組み合わせる。

## hookの規律

全ルールは[rules/react/hooks.md](../../rules/react/hooks.md)を参照。要点:

- トップレベルのみ。条件分岐の中では呼ばない
- subscription、interval、listenerは必ずcleanupする
- 新しいstateが古いstateに依存するなら関数updater（`setX(prev => prev + 1)`）を使う
- 既定はmemoizeしない — profilerや依存の連鎖で必要性が示されたときだけ`useMemo`/`useCallback`を足す
- 同じhookの並びが2つ以上のcomponentに現れたときだけcustom hookへ切り出す

## stateの置き場所の判断ツリー

```
1つのcomponentだけが使う?
  -> そのcomponent内のuseState

親と少数の子孫が使う?
  -> 最も近い共通の祖先へliftする

離れた枝をまたいで使い、かつ読み取り頻度が低い（theme、auth、locale）?
  -> React Context

ツリー全体で高頻度に更新される?
  -> 外部store（Zustand、Jotai、Redux Toolkit）

サーバー由来?
  -> server-stateライブラリ（TanStack Query、SWR、RSC fetch）
```

ほとんどのページにcontextやglobal storeは不要。liftの重複が苦痛になるまで抽象化を我慢する。

## Server / Client Component（RSC）

```tsx
// Server Component - 既定。async。自身のJSを配信しない
export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await db.product.findUnique({ where: { id: params.id } });
  if (!product) notFound();
  return <ProductView product={product} />;
}

// Client Component - "use client"で明示的に選ぶ
"use client";
export function AddToCartButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => addToCart(productId))}
    >
      {pending ? "Adding..." : "Add to cart"}
    </button>
  );
}
```

境界:

- Server -> Client: シリアライズ可能なpropsか`children`を渡す
- Client -> Server: `<form action={...}>`またはevent handlerからの命令的呼び出しでServer Actionを起動する
- Client Componentのファイルから Server Componentを`import`しない — `children`で組み合わせる

## Suspense + Error Boundary

```tsx
<ErrorBoundary fallback={<ErrorView />}>
  <Suspense fallback={<UserSkeleton />}>
    <UserDetail id={id} />
  </Suspense>
</ErrorBoundary>
```

- Suspense boundaryはrouteのルートではなくデータの近くに置き、段階的に表示する
- Error Boundaryは依然class API。hookに馴染むラッパーとして`react-error-boundary`を使う
- boundaryが捕捉するのは子のrender、lifecycle、constructorで投げられたエラーだけ。event handlerや非同期コードのエラーは捕捉しない

## Form

### React 19のform action（新規コードで推奨）

```tsx
"use client";
import { useActionState } from "react";

const initial = { error: null as string | null };

async function updateUserAction(_prev: typeof initial, formData: FormData) {
  "use server";
  const parsed = UserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };
  await db.user.update({ where: { id: parsed.data.id }, data: parsed.data });
  return { error: null };
}

export function UserForm() {
  const [state, formAction, pending] = useActionState(updateUserAction, initial);
  return (
    <form action={formAction}>
      <input name="name" required />
      <button type="submit" disabled={pending}>Save</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

### Controlled input

値が他のUIを駆動する、キー入力ごとに整形する、リアルタイム検証を行う場合はcontrolledにする。

### 複雑なform

多段階form、動的なfield配列、field横断の検証にはライブラリ（React Hook Form、TanStack Form）を使う。些細な複雑さを超えたformで自前のstate管理を作るのは保守上の罠。

## Data fetchingの判断マトリクス

| 必要なもの | 使うもの |
|---|---|
| Next.js App Routerでのリクエスト単位のデータ | RSCの`await fetch()` |
| クライアントのcache + mutation + invalidation | TanStack Query |
| 軽量なクライアントcache + revalidation | SWR |
| リアルタイムsubscription | Server-Sent Events、WebSocket、またはライブラリのsubscription API |
| 単発の投げっぱなし | event handler内の`fetch()` |

アプリケーションデータに`useEffect` + `fetch`は避ける — race condition、cacheなし、retryなし、Suspense非対応。

## compositionのレシピ

### `children`によるslot

```tsx
<Layout>
  <Header />
  <Main>{content}</Main>
</Layout>
```

### 名前付きslot

```tsx
<Page header={<Nav />} sidebar={<Filters />}>
  <Results />
</Page>
```

### Compound component（Context経由で状態を共有）

```tsx
<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="profile"><Profile /></Tabs.Panel>
  <Tabs.Panel value="settings"><Settings /></Tabs.Panel>
</Tabs>
```

### Render prop / function-as-child

親がrender結果へパラメータを渡す必要があるときに有用:

```tsx
<DataLoader id={id}>
  {({ data, isLoading }) => isLoading ? <Spinner /> : <UserCard user={data} />}
</DataLoader>
```

現代的な代替: 同じ形を返すhook（`useData(id)`）。多くの場合こちらの方が素直。

## Performance

### `React.memo`が本当に効く場面

次をすべて満たすときだけ`React.memo`で包む:

1. 頻繁にre-renderされる
2. renderをまたいでpropsがだいたい同じ
3. renderのコストが計測可能なほど大きい

`React.memo`はrenderのたびに等価チェックを加える。多くのrenderでpropsが異なるなら、そのチェックは純粋なオーバーヘッド。

### render連鎖を避ける

- 可能なら stateをliftするのではなく下へ降ろす
- contextを分割する。関心ごとに1つのcontextにすれば、`themeContext`の変更でauthの購読者がre-renderしない
- 外部stateライブラリには`useSyncExternalStore`を使う — 安全なconcurrent renderingに必須

### List

- 安定した`key` propsを渡す（配列indexではなくデータベースのid）
- 中身が単純でない行で表示件数が50程度を超えたら、`@tanstack/react-virtual`や`react-window`で長いlistを仮想化する

## accessibility優先のcomposition

- `role`属性に手を伸ばす前に、常にsemantic HTML（`<button>`、`<a>`、`<nav>`、`<main>`）を描画する
- すべてのinteractive要素はkeyboardで到達できること
- form inputにはlabelが必要 — `<label htmlFor>`、iconで視覚的に示すなら`aria-label`
- route遷移やmodalの開閉ではfocusを管理する
- componentのテストで`axe`を実行する（[skills/react-testing](../react-testing/SKILL.md)を参照）
- 関連: [skills/accessibility/SKILL.md](../accessibility/SKILL.md)がWCAG基準とパターンライブラリを扱う

## Routing

このskillはrouterに依存しない。上記のパターンはReact Router、TanStack Router、Next.js App Router、Remix Routerで通用する。router固有のパターン（loader、action、ネストしたlayout）は各routerのドキュメントに従う — それらはReactのコアの上に重なるframeworkの関心事。

## 対象外（ポインタ）

- **Next.js固有**: App Routerのdata loading、Route Handler、Middleware、Parallel Route — 別の関心事。Next.jsのドキュメントを使う
- **React Native**: プラットフォーム固有のパターンが十分に異なるため、別途`react-native-patterns` skillが必要（未整備）
- **Remix**: loader/actionの規約はRSCと重なるが、Remixのドキュメントに従う

## 関連

- Rules: [rules/react/](../../rules/react/) — coding-style、hooks、patterns、security、testing
- Skills: Vercel由来のperformanceルールは[react-performance](../react-performance/SKILL.md)、framework横断のUIの関心事は[frontend-patterns](../frontend-patterns/SKILL.md)、[accessibility](../accessibility/SKILL.md)、framework比較は[angular-developer](../angular-developer/SKILL.md)
- Agents: コードレビューは`react-reviewer`、build/bundlerのエラーは`react-build-resolver`
- Commands: `/react-review`、`/react-build`、`/react-test`

## 例

### debounce検索のcustom hook

```tsx
function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchBox() {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchApi(debounced),
    enabled: debounced.length > 0,
  });
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <Results items={data ?? []} />
    </>
  );
}
```

### React 19の`useOptimistic`によるOptimistic UI

```tsx
"use client";
import { useOptimistic } from "react";

export function MessageList({ messages }: { messages: Message[] }) {
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage],
  );

  async function send(formData: FormData) {
    const text = String(formData.get("text"));
    addOptimistic({ id: "pending", text, sender: "me" });
    await saveMessage(text);
  }

  return (
    <>
      <ul>{optimistic.map((m) => <li key={m.id}>{m.text}</li>)}</ul>
      <form action={send}>
        <input name="text" />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
```

### contextを分割してrender連鎖を避ける

```tsx
// 2つのcontext: 一方はめったに変わらず、もう一方は頻繁に変わる
const ThemeContext = createContext<Theme>("light");
const NotificationsContext = createContext<Notification[]>([]);

// ThemeContextだけを購読するcomponentは、notificationsが変わってもre-renderしない
```
