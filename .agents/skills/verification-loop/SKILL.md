---
name: verification-loop
description: "Claude Codeセッション向けの包括的な検証システム。Claude Codeセッションの作業を完了とみなす前に検証するときに使う。"
license: MIT
metadata:
  origin: ECC
---

# Verification Loop Skill

Claude Codeセッション向けの包括的な検証システム。

## 使いどころ

このskillを起動する場面:
- 機能や大きなコード変更を完了した後
- PRを作成する前
- 品質ゲートの通過を確認したいとき
- refactorの後

## 検証フェーズ

### Phase 1: Build検証
```bash
# プロジェクトがbuildできるか確認する
npm run build 2>&1 | tail -20
# または
pnpm build 2>&1 | tail -20
```

buildが失敗したら、続行せず先に修正する。

### Phase 2: 型検査
```bash
set -o pipefail
# TypeScriptプロジェクト
npx --no-install tsc --noEmit 2>&1 | head -30

# Pythonプロジェクト
pyright . 2>&1 | head -30
```

型エラーをすべて報告する。重大なものは続行前に修正する。

### Phase 3: Lintチェック
```bash
# JavaScript/TypeScript
npm run lint 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30
```

### Phase 4: テストスイート
```bash
# coverage付きでテストを実行する
npm run test -- --coverage 2>&1 | tail -50

# coverage閾値を確認する
# 目標: 最低80%
```

報告内容:
- テスト総数: X
- 成功: X
- 失敗: X
- Coverage: X%

### Phase 5: セキュリティスキャン
```bash
# 秘密情報を確認する
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# console.logを確認する
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

### Phase 6: 差分レビュー
```bash
# 変更内容を表示する
git diff --stat
git diff HEAD~1 --name-only
```

変更されたファイルごとに次を確認する:
- 意図しない変更
- 抜けているエラー処理
- 起こりうる境界ケース

## 出力形式

全フェーズを実行した後、検証レポートを出力する:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## 継続モード

長いセッションでは、15分ごとまたは大きな変更のたびに検証を実行する:

```markdown
以下をチェックポイントとして意識する:
- 関数を1つ書き終えたとき
- componentを1つ仕上げたとき
- 次のタスクへ移る前

実行: /verify
```

## Hooksとの併用

このskillはPostToolUse hookを補完し、より深い検証を提供する。
hookは問題を即座に検知し、このskillは包括的なレビューを提供する。
