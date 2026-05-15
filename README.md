# KoiReader Backend — Industrial AI Mission Control

Production-grade backend service powering KoiReader's supply chain intelligence platform. Built to process massive streams of industrial AI events, serve real-time dashboards, and expose a type-safe GraphQL API.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript (strict) |
| API | Apollo GraphQL Server v4 |
| HTTP Framework | Express |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 |
| Real-time | WebSocket Subscriptions (`graphql-ws`) |
| Validation | Zod |
| Auth | JWT (access + refresh token rotation) |
| Logging | Winston (JSON in prod, colorized in dev) |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
src/
├── config/           # Validated env config, pg pool, Redis client
├── types/            # Shared TypeScript interfaces & GraphQL context
├── utils/            # Logger, typed errors, Zod validators
├── database/
│   ├── migrations/   # Versioned SQL migration files
│   ├── migrate.ts    # Migration runner
│   └── seeds/        # Dev seed data
├── services/         # Business logic layer
│   ├── auth.service.ts
│   ├── cache.service.ts
│   ├── facility.service.ts
│   ├── asset.service.ts
│   ├── event.service.ts
│   ├── analytics.service.ts
│   └── alert.service.ts
├── graphql/
│   ├── schema/       # Full GraphQL SDL (type definitions)
│   ├── resolvers/    # One resolver file per domain
│   ├── dataloaders/  # DataLoader (N+1 prevention)
│   ├── helpers.ts    # requireAuth / requireRole guards
│   └── pubsub.ts     # In-process PubSub
├── middleware/       # Auth extractor, rate limiter, error handler
└── server.ts         # Bootstrap: Express + Apollo + WebSocket
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your local values. Generate JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Start infrastructure (Docker)

```bash
# Infra only — run app locally with hot-reload
docker-compose -f docker-compose.dev.yml up -d
```

### 4. Run migrations & seed

```bash
npm run migrate
npm run seed
```

Seed creates:
- Admin user: `admin@koireader.com` / `Admin@1234`
- 3 sample facilities (Chennai, Pune, Mumbai)
- 9 assets + 10 events + 1 alert

### 5. Start development server

```bash
npm run dev
```

GraphQL Sandbox: [http://localhost:4000/graphql](http://localhost:4000/graphql)

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot-reload (ts-node-dev) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled production build |
| `npm run migrate` | Run pending database migrations |
| `npm run seed` | Seed development data |
| `npm run lint` | Run ESLint |

---

## API Overview

### Authentication

All queries/mutations (except `register` and `login`) require a Bearer token:

```
Authorization: Bearer <accessToken>
```

### Sample Queries

**Login**
```graphql
mutation {
  login(input: { email: "admin@koireader.com", password: "Admin@1234" }) {
    accessToken
    refreshToken
    user { id name role }
  }
}
```

**List Facilities**
```graphql
query {
  facilities(pagination: { limit: 10, offset: 0 }) {
    items { id name location type openAlerts }
    pageInfo { total hasMore }
  }
}
```

**Ingest AI Event**
```graphql
mutation {
  ingestEvent(input: {
    assetId: "<uuid>"
    facilityId: "<uuid>"
    type: "anomaly_detected"
    severity: critical
    data: { confidence: 0.97, frame_id: 4201 }
    source: "koi-vision-v2"
  }) {
    id severity createdAt
  }
}
```

**Real-time Subscription**
```graphql
subscription {
  eventIngested(facilityId: "<uuid>", severity: critical) {
    id type severity data createdAt
    asset { name type }
  }
}
```

**Dashboard Summary**
```graphql
query {
  dashboardSummary(facilityId: "<uuid>") {
    assetStats
    eventStats
    recentMetrics
  }
}
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│         Browser App  │  Mobile App  │  IoT / AI Edge           │
└──────────────┬──────────────────────────────┬───────────────────┘
               │  HTTP POST /graphql           │  WS /graphql
               ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       EXPRESS SERVER :4000                      │
│  Helmet → CORS → Compression → RateLimiter → authMiddleware     │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────┐     ┌─────────────────────────────┐
│      APOLLO SERVER       │     │      WEBSOCKET SERVER       │
│  ApolloServer v4         │     │  graphql-ws + useServer()   │
│  formatError (sanitize)  │     │  JWT from connectionParams  │
│  introspection: dev only │     │  Subscription resolvers     │
└──────────────┬───────────┘     └──────────────┬──────────────┘
               │                                │
               ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GRAPHQL LAYER                              │
│                                                                 │
│  Schema (SDL)          Resolvers           DataLoaders          │
│  ─────────────         ─────────────────   ───────────────────  │
│  14 Queries            auth.resolver       facilityLoader       │
│  15 Mutations          facility.resolver   assetLoader          │
│  3 Subscriptions       asset.resolver      userLoader           │
│  Scalars: DateTime,    event.resolver      (batch + cache,      │
│           JSON         alert.resolver       per-request)        │
│                        analytics.resolver                       │
│                              │                                  │
│                        requireAuth()                            │
│                        requireRole()                            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                             │
│                                                                 │
│  AuthService       FacilityService     AssetService            │
│  CacheService      EventService        AlertService            │
│  AnalyticsService                                               │
│                                                                 │
│  • Zod validation at every entry point                         │
│  • Redis cache-aside before every DB read                      │
│  • Cache invalidation on every write                           │
└──────────┬────────────────────────────────────┬────────────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────┐           ┌────────────────────────────┐
│     REDIS :6379      │           │     POSTGRESQL :5432       │
│                      │           │                            │
│  Cache namespaces:   │           │  users                     │
│  koi:facility:*      │           │  refresh_tokens            │
│  koi:asset:*         │           │  facilities                │
│  koi:event:*         │           │  assets                    │
│  koi:alert:*         │           │  events                    │
│  koi:analytics:*     │           │  analytics                 │
│                      │           │  alerts                    │
│  Token blacklist:    │           │  schema_migrations         │
│  koi:blacklist:*     │           │                            │
│                      │           │  Pool: min 2, max 20       │
│  Pub/Sub channels:   │           │  Slow query log > 1s       │
│  koi:events:new      │           │  Auto updated_at trigger   │
│  koi:events:critical │           │                            │
└──────────────────────┘           └────────────────────────────┘
```

---

### Layer Breakdown

#### 1. Middleware Chain

Every HTTP request passes through this chain in order:

```
Request
  │
  ├─► Helmet          — sets security headers (CSP, HSTS, X-Frame-Options)
  ├─► CORS            — origin whitelist (all origins in dev, env var in prod)
  ├─► Compression     — gzip response bodies
  ├─► RateLimiter     — 100 req / 15min globally; 10 req / 15min on auth ops
  ├─► authMiddleware  — decodes JWT → attaches req.user (non-blocking)
  └─► Apollo Server   — builds context { user, loaders, requestId } per request
```

`authMiddleware` never blocks — it only populates `req.user`. Enforcement happens inside resolvers via `requireAuth()` and `requireRole()`, giving full control per operation.

---

#### 2. GraphQL Context (per request)

Every resolver receives a typed context object built fresh per request:

```typescript
{
  req: Request,           // raw Express request
  res: Response,          // raw Express response
  user: {                 // null if unauthenticated
    id, email, role
  },
  loaders: {              // fresh DataLoader instances (no cross-request cache leaks)
    facilityLoader,
    assetLoader,
    userLoader
  },
  requestId: string       // UUID for tracing
}
```

---

#### 3. Service Layer

Each service owns one domain. All services follow the same pattern:

```
Resolver calls Service
  │
  ├─► validate(zodSchema, input)   — throws ValidationError on bad input
  ├─► cache.get(key)               — Redis lookup first
  │     hit  → return cached value
  │     miss → query PostgreSQL
  │              └─► cache.set(key, value, TTL)
  │                  └─► return value
  └─► on write: cache.del(key) + cache.delPattern('list:*')
```

| Service | Responsibility |
|---|---|
| `AuthService` | Register, login, logout, JWT sign/verify, refresh token rotation, blacklisting |
| `CacheService` | Redis get/set/del with namespacing, TTL tiers, cache-aside helper |
| `FacilityService` | Facility CRUD with paginated listing and cache management |
| `AssetService` | Asset CRUD, status tracking, `last_seen_at` updates |
| `EventService` | AI event ingestion, severity routing, pub/sub publishing, stats |
| `AlertService` | Alert lifecycle (open → acknowledged → resolved → closed), priority ordering |
| `AnalyticsService` | Bulk metric recording via UNNEST, time-series aggregation, dashboard summary |

---

#### 4. Caching Strategy (Redis)

```
Namespace         Key Pattern                TTL       Used For
─────────────     ───────────────────────    ───────   ─────────────────────────
koi:facility:     koi:facility:{id}          300s      Entity reads
                  koi:facility:list:{l}:{o}  300s      Paginated lists
koi:asset:        koi:asset:{id}             300s      Entity reads
koi:event:        koi:event:stats:{fid}       60s      Live event stats
                  koi:event:unprocessed:*     60s      Unprocessed counts
koi:analytics:    koi:analytics:ts:*          60s      Time-series queries
                  koi:analytics:latest:*      60s      Latest metrics per asset
                  koi:analytics:dashboard:*   60s      Dashboard summaries
koi:blacklist:    koi:blacklist:{token}       token TTL Logged-out JWT tokens
```

**Write invalidation rules:**
- Single entity write → `del(id)`
- List-affecting write → `delPattern('list:*')`
- Stat-affecting write → short TTL handles natural expiry

---

#### 5. Database Schema & Relationships

```
users
 └─── refresh_tokens (user_id → users.id)   [CASCADE DELETE]
 └─── alerts.assigned_to (→ users.id)       [SET NULL on delete]

facilities
 └─── assets (facility_id → facilities.id)  [CASCADE DELETE]
 └─── events (facility_id → facilities.id)  [reference]
 └─── analytics (facility_id)               [SET NULL on delete]
 └─── alerts (facility_id)                  [SET NULL on delete]

assets
 └─── events (asset_id → assets.id)         [CASCADE DELETE]
 └─── analytics (asset_id)                  [SET NULL on delete]
 └─── alerts (asset_id)                     [SET NULL on delete]

events
 └─── alerts (event_id → events.id)         [SET NULL on delete]
```

**Key indexes for query performance:**

| Table | Index | Purpose |
|---|---|---|
| `events` | `(facility_id, created_at DESC)` | Facility event feed |
| `events` | `(processed) WHERE processed = FALSE` | Unprocessed queue scan |
| `analytics` | `(asset_id, metric_name, recorded_at DESC)` | Time-series per asset |
| `alerts` | `(status, severity)` | Open critical alert queries |
| `users` | `(email)` | Login lookup |

**Auto-trigger:** `update_updated_at()` fires `BEFORE UPDATE` on `users`, `facilities`, `assets`, `alerts` — no manual timestamp management needed.

---

#### 6. Authentication Flow

```
REGISTRATION
  client → register(email, password, name)
         → Zod validate
         → check email uniqueness
         → bcrypt.hash(password, 12 rounds)
         → INSERT user → return user


LOGIN
  client → login(email, password)
         → fetch user by email (active only)
         → bcrypt.compare(password, hash)
         → sign accessToken  (JWT, 15m, HS256)
         → generate refreshToken (crypto.randomBytes(64))
         → store SHA-256 hash of refreshToken in DB
         → return { accessToken, refreshToken, user }


AUTHENTICATED REQUEST
  client → Authorization: Bearer <accessToken>
         → authMiddleware decodes JWT
         → checks Redis blacklist (koi:blacklist:{token})
         → attaches user to req
         → resolver calls requireAuth() / requireRole()


TOKEN REFRESH
  client → refreshTokens(refreshToken)
         → hash token → lookup in DB
         → check not revoked + not expired
         → revoke old refresh token
         → issue new accessToken + new refreshToken (rotation)
         → return new pair


LOGOUT
  client → logout()
         → blacklist accessToken in Redis (TTL = remaining life)
         → revoke ALL refresh tokens for user in DB
```

---

#### 7. Event Ingestion & Real-time Pipeline

```
AI Camera / Edge Device
        │
        ▼
  ingestEvent(mutation)
        │
        ├─► Zod validate input
        ├─► INSERT into events table
        ├─► UPDATE assets SET last_seen_at = NOW()
        ├─► publish(koi:events:new, event)          ─► Redis Pub/Sub
        │       └─► if severity = critical:
        │           publish(koi:events:critical, event)
        │
        └─► pubsub.publish('EVENT_INGESTED', event) ─► GraphQL PubSub
                    │
                    ▼
            WebSocket subscribers
            filtered by facilityId / severity
                    │
                    ▼
            { data: { eventIngested: { ... } } }
            pushed to connected dashboards
```

---

#### 8. N+1 Prevention with DataLoader

Without DataLoader, fetching 10 events with their assets = 11 queries (1 + 10).
With DataLoader, it's always 2 queries regardless of list size.

```
Resolver: events query returns 10 events
  │
  ├─ event[0].asset → assetLoader.load(asset_id_A)  ─┐
  ├─ event[1].asset → assetLoader.load(asset_id_B)  ─┤
  ├─ event[2].asset → assetLoader.load(asset_id_A)  ─┤  batched into
  ├─ event[3].asset → assetLoader.load(asset_id_C)  ─┤  one tick
  └─ ...                                             ─┘
                                                       │
                          SELECT * FROM assets         ▼
                          WHERE id = ANY($1) ──► [A, B, C]
                                                (1 query total)
```

Each request gets **fresh** DataLoader instances — cached only within that request, preventing stale data leaking between users.

---

#### 9. Role-Based Access Control

| Operation | admin | operator | viewer |
|---|---|---|---|
| Read any resource | ✅ | ✅ | ✅ |
| Create facility / asset / alert | ✅ | ✅ | ❌ |
| Update facility / asset / alert | ✅ | ✅ | ❌ |
| Ingest events | ✅ | ✅ | ❌ |
| Record metrics | ✅ | ✅ | ❌ |
| Delete facility | ✅ | ❌ | ❌ |
| Change any user password | ✅ | ❌ | ❌ |

Enforced in resolvers via:
```typescript
requireRole(ctx, 'admin')           // admin only
requireRole(ctx, 'admin', 'operator') // admin or operator
requireAuth(ctx)                    // any authenticated user
```

---

#### 10. Request Lifecycle (end to end)

```
POST /graphql  { query: "...", variables: {...} }
        │
        ▼
   [Helmet]  → attach security headers
        │
   [CORS]    → check origin
        │
   [Compression] → gzip
        │
   [RateLimiter] → check req count in window
        │               exceeded? → 429
        │
   [authMiddleware]
        │  extract Bearer token
        │  check Redis blacklist
        │  verify JWT signature + expiry
        │  attach req.user (or null)
        │
   [Apollo Server]
        │  build context { user, loaders, requestId }
        │  parse + validate GraphQL document
        │
   [Resolver]
        │  requireAuth() / requireRole()  → throw if unauthorized
        │  call service method
        │
   [Service]
        │  validate(zodSchema, input)     → throw ValidationError if invalid
        │  cache.get(key)
        │    hit  → return
        │    miss → pool.query(sql, params)
        │             └─► cache.set(key, value, TTL)
        │
   [Response]
        │  format GraphQL response
        │  sanitize INTERNAL_SERVER_ERROR in production
        └─► { data: { ... } }
```

---

#### 11. Production Scaling Notes

| Concern | Current | Scale-up path |
|---|---|---|
| Pub/Sub | In-memory `PubSub` | Replace with `graphql-redis-subscriptions` for multi-instance |
| DB connection | pg Pool (max 20) | PgBouncer in front of PostgreSQL |
| Analytics writes | Bulk UNNEST insert | TimescaleDB extension for hypertable partitioning |
| Rate limiting | In-process `express-rate-limit` | Redis-backed store for multi-instance |
| Sessions | JWT stateless | Already stateless — scales horizontally |

---

## Docker (Full Stack)

```bash
# Build and run everything
cp .env.example .env   # fill in secrets
docker-compose up -d

# Run migrations inside container
docker-compose exec app npm run migrate
docker-compose exec app npm run seed
```

---

## Health Check

```
GET /health
→ { "status": "ok", "timestamp": "...", "version": "1.0.0" }
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Environment | `development` |
| `PORT` | HTTP port | `4000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | — |
| `DB_USER` | Database user | — |
| `DB_PASSWORD` | Database password | — |
| `DB_POOL_MIN` | Min pool connections | `2` |
| `DB_POOL_MAX` | Max pool connections | `20` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | — |
| `JWT_SECRET` | Access token secret (min 32 chars) | — |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) | — |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `LOG_LEVEL` | Winston log level | `info` |

---

## Production Notes

- Set `NODE_ENV=production` to disable GraphQL introspection and Apollo Sandbox
- Replace in-memory `PubSub` with `graphql-redis-subscriptions` for multi-instance deployments
- Set `ALLOWED_ORIGINS` env var to restrict CORS in production
- Use a secrets manager (AWS Secrets Manager / Vault) for JWT secrets and DB credentials
