---
name: react-native-patterns
description: React NativeとExpoのアプリパターン — Expo Routerによるnavigation、stateの分離（server/client/route/form）、TanStack QueryとZodによるdata fetching、高performanceなlist、NativeWind/StyleSheetによるstyling、native API、secure storage。React Native / Expoのscreen、component、navigation、data層を実装・編集するときに使う。
origin: ECC
---

# React Native / Expoパターン

Expoで本番品質のReact Nativeアプリを作るための実践的なパターン。navigation、state、data fetching、list、styling、native APIを扱う。`rules/react-native/`のrulesetと対になる。rulesが*何を*強制するかを示し、このskillが*どう*実現するかを示す。

以下で挙げるライブラリ（NativeWind、Zustand/Jotai、TanStack Query）は説明のために示した一般的で定着した選択肢であり、特定のパッケージよりパターン自体が重要で、同等のものなら何でもよい。validationにZodを使うのは、ECCの既存の`typescript/`ルールと揃えるためである。

これらのパターンは、New Architecture（近年のExpo SDKの既定であり、SDK 55以降は必須）上のmanaged Expo workflow（Expo Router、EAS、`expo-*` module）を前提とする。browserのDOMは前提としない。React Nativeには`<div>`もURLバーもwebのdata fetchingの既定もない。

## 発動タイミング

次のときにこのskillを使う。

- React Native / Expoのscreen、component、navigationを実装・編集するとき
- Expo Router（file-basedの`app/`ディレクトリ）でroutingを設定するとき
- stateの置き場所を判断するとき（server cacheかclient storeかroute paramsかform）
- TanStack Queryでdata fetchingを組み、Zodでresponseを検証するとき
- 長い、あるいは重いlistを描画するとき
- stylingの方式を選ぶ・適用するとき（NativeWindまたはStyleSheet）
- native device API（camera、location、通知）やsecure storageを使うとき
- モバイル固有の観点でRNコードをレビューするとき

ここではweb/React-DOMのパターンを使わない。URL-as-state、`<div>`、browser向けのSWRはReact Nativeに当てはまらない。

## 中核概念

### プロジェクト構成（Expo Router）

`app/`配下のfile-based routing。route fileは薄く保つ。paramsを読んで検証し、`components/`または`features/`にあるscreen componentへ委譲する。

```
app/
  _layout.tsx          # root stack
  (tabs)/
    _layout.tsx        # tab navigator
    index.tsx          # Home
  user/[id].tsx        # dynamic route
components/
features/
  user/UserProfile.tsx
```

### navigation: route paramsを検証する

deep linkとdynamic routeは信頼できない文字列を渡してくる。使う前にZodで検証する。

```tsx
// app/user/[id].tsx
import { useLocalSearchParams, router } from 'expo-router'
import { z } from 'zod'
import { UserProfile } from '@/features/user/UserProfile'

const Params = z.object({ id: z.string().uuid() })

export default function UserRoute() {
  const parsed = Params.safeParse(useLocalSearchParams())
  if (!parsed.success) {
    router.replace('/not-found')
    return null
  }
  return <UserProfile userId={parsed.data.id} />
}
```

### state: 関心を分けて保つ

serverのデータをclient storeへ複製しない。関心ごとに置き場所を分ける。

| 関心 | よくある選択肢 |
|---------|------|
| server state（リモートデータ） | server cacheライブラリ（TanStack Query、SWR） |
| client/UI state | 軽量store（Zustand、Jotai）またはContext |
| route/navigation state | Expo Routerのparams |
| form state | formライブラリ（React Hook Formなど）＋schema validation |
| 秘密情報 / token | `expo-secure-store` |
| 秘密でない永続化 | `AsyncStorage` / MMKV |

本当に共有が必要になるまではlocalの`useState`を優先する。

### data fetching: cacheライブラリ＋Zod

`useEffect`内でのfetchではなく、server cacheライブラリ（TanStack Query、SWR）を使う。境界で検証し、schemaから型を推論する。loading、error、emptyの各状態を明示的に扱う。（例はTanStack Queryを使う。）

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

const User = z.object({ id: z.string(), email: z.string().email() })
type User = z.infer<typeof User>

export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: async (): Promise<User> => User.parse(await api.getUser(id)),
  })
}

export function useUpdateEmail(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => api.updateEmail(id, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', id] }),
  })
}
```

### list: virtualizeする。ScrollView内で大きな配列をmapしない

```tsx
import { FlatList } from 'react-native'

<FlatList
  data={items}
  keyExtractor={(item) => item.id}
  renderItem={renderItem}          // memo化済み
  initialNumToRender={10}
  windowSize={5}
/>
```

大きなlistや要素が不揃いなlistには`FlashList`（Shopify）を使う。

### styling: 方式を一つに決める

`StyleSheet.create()`はframework標準の選択肢で、utility classライブラリ（NativeWindなど）が一般的な代替になる。どちらか一つを選び、一貫させる。hot pathのJSX内でstyle objectをinlineで作らない。

```tsx
// NativeWind
<View className="p-4 rounded-2xl bg-white">
  <Text className="text-base font-semibold">Hello</Text>
</View>

// StyleSheet
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 16, backgroundColor: '#fff' } })
<View style={styles.card}>...</View>
```

### native API: hookで包み、effectをcleanupする

Expo SDKの呼び出しとsubscriptionはJSXではなく`use*` hookの中に置く。必ずcleanupする。

```tsx
import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

type LocationState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'granted'; coords: Location.LocationObjectCoords }

export function useCurrentLocation() {
  // coordsだけでなくstatusも保持する。UIが「読み込み中」と
  // 「権限が拒否された」を区別し、行動可能なメッセージを出せるようにする。
  const [state, setState] = useState<LocationState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        if (active) setState({ status: 'denied' })
        return
      }
      const pos = await Location.getCurrentPositionAsync({})
      if (active) setState({ status: 'granted', coords: pos.coords })
    })()
    return () => { active = false }   // unmount後の古い結果を無視する
  }, [])

  return state
}
```

### tokenのsecure storage

```tsx
import * as SecureStore from 'expo-secure-store'

await SecureStore.setItemAsync('auth_token', token)   // Keychain / Keystore
const token = await SecureStore.getItemAsync('auth_token')
```

## コード例

### 画面全体: route → query → list → 状態

```tsx
// app/(tabs)/orders.tsx
import { memo, useCallback } from 'react'
import { FlatList, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

const OrderSchema = z.object({ id: z.string(), total: z.number(), status: z.string() })
const OrdersSchema = z.array(OrderSchema)
type Order = z.infer<typeof OrderSchema>

function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => OrdersSchema.parse(await api.listOrders()),
  })
}

// render間で参照を安定させるためmemo化する（listの指針を参照）。
const OrderRow = memo(function OrderRow({ item }: { item: Order }) {
  return (
    <View className="px-4 py-3 border-b border-neutral-200">
      <Text className="font-medium">#{item.id}</Text>
      <Text className="text-neutral-500">{item.status} · ${item.total}</Text>
    </View>
  )
})

export default function OrdersScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useOrders()
  const renderItem = useCallback(({ item }: { item: Order }) => <OrderRow item={item} />, [])

  if (isLoading) return <Centered><Text>Loading…</Text></Centered>
  if (isError) return <Centered><Text accessibilityRole="alert">Could not load orders.</Text></Centered>
  if (!data?.length) return <Centered><Text>No orders yet.</Text></Centered>

  return (
    <FlatList
      data={data}
      keyExtractor={(o) => o.id}
      onRefresh={refetch}
      refreshing={isRefetching}
      renderItem={renderItem}
    />
  )
}
```

### form: React Hook Form＋Zod resolver

```tsx
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextInput, Button, Text } from 'react-native'

const Schema = z.object({ email: z.string().email('Invalid email') })
type FormValues = z.infer<typeof Schema>

export function EmailForm({ onSubmit }: { onSubmit: (v: FormValues) => void }) {
  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { email: '' },
  })

  return (
    <>
      <Controller
        control={control}
        name="email"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextInput
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCapitalize="none"
            keyboardType="email-address"
            accessibilityLabel="Email address"
          />
        )}
      />
      {errors.email && <Text accessibilityRole="alert">{errors.email.message}</Text>}
      <Button title="Save" onPress={handleSubmit(onSubmit)} />
    </>
  )
}
```

## アンチパターン

```tsx
// WRONG: ScrollView内で大きな配列をmapする（virtualizationなし、カクつき、メモリ大）
<ScrollView>{items.map((i) => <Row key={i.id} item={i} />)}</ScrollView>
// RIGHT: FlatList / FlashList

// WRONG: serverデータをclient storeへ複製する（真実の源が二つ、データが古くなる）
const useStore = create((set) => ({ users: [], setUsers: (u) => set({ users: u }) }))
useEffect(() => { getUsers().then(setUsers) }, [])
// RIGHT: useQueryがserver stateを所有し、必要な値はそこから導出する

// WRONG: tokenをAsyncStorageへ置く（暗号化されない）
await AsyncStorage.setItem('auth_token', token)
// RIGHT: expo-secure-store

// WRONG: deep linkのparamsを信頼する
const { id } = useLocalSearchParams(); fetchUser(id)
// RIGHT: 使う前にZodで検証する

// WRONG: hot pathでrenderごとに再生成されるinline style object
<View style={{ padding: 16, backgroundColor: '#fff' }} />
// RIGHT: module scopeでStyleSheet.create、またはNativeWindのclassName

// WRONG: 本物の秘密値をbundleへ同梱する
const STRIPE_SECRET = 'sk_live_...'
// RIGHT: 特権的な呼び出しはserver側に置き、backendのルールで守られたpublic keyだけを配布する
```

## ベストプラクティス

- route fileは薄く保ち、ロジックはscreen componentと`use*` hookへ置く。
- 外部入力（APIのresponse、route params、push payload）はすべてZodで検証する。
- server stateはTanStack Queryに所有させ、client storeは小さく保つ。
- loading、error、emptyの各状態を必ず描画する。fallbackのないspinnerだけで済ませない。
- listをvirtualizeし、`renderItem`をmemo化し、安定した`keyExtractor`を渡す。
- animationには`react-native-reanimated`（UI thread）を使い、JS threadでの重い処理を避ける。
- tokenは`expo-secure-store`へ保存し、認可でclientを信頼しない。
- safe area、Dynamic Type、accessibilityのrole/labelを最初から守る。
- リリース前にすべてのnative依存についてNew Architecture互換性を確認する。

## 関連skill

- `vercel-react-best-practices`、`vercel-composition-patterns` — React/Next.js（web）のパターン。共通のReact概念には有用だが、DOM固有の内容を含む。
- `coding-standards` — RNコードにも当てはまるTypeScript/JavaScriptの書き方。
- `tdd-workflow`、`e2e-testing` — testのプロセス（RNではJest＋React Native Testing Library、Maestro/Detoxを使う）。
- `security-review` — 上記のRNのbundle/秘密情報に関する指針を補完する一般的なセキュリティチェックリスト。
