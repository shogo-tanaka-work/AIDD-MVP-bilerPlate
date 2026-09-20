# Query・利用者操作・非同期パターン

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

## Snapshot testを使わない場面

renderされた出力のsnapshotは:

- styleを変えるたびに壊れる
- レビューで形式的に承認されがちになる
- 振る舞いではなく実装詳細（DOM構造）をテストする

snapshotが許容できる用途:

- 純粋なデータ整形関数（`formatInvoice(invoice)` -> 安定した文字列）
- 生成される設定ファイル（例: webpack configの出力）

componentのvisual regressionには、Playwright/Cypressのスクリーンショット、またはPercy/Chromaticを使う。DOM文字列ではなく実際の画像差分を取る。
