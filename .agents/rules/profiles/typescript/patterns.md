---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript patterns

- validation schemaとdomain型の二重管理を避け、可能ならschemaから型を導出する。
- DB行、外部API response、domain model、view modelを境界で変換する。
- discriminated unionを使い、分岐は`never`で網羅性を確認する。
- Repositoryは永続化の詳細を隠し、Serviceはuse caseと状態遷移を担当する。
- 外部serviceは型付きinterfaceのadapterとして隔離する。
- module scopeには再代入されるrequest固有状態を置かない。
