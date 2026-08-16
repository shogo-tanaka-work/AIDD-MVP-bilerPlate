---
name: frontend-a11y
description: >
  ReactとNext.jsのaccessibilityパターン — semantic HTML、ARIA属性、
  formのlabel付け、keyboard navigation、focus管理、screen reader対応。
  interactiveなUI componentやformを実装するときに使う。
metadata:
  origin: community
---

# フロントエンドaccessibilityパターン

ReactとNext.jsの実践的なaccessibilityパターン。code reviewで最も多く指摘される問題を扱う。formのlabel欠落、誤ったARIAの使い方、semanticでないinteractive要素、壊れたkeyboard navigation。

## 発動タイミング

- form component（`<input>`、`<select>`、`<textarea>`）を実装・レビューする
- interactiveな要素（modal、dropdown、tooltip、tab）を作る
- `<div>`や`<span>`に`onClick`を付ける
- 要素に`aria-*`属性を追加する
- keyboard navigationやfocus管理を実装する
- code reviewツール（CodeRabbit、ESLint a11y）からaccessibilityの指摘を受ける
- screen reader対応が必要なcomponentを実装する

## formのaccessibility

`htmlFor` / `id`の対応漏れと、紐付いていないエラーメッセージがcode reviewで最も多い指摘。

### labelの紐付け

```tsx
// BAD: labelがinputと紐付いておらず、screen readerが関連付けられない
<label>Email</label>
<input type="email" />

// GOOD: htmlForがinputのidと一致している
<label htmlFor="email">Email</label>
<input id="email" type="email" />
```

### 必須フィールド

```tsx
// BAD: 見た目だけのアスタリスクはscreen readerに何も伝わらない
<label htmlFor="email">Email *</label>
<input id="email" type="email" />

// GOOD: requiredでbrowser標準のvalidationが有効になり、aria-requiredでscreen readerに必須を伝える
<label htmlFor="email">
  Email <span aria-hidden="true">*</span>
</label>
<input id="email" type="email" required aria-required="true" />
```

### エラーメッセージ

```tsx
// BAD: エラー文言は表示されるがinputと紐付いていない
<input id="email" type="email" />
<span className="error">Invalid email address</span>

// GOOD: aria-describedbyでinputとエラーメッセージを紐付ける
// aria-invalidで不正な状態をscreen readerに伝える
<input
  id="email"
  type="email"
  aria-describedby="email-error"
  aria-invalid={!!error}
/>
{error && (
  <span id="email-error" role="alert">
    {error}
  </span>
)}
```

### accessibleなformの完成例

```tsx
interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }
    onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="email">
          Email <span aria-hidden="true">*</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          aria-required="true"
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={!!errors.email}
          autoComplete="email"
        />
        {errors.email && (
          <span id="email-error" role="alert">
            {errors.email}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="password">
          Password <span aria-hidden="true">*</span>
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          aria-required="true"
          aria-describedby={errors.password ? 'password-error' : undefined}
          aria-invalid={!!errors.password}
          autoComplete="current-password"
        />
        {errors.password && (
          <span id="password-error" role="alert">
            {errors.password}
          </span>
        )}
      </div>

      <button type="submit">Log in</button>
    </form>
  );
}
```

## semantic HTML

意図に合う要素を使う。screen readerとkeyboard利用者はnativeのsemanticsに依存している。

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

## ARIA属性

nativeなHTMLのsemanticsで足りない場合だけARIAを使う。誤ったARIAはARIAなしより悪い。

### aria-labelとaria-labelledby

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

### aria-describedby

```tsx
// labelに加えて補足説明を提供する
<button
  aria-describedby="delete-warning"
  onClick={handleDelete}
> Delete account
</button>
<p id="delete-warning">This action cannot be undone.</p>
```

### 動的コンテンツのaria-live

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

### aria-expandedとaria-controls

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

## keyboard navigation

すべてのinteractive要素はkeyboardだけで到達・操作できなければならない。

### custom dropdown

```tsx
export function Dropdown({ options, onSelect }: { options: string[]; onSelect: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  if (!options.length) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen) onSelect(options[activeIndex]);
        setIsOpen(prev => !prev);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-controls={listId}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => setIsOpen(prev => !prev)}
    >
      <span>{options[activeIndex]}</span>
      {isOpen && (
        <ul id={listId} role="listbox">
          {options.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => {
                onSelect(option);
                setIsOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## focus管理

UIのstateが変わったときfocusは論理的に移動しなければならない。とくにmodalとroute遷移で重要。

### modalのfocus復元

> この例は初期focusと復元を扱う。完全なfocus trap（modal内でのTab/Shift+Tab循環）には、動的コンテンツやnested portalのedge caseを扱う[`focus-trap-react`](https://github.com/focus-trap/focus-trap-react)のようなライブラリを使う。

```tsx
export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // 現在focusされている要素を保存し、modalへfocusを移す
      previousFocusRef.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else {
      // modalを開いた要素へfocusを戻す
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
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

## モーションの抑制

OS設定でモーション抑制を要求している利用者を尊重する。

```tsx
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

// 使用例
export function AnimatedCard({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      style={{
        transition: reduceMotion ? 'none' : 'transform 300ms ease'
      }}
    >
      {children}
    </div>
  );
}
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

## チェックリスト

interactiveなcomponentをレビューへ出す前に確認する。

- [ ] すべての`<input>`、`<select>`、`<textarea>`が`htmlFor`/`id`で`<label>`と紐付いている
- [ ] エラーメッセージが`aria-describedby`で紐付き、`role="alert"`が付いている
- [ ] `role`、`tabIndex`、`onKeyDown`なしの`<div>`・`<span>`への`onClick`がない
- [ ] アイコンのみのbuttonに`aria-label`がある
- [ ] 装飾画像が`alt=""`と`aria-hidden="true"`を使っている
- [ ] modalが閉じるときにfocusを復元する（Tab/Shift+Tab循環を含む完全なfocus trapには`focus-trap-react`のようなライブラリを使う）
- [ ] 動的なコンテンツ更新が`aria-live`を使っている
- [ ] animationで`prefers-reduced-motion`を尊重している

## 関連skill

- `frontend-patterns` — 一般的なReact componentとstateのパターン
- `design-system` — design tokenとcomponentの一貫性
- `motion-ui` — accessibilityを考慮したanimationパターン
