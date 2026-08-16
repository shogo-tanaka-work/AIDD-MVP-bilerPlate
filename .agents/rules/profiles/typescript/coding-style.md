---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "**/*.cts"
---

# TypeScript coding style

- `strict: true`を維持する。
- application codeで`any`を使わず、外部入力は`unknown`から検証して型を狭める。
- exported function、共有model、component propsの型を明示する。
- 型だけのimportは`import type`を使う。
- 型assertionは検証済みの境界へ限定し、二重assertionとnon-null assertionの重ね掛けを避ける。
- 引数が増えた関数は名前付きobjectを検討し、boolean flagで複数の振る舞いを切り替えない。
- immutable updateと純粋関数を優先する。
- `catch`値は`unknown`として扱い、安全にnarrowingする。
