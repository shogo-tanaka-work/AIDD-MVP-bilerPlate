---
name: production-audit
description: リリース済みappの本番準備監査、launch前レビュー、merge後チェック、「本番で何が壊れるか」という問いに、リポジトリのデータを外部の監査サービスへ送らずローカルの根拠だけで答える。launch前・merge後の本番準備を監査するとき、本番で何が壊れるかを問われたときに使う。
metadata:
  origin: community
---

# 本番監査

アプリケーションがリリース可能か、本番で何が壊れうるか、launch前に何を直すべきかをユーザーが尋ねたときにこのskillを使う。これは陳腐化したcommunity版production-auditのmaintainer-safeな書き直しであり、本番準備という有用な観点を残しつつ、pin留めされていない外部実行と第三者へのデータ共有を取り除いている。

## 使う場面

- ユーザーが「本番準備できているか」「本番で何が壊れるか」「見落としは何か」「このリポジトリを監査して」「リリースして良いか」と尋ねたとき。
- 機能がmergeされ、deploy前またはmerge後のリスク確認が必要なとき。
- 公開launch、demo、顧客展開、投資家向けデモが近いとき。
- CIはgreenだが、ユーザーがtest状況ではなく本番リスクを知りたいとき。
- deploy済みURL、releaseブランチ、PR、現在のcheckoutが根拠収集に使えるとき。

## 使わない場面

- 実装中で、line単位のsecure codingの観点が適切なとき。まず`security-review`を使う。
- 純粋なlibrary、template、docsのみのリポジトリ、scaffoldの場合。ただしユーザーがapplicationの準備状況ではなくpackaging/releaseの準備状況を求める場合を除く。
- ユーザーが正式なcompliance監査を求めているとき。このskillはエンジニアリングのトリアージであり、法務・財務・医療・規制の認証ではない。
- 唯一の根拠がプロダクトのアイデアだけで、リポジトリ・deploy・CI・実行環境が存在しないとき。

## 進め方

監査はローカルの根拠とユーザーが許可した根拠から組み立てる。pin留めされていないリモートコードを実行したり、リポジトリの内容を第三者サービスへアップロードしたり、外部scannerを呼び出したりしない。ただしユーザーがそのツールとデータフローを明示的に承認した場合を除く。

次の順序で進める。

1. releaseの対象範囲を確定する。
2. 直近の変更と現在のブランチ状態を読む。
3. リポジトリに実際に存在するruntime、auth、data、payment、background job、AI、deployの境界を調べる。
4. CI、test、migration、環境変数のドキュメント、rollback経路を確認する。
5. 具体的な修正を伴うship/blockの推奨を短くまとめる。

## 根拠チェックリスト

安価なローカルシグナルから始める。

```text
git status --short --branch
git log --oneline --decorate -20
git diff --stat origin/main...HEAD
```

次にプロジェクト固有の領域を調べる。

- package script、CI workflow、releaseスクリプト、Dockerファイル、deploy manifest。
- API route、webhook、auth middleware、background worker、cron job、database migration。
- 環境変数のドキュメントと起動時チェック。
- observability hook、error reporting、log、health check、dashboard。
- rollback、seed、migration、backfillの手順。
- 最も重要なユーザー導線のE2E coverage。

deploy済みURLが対象範囲に含まれる場合、browserまたはHTTPによる確認はそのURLに限定し、ユーザーが安全なテストアカウントを提供しない限り認証を伴う操作は避ける。

## リスクの観点

### セキュリティと認証

- 公開route、API route、admin routeが明確に分離されているか。
- 認証と認可がserver-sideで強制されているか。
- 秘密情報がclient bundle、log、サンプル出力、commit済みファイルに入っていないか。
- 必要な箇所にrate limit、CSRF対策、CORSポリシー、uploadの検証があるか。
- AIやagentの領域が、prompt injection、tool悪用、信頼できないコンテンツが特権的な操作へ流れ込むことを防いでいるか。

### データ整合性

- migrationが前方向にクリーンに実行でき、rollbackまたは復旧計画があるか。
- 破壊的なmigration、backfill、データ取り込みが安全に段階化されているか。
- databaseのポリシー、grant、service-roleの境界がappのtenancyモデルと一致しているか。
- 書き込み、job、webhookハンドラのretryが冪等か。

### 決済とwebhook

- 信頼するpayloadのフィールドをparseする前にwebhook署名を検証しているか。
- 決済、subscription、fulfillmentの各webhookが冪等か。
- replay、重複配信、順序逆転の配信を処理しているか。
- test modeとlive modeのcredentialsが分離されているか。

### 運用

- クリーンなcheckoutから、ドキュメント化されたコマンドでappを起動できるか。
- 必要な環境変数が明示・検証され、不足時にfail-fastするか。
- 依存先へ到達可能なことを示すhealth checkがあるか。
- deploy、rollback、インシデント責任者の経路がドキュメント化されているか。
- logが秘密情報や個人情報を漏らさずに有用か。

### ユーザー体験

- launchに不可欠な導線がdesktopとmobileの両方で確認済みか。
- formがmobileで入力ズーム、レイアウト重なり、送信不能状態なしに使えるか。
- loading、empty、error、権限拒否の状態が何が起きたかをユーザーに伝えるか。
- 重要な操作が失敗したときのサポートまたは復旧経路があるか。

## スコアリング

スコアは優先順位付けを強制するために使い、数学的な確実性を示すものではない。

| 帯 | スコア | 意味 |
| --- | --- | --- |
| Blocked | 0-49 | 上位リスクを直すまでリリースしない |
| Risky | 50-69 | 小規模展開または社内betaに限ってリリースする |
| Launchable With Caveats | 70-84 | 責任者が列挙されたリスクを受け入れるならリリースする |
| Strong | 85-100 | 得られた根拠の範囲で明らかなlaunch blockerは無い |

次のいずれかに該当する場合、スコアは`69`で頭打ちにする。

- 機微なデータに対する認証または認可が欠けている。
- 決済またはfulfillmentのwebhookが冪等でない。
- 必要なmigrationを安全に実行できない。
- 秘密情報がclient bundle、log、commit済みファイルに露出している。
- 影響の大きいreleaseにrollback経路が無い。

CIがgreenでない場合、またはlaunchに不可欠な導線がend to endでtestされていない場合、スコアは`84`で頭打ちにする。

## 出力形式

まず一文で示す。

```text
Production audit: 76/100, launchable with caveats, with webhook idempotency and rollback docs as the two risks to fix before public launch.
```

続いて次を列挙する。

- `Blockers`: deploy前に必ず直す項目。
- `High-value fixes`: スコアを上げたい場合の次の修正。
- `Evidence checked`: 確認したファイル、コマンド、CI、deploy済みURL、PR。
- `Evidence missing`: 提供されれば確度が変わるもの。
- `Next action`: 具体的な修正または検証ステップを一つ。

強みの記述は短くする。ユーザーが求めたのは準備状況なので、有用な答えは残存リスクと次の一手である。

## 例

ユーザー:

```text
is this ready to ship?
```

応答:

```text
Production audit: 68/100, risky, because Stripe webhooks are verified but not idempotent and there is no rollback note for the pending migration.

Blockers:
- Add idempotency for `checkout.session.completed` before fulfilling orders.
- Write and test the rollback path for `20260511_add_billing_state.sql`.

High-value fixes:
- Add a health check that verifies database and payment-provider reachability.
- Add one E2E path for upgrade, webhook fulfillment, and billing-page refresh.

Evidence checked:
- `api/stripe/webhook.ts`
- `db/migrations/20260511_add_billing_state.sql`
- GitHub Actions run for the release branch

Next action: Want me to patch webhook idempotency first?
```

## アンチパターン

- 既定の監査手段として`npx <package>@latest`やリモートscannerを実行する。
- 明示的な承認なしに、ソース、秘密情報、顧客データ、非公開の構成を外部の監査サービスへアップロードする。
- 確認した根拠を示さずにスコアだけを出す。
- CIがgreenであることを本番準備完了とみなす。
- 「どうしたいか教えてください」という一般的な締め方で終える。

## 関連

- Skill: `security-review`
- Skill: `deployment-patterns`
- Skill: `e2e-testing`
- Skill: `tdd-workflow`
- Skill: `verification-loop`
