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

## ブランチ戦略（MVP簡易版）
- `main`: 本番相当。常にデプロイ可能な状態を保つ。直接プッシュ禁止
- `feat/<機能名>`: 新機能の開発ブランチ（例: feat/user-auth）
- `fix/<内容>`: バグ修正ブランチ（例: fix/login-error）
- `refactor/<対象>`: リファクタリングブランチ

### フロー
1. main から feature/fix/refactor ブランチを切る
2. TDDで実装 → PR作成 → CI通過 → レビュー → main にマージ
3. マージ後はブランチを削除する

### やらないこと（MVP段階）
- develop / staging / release ブランチの運用（過剰）
- リリースタグの管理（本番運用フェーズで導入する）
