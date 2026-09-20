# TDD証拠レポート（Step 8）

GREENとcoverageの検証後、人が読める短い証拠レポートを書く。レポートはtestコードの代わりではない。testコードが何を証明しているかを説明し、その証明をセッション再開やsquash mergeをまたいで保存する索引である。

## 推奨path

証拠レポートはプロジェクト標準のドキュメントディレクトリへ置く。例:

```text
docs/testing/<plan-or-task-name>.tdd.md
.github/tdd/<plan-or-task-name>.tdd.md
.claude/tdd/<plan-or-task-name>.tdd.md
```

リポジトリがすでにClaude固有のローカルartifactを使っているなら、`.claude/tdd/`も許容される。

## 含める内容

1. **元のplan** - 使用した`*.plan.md`へのリンク、または今回のTDD実行中にjourneyを導出したことの記述。
2. **User journey** - planに由来するjourney、またはStep 1で書いたものを列挙する。
3. **Taskレポート** - 各plan taskまたは実装した振る舞いについて次を記録する:
   - 一文の実行サマリー
   - 実際に実行した検証コマンド
   - 関連する出力の抜粋（該当する場合はREDとGREENの結果を含む）
   - 通過したtestが何を保証するか
4. **Test仕様** - 人が読める保証の表:

```markdown
| # | 保証内容 | testファイルまたはコマンド | testの種類 | 結果 | 証拠 |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | 空の検索は例外を投げずに空の結果リストを返す | `src/search.test.ts:returns empty list for empty query` | unit | PASS | `npm test -- search.test.ts` |
| 2 | APIは不正なlimit値をHTTP 400で拒否する | `src/api/markets/route.test.ts:validates query parameters` | integration | PASS | `npm test -- route.test.ts` |
```

5. **Coverageと既知の不足** - 可能ならcoverageのコマンドと結果を含め、意図的な不足、skipしたtest、未検証のフォローアップを説明する。
6. **Mergeの証拠** - checkpoint commitをsquashする場合は、最終的なRED/GREEN/refactorの要約をここと、PR本文またはsquash commit本文へ写す。

レポートは事実に徹する。実際のコマンドと結果を引用し、実行していないtestのPASSを捏造しない。planが曖昧だった、または疑わしい指示を含んでいた場合は、その懸念と採用した解釈もここへ記録する。
