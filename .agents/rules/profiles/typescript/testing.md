---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# TypeScript testing

- 実装詳細ではなく公開interfaceと利用者から見える振る舞いを検証する。
- Arrange・Act・Assertを分け、テスト名に条件と期待結果を書く。
- pure functionは境界値を、adapterは成功・timeout・不正responseを、UIは主要操作を優先する。
- network境界はmock serverまたはtest doubleで制御し、実serviceへ偶発的に接続しない。
- async assertionを待機し、固定sleepに依存しない。
- testを通すためにproduction behaviorを弱めない。
