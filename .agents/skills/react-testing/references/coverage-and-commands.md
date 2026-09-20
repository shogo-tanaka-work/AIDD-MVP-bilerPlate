# Coverage目標・TDDワークフロー・テストコマンド

## Coverage目標

行数ではなく振る舞いを基準にした参考値。プロジェクトが基準を定めていればそちらに従う。

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
