---
name: django-verification
description: "Djangoプロジェクトの検証ループ: migration、lint、coverage付きtest、security scan、リリース・PR前のdeploy準備確認。"
metadata:
  origin: ECC
---

# Django検証ループ

Djangoアプリケーションの品質とセキュリティを担保するため、PR前・大きな変更後・deploy前に実行する。

## 発動タイミング

- DjangoプロジェクトのPRを作る前
- 大きなmodel変更、migration更新、依存関係のアップグレード後
- staging・productionへのdeploy前検証
- 環境 → lint → test → security → deploy準備の全パイプラインを実行するとき
- migrationの安全性とtest coverageを検証するとき

## Phase 1: 環境チェック

```bash
# Pythonバージョンを確認する
python --version  # プロジェクト要件と一致すること

# 仮想環境を確認する
which python
pip list --outdated

# 環境変数を確認する
python -c "import os; import environ; print('DJANGO_SECRET_KEY set' if os.environ.get('DJANGO_SECRET_KEY') else 'MISSING: DJANGO_SECRET_KEY')"
```

環境設定が不正なら、そこで止めて修正する。

## Phase 2: コード品質とフォーマット

```bash
# 型検査
mypy . --config-file pyproject.toml

# ruffによるlint
ruff check . --fix

# blackによるフォーマット
black . --check
black .  # 自動修正

# importの整列
isort . --check-only
isort .  # 自動修正

# Django固有のチェック
python manage.py check --deploy
```

よくある問題:
- 公開関数の型ヒント漏れ
- PEP 8のフォーマット違反
- 未整列のimport
- 本番設定に残ったdebug設定

## Phase 3: Migration

```bash
# 未適用migrationを確認する
python manage.py showmigrations

# 不足しているmigrationを作る
python manage.py makemigrations --check

# migration適用のdry-run
python manage.py migrate --plan

# migrationを適用する（test環境）
python manage.py migrate

# migration競合を確認する
python manage.py makemigrations --merge  # 競合がある場合のみ
```

報告項目:
- 未適用migrationの数
- migrationの競合
- migrationのないmodel変更

## Phase 4: Testとcoverage

```bash
# pytestで全testを実行する
pytest --cov=apps --cov-report=html --cov-report=term-missing --reuse-db

# 特定appのtestを実行する
pytest apps/users/tests/

# markerで絞って実行する
pytest -m "not slow"  # 遅いtestをスキップする
pytest -m integration  # integration testのみ

# coverageレポート
open htmlcov/index.html
```

報告項目:
- test総数: X passed、Y failed、Z skipped
- 全体coverage: XX%
- appごとのcoverage内訳

Coverage目標:

| Component | 目標 |
|-----------|--------|
| Models | 90%+ |
| Serializers | 85%+ |
| Views | 80%+ |
| Services | 90%+ |
| 全体 | 80%+ |

## Phase 5: Security scan

```bash
# 依存関係の脆弱性
pip-audit
safety check --full-report

# Djangoのsecurityチェック
python manage.py check --deploy

# Banditによるsecurity lint
bandit -r . -f json -o bandit-report.json

# secretのscan（gitleaks導入時）
gitleaks detect --source . --verbose

# 環境変数のチェック
python -c "from django.core.exceptions import ImproperlyConfigured; from django.conf import settings; settings.DEBUG"
```

報告項目:
- 脆弱性のある依存関係
- security設定の問題
- ハードコードされたsecretの検出
- DEBUGの状態（本番ではFalseであること）

## Phase 6: Django管理コマンド

```bash
# modelの問題を確認する
python manage.py check

# 静的ファイルを収集する
python manage.py collectstatic --noinput --clear

# superuserを作る（test用に必要な場合）
echo "from apps.users.models import User; User.objects.create_superuser('admin@example.com', 'admin')" | python manage.py shell

# DBの整合性
python manage.py check --database default

# cacheの確認（Redis利用時）
python -c "from django.core.cache import cache; cache.set('test', 'value', 10); print(cache.get('test'))"
```

## Phase 7: パフォーマンスチェック

```bash
# Django Debug Toolbarの出力（N+1 queryを確認する）
# DEBUG=Trueのdevモードで実行してページへアクセスする
# SQLパネルで重複queryを探す

# query数の分析
django-admin debugsqlshell  # django-debug-sqlshell導入時

# 不足しているindexを確認する
python manage.py shell << EOF
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("SELECT table_name, index_name FROM information_schema.statistics WHERE table_schema = 'public'")
    print(cursor.fetchall())
EOF
```

報告項目:
- ページあたりのquery数（通常のページで50未満であること）
- 不足しているDB index
- 検出された重複query

## Phase 8: 静的アセット

```bash
# npm依存関係の確認（npm利用時）
npm audit
npm audit fix

# 静的ファイルのbuild（webpack/vite利用時）
npm run build

# 静的ファイルの確認
ls -la staticfiles/
python manage.py findstatic css/style.css
```

## Phase 9: 設定レビュー

```python
# Python shellで設定を確認する
python manage.py shell << EOF
from django.conf import settings
import os

# 重要なチェック
checks = {
    'DEBUG is False': not settings.DEBUG,
    'SECRET_KEY set': bool(settings.SECRET_KEY and len(settings.SECRET_KEY) > 30),
    'ALLOWED_HOSTS set': len(settings.ALLOWED_HOSTS) > 0,
    'HTTPS enabled': getattr(settings, 'SECURE_SSL_REDIRECT', False),
    'HSTS enabled': getattr(settings, 'SECURE_HSTS_SECONDS', 0) > 0,
    'Database configured': settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3',
}

for check, result in checks.items():
    status = '✓' if result else '✗'
    print(f"{status} {check}")
EOF
```

## Phase 10: Logging設定

```bash
# ログ出力をtestする
python manage.py shell << EOF
import logging
logger = logging.getLogger('django')
logger.warning('Test warning message')
logger.error('Test error message')
EOF

# ログファイルを確認する（設定されている場合）
tail -f /var/log/django/django.log
```

## Phase 11: APIドキュメント（DRFの場合）

```bash
# schemaを生成する
python manage.py generateschema --format openapi-json > schema.json

# schemaを検証する
# schema.jsonが正しいJSONか確認する
python -c "import json; json.load(open('schema.json'))"

# Swagger UIへアクセスする（drf-yasg利用時）
# ブラウザで http://localhost:8000/swagger/ を開く
```

## Phase 12: 差分レビュー

```bash
# 差分の統計を表示する
git diff --stat

# 実際の変更を表示する
git diff

# 変更されたファイルを表示する
git diff --name-only

# よくある問題を確認する
git diff | grep -i "todo\|fixme\|hack\|xxx"
git diff | grep "print("  # debug文
git diff | grep "DEBUG = True"  # debugモード
git diff | grep "import pdb"  # debugger
```

チェックリスト:
- debug用の記述がない（print、pdb、breakpoint()）
- 重要なコードにTODO/FIXMEコメントがない
- ハードコードされたsecretやcredentialsがない
- model変更に対応するmigrationが含まれている
- 設定変更が文書化されている
- 外部呼び出しにエラー処理がある
- 必要な箇所でtransaction管理が行われている

## 出力テンプレート

```
DJANGO VERIFICATION REPORT
==========================

Phase 1: Environment Check
  ✓ Python 3.11.5
  ✓ Virtual environment active
  ✓ All environment variables set

Phase 2: Code Quality
  ✓ mypy: No type errors
  ✗ ruff: 3 issues found (auto-fixed)
  ✓ black: No formatting issues
  ✓ isort: Imports properly sorted
  ✓ manage.py check: No issues

Phase 3: Migrations
  ✓ No unapplied migrations
  ✓ No migration conflicts
  ✓ All models have migrations

Phase 4: Tests + Coverage
  Tests: 247 passed, 0 failed, 5 skipped
  Coverage:
    Overall: 87%
    users: 92%
    products: 89%
    orders: 85%
    payments: 91%

Phase 5: Security Scan
  ✗ pip-audit: 2 vulnerabilities found (fix required)
  ✓ safety check: No issues
  ✓ bandit: No security issues
  ✓ No secrets detected
  ✓ DEBUG = False

Phase 6: Django Commands
  ✓ collectstatic completed
  ✓ Database integrity OK
  ✓ Cache backend reachable

Phase 7: Performance
  ✓ No N+1 queries detected
  ✓ Database indexes configured
  ✓ Query count acceptable

Phase 8: Static Assets
  ✓ npm audit: No vulnerabilities
  ✓ Assets built successfully
  ✓ Static files collected

Phase 9: Configuration
  ✓ DEBUG = False
  ✓ SECRET_KEY configured
  ✓ ALLOWED_HOSTS set
  ✓ HTTPS enabled
  ✓ HSTS enabled
  ✓ Database configured

Phase 10: Logging
  ✓ Logging configured
  ✓ Log files writable

Phase 11: API Documentation
  ✓ Schema generated
  ✓ Swagger UI accessible

Phase 12: Diff Review
  Files changed: 12
  +450, -120 lines
  ✓ No debug statements
  ✓ No hardcoded secrets
  ✓ Migrations included

RECOMMENDATION: WARNING: Fix pip-audit vulnerabilities before deploying

NEXT STEPS:
1. Update vulnerable dependencies
2. Re-run security scan
3. Deploy to staging for final testing
```

## Deploy前チェックリスト

- [ ] 全testがpassしている
- [ ] Coverageが80%以上
- [ ] security脆弱性がない
- [ ] 未適用migrationがない
- [ ] 本番設定でDEBUG = Falseになっている
- [ ] SECRET_KEYが適切に設定されている
- [ ] ALLOWED_HOSTSが正しく設定されている
- [ ] DBのバックアップが有効
- [ ] 静的ファイルが収集・配信されている
- [ ] loggingが設定され機能している
- [ ] エラー監視（Sentry等）が設定されている
- [ ] CDNが設定されている（該当する場合）
- [ ] Redis/cache backendが設定されている
- [ ] Celery workerが稼働している（該当する場合）
- [ ] HTTPS/SSLが設定されている
- [ ] 環境変数が文書化されている

## 継続的インテグレーション

### GitHub Actionsの例

```yaml
# .github/workflows/django-verification.yml
name: Django Verification

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Cache pip
        uses: actions/cache@v3
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install ruff black mypy pytest pytest-django pytest-cov bandit safety pip-audit

      - name: Code quality checks
        run: |
          ruff check .
          black . --check
          isort . --check-only
          mypy .

      - name: Security scan
        run: |
          bandit -r . -f json -o bandit-report.json
          safety check --full-report
          pip-audit

      - name: Run tests
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
          DJANGO_SECRET_KEY: test-secret-key
        run: |
          pytest --cov=apps --cov-report=xml --cov-report=term-missing

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## クイックリファレンス

| チェック | コマンド |
|-------|---------|
| 環境 | `python --version` |
| 型検査 | `mypy .` |
| Lint | `ruff check .` |
| フォーマット | `black . --check` |
| Migration | `python manage.py makemigrations --check` |
| Test | `pytest --cov=apps` |
| Security | `pip-audit && bandit -r .` |
| Djangoチェック | `python manage.py check --deploy` |
| Collectstatic | `python manage.py collectstatic --noinput` |
| 差分統計 | `git diff --stat` |

覚えておくこと: 自動検証はよくある問題を捕捉するが、手動のコードレビューやstaging環境でのtestを置き換えるものではない。
