# semantic HTMLとARIA属性

screen readerとkeyboard利用者はnativeのsemanticsに依存している。誤ったARIAはARIAなしより悪い。

## semantic HTML

```tsx
// BAD: divにはroleもkeyboard対応もaccessible nameもない
<div onClick={handleClick}>Submit</div>

// GOOD: buttonはfocus可能でEnter/Spaceで発火し、「button」として読み上げられる
<button type="button" onClick={handleClick}>Submit</button>
```

```tsx
// BAD: semanticでないnavigation
<div onClick={() => navigate('/home')}>Home</div>

// GOOD: anchorは右クリック・中クリック・keyboard navigationに対応する
<a href="/home">Home</a>
```

```tsx
// BAD: 見出し階層が飛んでいる（h1からh4）
<h1>Dashboard</h1>
<h4>Recent Activity</h4>

// GOOD: 見出しレベルが連続している
<h1>Dashboard</h1>
<h2>Recent Activity</h2>
```

## aria-labelとaria-labelledby

```tsx
// aria-label: インラインの文字列label。可視のlabel文言がないときに使う
<button aria-label="Close modal">
  <XIcon />
</button>

// aria-labelledby: 他要素のテキストを参照する。可視のlabelがあるときに使う
<section aria-labelledby="section-title">
  <h2 id="section-title">Recent Orders</h2>
  {/* コンテンツ */}
</section>
```

## aria-describedby

```tsx
// labelに加えて補足説明を提供する
<button
  aria-describedby="delete-warning"
  onClick={handleDelete}
> Delete account
</button>
<p id="delete-warning">This action cannot be undone.</p>
```

## 動的コンテンツのaria-live

```tsx
// ページ再読み込みなしに更新される内容を読み上げさせるにはaria-liveを使う
// polite: 利用者が現在の操作を終えるまで待ってから読み上げる
// assertive: 即座に割り込む。緊急のエラーにだけ使う

export function StatusMessage({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <div role="status" aria-live={isError ? 'assertive' : 'polite'} aria-atomic="true">
      {message}
    </div>
  );
}
```

## aria-expandedとaria-controls

```tsx
export function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div>
      <button aria-expanded={isOpen} aria-controls={contentId} onClick={() => setIsOpen(prev => !prev)}>
        {title}
      </button>
      <div id={contentId} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
```

## 画像とアイコン

```tsx
// BAD: 装飾アイコンがlabelなしの画像として読み上げられる
<img src="/icon.svg" />

// GOOD: 装飾画像をscreen readerから隠す
<img src="/decoration.png" alt="" aria-hidden="true" />

// GOOD: 意味のある画像には説明的なalt textを付ける
<img src="/chart.png" alt="Monthly revenue increased 23% from January to March" />

// GOOD: アイコンのみのbuttonにaccessibleなlabelを付ける
<button aria-label="Delete item">
  <TrashIcon aria-hidden="true" />
</button>
```

## アンチパターン

```tsx
// BAD: keyboard対応のないnon-interactive要素へのonClick
<div onClick={handleClick}>Click me</div>

// BAD: roleのないdivへのaria-label
<div aria-label="Navigation">...</div>

// BAD: placeholderをlabelの代用にしている
<input placeholder="Enter your email" />

// BAD: 正のtabIndexはtab順序を予測不能にする
<button tabIndex={3}>Submit</button>

// BAD: focus可能な要素へのaria-hidden。keyboard利用者が閉じ込められる
<button aria-hidden="true">Open</button>

// BAD: keyboard handlerのないdivへのrole="button"
<div role="button" onClick={handleClick}>Submit</div>
// 不足: tabIndex={0}、Enter/Space用のonKeyDown
```
