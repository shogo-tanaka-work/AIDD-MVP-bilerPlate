# XSS対策とContent Security Policy

## HTMLのsanitize

```typescript
import DOMPurify from 'isomorphic-dompurify'

// ユーザー提供のHTMLは必ずsanitizeする
function renderUserContent(html: string) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p'],
    ALLOWED_ATTR: []
  })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```

## Content Security Policy

厳しい設定から始め、撤去計画を文書化した場合だけ緩める。
`'unsafe-inline'` や `'unsafe-eval'` を既定にしない。これらはCSPの保護の多くを
無効化するため、一時的な互換性の負債として扱う。

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      base-uri 'self';
      object-src 'none';
      frame-ancestors 'none';
      script-src 'self';
      style-src 'self';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://api.example.com;
    `.replace(/\s{2,}/g, ' ').trim()
  }
]
```

## 確認手順

- [ ] ユーザー提供のHTMLをsanitizeしている
- [ ] CSPヘッダを設定している
- [ ] 未検証の動的コンテンツを描画していない
- [ ] Reactの組み込みXSS保護を使っている
