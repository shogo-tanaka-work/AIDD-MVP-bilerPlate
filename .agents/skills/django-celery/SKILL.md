---
name: django-celery
description: Django + Celeryの非同期taskパターン — 設定、task設計、beatスケジューリング、retry、canvas workflow、監視、テスト。Djangoアプリへバックグラウンドジョブ、定期task、非同期処理を追加するときに使う。
metadata:
  origin: ECC
---

# Django + Celery Async Task Patterns

RedisまたはRabbitMQを使い、DjangoでCeleryによるバックグラウンドtask処理を本番品質で実装するためのパターン。

## 起動タイミング

- Djangoアプリへバックグラウンドジョブや非同期処理を追加するとき
- 定期実行・スケジュールtaskを実装するとき
- 遅い処理（メール送信、PDF生成、API呼び出し）をリクエストサイクルから切り離すとき
- cron的なスケジューリングのためにCelery Beatを構成するとき
- taskの失敗、retry、キューの滞留をデバッグするとき
- Celery taskのテストを書くとき

## プロジェクト構成

### インストール

```bash
pip install 'celery[redis]' django-celery-results django-celery-beat
```

### `celery.py` — アプリのエントリポイント

```python
# config/celery.py
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

app = Celery('myproject')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()  # 各INSTALLED_APPのtasks.pyを探索する

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
```

```python
# config/__init__.py
from .celery import app as celery_app

__all__ = ('celery_app',)
```

### Djangoの設定

```python
# config/settings/base.py

# Broker（本番ではRedisを推奨）
CELERY_BROKER_URL = env('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = env('CELERY_RESULT_BACKEND', default='django-db')

# シリアライズ
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'

# taskの挙動
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60        # ハード上限: 30分
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60   # ソフト上限: SoftTimeLimitExceededを送る
CELERY_WORKER_PREFETCH_MULTIPLIER = 1   # workerが長いtaskを抱え込むのを防ぐ
CELERY_TASK_ACKS_LATE = True            # workerがクラッシュしたら再キューする

# 結果の保持
CELERY_RESULT_EXPIRES = 60 * 60 * 24   # 結果を24時間保持する

# Beat scheduler（定期task用）
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# インストール済みアプリ
INSTALLED_APPS += [
    'django_celery_results',
    'django_celery_beat',
]
```

### workerの実行

```bash
# workerを起動する（開発）
celery -A config worker --loglevel=info

# beat schedulerを起動する（定期task）
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler

# worker + beatの同時起動（開発のみ。本番では使わない）
celery -A config worker --beat --loglevel=info

# 本番: 並行度を指定した複数worker
celery -A config worker --loglevel=warning --concurrency=4 -Q default,high_priority
```

## task設計パターン

### 基本のtask

```python
# apps/notifications/tasks.py
from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(name='notifications.send_welcome_email')
def send_welcome_email(user_id: int) -> None:
    """Send welcome email to newly registered user."""
    from apps.users.models import User
    from apps.notifications.services import EmailService

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning('send_welcome_email: user %s not found', user_id)
        return  # 冪等 — raiseしない。もはや完了不可能なtask

    EmailService.send_welcome(user)
    logger.info('Welcome email sent to user %s', user_id)
```

### retryするtask

```python
@shared_task(
    bind=True,
    name='integrations.sync_to_crm',
    max_retries=5,
    default_retry_delay=60,       # 初回retryまでの秒数
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,           # 指数バックオフ
    retry_backoff_max=600,        # 上限10分
    retry_jitter=True,            # thundering herdを避けるためランダム化する
)
def sync_contact_to_crm(self, contact_id: int) -> dict:
    """Sync contact to external CRM with retry on transient failures."""
    from apps.crm.services import CRMClient

    try:
        result = CRMClient().sync(contact_id)
        return result
    except CRMClient.RateLimitError as exc:
        # responseヘッダから固有のretry待ち時間を取る
        raise self.retry(exc=exc, countdown=int(exc.retry_after))
```

### 冪等なtaskのパターン

同じ入力で複数回実行しても安全になるようtaskを設計する:

```python
@shared_task(name='orders.mark_shipped')
def mark_order_shipped(order_id: int, tracking_number: str) -> None:
    """Mark order as shipped — safe to run multiple times."""
    from apps.orders.models import Order

    updated = Order.objects.filter(
        pk=order_id,
        status=Order.Status.PROCESSING,    # ガード: 未出荷のときだけ更新する
    ).update(
        status=Order.Status.SHIPPED,
        tracking_number=tracking_number,
    )

    if not updated:
        logger.info('mark_order_shipped: order %s already shipped or not found', order_id)
```

### ソフトタイムリミット付きのtask

```python
from celery.exceptions import SoftTimeLimitExceeded

@shared_task(
    bind=True,
    name='reports.generate_pdf',
    soft_time_limit=120,
    time_limit=150,
)
def generate_pdf_report(self, report_id: int) -> str:
    """Generate PDF report with graceful timeout handling."""
    from apps.reports.services import PDFGenerator

    try:
        path = PDFGenerator.build(report_id)
        return path
    except SoftTimeLimitExceeded:
        # 強制終了の前に中途半端なファイルを片付ける
        PDFGenerator.cleanup(report_id)
        raise
```

## taskの呼び出し

```python
from datetime import timedelta
from django.utils import timezone

# 投げっぱなし（非同期）
send_welcome_email.delay(user.pk)

# 将来の実行を予約する
send_reminder.apply_async(args=[user.pk], countdown=3600)  # 1時間後
send_reminder.apply_async(args=[user.pk], eta=timezone.now() + timedelta(days=1))

# キューを指定して実行する
sync_contact_to_crm.apply_async(args=[contact.pk], queue='high_priority')

# 同期実行（テスト・デバッグのみ）
result = generate_pdf_report.apply(args=[report.pk])
```

## Beatによるスケジューリング（定期task）

### コードで定義するスケジュール

```python
# config/settings/base.py
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'cleanup-expired-sessions': {
        'task': 'users.cleanup_expired_sessions',
        'schedule': crontab(hour=2, minute=0),   # 毎日午前2時
    },
    'sync-inventory': {
        'task': 'products.sync_inventory',
        'schedule': 60.0,                         # 60秒ごと
    },
    'weekly-digest': {
        'task': 'notifications.send_weekly_digest',
        'schedule': crontab(day_of_week='monday', hour=8, minute=0),
    },
}
```

### DBで定義するスケジュール（django-celery-beat経由）

```python
# Django adminまたはコードから定期taskを管理する
from django_celery_beat.models import PeriodicTask, CrontabSchedule
import json

schedule, _ = CrontabSchedule.objects.get_or_create(
    hour='*/6', minute='0',
    timezone='UTC',
)

PeriodicTask.objects.update_or_create(
    name='Sync inventory every 6 hours',
    defaults={
        'crontab': schedule,
        'task': 'products.sync_inventory',
        'args': json.dumps([]),
        'enabled': True,
    }
)
```

## Canvas: taskの連結とグループ化

```python
from celery import chain, group, chord

# Chain: 結果を渡しながらtaskを順に実行する
pipeline = chain(
    fetch_data.s(source_id),
    transform_data.s(),          # fetch_dataの結果を第1引数として受け取る
    load_to_warehouse.s(),
)
pipeline.delay()

# Group: taskを並列に実行する
parallel = group(
    send_welcome_email.s(user_id)
    for user_id in new_user_ids
)
parallel.delay()

# Chord: 並列taskの完了後にcallbackを実行する
result = chord(
    group(process_chunk.s(chunk) for chunk in data_chunks),
    aggregate_results.s(),       # 各chunkの結果のリストを受け取る
)
result.delay()
```

## エラー処理とdead letter queue

```python
# apps/core/tasks.py
from celery.signals import task_failure

@task_failure.connect
def on_task_failure(sender, task_id, exception, args, kwargs, traceback, einfo, **kw):
    """Log all task failures to Sentry / alerting."""
    import sentry_sdk
    with sentry_sdk.new_scope() as scope:
        scope.set_context('celery', {
            'task': sender.name,
            'task_id': task_id,
            'args': args,
            'kwargs': kwargs,
        })
        sentry_sdk.capture_exception(exception)
```

```python
# retry上限に達した失敗taskをdead-letter queueへ回す
@shared_task(
    bind=True,
    max_retries=3,
    name='payments.charge_card',
)
def charge_card(self, order_id: int) -> None:
    from apps.payments.models import Order, FailedCharge

    try:
        _do_charge(order_id)
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            # 手動確認のためdead-letterテーブルへ保存する
            FailedCharge.objects.create(
                order_id=order_id,
                error=str(exc),
                task_id=self.request.id,
            )
            return  # raiseしない — このtaskは恒久的な失敗
        raise self.retry(exc=exc)
```

## Celery taskのテスト

### unit test（brokerなし）

```python
# tests/test_tasks.py
import pytest
from unittest.mock import patch, MagicMock
from apps.notifications.tasks import send_welcome_email

class TestSendWelcomeEmail:

    @pytest.mark.django_db
    def test_sends_email_to_existing_user(self, user):
        with patch('apps.notifications.services.EmailService') as mock_email:
            send_welcome_email(user.pk)
            mock_email.send_welcome.assert_called_once_with(user)

    @pytest.mark.django_db
    def test_skips_missing_user_gracefully(self):
        """Should not raise when user is deleted between enqueue and execute."""
        send_welcome_email(99999)  # 存在しないuser — raiseしてはならない
```

### CELERY_TASK_ALWAYS_EAGERによるintegration test

```python
# config/settings/test.py
CELERY_TASK_ALWAYS_EAGER = True      # テストではtaskを同期実行する
CELERY_TASK_EAGER_PROPAGATES = True  # taskの例外を再throwする

# tests/test_integration.py
@pytest.mark.django_db
def test_registration_triggers_welcome_email(client):
    with patch('apps.notifications.services.EmailService') as mock_email:
        response = client.post('/api/users/', {
            'email': 'new@example.com',
            'password': 'strongpass123',
        })

    assert response.status_code == 201
    mock_email.send_welcome.assert_called_once()
```

### retryのテスト

```python
@pytest.mark.django_db
def test_task_retries_on_connection_error():
    with patch('apps.crm.services.CRMClient.sync') as mock_sync:
        mock_sync.side_effect = ConnectionError('timeout')

        with pytest.raises(ConnectionError):
            sync_contact_to_crm.apply(args=[1], throw=True)

        assert mock_sync.call_count == 1  # eager時は初回のみ
```

## 監視

```bash
# 稼働中のworkerとキューを調べる
celery -A config inspect active
celery -A config inspect stats
celery -A config inspect reserved

# キューの長さを確認する（Redis）
redis-cli llen celery

# Flower: Webベースのリアルタイム監視
pip install flower
celery -A config flower --port=5555
```

## アンチパターン

```python
# BAD: modelインスタンスを渡す — 実行時には古くなっている可能性がある
send_welcome_email.delay(user)        # ORMオブジェクトは渡さない
send_welcome_email.delay(user.pk)     # 常にPKを渡す

# BAD: 本番のviewでtaskを同期実行する
result = generate_report.apply()      # リクエストスレッドをブロックする

# BAD: ガードのない非冪等なtask
@shared_task
def charge_and_fulfill(order_id):
    order.charge()     # retryすると二重課金になりうる
    order.fulfill()

# GOOD: statusガード付きで冪等にする
@shared_task
def charge_and_fulfill(order_id):
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status != Order.Status.PENDING:
        return  # 処理済み
    order.charge()
    order.fulfill()
```

## 本番チェックリスト

| 確認項目 | 設定 |
|-------|---------|
| クラッシュ時のworker再起動 | `supervisord`または`systemd` unit |
| `CELERY_TASK_ACKS_LATE = True` | workerクラッシュ時にtaskを再キューする |
| `CELERY_WORKER_PREFETCH_MULTIPLIER = 1` | 長いtaskを公平に分配する |
| 優先度ごとのキュー分離 | `-Q default,high_priority,low_priority` |
| `CELERY_TASK_SOFT_TIME_LIMIT`の設定 | 強制終了前の穏当なタイムアウト |
| Sentry連携 | すべての`task_failure` signalを捕捉する |
| Flowerなどの監視 | キューの滞留を可視化する |
| Beatは単一ノードでのみ実行 | 定期taskの二重実行を防ぐ |

## 関連skill

- `django-patterns` — ORM、service層、プロジェクト構成
- `django-tdd` — Djangoのmodel、view、serviceのテスト
- `python-testing` — pytestの設定とfixture
