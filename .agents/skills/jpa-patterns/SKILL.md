---
name: jpa-patterns
description: Spring Bootにおけるentity設計、relationship、query最適化、transaction、auditing、index、pagination、poolingを扱うJPA/Hibernateパターン。JPA entityやrelationshipを設計するとき、Hibernateのquery・transaction・N+1問題を解消するときに使う。
metadata:
  origin: ECC
---

# JPA/Hibernate Patterns

Spring Bootのデータモデリング、repository、performance tuningに使う。

## いつ発動するか

- JPA entityとテーブルmappingを設計するとき
- relationship（@OneToMany、@ManyToOne、@ManyToMany）を定義するとき
- query最適化（N+1の防止、fetch戦略、projection）を行うとき
- transaction、auditing、論理削除を設定するとき
- pagination、ソート、独自repository methodを用意するとき
- connection pooling（HikariCP）やsecond-level cacheをtuningするとき

## Entity設計

```java
@Entity
@Table(name = "markets", indexes = {
  @Index(name = "idx_markets_slug", columnList = "slug", unique = true)
})
@EntityListeners(AuditingEntityListener.class)
public class MarketEntity {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 200)
  private String name;

  @Column(nullable = false, unique = true, length = 120)
  private String slug;

  @Enumerated(EnumType.STRING)
  private MarketStatus status = MarketStatus.ACTIVE;

  @CreatedDate private Instant createdAt;
  @LastModifiedDate private Instant updatedAt;
}
```

auditingを有効化する。
```java
@Configuration
@EnableJpaAuditing
class JpaConfig {}
```

## RelationshipとN+1の防止

```java
@OneToMany(mappedBy = "market", cascade = CascadeType.ALL, orphanRemoval = true)
private List<PositionEntity> positions = new ArrayList<>();
```

- 既定はlazy loadingにし、必要なqueryで`JOIN FETCH`を使う
- collectionへ`EAGER`を使わない。読み取り経路はDTO projectionにする

```java
@Query("select m from MarketEntity m left join fetch m.positions where m.id = :id")
Optional<MarketEntity> findWithPositions(@Param("id") Long id);
```

## Repositoryパターン

```java
public interface MarketRepository extends JpaRepository<MarketEntity, Long> {
  Optional<MarketEntity> findBySlug(String slug);

  @Query("select m from MarketEntity m where m.status = :status")
  Page<MarketEntity> findByStatus(@Param("status") MarketStatus status, Pageable pageable);
}
```

- 軽量なqueryにはprojectionを使う。
```java
public interface MarketSummary {
  Long getId();
  String getName();
  MarketStatus getStatus();
}
Page<MarketSummary> findAllBy(Pageable pageable);
```

## Transaction

- serviceのmethodへ`@Transactional`を付ける
- 読み取り経路は`@Transactional(readOnly = true)`で最適化する
- propagationは慎重に選び、長時間のtransactionを避ける

```java
@Transactional
public Market updateStatus(Long id, MarketStatus status) {
  MarketEntity entity = repo.findById(id)
      .orElseThrow(() -> new EntityNotFoundException("Market"));
  entity.setStatus(status);
  return Market.from(entity);
}
```

## Pagination

```java
PageRequest page = PageRequest.of(pageNumber, pageSize, Sort.by("createdAt").descending());
Page<MarketEntity> markets = repo.findByStatus(MarketStatus.ACTIVE, page);
```

cursor風のpaginationでは、JPQLに`id > :lastId`と順序指定を含める。

## Indexとperformance

- よく使う絞り込み（`status`、`slug`、外部キー）にindexを追加する
- queryパターンに合わせた複合index（`status, created_at`）を使う
- `select *`を避け、必要な列だけをprojectionする
- 書き込みは`saveAll`と`hibernate.jdbc.batch_size`でbatch化する

## Connection Pooling（HikariCP）

推奨プロパティ。
```
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.validation-timeout=5000
```

PostgreSQLのLOB処理では次を追加する。
```
spring.jpa.properties.hibernate.jdbc.lob.non_contextual_creation=true
```

## Caching

- 1st-level cacheはEntityManager単位。transactionをまたいでentityを保持しない
- 読み取りの多いentityではsecond-level cacheを慎重に検討し、eviction戦略を検証する

## Migration

- FlywayまたはLiquibaseを使い、本番でHibernateのauto DDLに依存しない
- migrationは冪等かつ追加的に保ち、計画なしに列を削除しない

## データアクセスのテスト

- 本番に近づけるため`@DataJpaTest`とTestcontainersを優先する
- SQLの効率はログで検証する。`logging.level.org.hibernate.SQL=DEBUG`、パラメータ値には`logging.level.org.hibernate.orm.jdbc.bind=TRACE`を設定する

**Remember**: entityは軽く、queryは意図的に、transactionは短く保つ。N+1はfetch戦略とprojectionで防ぎ、read/write経路に合わせてindexを張る。
