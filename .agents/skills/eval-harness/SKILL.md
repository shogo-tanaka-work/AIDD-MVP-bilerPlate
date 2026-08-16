---
name: eval-harness
description: eval-driven development（EDD）の原則をClaude Codeのセッションへ適用する形式的な評価フレームワーク。Claude Codeのworkflowを信頼または変更する前に、形式的なevalが必要なときに使う。
metadata:
  origin: ECC
tools: Read, Write, Edit, Bash, Grep, Glob
---

# Eval Harness Skill

eval-driven development（EDD）の原則を実装した、Claude Codeセッション向けの形式的な評価フレームワーク。

## いつ発動するか

- AI支援workflowにeval-driven development（EDD）を導入するとき
- Claude Codeのタスク完了に対する合否基準を定義するとき
- pass@k指標でagentの信頼性を測定するとき
- promptやagentの変更に対する回帰テスト群を作るとき
- モデルバージョン間でagentの性能を比較するとき

## 考え方

Eval-Driven Developmentは、evalを「AI開発におけるunit test」として扱う。
- 実装の前に期待する挙動を定義する
- 開発中は継続的にevalを実行する
- 変更ごとに回帰を追跡する
- 信頼性の測定にpass@k指標を使う

## Evalの種類

### Capability Evals
これまでできなかったことをClaudeができるかを検証する。
```markdown
[CAPABILITY EVAL: feature-name]
Task: Description of what Claude should accomplish
Success Criteria:
  - [ ] Criterion 1
  - [ ] Criterion 2
  - [ ] Criterion 3
Expected Output: Description of expected result
```

### Regression Evals
変更が既存機能を壊していないことを確認する。
```markdown
[REGRESSION EVAL: feature-name]
Baseline: SHA or checkpoint name
Tests:
  - existing-test-1: PASS/FAIL
  - existing-test-2: PASS/FAIL
  - existing-test-3: PASS/FAIL
Result: X/Y passed (previously Y/Y)
```

## Graderの種類

### 1. Code-Based Grader
コードによる決定的なチェック。
```bash
# Check if file contains expected pattern
grep -q "export function handleAuth" src/auth.ts && echo "PASS" || echo "FAIL"

# Check if tests pass
npm test -- --testPathPattern="auth" && echo "PASS" || echo "FAIL"

# Check if build succeeds
npm run build && echo "PASS" || echo "FAIL"
```

### 2. Model-Based Grader
自由記述の出力の評価にClaudeを使う。
```markdown
[MODEL GRADER PROMPT]
Evaluate the following code change:
1. Does it solve the stated problem?
2. Is it well-structured?
3. Are edge cases handled?
4. Is error handling appropriate?

Score: 1-5 (1=poor, 5=excellent)
Reasoning: [explanation]
```

### 3. Human Grader
人手レビュー対象として印を付ける。
```markdown
[HUMAN REVIEW REQUIRED]
Change: Description of what changed
Reason: Why human review is needed
Risk Level: LOW/MEDIUM/HIGH
```

## 指標

### pass@k
「k回の試行で少なくとも1回成功する」
- pass@1: 初回試行の成功率
- pass@3: 3回以内での成功
- 一般的な目標: pass@3 > 90%

### pass^k
「k回すべての試行が成功する」
- 信頼性としてはより高い基準
- pass^3: 3回連続の成功
- 重要経路に使う

## Evalのworkflow

### 1. 定義（コーディング前）
```markdown
## EVAL DEFINITION: feature-xyz

### Capability Evals
1. Can create new user account
2. Can validate email format
3. Can hash password securely

### Regression Evals
1. Existing login still works
2. Session management unchanged
3. Logout flow intact

### Success Metrics
- pass@3 > 90% for capability evals
- pass^3 = 100% for regression evals
```

### 2. 実装
定義したevalを通すコードを書く。

### 3. 評価
```bash
# Run capability evals
[Run each capability eval, record PASS/FAIL]

# Run regression evals
npm test -- --testPathPattern="existing"

# Generate report
```

### 4. 報告
```markdown
EVAL REPORT: feature-xyz
========================

Capability Evals:
  create-user:     PASS (pass@1)
  validate-email:  PASS (pass@2)
  hash-password:   PASS (pass@1)
  Overall:         3/3 passed

Regression Evals:
  login-flow:      PASS
  session-mgmt:    PASS
  logout-flow:     PASS
  Overall:         3/3 passed

Metrics:
  pass@1: 67% (2/3)
  pass@3: 100% (3/3)

Status: READY FOR REVIEW
```

## 組み込みパターン

### 実装前
```
/eval define feature-name
```
`.claude/evals/feature-name.md`にeval定義ファイルを作成する

### 実装中
```
/eval check feature-name
```
現在のevalを実行して状態を報告する

### 実装後
```
/eval report feature-name
```
完全なevalレポートを生成する

## Evalの保存場所

evalはプロジェクト内に保存する。
```
.claude/
  evals/
    feature-xyz.md      # Eval definition
    feature-xyz.log     # Eval run history
    baseline.json       # Regression baselines
```

## Best Practice

1. **コーディング前にevalを定義する** - 成功基準を明確に考えさせる
2. **evalを頻繁に実行する** - 回帰を早期に検出する
3. **pass@kを継続的に追跡する** - 信頼性の傾向を監視する
4. **可能な限りcode graderを使う** - 決定的 > 確率的
5. **セキュリティは人手レビュー** - セキュリティ確認を完全自動化しない
6. **evalを高速に保つ** - 遅いevalは実行されなくなる
7. **evalをコードと一緒にバージョン管理する** - evalは一級の成果物

## 例: 認証の追加

```markdown
## EVAL: add-authentication

### Phase 1: Define (10 min)
Capability Evals:
- [ ] User can register with email/password
- [ ] User can login with valid credentials
- [ ] Invalid credentials rejected with proper error
- [ ] Sessions persist across page reloads
- [ ] Logout clears session

Regression Evals:
- [ ] Public routes still accessible
- [ ] API responses unchanged
- [ ] Database schema compatible

### Phase 2: Implement (varies)
[Write code]

### Phase 3: Evaluate
Run: /eval check add-authentication

### Phase 4: Report
EVAL REPORT: add-authentication
==============================
Capability: 5/5 passed (pass@3: 100%)
Regression: 3/3 passed (pass^3: 100%)
Status: SHIP IT
```

## Product Evals (v1.8)

unit testだけでは挙動の品質を捉えられない場合にproduct evalを使う。

### Graderの種類

1. Code grader（決定的なassertion）
2. Rule grader（regex・schemaによる制約）
3. Model grader（LLM-as-judgeのrubric）
4. Human grader（曖昧な出力に対する人手判定）

### pass@kの指針

- `pass@1`: 素の信頼性
- `pass@3`: 制御された再試行下での実用的な信頼性
- `pass^3`: 安定性テスト（3回すべて通過が必要）

推奨閾値。
- Capability evals: pass@3 >= 0.90
- Regression evals: リリース上重要な経路ではpass^3 = 1.00

### Evalのアンチパターン

- 既知のeval例へpromptを過剰適合させる
- happy pathの出力しか測定しない
- pass率を追う一方でコストとlatencyの変動を無視する
- 不安定なgraderをリリースgateに残す

### 最小限のeval成果物構成

- `.claude/evals/<feature>.md` 定義
- `.claude/evals/<feature>.log` 実行履歴
- `docs/releases/<version>/eval-summary.md` リリース時のスナップショット
