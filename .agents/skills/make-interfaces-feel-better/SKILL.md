---
name: make-interfaces-feel-better
description: interfaceの完成度を高める具体的なdesign engineeringの詳細を適用する。UIのspacing、typography、border、shadow、motion、hit area、icon、text wrapping、interaction stateをレビュー・改善するときに使う。
metadata:
  origin: community
---

# Make Interfaces Feel Better

積み重なることでinterfaceの完成度を高める、細かなdesign engineeringの工夫のために
このskillを使う。

出典: 停滞したcommunity PR #1659（`linus707`）から回収。

## 使う場面

- UIがしっくりこない、平坦、ありきたり、窮屈、ガタつく、未完成だとユーザーが言うとき。
- control、card、list、dashboard、navigation、form、toolbarを実装しているとき。
- componentにhover、active、focus、enter、exit、loading、empty状態が必要なとき。
- frontendレビューで具体的なbefore/afterの提案が必要なとき。

## 基本原則

### Concentric Radius

近接して入れ子になった角丸surfaceには次を使う:

```text
outer radius = inner radius + padding
```

paddingが大きい場合は、式に合わせようとせず別々のsurfaceとして扱う。目的は
視覚的な一貫性であり、公式の順守ではない。

### 視覚的な位置合わせ

幾何学的な中央が常に視覚的な中央になるとは限らない。icon button、再生用の
三角形、矢印、星、非対称なiconは小さなoffsetを必要とすることが多い。可能ならSVG側を
直し、難しければpixel単位のmarginまたはpaddingで調整する。

### ShadowとBorder

分離とfocus ringにはborderを使う。card、button、dropdown、popoverに奥行きが必要なときは
重ねたshadowを使う。shadowは透過させ、どの背景でも機能する程度に控えめにする。

### Text Wrapping

- 見出しや短いタイトルには `text-wrap: balance` を使う。
- 短〜中程度の本文、caption、説明、list itemには `text-wrap: pretty` を使う。
- 長文、code、preformattedな内容にはどちらも使わない。
- counter、timer、価格、table、その他更新される数値には `font-variant-numeric: tabular-nums` を使う。

### Font Smoothing

macOSでは、プロジェクトが未対応の場合にroot layoutでantialiasedなfont smoothingを
適用する:

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 画像のoutline

画像は、縁がsurfaceに溶け込まないよう控えめなinset outlineを必要とすることが多い。

```css
img {
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

@media (prefers-color-scheme: dark) {
  img {
    outline-color: rgba(255, 255, 255, 0.1);
  }
}
```

中立な黒または白のalpha outlineを使う。画像のoutlineをbrand paletteで
色付けしない。

### Motion

interactiveな状態変化にはCSS transitionを使う。動作の途中で利用者の意図が
変わっても再ターゲットできるため。keyframesは段階的な一度きりの登場や
loading演出に限定する。

適切なmotionの既定値:

- Enter: opacity、小さな `translateY`、必要に応じてblurを組み合わせる。
- Exit: enterより短く控えめにし、通常は150ms。
- Press: 触覚的なbuttonには `scale(0.96)`。動きが邪魔なときに無効化できる手段を用意する。
- Iconの差し替え: 即座の表示切り替えではなく、opacity・scale・blurでcross-fadeする。

### Transitionの適用範囲

`transition: all` は使わない。変化するプロパティを明示する:

```css
.button {
  transition-property: transform, background-color, box-shadow;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}
```

`will-change` は `transform`、`opacity`、`filter` などcompositor向きのプロパティで
初回フレームのstutterが出るときだけ使う。`will-change: all` は使わない。

### Hit Area

interactiveなcontrolは最低でも40x40pxのhit areaを持たせ、layoutが許すなら44x44pxが望ましい。
表示されるiconがそれより小さい場合はpseudo-elementで拡張するが、拡張したhit areaを
重ねない。

## レビュー出力

UIのpolish passをレビューするときは、具体的な変更をbefore/afterの行で報告する:

| 原則 | Before | After |
| --- | --- | --- |
| Concentric radius | 親と子で同じradius | 親のradiusがpaddingを考慮している |
| Tabular numbers | 桁が変わるとcounterがずれる | counterが `tabular-nums` を使う |
| Transitionの適用範囲 | `transition: all` | transitionプロパティを明示 |

snippetから自明でない場合はfile pathとプロパティを併記する。
確認したが変更しなかった原則は省く。

## チェックリスト

- 入れ子の角丸要素が視覚的に一貫している。
- iconが視覚的に中央にある。
- button、card、popoverが適切な理由でborderまたはshadowを使っている。
- 見出しと短いテキストが不格好な折り返しを避けている。
- 動的な数値がtabular numeralsを使っている。
- 必要な箇所で画像が中立なoutlineを持つ。
- enterとexitのアニメーションが分離され、控えめで、必要に応じて中断可能である。
- buttonが過剰な動きなく触覚的なactive状態を持つ。
- `transition: all` と `will-change: all` が存在しない。
- 小さなcontrolでも実用的なhit areaがある。
