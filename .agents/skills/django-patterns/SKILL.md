---
name: django-patterns
description: Djangoのアーキテクチャパターン、DRFによるREST API設計、ORMのベストプラクティス、caching、signal、middleware、本番品質のDjangoアプリ。Djangoアプリ、DRFのAPI、ORM query、cachingを実装・レビューするときに使う。
metadata:
  origin: ECC
---

# Django開発パターン

スケールしやすく保守しやすいアプリケーションのための、本番品質のDjangoアーキテクチャパターン。

## 発動タイミング

- Django webアプリケーションを構築するとき
- Django REST FrameworkのAPIを設計するとき
- Django ORMやmodelを扱うとき
- Djangoプロジェクトの構成を整えるとき
- caching、signal、middlewareを実装するとき

## プロジェクト構成

### 推奨レイアウト

```
myproject/
├── config/
│   ├── __init__.py
│   ├── settings/
│   │   ├── __init__.py
│   │   ├── base.py          # 基本設定
│   │   ├── development.py   # 開発設定
│   │   ├── production.py    # 本番設定
│   │   └── test.py          # テスト設定
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── manage.py
└── apps/
    ├── __init__.py
    ├── users/
    │   ├── __init__.py
    │   ├── models.py
    │   ├── views.py
    │   ├── serializers.py
    │   ├── urls.py
    │   ├── permissions.py
    │   ├── filters.py
    │   ├── services.py
    │   └── tests/
    └── products/
        └── ...
```

### 設定分割パターン

```python
# config/settings/base.py
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = env('DJANGO_SECRET_KEY')
DEBUG = False
ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    # ローカルapp
    'apps.users',
    'apps.products',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),
        'PORT': env('DB_PORT', default='5432'),
    }
}

# config/settings/development.py
from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

DATABASES['default']['NAME'] = 'myproject_dev'

INSTALLED_APPS += ['debug_toolbar']

MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# config/settings/production.py
from .base import *

DEBUG = False
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# ログ
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'WARNING',
            'class': 'logging.FileHandler',
            'filename': '/var/log/django/django.log',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'WARNING',
            'propagate': True,
        },
    },
}
```

## Model設計パターン

### Modelのベストプラクティス

```python
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator

class User(AbstractUser):
    """AbstractUserを拡張したカスタムuser model。"""
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    birth_date = models.DateField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'
        verbose_name = 'user'
        verbose_name_plural = 'users'
        ordering = ['-date_joined']

    def __str__(self):
        return self.email

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

class Product(models.Model):
    """適切なfield設定を持つproduct model。"""
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True, max_length=250)
    description = models.TextField(blank=True)
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    stock = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        related_name='products'
    )
    tags = models.ManyToManyField('Tag', blank=True, related_name='products')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['category', 'is_active']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(price__gte=0),
                name='price_non_negative'
            )
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)
```

### QuerySetのベストプラクティス

```python
from django.db import models

class ProductQuerySet(models.QuerySet):
    """Product model向けのカスタムQuerySet。"""

    def active(self):
        """有効なproductだけを返す。"""
        return self.filter(is_active=True)

    def with_category(self):
        """N+1 queryを避けるためcategoryをselect relatedする。"""
        return self.select_related('category')

    def with_tags(self):
        """many-to-many関係のtagをprefetchする。"""
        return self.prefetch_related('tags')

    def in_stock(self):
        """在庫が0より多いproductを返す。"""
        return self.filter(stock__gt=0)

    def search(self, query):
        """名前または説明でproductを検索する。"""
        return self.filter(
            models.Q(name__icontains=query) |
            models.Q(description__icontains=query)
        )

class Product(models.Model):
    # ... fields ...

    objects = ProductQuerySet.as_manager()  # カスタムQuerySetを使う

# 使い方
Product.objects.active().with_category().in_stock()
```

### Managerのメソッド

```python
class ProductManager(models.Manager):
    """複雑なquery向けのカスタムmanager。"""

    def get_or_none(self, **kwargs):
        """DoesNotExistではなくオブジェクトかNoneを返す。"""
        try:
            return self.get(**kwargs)
        except self.model.DoesNotExist:
            return None

    def create_with_tags(self, name, price, tag_names):
        """関連tag付きでproductを作成する。"""
        product = self.create(name=name, price=price)
        tags = [Tag.objects.get_or_create(name=name)[0] for name in tag_names]
        product.tags.set(tags)
        return product

    def bulk_update_stock(self, product_ids, quantity):
        """複数productの在庫を一括更新する。"""
        return self.filter(id__in=product_ids).update(stock=quantity)

# model内
class Product(models.Model):
    # ... fields ...
    custom = ProductManager()
```

## Django REST Frameworkのパターン

### Serializerのパターン

```python
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import Product, User

class ProductSerializer(serializers.ModelSerializer):
    """Product model向けのserializer。"""

    category_name = serializers.CharField(source='category.name', read_only=True)
    average_rating = serializers.FloatField(read_only=True)
    discount_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'description', 'price',
            'discount_price', 'stock', 'category_name',
            'average_rating', 'created_at'
        ]
        read_only_fields = ['id', 'slug', 'created_at']

    def get_discount_price(self, obj):
        """該当する場合は割引価格を計算する。"""
        if hasattr(obj, 'discount') and obj.discount:
            return obj.price * (1 - obj.discount.percent / 100)
        return obj.price

    def validate_price(self, value):
        """価格が非負であることを保証する。"""
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

class ProductCreateSerializer(serializers.ModelSerializer):
    """product作成用のserializer。"""

    class Meta:
        model = Product
        fields = ['name', 'description', 'price', 'stock', 'category']

    def validate(self, data):
        """複数fieldにまたがるカスタム検証。"""
        if data['price'] > 10000 and data['stock'] > 100:
            raise serializers.ValidationError(
                "Cannot have high-value products with large stock."
            )
        return data

class UserRegistrationSerializer(serializers.ModelSerializer):
    """ユーザー登録用のserializer。"""

    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(write_only=True, style={'input_type': 'password'})

    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'password_confirm']

    def validate(self, data):
        """パスワードが一致することを検証する。"""
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({
                "password_confirm": "Password fields didn't match."
            })
        return data

    def create(self, validated_data):
        """ハッシュ化したパスワードでユーザーを作成する。"""
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        return user
```

### ViewSetのパターン

```python
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from .models import Product
from .serializers import ProductSerializer, ProductCreateSerializer
from .permissions import IsOwnerOrReadOnly
from .filters import ProductFilter
from .services import ProductService

class ProductViewSet(viewsets.ModelViewSet):
    """Product model向けのViewSet。"""

    queryset = Product.objects.select_related('category').prefetch_related('tags')
    permission_classes = [IsAuthenticated, IsOwnerOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProductFilter
    search_fields = ['name', 'description']
    ordering_fields = ['price', 'created_at', 'name']
    ordering = ['-created_at']

    def get_serializer_class(self):
        """actionに応じて適切なserializerを返す。"""
        if self.action == 'create':
            return ProductCreateSerializer
        return ProductSerializer

    def perform_create(self, serializer):
        """ユーザー情報を付けて保存する。"""
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def featured(self, request):
        """注目productを返す。"""
        featured = self.queryset.filter(is_featured=True)[:10]
        serializer = self.get_serializer(featured, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def purchase(self, request, pk=None):
        """productを購入する。"""
        product = self.get_object()
        service = ProductService()
        result = service.purchase(product, request.user)
        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_products(self, request):
        """現在のユーザーが作成したproductを返す。"""
        products = self.queryset.filter(created_by=request.user)
        page = self.paginate_queryset(products)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)
```

### カスタムAction

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_to_cart(request):
    """productをユーザーのcartへ追加する。"""
    product_id = request.data.get('product_id')
    quantity = request.data.get('quantity', 1)

    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return Response(
            {'error': 'Product not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    cart, _ = Cart.objects.get_or_create(user=request.user)
    CartItem.objects.create(
        cart=cart,
        product=product,
        quantity=quantity
    )

    return Response({'message': 'Added to cart'}, status=status.HTTP_201_CREATED)
```

## Service層パターン

```python
# apps/orders/services.py
from typing import Optional
from django.db import transaction
from .models import Order, OrderItem

class OrderService:
    """order関連の業務ロジックを担うservice層。"""

    @staticmethod
    @transaction.atomic
    def create_order(user, cart: Cart) -> Order:
        """cartからorderを作成する。"""
        order = Order.objects.create(
            user=user,
            total_price=cart.total_price
        )

        for item in cart.items.all():
            OrderItem.objects.create(
                order=order,
                product=item.product,
                quantity=item.quantity,
                price=item.product.price
            )

        # cartを空にする
        cart.items.all().delete()

        return order

    @staticmethod
    def process_payment(order: Order, payment_data: dict) -> bool:
        """orderの決済を処理する。"""
        # 決済gatewayとの連携
        payment = PaymentGateway.charge(
            amount=order.total_price,
            token=payment_data['token']
        )

        if payment.success:
            order.status = Order.Status.PAID
            order.save()
            # 確認メールを送る
            OrderService.send_confirmation_email(order)
            return True

        return False

    @staticmethod
    def send_confirmation_email(order: Order):
        """order確認メールを送る。"""
        # メール送信の処理
        pass
```

## Caching戦略

### Viewレベルのcaching

```python
from django.views.decorators.cache import cache_page
from django.utils.decorators import method_decorator

@method_decorator(cache_page(60 * 15), name='dispatch')  # 15分
class ProductListView(generic.ListView):
    model = Product
    template_name = 'products/list.html'
    context_object_name = 'products'
```

### Template fragmentのcaching

```django
{% load cache %}
{% cache 500 sidebar %}
    ... expensive sidebar content ...
{% endcache %}
```

### 低レベルのcaching

```python
from django.core.cache import cache

def get_featured_products():
    """cacheを使って注目productを取得する。"""
    cache_key = 'featured_products'
    products = cache.get(cache_key)

    if products is None:
        products = list(Product.objects.filter(is_featured=True))
        cache.set(cache_key, products, timeout=60 * 15)  # 15分

    return products
```

### QuerySetのcaching

```python
from django.core.cache import cache

def get_popular_categories():
    cache_key = 'popular_categories'
    categories = cache.get(cache_key)

    if categories is None:
        categories = list(Category.objects.annotate(
            product_count=Count('products')
        ).filter(product_count__gt=10).order_by('-product_count')[:20])
        cache.set(cache_key, categories, timeout=60 * 60)  # 1時間

    return categories
```

## Signal

### Signalのパターン

```python
# apps/users/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import Profile

User = get_user_model()

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """ユーザー作成時にprofileを作成する。"""
    if created:
        Profile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """ユーザー保存時にprofileを保存する。"""
    instance.profile.save()

# apps/users/apps.py
from django.apps import AppConfig

class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.users'

    def ready(self):
        """appの準備完了時にsignalをimportする。"""
        import apps.users.signals
```

## Middleware

### カスタムMiddleware

```python
# middleware/active_user_middleware.py
import time
from django.utils.deprecation import MiddlewareMixin

class ActiveUserMiddleware(MiddlewareMixin):
    """アクティブなユーザーを追跡するmiddleware。"""

    def process_request(self, request):
        """受信requestを処理する。"""
        if request.user.is_authenticated:
            # 最終アクティブ時刻を更新する
            request.user.last_active = timezone.now()
            request.user.save(update_fields=['last_active'])

class RequestLoggingMiddleware(MiddlewareMixin):
    """requestをログ出力するmiddleware。"""

    def process_request(self, request):
        """request開始時刻を記録する。"""
        request.start_time = time.time()

    def process_response(self, request, response):
        """requestの所要時間をログ出力する。"""
        if hasattr(request, 'start_time'):
            duration = time.time() - request.start_time
            logger.info(f'{request.method} {request.path} - {response.status_code} - {duration:.3f}s')
        return response
```

## Performance最適化

### N+1 queryの防止

```python
# 悪い例 - N+1 query
products = Product.objects.all()
for product in products:
    print(product.category.name)  # productごとに個別のquery

# 良い例 - select_relatedによる単一query
products = Product.objects.select_related('category').all()
for product in products:
    print(product.category.name)

# 良い例 - many-to-manyにはprefetch
products = Product.objects.prefetch_related('tags').all()
for product in products:
    for tag in product.tags.all():
        print(tag.name)
```

### DBのindex設定

```python
class Product(models.Model):
    name = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(unique=True)
    category = models.ForeignKey('Category', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['category', 'created_at']),
        ]
```

### 一括操作

```python
# 一括作成
Product.objects.bulk_create([
    Product(name=f'Product {i}', price=10.00)
    for i in range(1000)
])

# 一括更新
products = Product.objects.all()[:100]
for product in products:
    product.is_active = True
Product.objects.bulk_update(products, ['is_active'])

# 一括削除
Product.objects.filter(stock=0).delete()
```

## クイックリファレンス

| パターン | 説明 |
|---------|-------------|
| 設定分割 | dev/prod/testの設定を分ける |
| カスタムQuerySet | 再利用可能なqueryメソッド |
| Service層 | 業務ロジックの分離 |
| ViewSet | REST APIのendpoint |
| Serializerの検証 | request/responseの変換 |
| select_related | foreign keyの最適化 |
| prefetch_related | many-to-manyの最適化 |
| cache優先 | コストの高い処理をcacheする |
| Signal | イベント駆動の処理 |
| Middleware | request/responseの処理 |

留意: Djangoには多くのショートカットがあるが、本番アプリケーションでは簡潔なコードよりも構造と整理が重要になる。保守性を前提に作る。
