---
name: django-security
description: Djangoのセキュリティベストプラクティス、認証、認可、CSRF対策、SQL injection対策、XSS対策、安全なdeploy設定。Djangoの認証・認可・入力処理・deploy設定をレビューするときに使う。
metadata:
  origin: ECC
---

# Djangoセキュリティベストプラクティス

一般的な脆弱性からDjangoアプリケーションを守るための包括的なセキュリティガイドライン。

## 発動タイミング

- Djangoの認証・認可を設定するとき
- ユーザーの権限とroleを実装するとき
- 本番のセキュリティ設定を構成するとき
- Djangoアプリケーションのセキュリティ問題をレビューするとき
- Djangoアプリケーションを本番へdeployするとき

## 中核のセキュリティ設定

### 本番設定の構成

```python
# settings/production.py
import os

DEBUG = False  # 重要: 本番でTrueにしない

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',')

# セキュリティヘッダ
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000  # 1年
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

# HTTPSとCookie
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# secret key（環境変数で設定する）
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured('DJANGO_SECRET_KEY environment variable is required')

# パスワード検証
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 12,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]
```

## 認証

### カスタムUser model

```python
# apps/users/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    """セキュリティを高めるためのカスタムuser model。"""

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)

    USERNAME_FIELD = 'email'  # emailをusernameとして使う
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.email

# settings/base.py
AUTH_USER_MODEL = 'users.User'
```

### パスワードのhash化

```python
# Djangoは既定でPBKDF2を使う。より強固にするなら:
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
]
```

### session管理

```python
# session設定
SESSION_ENGINE = 'django.contrib.sessions.backends.cache'  # または'db'
SESSION_CACHE_ALIAS = 'default'
SESSION_COOKIE_AGE = 3600 * 24 * 7  # 1週間
SESSION_SAVE_EVERY_REQUEST = False
SESSION_EXPIRE_AT_BROWSER_CLOSE = False  # UXは良いが安全性は下がる
```

## 認可

### 権限

```python
# models.py
from django.db import models
from django.contrib.auth.models import Permission

class Post(models.Model):
    title = models.CharField(max_length=200)
    content = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        permissions = [
            ('can_publish', 'Can publish posts'),
            ('can_edit_others', 'Can edit posts of others'),
        ]

    def user_can_edit(self, user):
        """このpostをuserが編集できるか判定する。"""
        return self.author == user or user.has_perm('app.can_edit_others')

# views.py
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.views.generic import UpdateView

class PostUpdateView(LoginRequiredMixin, PermissionRequiredMixin, UpdateView):
    model = Post
    permission_required = 'app.can_edit_others'
    raise_exception = True  # redirectではなく403を返す

    def get_queryset(self):
        """自分のpostだけ編集を許可する。"""
        return Post.objects.filter(author=self.request.user)
```

### カスタム権限

```python
# permissions.py
from rest_framework import permissions

class IsOwnerOrReadOnly(permissions.BasePermission):
    """所有者だけにobjectの編集を許可する。"""

    def has_object_permission(self, request, view, obj):
        # 読み取り権限はどのrequestでも許可
        if request.method in permissions.SAFE_METHODS:
            return True

        # 書き込み権限は所有者のみ
        return obj.author == request.user

class IsAdminOrReadOnly(permissions.BasePermission):
    """adminには全操作を、他は読み取りのみを許可する。"""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff

class IsVerifiedUser(permissions.BasePermission):
    """検証済みuserだけを許可する。"""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_verified
```

### Role-Based Access Control (RBAC)

```python
# models.py
from django.contrib.auth.models import AbstractUser, Group

class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Administrator'),
        ('moderator', 'Moderator'),
        ('user', 'Regular User'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')

    def is_admin(self):
        return self.role == 'admin' or self.is_superuser

    def is_moderator(self):
        return self.role in ['admin', 'moderator']

# Mixin
class AdminRequiredMixin:
    """admin roleを要求するmixin。"""

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_admin():
            from django.core.exceptions import PermissionDenied
            raise PermissionDenied
        return super().dispatch(request, *args, **kwargs)
```

## SQL injection対策

### Django ORMによる保護

```python
# GOOD: Django ORMはparameterを自動でescapeする
def get_user(username):
    return User.objects.get(username=username)  # 安全

# GOOD: raw()ではparameterを使う
def search_users(query):
    return User.objects.raw('SELECT * FROM users WHERE username = %s', [query])

# BAD: ユーザー入力を直接埋め込まない
def get_user_bad(username):
    return User.objects.raw(f'SELECT * FROM users WHERE username = {username}')  # 脆弱!

# GOOD: filterは適切にescapeされる
def get_users_by_email(email):
    return User.objects.filter(email__iexact=email)  # 安全

# GOOD: 複雑なqueryにはQ objectを使う
from django.db.models import Q
def search_users_complex(query):
    return User.objects.filter(
        Q(username__icontains=query) |
        Q(email__icontains=query)
    )  # 安全
```

### raw()での追加の安全対策

```python
# raw SQLが必要な場合は必ずparameterを使う
User.objects.raw(
    'SELECT * FROM users WHERE email = %s AND status = %s',
    [user_input_email, status]
)
```

## XSS対策

### templateのescape

```django
{# Djangoは既定で変数を自動escapeする - 安全 #}
{{ user_input }}  {# escapeされたHTML #}

{# 信頼できる内容だけ明示的にsafeにする #}
{{ trusted_html|safe }}  {# escapeされない #}

{# 安全なHTMLのためのtemplate filter #}
{{ user_input|escape }}  {# 既定と同じ #}
{{ user_input|striptags }}  {# HTMLタグをすべて除去 #}

{# JavaScriptのescape #}
<script>
    var username = {{ username|escapejs }};
</script>
```

### 安全な文字列の扱い

```python
from django.utils.safestring import mark_safe
from django.utils.html import escape

# BAD: escapeせずにユーザー入力をsafe扱いしない
def render_bad(user_input):
    return mark_safe(user_input)  # 脆弱!

# GOOD: 先にescapeしてからsafeにする
def render_good(user_input):
    return mark_safe(escape(user_input))

# GOOD: 変数を含むHTMLにはformat_htmlを使う
from django.utils.html import format_html

def greet_user(username):
    return format_html('<span class="user">{}</span>', escape(username))
```

### HTTPヘッダ

```python
# settings.py
SECURE_CONTENT_TYPE_NOSNIFF = True  # MIME sniffingを防ぐ
SECURE_BROWSER_XSS_FILTER = True  # XSS filterを有効化
X_FRAME_OPTIONS = 'DENY'  # clickjackingを防ぐ

# カスタムmiddleware
from django.conf import settings

class SecurityHeaderMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Content-Security-Policy'] = "default-src 'self'"
        return response
```

## CSRF対策

### 既定のCSRF保護

```python
# settings.py - CSRFは既定で有効
CSRF_COOKIE_SECURE = True  # HTTPSでのみ送信
CSRF_COOKIE_HTTPONLY = True  # JavaScriptからのアクセスを防ぐ
CSRF_COOKIE_SAMESITE = 'Lax'  # 一部のCSRFを防ぐ
CSRF_TRUSTED_ORIGINS = ['https://example.com']  # 信頼するdomain

# templateでの利用
<form method="post">
    {% csrf_token %}
    {{ form.as_p }}
    <button type="submit">Submit</button>
</form>

# AJAX request
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

fetch('/api/endpoint/', {
    method: 'POST',
    headers: {
        'X-CSRFToken': getCookie('csrftoken'),
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
});
```

### viewの除外（慎重に使う）

```python
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt  # どうしても必要なときだけ使う!
def webhook_view(request):
    # 外部serviceからのwebhook
    pass
```

## ファイルアップロードのセキュリティ

### ファイルの検証

```python
import os
import magic  # pip install python-magic
from django.core.exceptions import ValidationError

ALLOWED_MIMES = {
    'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
}

MIME_TO_EXTENSIONS = {
    'image/jpeg': {'.jpg', '.jpeg'},
    'image/png': {'.png'},
    'image/gif': {'.gif'},
    'application/pdf': {'.pdf'},
}

def validate_file_type(value):
    """magic bytesでファイル種別を検証し、拡張子と突き合わせる。"""
    mime = magic.from_buffer(value.read(2048), mime=True)
    value.seek(0)

    if mime not in ALLOWED_MIMES:
        raise ValidationError('Unsupported file type.')

    ext = os.path.splitext(value.name)[1].lower()
    if ext not in MIME_TO_EXTENSIONS.get(mime, set()):
        raise ValidationError('File extension does not match file content.')

def validate_file_size(value):
    """ファイルサイズを検証する（最大5MB）。"""
    if value.size > 5 * 1024 * 1024:
        raise ValidationError('File too large. Max size is 5MB.')

# models.py
class Document(models.Model):
    file = models.FileField(
        upload_to='documents/',
        validators=[validate_file_type, validate_file_size]
    )

```

libmagicの導入が難しい環境（最小構成のcontainerなど）では、
pure-Pythonの`filetype`パッケージを代替に使う。

```python
import os
from django.core.exceptions import ValidationError

import filetype  # pip install filetype

ALLOWED_MIMES = {
    'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
}

MIME_TO_EXTENSIONS = {
    'image/jpeg': {'.jpg', '.jpeg'},
    'image/png': {'.png'},
    'image/gif': {'.gif'},
    'application/pdf': {'.pdf'},
}

def validate_file_type(value):
    """magic bytesでファイル種別を検証する。"""
    kind = filetype.guess(value.read(2048))
    value.seek(0)

    if kind is None or kind.mime not in ALLOWED_MIMES:
        raise ValidationError('Unsupported file type.')

    ext = os.path.splitext(value.name)[1].lower()
    if ext not in MIME_TO_EXTENSIONS.get(kind.mime, set()):
        raise ValidationError('File extension does not match file content.')
```

### 安全なファイル保存

```python
# settings.py
MEDIA_ROOT = '/var/www/media/'
MEDIA_URL = '/media/'

# 本番ではmedia用に別domainを使う
MEDIA_DOMAIN = 'https://media.example.com'

# ユーザーのアップロードを直接配信しない
# static fileにはwhitenoiseまたはCDNを使う
# media fileには別serverまたはS3を使う
```

## APIのセキュリティ

### rate limiting

```python
# settings.py
REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle'
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/day',
        'upload': '10/hour',
    }
}

# カスタムthrottle
from rest_framework.throttling import UserRateThrottle

class BurstRateThrottle(UserRateThrottle):
    scope = 'burst'
    rate = '60/min'

class SustainedRateThrottle(UserRateThrottle):
    scope = 'sustained'
    rate = '1000/day'
```

### APIの認証

```python
# settings.py
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

# views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def protected_view(request):
    return Response({'message': 'You are authenticated'})
```

## セキュリティヘッダ

### Content Security Policy

```python
# settings.py
CSP_DEFAULT_SRC = "'self'"
CSP_SCRIPT_SRC = "'self' https://cdn.example.com"
CSP_STYLE_SRC = "'self' 'unsafe-inline'"
CSP_IMG_SRC = "'self' data: https:"
CSP_CONNECT_SRC = "'self' https://api.example.com"

# Middleware
class CSPMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response['Content-Security-Policy'] = (
            f"default-src {CSP_DEFAULT_SRC}; "
            f"script-src {CSP_SCRIPT_SRC}; "
            f"style-src {CSP_STYLE_SRC}; "
            f"img-src {CSP_IMG_SRC}; "
            f"connect-src {CSP_CONNECT_SRC}"
        )
        return response
```

## 環境変数

### 秘密情報の管理

```python
# python-decoupleまたはdjango-environを使う
import environ

env = environ.Env(
    # 型変換と既定値を設定する
    DEBUG=(bool, False)
)

# .envファイルの読み込み
environ.Env.read_env()

SECRET_KEY = env('DJANGO_SECRET_KEY')
DATABASE_URL = env('DATABASE_URL')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')

# .envファイル（絶対にcommitしない）
DEBUG=False
SECRET_KEY=your-secret-key-here
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
ALLOWED_HOSTS=example.com,www.example.com
```

## セキュリティイベントのログ

```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'WARNING',
            'class': 'logging.FileHandler',
            'filename': '/var/log/django/security.log',
        },
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'django.security': {
            'handlers': ['file', 'console'],
            'level': 'WARNING',
            'propagate': True,
        },
        'django.request': {
            'handlers': ['file'],
            'level': 'ERROR',
            'propagate': False,
        },
    },
}
```

## セキュリティ簡易チェックリスト

| 項目 | 説明 |
|-------|-------------|
| `DEBUG = False` | 本番でDEBUGを有効にしない |
| HTTPSのみ | SSLを強制し、cookieをsecureにする |
| 強固な秘密情報 | SECRET_KEYは環境変数で渡す |
| パスワード検証 | すべてのvalidatorを有効にする |
| CSRF対策 | 既定で有効。無効化しない |
| XSS対策 | Djangoは自動escapeする。ユーザー入力に`&#124;safe`を使わない |
| SQL injection | ORMを使い、queryで文字列連結をしない |
| ファイルアップロード | 種別とサイズを検証する |
| rate limiting | API endpointをthrottleする |
| セキュリティヘッダ | CSP、X-Frame-Options、HSTS |
| ログ | セキュリティイベントを記録する |
| 更新 | Djangoと依存を最新に保つ |

留意点: セキュリティは製品ではなくプロセスである。定期的にセキュリティ運用を見直して更新する。
