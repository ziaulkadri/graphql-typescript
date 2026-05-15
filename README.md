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

## Architecture Highlights

### Caching Strategy (Redis)
- **Cache-aside pattern** on all entity reads
- TTL tiers: SHORT (60s) · MEDIUM (300s) · LONG (3600s)
- Pattern-based invalidation on writes (`delPattern`)
- JWT blacklist stored in Redis with token's remaining TTL

### N+1 Prevention (DataLoader)
- Fresh `DataLoader` instances per request (prevents cross-request leaks)
- Batches DB lookups for `facility`, `asset`, `user` relations

### Auth Flow
```
Login → accessToken (15m JWT) + refreshToken (7d, stored hashed in DB)
     → on expiry: POST refreshTokens mutation → rotated pair
     → on logout: token blacklisted in Redis, all refresh tokens revoked
```

### Event Pipeline
```
ingestEvent mutation
  → validate → INSERT to DB
  → update asset.last_seen_at
  → publish to Redis pub/sub
  → pubsub.publish → WebSocket subscribers notified in real-time
```

### Role-Based Access
| Role | Permissions |
|---|---|
| `admin` | Full access |
| `operator` | Read + write (no delete facility) |
| `viewer` | Read only |

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
# graphql-typescript
