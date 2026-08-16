| name | description |
|------|-------------|
| cloud-infrastructure-security | クラウドプラットフォームへのdeploy、インフラ設定、IAM policyの管理、logging/monitoringの構築、CI/CD pipelineの実装を行うときにこのskillを使う。ベストプラクティスに沿ったクラウドセキュリティのチェックリストを提供する。 |

# Cloud & Infrastructure Security Skill

このskillは、クラウドインフラ、CI/CD pipeline、deploy設定がセキュリティのベストプラクティスと業界標準に従うようにする。

## 発動タイミング

- クラウドプラットフォーム（AWS、Vercel、Railway、Cloudflare）へアプリケーションをdeployするとき
- IAM roleと権限を設定するとき
- CI/CD pipelineを構築するとき
- infrastructure as code（Terraform、CloudFormation）を実装するとき
- loggingとmonitoringを設定するとき
- クラウド環境のsecretを管理するとき
- CDNとedgeのセキュリティを設定するとき
- 災害復旧とバックアップ戦略を実装するとき

## クラウドセキュリティチェックリスト

### 1. IAMとアクセス制御

#### 最小権限の原則

```yaml
# PASS: CORRECT: 最小限の権限
iam_role:
  permissions:
    - s3:GetObject  # 読み取りのみ
    - s3:ListBucket
  resources:
    - arn:aws:s3:::my-bucket/*  # 特定のbucketのみ

# FAIL: WRONG: 広すぎる権限
iam_role:
  permissions:
    - s3:*  # すべてのS3操作
  resources:
    - "*"  # すべてのresource
```

#### 多要素認証（MFA）

```bash
# root/adminアカウントでは必ずMFAを有効化する
aws iam enable-mfa-device \
  --user-name admin \
  --serial-number arn:aws:iam::123456789:mfa/admin \
  --authentication-code1 123456 \
  --authentication-code2 789012
```

#### 検証手順

- [ ] 本番でrootアカウントを使っていない
- [ ] 特権アカウントすべてでMFAが有効
- [ ] service accountは長命なcredentialsではなくroleを使う
- [ ] IAM policyが最小権限に従っている
- [ ] 定期的なアクセスレビューを実施している
- [ ] 未使用のcredentialsをローテーションまたは削除している

### 2. Secretsの管理

#### クラウドのSecrets Manager

```typescript
// PASS: CORRECT: クラウドのsecrets managerを使う
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManager({ region: 'us-east-1' });
const secret = await client.getSecretValue({ SecretId: 'prod/api-key' });
const apiKey = JSON.parse(secret.SecretString).key;

// FAIL: WRONG: ハードコード、または環境変数だけに置く
const apiKey = process.env.API_KEY; // ローテーションされず、監査もされない
```

#### Secretsのローテーション

```bash
# databaseのcredentialsに自動ローテーションを設定する
aws secretsmanager rotate-secret \
  --secret-id prod/db-password \
  --rotation-lambda-arn arn:aws:lambda:region:account:function:rotate \
  --rotation-rules AutomaticallyAfterDays=30
```

#### 検証手順

- [ ] すべてのsecretをクラウドのsecrets manager（AWS Secrets Manager、Vercel Secrets）に保存している
- [ ] databaseのcredentialsで自動ローテーションが有効
- [ ] API keyを少なくとも四半期ごとにローテーションしている
- [ ] コード、ログ、エラーメッセージにsecretがない
- [ ] secretアクセスの監査ログが有効

### 3. ネットワークセキュリティ

#### VPCとfirewallの設定

```terraform
# PASS: CORRECT: 制限されたsecurity group
resource "aws_security_group" "app" {
  name = "app-sg"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]  # 内部VPCのみ
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # 送信はHTTPSのみ
  }
}

# FAIL: WRONG: インターネットへ開放
resource "aws_security_group" "bad" {
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # 全port、全IP!
  }
}
```

#### 検証手順

- [ ] databaseが公開されていない
- [ ] SSH/RDP portをVPN/bastionのみに制限している
- [ ] security groupが最小権限に従っている
- [ ] Network ACLを設定している
- [ ] VPC flow logsが有効

### 4. LoggingとMonitoring

#### CloudWatch/loggingの設定

```typescript
// PASS: CORRECT: 網羅的なlogging
import { CloudWatchLogsClient, CreateLogStreamCommand } from '@aws-sdk/client-cloudwatch-logs';

const logSecurityEvent = async (event: SecurityEvent) => {
  await cloudwatch.putLogEvents({
    logGroupName: '/aws/security/events',
    logStreamName: 'authentication',
    logEvents: [{
      timestamp: Date.now(),
      message: JSON.stringify({
        type: event.type,
        userId: event.userId,
        ip: event.ip,
        result: event.result,
        // 機密dataは決してログに出さない
      })
    }]
  });
};
```

#### 検証手順

- [ ] すべてのserviceでCloudWatch/loggingが有効
- [ ] 認証失敗を記録している
- [ ] admin操作を監査している
- [ ] ログ保持期間を設定している（コンプライアンス上90日以上）
- [ ] 不審な挙動へのアラートを設定している
- [ ] ログを集約し改ざん不能にしている

### 5. CI/CD pipelineのセキュリティ

#### 安全なpipeline設定

```yaml
# PASS: CORRECT: 安全なGitHub Actions workflow
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read  # 最小限の権限

    steps:
      - uses: actions/checkout@v4

      # secretをscanする
      - name: Secret scanning
        uses: trufflesecurity/trufflehog@main

      # 依存関係の監査
      - name: Audit dependencies
        run: npm audit --audit-level=high

      # 長命なtokenではなくOIDCを使う
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
          aws-region: us-east-1
```

#### サプライチェーンのセキュリティ

```json
// package.json - lock fileとintegrity checkを使う
{
  "scripts": {
    "install": "npm ci",  // 再現可能なbuildのためciを使う
    "audit": "npm audit --audit-level=moderate",
    "check": "npm outdated"
  }
}
```

#### 検証手順

- [ ] 長命なcredentialsではなくOIDCを使っている
- [ ] pipelineでsecret scanningを行っている
- [ ] 依存関係の脆弱性scanを行っている
- [ ] container imageのscanを行っている（該当する場合）
- [ ] branch protection ruleを強制している
- [ ] merge前のコードレビューを必須にしている
- [ ] 署名付きcommitを必須にしている

### 6. CloudflareとCDNのセキュリティ

#### Cloudflareのセキュリティ設定

```typescript
// PASS: CORRECT: security headerを付けたCloudflare Workers
export default {
  async fetch(request: Request): Promise<Response> {
    const response = await fetch(request);

    // security headerを追加する
    const headers = new Headers(response.headers);
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'geolocation=(), microphone=()');

    return new Response(response.body, {
      status: response.status,
      headers
    });
  }
};
```

#### WAF rule

```bash
# CloudflareのWAF managed ruleを有効化する
# - OWASP Core Ruleset
# - Cloudflare Managed Ruleset
# - rate limitingのrule
# - bot protection
```

#### 検証手順

- [ ] OWASP ruleを使ったWAFが有効
- [ ] rate limitingを設定している
- [ ] bot protectionが有効
- [ ] DDoS protectionが有効
- [ ] security headerを設定している
- [ ] SSL/TLSのstrictモードが有効

### 7. バックアップと災害復旧

#### 自動バックアップ

```terraform
# PASS: CORRECT: RDSの自動バックアップ
resource "aws_db_instance" "main" {
  allocated_storage     = 20
  engine               = "postgres"

  backup_retention_period = 30  # 保持期間30日
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  deletion_protection = true  # 誤削除を防ぐ
}
```

#### 検証手順

- [ ] 日次の自動バックアップを設定している
- [ ] バックアップ保持期間がコンプライアンス要件を満たしている
- [ ] point-in-time recoveryが有効
- [ ] 四半期ごとにバックアップのtestを実施している
- [ ] 災害復旧計画を文書化している
- [ ] RPOとRTOを定義しtestしている

## Deploy前のクラウドセキュリティチェックリスト

本番クラウドへdeployする前に必ず確認する:

- [ ] **IAM**: rootアカウント不使用、MFA有効、最小権限のpolicy
- [ ] **Secrets**: すべてのsecretをローテーション付きでクラウドのsecrets managerに保存
- [ ] **Network**: security groupを制限、公開databaseなし
- [ ] **Logging**: 保持期間付きでCloudWatch/loggingが有効
- [ ] **Monitoring**: 異常へのアラートを設定
- [ ] **CI/CD**: OIDC認証、secret scanning、依存関係の監査
- [ ] **CDN/WAF**: OWASP rule付きのCloudflare WAFが有効
- [ ] **Encryption**: 保存時と転送時のdataを暗号化
- [ ] **Backups**: 復旧をtest済みの自動バックアップ
- [ ] **Compliance**: GDPR/HIPAA要件を満たす（該当する場合）
- [ ] **Documentation**: インフラを文書化し、runbookを作成
- [ ] **Incident Response**: セキュリティインシデント対応計画を整備

## よくあるクラウドの設定ミス

### S3 bucketの公開

```bash
# FAIL: WRONG: 公開bucket
aws s3api put-bucket-acl --bucket my-bucket --acl public-read

# PASS: CORRECT: アクセスを限定したprivate bucket
aws s3api put-bucket-acl --bucket my-bucket --acl private
aws s3api put-bucket-policy --bucket my-bucket --policy file://policy.json
```

### RDSの公開アクセス

```terraform
# FAIL: WRONG
resource "aws_db_instance" "bad" {
  publicly_accessible = true  # 絶対にやらない!
}

# PASS: CORRECT
resource "aws_db_instance" "good" {
  publicly_accessible = false
  vpc_security_group_ids = [aws_security_group.db.id]
}
```

## 参考資料

- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)
- [Cloudflare Security Documentation](https://developers.cloudflare.com/security/)
- [OWASP Cloud Security](https://owasp.org/www-project-cloud-security/)
- [Terraform Security Best Practices](https://www.terraform.io/docs/cloud/guides/recommended-practices/)

**覚えておくこと**: クラウドの設定ミスはデータ漏えいの最大の原因である。公開されたS3 bucket一つ、あるいは緩すぎるIAM policy一つで、インフラ全体が危険にさらされる。常に最小権限の原則と多層防御に従う。
