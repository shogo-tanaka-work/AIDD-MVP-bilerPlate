---
name: react-performance
description: Vercel EngineeringのReact Best Practices (https://github.com/vercel-labs/agent-skills) をもとにしたReact・Next.jsのperformance最適化パターン。70以上のルールを8つの優先度カテゴリ（waterfall、bundle size、server-side、client fetching、re-render、rendering、JS micro-perf、advanced）へ整理する。React/Next.jsコードをperformance観点で実装・レビュー・refactorするときに使う。
metadata:
  origin: ECC
---

# React Performance

React 18/19とNext.js向けのperformance最適化パターン。[Vercel Labs `react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)（MIT、v1.0.0）をもとにしている。このskillはルールを優先度順に整理し、実際のコードレビューとrefactorで使える判断指針を示す。

## いつ発動するか

- React/Next.jsコードをperformance観点で書く・レビューするとき
- 遅いページ読み込み、遅い操作、client側の高いCPU使用を診断するとき
- bundle sizeやLighthouse Core Web Vitalsの悪化を調査するとき
- Server Components / API routeのwaterfallを解消するとき
- client側のre-renderを削減するとき
- 長いリスト、アニメーション、hydrationを最適化するとき
- `app/`、`pages/`、`components/`、データ層に触れるPRの最適化判断をレビューするとき

## 優先度インデックス

| 優先度 | カテゴリ | Prefix | 効いてくる場面 |
|---|---|---|---|
| 1 — CRITICAL | Waterfallの解消 | `async-` | `await`の後に独立した`await`が続くとき |
| 2 — CRITICAL | Bundle Sizeの最適化 | `bundle-` | first-load JS、route単位のimport、third-party lib |
| 3 — HIGH | Server側のperformance | `server-` | RSC、Server Actions、API route、SSR |
| 4 — MEDIUM-HIGH | Client側のデータ取得 | `client-` | hook内のSWR / TanStack Query / 素の`fetch` |
| 5 — MEDIUM | Re-renderの最適化 | `rerender-` | 高頻度なstate更新、親から子への波及 |
| 6 — MEDIUM | Renderingのperformance | `rendering-` | 長いリスト、アニメーション、hydration |
| 7 — LOW-MEDIUM | JavaScriptのperformance | `js-` | ホットループ、頻繁なアロケーション |
| 8 — LOW | 応用パターン | `advanced-` | effect eventの統合、安定したref |

## 1. Waterfallの解消（CRITICAL）

> 「Waterfallはperformanceを殺す第一要因」 — 逐次の`await`は毎回ネットワークlatencyを丸ごと足す。

### 安価な条件はawaitより先に

リモートデータをawaitする前に、同期的な条件（props、env、固定フラグ）を確認する。

```ts
// INCORRECT
async function Page({ id }: { id: string }) {
  const flag = await getFlag("show-page");
  if (!flag || !id) return null;
  const data = await getData(id);
  // ...
}

// CORRECT — 安価な同期条件で先に打ち切る
async function Page({ id }: { id: string }) {
  if (!id) return null;
  const flag = await getFlag("show-page");
  if (!flag) return null;
  const data = await getData(id);
}
```

### 使う直前までawaitを遅らせる

`await`はそれを使う分岐の中へ移す。

```ts
// INCORRECT — データが必要か決まる前にawaitしている
const user = await getUser(id);
if (mode === "guest") return renderGuest();
return renderUser(user);

// CORRECT
if (mode === "guest") return renderGuest();
const user = await getUser(id);
return renderUser(user);
```

### 独立した処理はPromise.allで

```ts
// INCORRECT — 逐次
const user = await getUser(id);
const posts = await getPosts(id);
const followers = await getFollowers(id);

// CORRECT — 並列
const [user, posts, followers] = await Promise.all([
  getUser(id),
  getPosts(id),
  getFollowers(id),
]);
```

### 部分的な依存 — 早く始めて、遅くawaitする

```ts
// CORRECT — 全promiseを先に開始し、結果が必要になった時点でawaitする
const userP = getUser(id);
const postsP = getPosts(id);
const profile = await getProfile(id);
if (profile.private) return null;
const [user, posts] = await Promise.all([userP, postsP]);
```

### Streamingのための Suspense

`<Suspense>`境界をデータの近くへ置き、遅いsub-treeがstreamされる間もページが描けるところから描けるようにする。トレードオフはコンテンツ到着時のlayout shift。あらかじめ場所を確保する（skeletonまたは`min-height`）。

### Server Components: compositionで並列化する

```tsx
// INCORRECT — 1つのcomponent内の兄弟awaitは逐次実行になる
export default async function Page() {
  const user = await getUser();
  const cart = await getCart();
  return <View user={user} cart={cart} />;
}

// CORRECT — 子へ分割すればReactが並列に実行する
export default async function Page() {
  return (
    <View>
      <UserSection />
      <CartSection />
    </View>
  );
}
```

## 2. Bundle Sizeの最適化（CRITICAL）

### barrelではなく直接import

barrelの`index.ts`は、tree-shakingで大半が落ちる場合でもbundlerにモジュールグラフ全体を辿らせる。直接importは実アプリでfirst-load JSを200-800ms削減する。

```ts
// INCORRECT
import { Button, Card, Modal } from "@/components";

// CORRECT
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
```

Next.js 13.5以降には、列挙したパッケージについてこれを自動化する[Optimize Package Imports](https://nextjs.org/docs/app/api-reference/next-config-js/optimizePackageImports)がある。使うこと。列挙外のlibでは手動の直接importが依然必要。

### 静的に解析できるパス

```ts
// INCORRECT — bundler/traceの解析を妨げる
const mod = await import(`./pages/${name}`);

// CORRECT — 分岐ごとに明示する
const mod = name === "home" ? await import("./pages/home") : await import("./pages/about");
```

### 重いcomponentは動的import

```tsx
import dynamic from "next/dynamic";

const HeavyChart = dynamic(() => import("./HeavyChart"), {
  loading: () => <Skeleton />,
  ssr: false, // client専用の場合
});
```

### Third-partyスクリプトを遅延させる

分析、ロギング、サポートwidgetはhydrationの後に読み込む。`next/script`で`strategy="afterInteractive"`（既定）または`"lazyOnload"`を使う。

### 条件付きのモジュール読み込み

```tsx
if (user.role === "admin") {
  const { AdminPanel } = await import("./admin/AdminPanel");
  // ...
}
```

### hover/focusでpreloadする

hover時に`<link rel="preload">`や`import()`を発火し、クリックされる頃にはbundleがcacheにある状態にする。

## 3. Server側のperformance（HIGH）

### Server ActionsもAPI routeと同様に認証する

すべての`"use server"`関数は公開endpointである。action内で認証と認可を行う。呼び出し元のClient Componentによる制御に依存しない。

```ts
"use server";
export async function deleteUser(formData: FormData) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const targetId = String(formData.get("id"));
  if (session.user.role !== "admin" && session.user.id !== targetId) {
    throw new Error("Forbidden");
  }
  await db.user.delete({ where: { id: targetId } });
}
```

### リクエスト単位の重複排除に`React.cache()`

```ts
import { cache } from "react";

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

`React.cache`は単一リクエスト内で重複を排除する。同一renderの3つのServer Componentから`getUser("1")`を呼んでもDB queryは1回。

### リクエストをまたぐデータにはLRU cache

リクエストごとに変わらないデータ（設定、参照テーブル）は、Reactの外でLRU cacheまたは`unstable_cache`にcacheする。

### RSCのpropsで重複するserializeを避ける

Server Componentが同じデータを複数のClient Componentへ渡すと、消費側の数だけserializeされる。Client Componentを上位へ持ち上げ、childrenを渡す。

### 静的I/Oはmodule scopeへ引き上げる

```ts
// CORRECT — モジュール読み込み時に一度だけ実行される
const fontData = readFileSync(fontPath);

export async function Page() {
  return <Banner font={fontData} />;
}
```

### RSC/SSRで可変なmodule-level stateを持たない

server上のmodule stateは全リクエストで共有される。利用者間のrace conditionになる。代わりにリクエストスコープの保存手段（`headers()`、`cookies()`、async context）を使う。

### Client Componentへ渡すデータを最小化する

Clientが必要とするものだけをserializeする。フィールドを削り、paginationし、DB層で列を絞る。

### ネストしたfetchはitemごとのPromise.allで並列化する

```ts
const users = await getUsers();
const enriched = await Promise.all(
  users.map(async (u) => ({ ...u, posts: await getPostsFor(u.id) })),
);
```

### ブロックしない処理には`after()`

Next.js 15の`after()`はresponse送信後に処理を実行する。ロギング、cacheのウォームアップ、分析に使う。

```ts
import { after } from "next/server";
export async function GET() {
  const data = await getData();
  after(() => logAnalytics(data));
  return Response.json(data);
}
```

## 4. Client側のデータ取得（MEDIUM-HIGH）

### 重複排除にSWR / TanStack Query

複数のcomponentが`useUser(id)`を呼ぶなら、ネットワークリクエストとcacheエントリは1つを共有すべき。SWRまたはTanStack Queryを使い、共有データで自作の`useEffect` + `fetch`を書かない。

### グローバルなevent listenerを重複排除する

```tsx
// INCORRECT — componentごとに個別に登録している
useEffect(() => {
  window.addEventListener("scroll", handler);
  return () => window.removeEventListener("scroll", handler);
}, []);

// CORRECT — hook + グローバルsubjectで単一のlistenerにする
const useScroll = createScrollHook(); // 内部はsingletonのsubject
```

### scrollにはpassive listener

```ts
window.addEventListener("scroll", handler, { passive: true });
```

スクロールの滑らかさが上がる。ただしlistenerは`preventDefault()`できない。

### localStorage: versionを持たせ、最小化する

- 必ず`version`フィールドを保存する。schema変更時に上げ、旧データを移行または破棄する
- payloadは小さく保つ。`localStorage`は同期APIでmain threadをブロックする

## 5. Re-renderの最適化（MEDIUM）

### callbackでしか使わないstateをsubscribeしない

```tsx
// INCORRECT — countが変わるたびre-renderする
const count = useStore((s) => s.count);
const handler = () => doSomething(count);

// CORRECT — 呼び出し時に一度だけ読む
const handler = () => {
  const count = useStore.getState().count;
  doSomething(count);
};
```

### 重い処理はmemo化したcomponentへ切り出す

```tsx
// CORRECT — `items`が変わったときだけ子がre-renderする
const Heavy = memo(function Heavy({ items }: { items: Item[] }) {
  return <Chart data={transform(items)} />;
});
```

### 非primitiveな既定propsは外へ引き上げる

```tsx
// INCORRECT — renderごとに新しい配列ができてmemoが効かない
<List items={items ?? []} />

// CORRECT
const EMPTY: Item[] = [];
<List items={items ?? EMPTY} />
```

### effectの依存はprimitiveにする

```tsx
// INCORRECT — renderごとにobjectのidentityが変わる
useEffect(() => {}, [{ id, name }]);

// CORRECT — primitive
useEffect(() => {}, [id, name]);
```

### 生の値ではなく導出したbooleanをsubscribeする

```tsx
// INCORRECT — cartのどんな変化でもre-renderする
const cart = useStore((s) => s.cart);
const hasItems = cart.length > 0;

// CORRECT — 空かどうかが反転したときだけre-renderする
const hasItems = useStore((s) => s.cart.length > 0);
```

### 導出はrender中に行い、`useEffect`でやらない

```tsx
// INCORRECT
const [full, setFull] = useState("");
useEffect(() => setFull(`${first} ${last}`), [first, last]);

// CORRECT
const full = `${first} ${last}`;
```

### 安定したcallbackには関数形式の`setState`

```tsx
// CORRECT
const increment = useCallback(() => setCount((c) => c + 1), []);
```

### 高コストな初期値にはlazy state initializer

```tsx
const [tree] = useState(() => parseTree(largeInput));
```

### 単純なprimitiveにmemoを使わない

`useMemo(() => x + 1, [x])`はオーバーヘッドでしかない。memoが割に合うのはobjectのidentityと高コストな計算のとき。

### 依存が独立するhookは分割する

```tsx
// INCORRECT — どちらのsourceが変わっても両方のselectorが再実行される
const { a, b } = useSomething(source1, source2);

// CORRECT
const a = useA(source1);
const b = useB(source2);
```

### 操作のロジックはevent handlerへ移す

event handlerはユーザー操作時にだけ走る。`useEffect`は依存が変わるたびに再実行される。

### 緊急でない更新には`startTransition`

```tsx
const [pending, startTransition] = useTransition();
startTransition(() => setFilters(newFilters));
```

### 重いrenderには`useDeferredValue`

```tsx
const deferredQuery = useDeferredValue(query);
const results = useMemo(() => expensiveSearch(deferredQuery), [deferredQuery]);
```

### 一時的で高頻度な値には`useRef`

頻繁に変わるがre-renderを起こすべきでない値（タイムスタンプ、直前のキー、累積値）に使う。

### component内でcomponentを定義しない

```tsx
// INCORRECT — Outerのrenderごとに Inner は新しいcomponentになる
function Outer() {
  const Inner = () => <span />;
  return <Inner />;
}
```

renderのたびに新しい`Inner`型ができ、reconciliationが効かず子がunmountされる。

## 6. Renderingのperformance（MEDIUM）

### SVGではなくwrapperをアニメーションさせる

SVGを囲む`<div>`のtransformはGPUアクセラレーションが効く。SVG自体のtransformはpaintを誘発する。

### 長いリストに`content-visibility: auto`

```css
.row { content-visibility: auto; contain-intrinsic-size: auto 80px; }
```

ブラウザが画面外のrenderingをスキップする。数百行のリストで大きな効果がある。

### 静的なJSXは外へ引き上げる

```tsx
const STATIC_HEADER = <h1>Title</h1>;
function Page() {
  return <>{STATIC_HEADER}<Body /></>;
}
```

### SVG: 座標の精度を落とす

`d="M10.123456,20.654321"` → `d="M10.12,20.65"`。桁ごとにバイトを消費する一方、見た目の差はsub-pixel。

### inline scriptでhydration時のちらつきを防ぐ

hydration前に必要な値（テーマ、ロケール）は、Reactのmount前に`document.documentElement.dataset.*`を設定する`<script>`をinlineする。

### 想定内のhydration不一致は範囲を絞って抑制する

```tsx
<time suppressHydrationWarning>{new Date().toLocaleString()}</time>
```

差異が既知のleaf nodeにだけ使う。子を含むtreeへは決して使わない。

### mount/unmountの代わりに`<Activity>`で表示切り替え

React 19の`<Activity mode="visible|hidden">`はtreeのstateとeffectをmountしたまま隠す。タブやアコーディオンではunmount/remountより安い。

### 条件付きrenderは`&&`よりternary

```tsx
// INCORRECT — `0`がテキストノードとして描画される
{count && <Badge>{count}</Badge>}

// CORRECT
{count > 0 ? <Badge>{count}</Badge> : null}
```

### loading状態には`useTransition`

`startTransition`とactionを組み合わせる。次のstateを計算する間、Reactは`isPending`として直前のUIを表示する。

### React DOMのresource hint

```tsx
import { preload, preconnect } from "react-dom";
preload("/api/critical", { as: "fetch" });
preconnect("https://api.example.com");
```

### `<script>`タグの`defer` / `async`

DOMContentLoaded後に順序どおり実行するなら`defer`、投げっぱなしでよいなら`async`。

## 7. JavaScriptのperformance（LOW-MEDIUM）

- **DOM/CSSの変更をまとめる** — プロパティごとではなく、classの差し替えや`cssText`で適用する
- **繰り返す検索には`Map`** — `O(1)`対 `O(n)`の線形走査
- **ループ内のプロパティアクセスをキャッシュする** — `const len = arr.length`
- **純粋関数をmemo化する** — module-levelの`Map<key, result>`
- **`localStorage`の読み取りをキャッシュする** — 同期API。renderごとに1回にする
- **`filter().map()`を1パスにまとめる** — `flatMap`または単一の`for`
- **高コストな比較の前に配列長を確認する**
- **関数から早期returnする**
- **RegExpをループ外へ引き上げる** — コンパイルは無料ではない
- **min/maxは`sort()`ではなくループで** — `O(n)` 対 `O(n log n)`
- **所属判定には`Set`/`Map`** — `O(1)` 対 `Array.includes`の`O(n)`
- **immutabilityが重要なら破壊的変更より`toSorted()`**
- **`flatMap`でmapとfilterを1パスにする**
- **`requestIdleCallback`** を重要でない処理に使う

## 8. 応用パターン（LOW）

### `useEffectEvent`の依存

`useEffectEvent`から得た値は安定している。effectの依存に加えないこと。

### Event handlerのref

memo化した子へ渡す安定したcallbackが必要なとき。

```tsx
const handlerRef = useRef(handler);
useEffect(() => { handlerRef.current = handler; });
const stable = useCallback((arg) => handlerRef.current(arg), []);
```

### アプリ読み込みごとに一度だけ初期化する

module-levelのsingleton（テレメトリ、logger）は、`useEffect`ではなくmodule scopeのフラグでガードする。

### 安定したcallback refのための`useLatest`

```tsx
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
```

## 自動化ツール

これらのルールの多くはすでに自動化されている。

- **Next.js 13.5以降のOptimize Package Imports** — barrel importの最適化
- **React Compiler**（RFC、canary） — 自動memo化
- **Turbopack** — 高速なbuild、より良いtree-shaking
- **Bundle Analyzer**（`@next/bundle-analyzer`） — first-load JSの可視化

プロジェクトがReact Compilerを導入している場合、手動memo化の`rerender-*`ルールは「レビューのみ」へ格下げする。compilerが処理するため、手動の`useMemo`/`useCallback`は不要なノイズになる。

## Lighthouse / Web Vitalsとの対応

| 指標 | 関連の強いカテゴリ |
|---|---|
| **LCP**（Largest Contentful Paint） | Waterfall、Bundle Size、Resource Hint |
| **INP**（Interaction to Next Paint） | Re-render、Rendering、JavaScript |
| **CLS**（Cumulative Layout Shift） | Rendering（Suspenseの配置、画像サイズ指定） |
| **TBT**（Total Blocking Time） | Bundle Size、JavaScript、Third-Partyの遅延 |
| **FID**（旧指標） | Bundle Size、Hydration |

## 関連

- Skills: [react-patterns](../react-patterns/SKILL.md), [react-testing](../react-testing/SKILL.md), [frontend-patterns](../frontend-patterns/SKILL.md), [accessibility](../accessibility/SKILL.md), [nextjs-turbopack](../nextjs-turbopack/SKILL.md)
- Rules: [rules/react/](../../rules/react/)
- Agents: `react-reviewer`がコードレビューでこれらのルールを適用し、`react-build-resolver`が関連するbuild失敗を扱う
- Commands: `/react-review`, `/react-build`, `/react-test`

## 出典

Vercel Labsの`react-best-practices` skill（MIT License、copyright Vercel Engineering、v1.0.0、2026年1月）をもとにしている。ソース: [https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)。

このskillは元の70ルールのカタログを、単一の参照しやすいリファレンスとして再構成・翻案したもの。拡張された例を含む完全な元ルールセットは上流リポジトリを参照する。
