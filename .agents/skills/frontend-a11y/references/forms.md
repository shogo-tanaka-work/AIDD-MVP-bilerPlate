# formのaccessibility

`htmlFor` / `id`の対応漏れと、紐付いていないエラーメッセージがcode reviewで最も多い指摘。

## labelの紐付け

```tsx
// BAD: labelがinputと紐付いておらず、screen readerが関連付けられない
<label>Email</label>
<input type="email" />

// GOOD: htmlForがinputのidと一致している
<label htmlFor="email">Email</label>
<input id="email" type="email" />
```

## 必須フィールド

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

## エラーメッセージ

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

## accessibleなformの完成例

自前でvalidationするため`noValidate`を付け、`autoComplete`でbrowserの入力補助を有効にしている。エラーがないときは`aria-describedby`を`undefined`にして、存在しないidを参照させない。

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
