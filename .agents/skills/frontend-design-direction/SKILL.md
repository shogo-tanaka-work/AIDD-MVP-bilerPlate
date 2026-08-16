---
name: frontend-design-direction
description: 本番UI開発のためにECC固有のフロントエンドdesign directionを定める。Webサイト、dashboard、アプリケーション、component、landing page、visual tool、その他プロダクト固有のdesign判断が必要なweb UIを実装・改善するときに使う。
metadata:
  origin: community
---

# Frontend Design Direction

UIを動かすだけでなく、目的に沿い、完成度が高く、プロダクト領域にふさわしい手触りにする作業でこのskillを使う。

出典: 停滞したcommunity PR #1659（`linus707`）から救い出したもの。

注記: ECCは正式なAnthropicの`frontend-design` skillを意図的に再同梱していない。公式のupstream skillが必要なら`anthropics/skills`から導入する。このskillは#1659の有用なローカル指針をECC固有のdesign directionとして取り出したものである。

## 使う場面

- Webページ、アプリ、dashboard、artifact、component、UIの実装を依頼されたとき。
- interfaceをより洗練させ、特徴的に、美しく、あるいは没個性でなくするよう依頼されたとき。
- 実装に視覚的な階層、typography、色、motion、レイアウト、interactionの判断が必要なとき。
- 現状のUIは動くが、平板・没個性・テンプレート的、または対象読者に合っていないとき。

## Design Direction

コーディング前に具体的な方向性を決める。

1. 目的: このinterfaceは何をする道具か。
2. 対象者: このworkflowを繰り返すのは誰で、最初に何を見たいのか。
3. トーン: 実用的、editorial、遊び心、無骨、洗練、技術的、過剰、最小限、高密度、静か、あるいは他の明示的な方向性。
4. 記憶に残る要素: 結果を意図的に感じさせるdesignのアイデアを一つ。
5. 制約: framework、accessibility、performance、レスポンシブ対応、既存のdesign system。

方向性は領域に合わせる。SaaSの運用ツールは通常、高密度で静かで走査しやすくする。ポートフォリオ、ローンチページ、ゲーム、editorialな作品はより表現的でよい。日常的に繰り返し使うツールにlanding pageの構成を押し付けない。

## 実装の指針

- マーケティング文言を明示的に求められない限り、最初の画面として実際に使える体験を作る。
- 新しい視覚体系を持ち込む前に、既存のproject component、token、iconライブラリ、routingパターンを使う。
- interfaceが画像、製品、場所、人物、ゲームプレイ、chart、閲覧可能なメディアに依存する場合は、実物または生成した視覚assetを使う。
- 汎用的な巨大hero textより、文脈に合ったtypographyとspacingを優先する。
- パレットは多次元に保つ。単一の色相系統が支配するUIを避ける。
- 方向性が各stateで一貫するよう、CSS変数か既存のdesign tokenを使う。
- レスポンシブの制約を明示的に設計する。grid、アスペクト比、min/maxサイズ、安定したtoolbar、固定形式のcontrolは、labelやhover stateが現れてもずれてはならない。
- motionは控えめに、しかし意図をもって使う。装飾的なアニメーションより、stateを明確にする情報量の多いtransitionを優先する。
- モバイルとデスクトップで文字が収まることを確認する。長いlabelはあふれずに折り返すか縮小しなければならない。

## アンチパターン

- よくある生成物のパターンに流れない: 紫のグラデーション、装飾的なblob、過大なcard、曖昧なheroコピー、ストック風の雰囲気メディア。
- cardの中にcardを入れない。
- 領域が抑制を求めているのに、装飾的なstyleを一律に使わない。
- 主要な製品・ツール・対象・workflowを汎用的なマーケティングセクションの背後に隠さない。
- design上の装飾のために、明確に見合わない新規dependencyを追加しない。
- controlがそれ自体で語れる場合に、UIの機能をUIの中で説明しない。

## レビューチェックリスト

- 最初のviewportで、製品・workflow・対象が即座に伝わる。
- 視覚的な階層が走査と反復利用を支えている。
- typographyがコンテナに収まり、隣接する内容と重ならない。
- 色にコントラストがあり、単調なパレットへ潰れていない。
- 既知のツール操作には、利用可能な範囲でiconを使っている。
- レスポンシブなレイアウトで、board、grid、toolbar、control、tile、counterの寸法が安定している。
- assetが表示され、埋め草ではなく主題を伝えている。
- motionが方向感覚を助け、動作の遅さを覆い隠していない。
- 明確な理由がない限り、結果がrepoの既存フロントエンド慣行に沿っている。
