# ブロックチェーンのセキュリティ（Solana）

## walletの検証

```typescript
import { verify } from '@solana/web3.js'

async function verifyWalletOwnership(
  publicKey: string,
  signature: string,
  message: string
) {
  try {
    const isValid = verify(
      Buffer.from(message),
      Buffer.from(signature, 'base64'),
      Buffer.from(publicKey, 'base64')
    )
    return isValid
  } catch (error) {
    return false
  }
}
```

## transactionの検証

```typescript
async function verifyTransaction(transaction: Transaction) {
  // 受取先を検証する
  if (transaction.to !== expectedRecipient) {
    throw new Error('Invalid recipient')
  }

  // 金額を検証する
  if (transaction.amount > maxAmount) {
    throw new Error('Amount exceeds limit')
  }

  // 残高が十分か検証する
  const balance = await getBalance(transaction.from)
  if (balance < transaction.amount) {
    throw new Error('Insufficient balance')
  }

  return true
}
```

## 確認手順

- [ ] walletの署名を検証している
- [ ] transactionの内容を検証している
- [ ] transaction前に残高を確認している
- [ ] 内容を確認しないtransaction署名がない
