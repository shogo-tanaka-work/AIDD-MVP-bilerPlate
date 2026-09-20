# テスト規約とcode smell

## テストの構造（AAAパターン）

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

## テストの命名

```typescript
// PASS: GOOD: 説明的なテスト名
test('returns empty array when no markets match query', () => { })
test('throws error when OpenAI API key is missing', () => { })
test('falls back to substring search when Redis unavailable', () => { })

// FAIL: BAD: 曖昧なテスト名
test('works', () => { })
test('test search', () => { })
```

## code smellの検出

次のanti-patternに注意する。

### 1. 長い関数

```typescript
// FAIL: BAD: 50行を超える関数
function processMarketData() {
  // 100行のコード
}

// PASS: GOOD: 小さな関数へ分割する
function processMarketData() {
  const validated = validateData()
  const transformed = transformData(validated)
  return saveData(transformed)
}
```

### 2. 深いネスト

```typescript
// FAIL: BAD: 5段階以上のネスト
if (user) {
  if (user.isAdmin) {
    if (market) {
      if (market.isActive) {
        if (hasPermission) {
          // 何らかの処理
        }
      }
    }
  }
}

// PASS: GOOD: 早期return
if (!user) return
if (!user.isAdmin) return
if (!market) return
if (!market.isActive) return
if (!hasPermission) return

// 何らかの処理
```

### 3. マジックナンバー

```typescript
// FAIL: BAD: 説明のない数値
if (retryCount > 3) { }
setTimeout(callback, 500)

// PASS: GOOD: 名前付き定数
const MAX_RETRIES = 3
const DEBOUNCE_DELAY_MS = 500

if (retryCount > MAX_RETRIES) { }
setTimeout(callback, DEBOUNCE_DELAY_MS)
```
