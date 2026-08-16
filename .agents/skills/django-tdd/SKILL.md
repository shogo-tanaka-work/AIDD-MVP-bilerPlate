---
name: django-tdd
description: pytest-djangoによるDjangoのtest戦略、TDD手法、factory_boy、mocking、coverage、Django REST FrameworkのAPI test。pytest-djangoでDjangoやDRFのtestを書くとき、またはDjangoの機能をtest-firstで進めるときに使う。
metadata:
  origin: ECC
---

# TDDによるDjango Testing

pytest、factory_boy、Django REST Frameworkを使ったDjangoアプリケーションのtest駆動開発。

## 発動タイミング

- 新しいDjangoアプリケーションを書くとき
- Django REST FrameworkのAPIを実装するとき
- Djangoのmodel、view、serializerをtestするとき
- Djangoプロジェクトのtest基盤を整備するとき

## DjangoのTDDワークフロー

### Red-Green-Refactorサイクル

```python
# Step 1: RED - 失敗するtestを書く
def test_user_creation():
    user = User.objects.create_user(email='test@example.com', password='testpass123')
    assert user.email == 'test@example.com'
    assert user.check_password('testpass123')
    assert not user.is_staff

# Step 2: GREEN - testを通す
# User modelまたはfactoryを作る

# Step 3: REFACTOR - testをgreenに保ったまま改善する
```

## Setup

### pytestの設定

```ini
# pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.test
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    --reuse-db
    --nomigrations
    --cov=apps
    --cov-report=html
    --cov-report=term-missing
    --strict-markers
markers =
    slow: marks tests as slow
    integration: marks tests as integration tests
```

### Test用設定

```python
# config/settings/test.py
from .base import *

DEBUG = True
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# 高速化のためmigrationを無効化する
class DisableMigrations:
    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None

MIGRATION_MODULES = DisableMigrations()

# 高速なpassword hashing
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Email backend
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Celeryを常にeagerにする
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
```

### conftest.py

```python
# tests/conftest.py
import pytest
from django.utils import timezone
from django.contrib.auth import get_user_model

User = get_user_model()

@pytest.fixture(autouse=True)
def timezone_settings(settings):
    """timezoneを一定に保つ。"""
    settings.TIME_ZONE = 'UTC'

@pytest.fixture
def user(db):
    """test用userを作る。"""
    return User.objects.create_user(
        email='test@example.com',
        password='testpass123',
        username='testuser'
    )

@pytest.fixture
def admin_user(db):
    """admin userを作る。"""
    return User.objects.create_superuser(
        email='admin@example.com',
        password='adminpass123',
        username='admin'
    )

@pytest.fixture
def authenticated_client(client, user):
    """認証済みclientを返す。"""
    client.force_login(user)
    return client

@pytest.fixture
def api_client():
    """DRFのAPI clientを返す。"""
    from rest_framework.test import APIClient
    return APIClient()

@pytest.fixture
def authenticated_api_client(api_client, user):
    """認証済みAPI clientを返す。"""
    api_client.force_authenticate(user=user)
    return api_client
```

## Factory Boy

### Factoryの設定

```python
# tests/factories.py
import factory
from factory import fuzzy
from datetime import datetime, timedelta
from django.contrib.auth import get_user_model
from apps.products.models import Product, Category

User = get_user_model()

class UserFactory(factory.django.DjangoModelFactory):
    """User modelのfactory。"""

    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = factory.Sequence(lambda n: f"user{n}")
    password = factory.PostGenerationMethodCall('set_password', 'testpass123')
    first_name = factory.Faker('first_name')
    last_name = factory.Faker('last_name')
    is_active = True

class CategoryFactory(factory.django.DjangoModelFactory):
    """Category modelのfactory。"""

    class Meta:
        model = Category

    name = factory.Faker('word')
    slug = factory.LazyAttribute(lambda obj: obj.name.lower())
    description = factory.Faker('text')

class ProductFactory(factory.django.DjangoModelFactory):
    """Product modelのfactory。"""

    class Meta:
        model = Product

    name = factory.Faker('sentence', nb_words=3)
    slug = factory.LazyAttribute(lambda obj: obj.name.lower().replace(' ', '-'))
    description = factory.Faker('text')
    price = fuzzy.FuzzyDecimal(10.00, 1000.00, 2)
    stock = fuzzy.FuzzyInteger(0, 100)
    is_active = True
    category = factory.SubFactory(CategoryFactory)
    created_by = factory.SubFactory(UserFactory)

    @factory.post_generation
    def tags(self, create, extracted, **kwargs):
        """productへtagを追加する。"""
        if not create:
            return
        if extracted:
            for tag in extracted:
                self.tags.add(tag)
```

### Factoryの使い方

```python
# tests/test_models.py
import pytest
from tests.factories import ProductFactory, UserFactory

def test_product_creation():
    """factoryによるproduct作成のtest。"""
    product = ProductFactory(price=100.00, stock=50)
    assert product.price == 100.00
    assert product.stock == 50
    assert product.is_active is True

def test_product_with_tags():
    """tag付きproductのtest。"""
    tags = [TagFactory(name='electronics'), TagFactory(name='new')]
    product = ProductFactory(tags=tags)
    assert product.tags.count() == 2

def test_multiple_products():
    """複数productの作成test。"""
    products = ProductFactory.create_batch(10)
    assert len(products) == 10
```

## Model Testing

### Modelのtest

```python
# tests/test_models.py
import pytest
from django.core.exceptions import ValidationError
from tests.factories import UserFactory, ProductFactory

class TestUserModel:
    """User modelのtest。"""

    def test_create_user(self, db):
        """通常userの作成test。"""
        user = UserFactory(email='test@example.com')
        assert user.email == 'test@example.com'
        assert user.check_password('testpass123')
        assert not user.is_staff
        assert not user.is_superuser

    def test_create_superuser(self, db):
        """superuserの作成test。"""
        user = UserFactory(
            email='admin@example.com',
            is_staff=True,
            is_superuser=True
        )
        assert user.is_staff
        assert user.is_superuser

    def test_user_str(self, db):
        """userの文字列表現のtest。"""
        user = UserFactory(email='test@example.com')
        assert str(user) == 'test@example.com'

class TestProductModel:
    """Product modelのtest。"""

    def test_product_creation(self, db):
        """productの作成test。"""
        product = ProductFactory()
        assert product.id is not None
        assert product.is_active is True
        assert product.created_at is not None

    def test_product_slug_generation(self, db):
        """slug自動生成のtest。"""
        product = ProductFactory(name='Test Product')
        assert product.slug == 'test-product'

    def test_product_price_validation(self, db):
        """priceが負にならないことのtest。"""
        product = ProductFactory(price=-10)
        with pytest.raises(ValidationError):
            product.full_clean()

    def test_product_manager_active(self, db):
        """active managerメソッドのtest。"""
        ProductFactory.create_batch(5, is_active=True)
        ProductFactory.create_batch(3, is_active=False)

        active_count = Product.objects.active().count()
        assert active_count == 5

    def test_product_stock_management(self, db):
        """在庫管理のtest。"""
        product = ProductFactory(stock=10)
        product.reduce_stock(5)
        product.refresh_from_db()
        assert product.stock == 5

        with pytest.raises(ValueError):
            product.reduce_stock(10)  # 在庫不足
```

## View Testing

### Django viewのtest

```python
# tests/test_views.py
import pytest
from django.urls import reverse
from tests.factories import ProductFactory, UserFactory

class TestProductViews:
    """product viewのtest。"""

    def test_product_list(self, client, db):
        """product一覧viewのtest。"""
        ProductFactory.create_batch(10)

        response = client.get(reverse('products:list'))

        assert response.status_code == 200
        assert len(response.context['products']) == 10

    def test_product_detail(self, client, db):
        """product詳細viewのtest。"""
        product = ProductFactory()

        response = client.get(reverse('products:detail', kwargs={'slug': product.slug}))

        assert response.status_code == 200
        assert response.context['product'] == product

    def test_product_create_requires_login(self, client, db):
        """product作成に認証が必要であることのtest。"""
        response = client.get(reverse('products:create'))

        assert response.status_code == 302
        assert response.url.startswith('/accounts/login/')

    def test_product_create_authenticated(self, authenticated_client, db):
        """認証済みuserによるproduct作成のtest。"""
        response = authenticated_client.get(reverse('products:create'))

        assert response.status_code == 200

    def test_product_create_post(self, authenticated_client, db, category):
        """POSTによるproduct作成のtest。"""
        data = {
            'name': 'Test Product',
            'description': 'A test product',
            'price': '99.99',
            'stock': 10,
            'category': category.id,
        }

        response = authenticated_client.post(reverse('products:create'), data)

        assert response.status_code == 302
        assert Product.objects.filter(name='Test Product').exists()
```

## DRF API Testing

### Serializerのtest

```python
# tests/test_serializers.py
import pytest
from rest_framework.exceptions import ValidationError
from apps.products.serializers import ProductSerializer
from tests.factories import ProductFactory

class TestProductSerializer:
    """ProductSerializerのtest。"""

    def test_serialize_product(self, db):
        """productのserialize test。"""
        product = ProductFactory()
        serializer = ProductSerializer(product)

        data = serializer.data

        assert data['id'] == product.id
        assert data['name'] == product.name
        assert data['price'] == str(product.price)

    def test_deserialize_product(self, db):
        """product dataのdeserialize test。"""
        data = {
            'name': 'Test Product',
            'description': 'Test description',
            'price': '99.99',
            'stock': 10,
            'category': 1,
        }

        serializer = ProductSerializer(data=data)

        assert serializer.is_valid()
        product = serializer.save()

        assert product.name == 'Test Product'
        assert float(product.price) == 99.99

    def test_price_validation(self, db):
        """price検証のtest。"""
        data = {
            'name': 'Test Product',
            'price': '-10.00',
            'stock': 10,
        }

        serializer = ProductSerializer(data=data)

        assert not serializer.is_valid()
        assert 'price' in serializer.errors

    def test_stock_validation(self, db):
        """stockが負にならないことのtest。"""
        data = {
            'name': 'Test Product',
            'price': '99.99',
            'stock': -5,
        }

        serializer = ProductSerializer(data=data)

        assert not serializer.is_valid()
        assert 'stock' in serializer.errors
```

### API ViewSetのtest

```python
# tests/test_api.py
import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from tests.factories import ProductFactory, UserFactory

class TestProductAPI:
    """Product APIのendpoint test。"""

    @pytest.fixture
    def api_client(self):
        """API clientを返す。"""
        return APIClient()

    def test_list_products(self, api_client, db):
        """product一覧のtest。"""
        ProductFactory.create_batch(10)

        url = reverse('api:product-list')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 10

    def test_retrieve_product(self, api_client, db):
        """product取得のtest。"""
        product = ProductFactory()

        url = reverse('api:product-detail', kwargs={'pk': product.id})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == product.id

    def test_create_product_unauthorized(self, api_client, db):
        """未認証でのproduct作成のtest。"""
        url = reverse('api:product-list')
        data = {'name': 'Test Product', 'price': '99.99'}

        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_product_authorized(self, authenticated_api_client, db):
        """認証済みuserによるproduct作成のtest。"""
        url = reverse('api:product-list')
        data = {
            'name': 'Test Product',
            'description': 'Test',
            'price': '99.99',
            'stock': 10,
        }

        response = authenticated_api_client.post(url, data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Test Product'

    def test_update_product(self, authenticated_api_client, db):
        """productの更新test。"""
        product = ProductFactory(created_by=authenticated_api_client.user)

        url = reverse('api:product-detail', kwargs={'pk': product.id})
        data = {'name': 'Updated Product'}

        response = authenticated_api_client.patch(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Product'

    def test_delete_product(self, authenticated_api_client, db):
        """productの削除test。"""
        product = ProductFactory(created_by=authenticated_api_client.user)

        url = reverse('api:product-detail', kwargs={'pk': product.id})
        response = authenticated_api_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_filter_products_by_price(self, api_client, db):
        """priceによるproductのfiltering test。"""
        ProductFactory(price=50)
        ProductFactory(price=150)

        url = reverse('api:product-list')
        response = api_client.get(url, {'price_min': 100})

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1

    def test_search_products(self, api_client, db):
        """productの検索test。"""
        ProductFactory(name='Apple iPhone')
        ProductFactory(name='Samsung Galaxy')

        url = reverse('api:product-list')
        response = api_client.get(url, {'search': 'Apple'})

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1
```

## MockingとPatching

### 外部serviceのmock

```python
# tests/test_views.py
from unittest.mock import patch, Mock
import pytest

class TestPaymentView:
    """payment gatewayをmockした決済viewのtest。"""

    @patch('apps.payments.services.stripe')
    def test_successful_payment(self, mock_stripe, client, user, product):
        """Stripeをmockした決済成功のtest。"""
        # mockを設定する
        mock_stripe.Charge.create.return_value = {
            'id': 'ch_123',
            'status': 'succeeded',
            'amount': 9999,
        }

        client.force_login(user)
        response = client.post(reverse('payments:process'), {
            'product_id': product.id,
            'token': 'tok_visa',
        })

        assert response.status_code == 302
        mock_stripe.Charge.create.assert_called_once()

    @patch('apps.payments.services.stripe')
    def test_failed_payment(self, mock_stripe, client, user, product):
        """決済失敗のtest。"""
        mock_stripe.Charge.create.side_effect = Exception('Card declined')

        client.force_login(user)
        response = client.post(reverse('payments:process'), {
            'product_id': product.id,
            'token': 'tok_visa',
        })

        assert response.status_code == 302
        assert 'error' in response.url
```

### Email送信のmock

```python
# tests/test_email.py
from django.core import mail
from django.test import override_settings

@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
def test_order_confirmation_email(db, order):
    """注文確認emailのtest。"""
    order.send_confirmation_email()

    assert len(mail.outbox) == 1
    assert order.user.email in mail.outbox[0].to
    assert 'Order Confirmation' in mail.outbox[0].subject
```

## Integration Testing

### 一連の流れのtest

```python
# tests/test_integration.py
import pytest
from django.urls import reverse
from tests.factories import UserFactory, ProductFactory

class TestCheckoutFlow:
    """checkout全体フローのtest。"""

    def test_guest_to_purchase_flow(self, client, db):
        """ゲストから購入までの全フローのtest。"""
        # Step 1: 登録
        response = client.post(reverse('users:register'), {
            'email': 'test@example.com',
            'password': 'testpass123',
            'password_confirm': 'testpass123',
        })
        assert response.status_code == 302

        # Step 2: login
        response = client.post(reverse('users:login'), {
            'email': 'test@example.com',
            'password': 'testpass123',
        })
        assert response.status_code == 302

        # Step 3: productを閲覧する
        product = ProductFactory(price=100)
        response = client.get(reverse('products:detail', kwargs={'slug': product.slug}))
        assert response.status_code == 200

        # Step 4: cartへ追加する
        response = client.post(reverse('cart:add'), {
            'product_id': product.id,
            'quantity': 1,
        })
        assert response.status_code == 302

        # Step 5: checkout
        response = client.get(reverse('checkout:review'))
        assert response.status_code == 200
        assert product.name in response.content.decode()

        # Step 6: 購入を完了する
        with patch('apps.checkout.services.process_payment') as mock_payment:
            mock_payment.return_value = True
            response = client.post(reverse('checkout:complete'))

        assert response.status_code == 302
        assert Order.objects.filter(user__email='test@example.com').exists()
```

## Testのベストプラクティス

### すること

- **factoryを使う**: 手作業のobject生成に頼らない
- **1 testに1 assertion**: testの焦点を保つ
- **説明的なtest名**: `test_user_cannot_delete_others_post`
- **境界条件をtestする**: 空入力、None、境界値
- **外部serviceをmockする**: 外部APIに依存しない
- **fixtureを使う**: 重複をなくす
- **権限をtestする**: 認可が機能することを確認する
- **testを高速に保つ**: `--reuse-db`と`--nomigrations`を使う

### しないこと

- **Django内部をtestしない**: Djangoの動作は信頼する
- **third-party codeをtestしない**: ライブラリの動作は信頼する
- **失敗するtestを放置しない**: すべてのtestを通す
- **test間に依存を作らない**: 任意の順序で実行できるようにする
- **過剰にmockしない**: mockは外部依存だけに使う
- **private methodをtestしない**: 公開interfaceをtestする
- **本番DBを使わない**: 常にtest用DBを使う

## Coverage

### Coverageの設定

```bash
# coverage付きでtestを実行する
pytest --cov=apps --cov-report=html --cov-report=term-missing

# HTMLレポートを生成する
open htmlcov/index.html
```

### Coverage目標

| Component | 目標coverage |
|-----------|-----------------|
| Models | 90%+ |
| Serializers | 85%+ |
| Views | 80%+ |
| Services | 90%+ |
| Utilities | 80%+ |
| 全体 | 80%+ |

## クイックリファレンス

| Pattern | 用途 |
|---------|-------|
| `@pytest.mark.django_db` | DBアクセスを有効化する |
| `client` | Djangoのtest client |
| `api_client` | DRFのAPI client |
| `factory.create_batch(n)` | 複数objectを作る |
| `patch('module.function')` | 外部依存をmockする |
| `override_settings` | 一時的にsettingsを変える |
| `force_authenticate()` | test中の認証を迂回する |
| `assertRedirects` | redirectを確認する |
| `assertTemplateUsed` | templateの使用を検証する |
| `mail.outbox` | 送信済みemailを確認する |

覚えておくこと: testはドキュメントである。良いtestはコードがどう動くべきかを説明する。単純で読みやすく保守しやすい状態に保つ。
