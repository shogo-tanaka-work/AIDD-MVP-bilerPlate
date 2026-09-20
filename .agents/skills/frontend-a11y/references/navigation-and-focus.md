# keyboard navigation・focus管理・モーション

すべてのinteractive要素はkeyboardだけで到達・操作できなければならない。UIのstateが変わったときfocusは論理的に移動しなければならない。とくにmodalとroute遷移で重要。

## custom dropdown

ArrowUp / ArrowDownで候補を移動し、Enter / Spaceで確定、Escapeで閉じる。listbox内のidは`useId`で生成し、`aria-controls`から参照する。

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

## modalのfocus復元

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
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
      onKeyDown={({ key }) => key === 'Escape' && onClose()}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
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
