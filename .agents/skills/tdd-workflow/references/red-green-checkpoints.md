# RED / GREEN / Refactorの詳細とcheckpoint commit

## Gitのcheckpoint

- リポジトリがGit管理下なら、各TDD段階の後にcheckpoint commitを作る
- workflowが完了するまで、これらのcheckpoint commitをsquashしたり書き換えたりしない
- 各checkpoint commitのメッセージは、段階と取得した証拠を正確に記述する
- 現在のタスクで現在のactive branch上に作られたcommitだけを数える
- 他branchのcommit、以前の無関係な作業、離れたbranch履歴を有効なcheckpointの証拠として扱わない
- checkpointが満たされたと見なす前に、そのcommitがactive branchの現在の`HEAD`から到達可能で、現在のタスク列に属することを確認する
- 推奨されるコンパクトなworkflow:
  - 失敗するtestを追加しREDを検証したcommitを1つ
  - 最小限の修正を適用しGREENを検証したcommitを1つ
  - refactor完了の任意のcommitを1つ
- testのcommitが明確にREDへ、fixのcommitが明確にGREENへ対応していれば、証拠専用のcommitを別途作る必要はない
- squash mergeは、workflowの証拠がStep 8で保存された後にのみ許される。checkpoint commitをsquashする場合は、RED/GREEN/refactorの要約をPR本文、squash commitの本文、または証拠レポートへ写し、レビュアーが「何をどう検証したか」に答えられるようにする

プロジェクトの`AGENTS.md`がcommit前のユーザー確認を求めている場合は、checkpoint commitもその確認を経る。

## Step 1: User Journeyを書く

```
As a [role], I want to [action], so that [benefit]
```

`*.plan.md`がある場合の扱いは`plan-handoff.md`を参照する。

## Step 2: Test caseを作る

各user journeyについて、網羅的なtest caseを作る:

```typescript
describe('Semantic Search', () => {
  it('returns relevant markets for query', async () => {
    // テストの実装
  })

  it('handles empty query gracefully', async () => {
    // edge caseのテスト
  })

  it('falls back to substring search when Redis unavailable', async () => {
    // fallback挙動のテスト
  })

  it('sorts results by similarity score', async () => {
    // ソートロジックのテスト
  })
})
```

## Step 3: Testを実行する（RED gate）

```bash
<test>
# まだ実装していないのでtestは失敗するはず
```

この手順は必須であり、すべてのproductionコード変更に対するRED gateである。業務ロジックその他のproductionコードを変更する前に、次のいずれかの経路で妥当なRED状態を検証しなければならない:

- 実行時のRED:
  - 対象のtest targetが正常にcompileされる
  - 新規または変更したtestが実際に実行される
  - 結果がREDである
- compile時のRED:
  - 新しいtestが、バグのあるコード経路を新たにインスタンス化・参照・実行する
  - compile失敗そのものが意図したREDのシグナルである
- いずれの場合も、失敗の原因は意図した業務ロジックのバグ、未定義の挙動、未実装であること
- 失敗の原因が、無関係な構文エラー、壊れたtest setup、依存の欠落、無関係なregressionだけではないこと

書いただけでcompileも実行もされていないtestはREDとして数えない。このRED状態を確認するまでproductionコードを編集しない。

checkpoint commit（推奨形式）:
- `test: add reproducer for <feature or bug>`
- 再現testがcompile・実行され意図した理由で失敗したなら、このcommitをRED検証のcheckpointとしても扱える
- 継続前に、このcheckpoint commitが現在のactive branch上にあることを確認する

## Step 4: コードを実装する

testを通すための最小限のコードを書く:

```typescript
// テストに導かれた実装
export async function searchMarkets(query: string) {
  // ここに実装
}
```

最小限の修正をここでstageし、checkpoint commitはStep 5でGREENが検証されるまで保留する。

## Step 5: 再びtestを実行する（GREEN gate）

```bash
<test>
# ここでtestが通るはず
```

修正後に同じ対象のtest targetを再実行し、失敗していたtestがGREENになったことを確認する。妥当なGREEN結果を得た後にのみrefactorへ進める。

checkpoint commit（推奨形式）:
- `fix: <feature or bug>`
- 同じ対象のtest targetを再実行して通ったなら、fixのcommitをGREEN検証のcheckpointとしても扱える
- 継続前に、このcheckpoint commitが現在のactive branch上にあることを確認する

## Step 6: Refactor

testをgreenに保ったままコード品質を高める: 重複の除去、命名の改善、performanceの最適化、可読性の向上。

checkpoint commit（推奨形式）:
- `refactor: clean up after <feature or bug> implementation`
- TDDサイクルを完了と見なす前に、このcheckpoint commitが現在のactive branch上にあることを確認する

## Step 7: Coverageを確認する

```bash
<coverage>
# 目標（既定80%以上）を達成しているか確認する
```

Jestでの閾値設定:

```json
{
  "jest": {
    "coverageThresholds": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

Bunネイティブrunnerでは`bunfig.toml`の`[test]`配下で設定する（`test-runner-detection.md`を参照）。
