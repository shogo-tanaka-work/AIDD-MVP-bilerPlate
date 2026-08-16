---
name: react-testing
description: React Testing Library、Vitest/Jest、network mockingのMSW、axeによるaccessibility assertion、component testとPlaywright/CypressのE2Eの境界を扱うReact componentのテスト。Reactのcomponent、hook、pageのテストを書く・修正するときに使う。
metadata:
  origin: ECC
---

# React Testing

振る舞い中心のcomponent test、custom hook test、accessibility assertion、networkレイヤのmockingを網羅するReactテストパターン。

## 適用する場面

- React component、custom hook、pageのテストを書くとき
- テストのない既存componentにテストを追加するとき
- Enzymeやclass component時代のパターンからReact Testing Libraryへ移行するとき
- 新規ReactプロジェクトでVitestやJestを設定するとき
- テスト内でHTTP requestをmockするとき
- accessibility違反をassertするとき
- RTL、Playwright Component Testing、フルE2Eのどれに属するテストか判断するとき

## 基本原則

実装詳細ではなく、利用者が見るもの・行うことをテストする。

テストがすべきこと:

- 本番と同じproviderでcomponentをrenderする
- accessibleなquery（role、label）と`userEvent`で操作する
- 目に見える出力と観測可能な副作用（callbackの発火、requestの送信）をassertする

テストがすべきでないこと:

- componentのstate、子へ渡されたprops、呼ばれたhookを調べる
- React自体やframeworkのhookをmockする
- render回数や、利用者に影響しないDOM構造をassertする

## ライブラリの選択

| Runner | 適する場面 | 備考 |
|---|---|---|
| **Vitest** | Vite、Remix、モダンな構成 | 高速、ネイティブESM、Jest互換API |
| **Jest** | Next.js、CRA、既存repo | 多くのReactプロジェクトの既定 |
| **Playwright Component Testing** | 実ブラウザエンジンが必要なとき | JSDOMに必要な機能がない場合に使う |
| **Cypress Component Testing** | 実ブラウザ、Cypressを既に使用 | Playwright CTの代替 |

一つを選ぶ。明確な棲み分けがない限り、同じrepoでRTL + VitestとPlaywright CTを併用しない。

## Queryの優先順位

React Testing Libraryのqueryは3段階に分かれる。上から順に使う。

1. **誰にでもアクセス可能**: `getByRole`、`getByLabelText`、`getByPlaceholderText`、`getByText`、`getByDisplayValue`
2. **semantic**: `getByAltText`、`getByTitle`
3. **Test ID（脱出口）**: `getByTestId`

```tsx
// 最良
screen.getByRole("button", { name: /save/i });

// inputには許容できる
screen.getByLabelText("Email");

// 最後の手段
screen.getByTestId("save-btn");
```

種類:

- `getBy*` — 一致しなければthrowする
- `queryBy*` — `null`を返す（「存在しないこと」のassertに使う）
- `findBy*` — 非同期でPromiseを返す（非同期処理後に現れる要素に使う）

## `userEvent`による利用者操作

```tsx
import userEvent from "@testing-library/user-event";

test("submits the form", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<UserForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText("Email"), "user@example.com");
  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(onSubmit).toHaveBeenCalledWith({ email: "user@example.com" });
});
```

- userEventの呼び出しは必ず`await`する
- `userEvent.setup()`はテストごとに1回呼び、返された`user`を使い回す
- `userEvent`は実ブラウザの一連の操作を再現する。`fireEvent`は単一の合成イベントを発火するだけなので`userEvent`を優先する

## 非同期パターン

```tsx
// 非同期処理後に現れる要素
expect(await screen.findByText("Loaded")).toBeInTheDocument();

// 副作用のassert
await waitFor(() => expect(saveSpy).toHaveBeenCalled());

// 消えるはずの要素
await waitForElementToBeRemoved(() => screen.queryByText("Loading"));
```

`setTimeout` + assertは不安定なので使わない。上のmatcherを使う。

## MSWによるnetwork mocking

Mock Service Workerはnetworkレイヤでmockする。component、hook、fetchライブラリはすべて本番と同じ挙動になる。

### セットアップ

```ts
// test/setup.ts
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/users/:id", ({ params }) =>
    HttpResponse.json({ id: params.id, name: "Alice" }),
  ),
  http.post("/api/users", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: "new-id", ...body }, { status: 201 });
  }),
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`onUnhandledRequest: "error"`を設定し、mockしていないrequestがテストを明確に失敗させるようにする。黙って通過するより赤くなる方がよい。

### テストごとの上書き

```tsx
test("renders error on 500", async () => {
  server.use(
    http.get("/api/users/:id", () => new HttpResponse(null, { status: 500 })),
  );
  render(<UserPage id="1" />);
  expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
});
```

## Providerのラップ

providerは`test-utils.tsx`で一度だけラップする。

```tsx
// test-utils.tsx
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter>{ui}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
    options,
  );
}

export * from "@testing-library/react";
```

以降、各テストファイルで`import { renderWithProviders, screen } from "test-utils"`する。

## Custom hookのテスト

```tsx
import { renderHook, act } from "@testing-library/react";

test("useCounter increments and decrements", () => {
  const { result } = renderHook(() => useCounter(0));

  expect(result.current.count).toBe(0);

  act(() => result.current.increment());
  expect(result.current.count).toBe(1);

  act(() => result.current.decrement());
  expect(result.current.count).toBe(0);
});

test("useCounter accepts initial value", () => {
  const { result } = renderHook(() => useCounter(10));
  expect(result.current.count).toBe(10);
});

test("useUser fetches user data", async () => {
  // QueryClientはre-renderをまたいで残るよう、wrapperの外でテストごとに1回だけ生成する。
  // wrapperのclosure内で生成するとrenderのたびにcache stateがリセットされ、不安定なテストになる。
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useUser("1"), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual({ id: "1", name: "Alice" });
});
```

- stateを変える呼び出しは`act`でラップする
- hookの公開APIだけを通してテストする
- contextを使うhookには`wrapper`を渡す

## Accessibilityのassert

```tsx
import { axe, toHaveNoViolations } from "jest-axe"; // または vitest-axe
expect.extend(toHaveNoViolations);

test("UserCard has no a11y violations", async () => {
  const { container } = render(<UserCard user={mockUser} />);
  expect(await axe(container)).toHaveNoViolations();
});
```

interactiveなcomponentすべてのcomponent testでaxeを実行する。次を検出できる。

- form inputのlabel欠落
- 不正なARIAの使用
- 不十分な色コントラスト（限定的。JSDOMには実CSSエンジンがないためinline styleのみ有効。視覚的なコントラストはPlaywrightの担当）
- 画像のalt text欠落
- 見出し順序の違反

関連: 広範なa11yテストの手引きは[skills/accessibility/SKILL.md](../accessibility/SKILL.md)。

## Snapshot testを使わない場面

renderされた出力のsnapshotは:

- styleを変えるたびに壊れる
- レビューで形式的に承認されがちになる
- 振る舞いではなく実装詳細（DOM構造）をテストする

snapshotが許容できる用途:

- 純粋なデータ整形関数（`formatInvoice(invoice)` -> 安定した文字列）
- 生成される設定ファイル（例: webpack configの出力）

componentのvisual regressionには、Playwright/Cypressのスクリーンショット、またはPercy/Chromaticを使う。DOM文字列ではなく実際の画像差分を取る。

## Playwright / Cypressに切り替える場面

JSDOM（Vitest/Jestが使用）には次ができない。

- 実際のレイアウトのrender（flexbox、grid、viewport query）
- ネイティブのブラウザアニメーション、CSS transitionの実行
- scroll挙動、drag-and-drop、クリップボードからの貼り付けのテスト
- iframe、popup、download、cross-originフローの処理
- DevTools対応込みの制御された環境での実network実行

いずれかが必要ならPlaywright Component Testing（実ブラウザでのcomponent test）かフルE2Eを使う。[e2e-testing skill](../e2e-testing/SKILL.md)を参照。

判断の境界:

- hook、表示中心のcomponent、ロジックのあるform -> RTL
- レイアウトが重要、またはJSDOMにないブラウザAPIを使うcomponent -> Playwright CT
- 複数ページにまたがる利用者フロー全体 -> Playwright/CypressのE2E

## Coverage目標

| レイヤ | 目標 |
|---|---|
| 純粋なutility | >=90% |
| Custom hook | >=85% |
| 表示中心のcomponent | >=80% — 行数ではなく振る舞い |
| Container component | >=70% — 正常系 + エラー状態 |
| Page | E2Eで別途カバー。最低限のsmoke test |

`vitest.config.ts` / `jest.config.js`で設定する。

```ts
// vitest.config.ts
test: {
  coverage: {
    provider: "v8",
    reporter: ["text", "html", "lcov"],
    thresholds: {
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    },
  },
}
```

## アンチパターン

- `container.querySelector("...")` — accessibilityのqueryを迂回し、実利用者が失敗する場面でもテストが通る
- render回数のassert — 実装詳細
- `jest.mock("react", ...)` — Reactは決してmockしない。componentの方をリファクタする
- 子componentを既定でmockする — 分離ではなく統合をテストしている。重い副作用がある場合だけmockする
- `act()`の警告を無視する — 実際のバグ（unmount後のstate更新、非同期のラップ漏れ）を示している
- テスト間で可変stateを共有する — テスト順が変わると不安定になる
- `it.skip()`を外しても通るテスト — 意図した内容を実際にはassertしていない

## TDDワークフロー

```
RED     -> 次の要件に対する失敗するテストを書く
GREEN   -> 通すための最小限のcomponentコードを書く
REFACTOR -> componentを改善し、テストはgreenのまま保つ
REPEAT  -> 次の要件へ
```

新規componentの場合:

1. componentのprop型とシグネチャを定める
2. 最も単純なケースの最初のテストを書く
3. 正しい理由で失敗することを確認する
4. 通す分だけ実装する
5. 次のテストケースを追加する
6. 3つ目の似たテストでパターンが見えたらリファクタする

## テストコマンド

```bash
# Vitest
vitest                            # watch
vitest run                        # 単発実行
vitest run --coverage             # coverage付き
vitest run path/to/file.test.tsx  # 単一ファイル

# Jest
jest --watch
jest --coverage
jest path/to/file.test.tsx

# CIモード
CI=true vitest run --coverage
```

## 関連

- Rules: [rules/react/testing.md](../../rules/react/testing.md)
- Skills: [react-patterns](../react-patterns/SKILL.md), [accessibility](../accessibility/SKILL.md), [e2e-testing](../e2e-testing/SKILL.md), [tdd-workflow](../tdd-workflow/SKILL.md)
- Agents: `react-reviewer`（コードレビュー時にテスト品質をレビュー）、`tdd-guide`（TDDプロセスを徹底）
- Commands: `/react-test`, `/react-review`

## 例

### MSWとuserEventによるform送信

```tsx
test("submits user form and shows success", async () => {
  server.use(
    http.post("/api/users", () =>
      HttpResponse.json({ id: "1", name: "Alice" }, { status: 201 }),
    ),
  );

  const user = userEvent.setup();
  renderWithProviders(<UserForm />);

  await user.type(screen.getByLabelText("Name"), "Alice");
  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(await screen.findByText(/saved successfully/i)).toBeInTheDocument();
});
```

### Error boundaryのテスト

```tsx
function Broken() {
  throw new Error("boom");
}

test("error boundary renders fallback", () => {
  // 想定内のthrowに対するReactのconsole.errorノイズを抑え、その後復元する。
  // spyがテストをまたいで残り、他の本物のエラーを隠すのを防ぐため。
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  } finally {
    errorSpy.mockRestore();
  }
});
```

### Suspense boundaryのテスト

```tsx
test("shows loading then content", async () => {
  renderWithProviders(
    <Suspense fallback={<div>Loading...</div>}>
      <UserDetail id="1" />
    </Suspense>,
  );

  expect(screen.getByText("Loading...")).toBeInTheDocument();
  expect(await screen.findByText("Alice")).toBeInTheDocument();
});
```
