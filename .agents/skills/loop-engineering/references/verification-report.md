# 検証の順序と報告形式

Loopの「Verify」段階で使う。常時ロードされる `.agents/rules/verification.md` の原則（変更範囲に近い検証から実行し、最後に全体を確認する）を、実行順と報告形式に落としたもの。

## 実行順

安価で失敗が早く分かるものから順に実行する。前段が失敗したら後段へ進まず、先に直す。

1. format（自動整形の差分がないか）
2. lint
3. typecheck（`tsc --noEmit`、`pyright` など）
4. 対象を絞ったテスト（変更したmodule・機能だけ）
5. 統合テスト / E2E（主要導線に触れたときだけ）
6. build
7. 差分レビュー（`git diff --stat` と変更ファイルごとの目視）

full test suiteとbuildは高コストなので、Loopの最終反復で1回にとどめる。

## 差分レビューで見ること

- 意図しないファイルの変更が混ざっていないか
- エラー処理の抜け（catchして黙る、文脈のない再throw）
- 境界ケース（空・上限・重複・同時実行）
- ログや例外に秘密値・個人情報が入っていないか
- 仕様外の機能や不要な抽象化を先取りしていないか

## 報告形式

```text
VERIFICATION REPORT
==================

Format:    [PASS/FAIL/SKIP]
Lint:      [PASS/FAIL/SKIP] (X warnings)
Types:     [PASS/FAIL/SKIP] (X errors)
Tests:     [PASS/FAIL/SKIP] (X/Y passed, Z% coverage)
Build:     [PASS/FAIL/SKIP]
Diff:      [X files changed]

Overall:   [READY/NOT READY]

未確認と理由:
- （実行できなかった検証と、再現コマンド）

残る課題:
1. ...
```

SKIPにした項目は理由を書く。検証不能な項目を成功扱いにしない。

## チェックポイント

長いセッションでは次のタイミングで短い検証（1〜4）を挟む。

- 関数やcomponentを1つ仕上げたとき
- 次のタスクへ移る前
- PRを作る前（このときは1〜7を全て実行する）
