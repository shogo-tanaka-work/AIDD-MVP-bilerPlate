# Custom hook・accessibility assertion・boundaryのテスト

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

広範なa11yテストの手引きは`accessibility` skillを参照する。

## Error boundaryのテスト

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

## Suspense boundaryのテスト

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
