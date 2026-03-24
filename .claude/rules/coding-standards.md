# コーディング規約（スタック共通）

## 命名規則
- 変数・関数: camelCase
- 定数: UPPER_SNAKE_CASE
- コンポーネント・クラス: PascalCase
- ファイル名: kebab-case（コンポーネントは PascalCase）

## 共通ルール
- 1ファイル1責務。200行を超えたら分割を検討する
- any / unknown の安易な使用禁止。型を明示する
- エラーハンドリング必須。空の catch 禁止
- デバッグ用の console.log はコミット前に削除する
- マジックナンバー禁止。定数として定義する
- コメントは「なぜ」を書く。「何を」はコードから読める

## Git
- コミットメッセージは Conventional Commits 形式
  （feat / fix / refactor / test / docs / chore）
- 1コミット1変更。複数の変更を混ぜない
