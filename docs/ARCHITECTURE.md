# Bundelkhandi Chhakri — System Architecture

## Overview

Bundelkhandi Chhakri is a production-grade real-time multiplayer card game. This document defines the top-level architecture for the complete system: backend services, Flutter client, real-time communication, persistence, and AI subsystem.

---

## System Topology

```
┌───────────────────────────────────────────────────────────────┐
│                        CLIENTS                                │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │  Flutter App  │    │  Flutter App  │    │  Flutter App  │   │
│  │  (iOS/Android)│    │  (iOS/Android)│    │  (Web/Debug) │   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘   │
└─────────┼───────────────────┼───────────────────┼───────────-┘
          │                   │                   │
          │  HTTPS + WSS (TLS termination at proxy)
          │
┌─────────▼───────────────────────────────────────────────────┐
│                     REVERSE PROXY                            │
│              (Nginx / Replit Shared Proxy)                   │
│  Routes: /api → API Server   /  → Static (future web)       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    API SERVER                                │
│             Node.js 24 + Express 5 + Socket.IO              │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  REST Routes │  │  Socket.IO   │  │   Job Queue      │    │
│  │  /api/auth   │  │  Namespace:  │  │  (AI turns,      │    │
│  │  /api/rooms  │  │  /game       │  │   cleanup,       │    │
│  │  /api/games  │  │  /lobby      │  │   leaderboard)   │    │
│  │  /api/users  │  │              │  │                  │    │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬────────┘   │
│         │                 │                     │            │
│  ┌──────▼─────────────────▼─────────────────────▼────────┐  │
│  │              SERVICE LAYER                              │  │
│  │  AuthService │ RoomService │ GameService │ AIService   │  │
│  └──────────────────────────────────────────────────────-─┘  │
│                          │                                   │
│  ┌───────────────────────▼──────────────────────────────┐   │
│  │              DATA LAYER (Drizzle ORM)                 │   │
│  │  users │ rooms │ games │ game_players │ game_rounds   │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   POSTGRESQL DATABASE                        │
│              (Replit Managed PostgreSQL)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
| Concern | Technology | Why |
|---|---|---|
| Runtime | Node.js 24 | LTS, ESM-native, excellent async perf |
| Framework | Express 5 | Minimal, battle-tested, async error handling |
| Real-time | Socket.IO 4 | Rooms, namespaces, reconnection, fallback |
| ORM | Drizzle ORM | Type-safe, schema-as-code, zero runtime overhead |
| Database | PostgreSQL 17 | ACID, JSONB for game state, proven at scale |
| Validation | Zod v4 | Runtime schema validation, shared with client |
| Logging | Pino | Structured, extremely fast |
| Auth | JWT + Refresh tokens | Stateless, mobile-friendly |
| Password | Argon2id | Industry standard for password hashing |
| Session | Redis (Phase 2) | Socket.IO horizontal scaling |

### Flutter Client
| Concern | Technology | Why |
|---|---|---|
| Framework | Flutter 3.x | True cross-platform, 60/120fps rendering |
| Language | Dart 3.x | Sound null safety, pattern matching |
| State | Riverpod 2 | Compile-time safe, testable |
| Navigation | GoRouter | Declarative, deep link support |
| Networking | Dio | Interceptors, retry, type-safe |
| WebSocket | socket_io_client | Matches server Socket.IO protocol |
| Local storage | Hive | Fast, type-safe, no native deps |
| Animations | Rive | Card dealing, flip, celebration animations |
| Audio | just_audio | Card sound effects, background music |

### DevOps / Infrastructure
| Concern | Technology |
|---|---|
| CI/CD | GitHub Actions |
| Hosting | Replit Deployments (backend) |
| Mobile distribution | TestFlight (iOS) / Firebase App Distribution (Android) |
| Error tracking | Sentry (Phase 2) |
| Analytics | PostHog (Phase 2) |

---

## Architectural Principles

### 1. Contract-First API Development
All API routes are defined in `lib/api-spec/openapi.yaml` first. Code is generated from the spec — never written by hand for transport layer. Game state is validated with Zod schemas on both ingress and egress.

### 2. Event-Driven Real-Time Layer
Gameplay is driven entirely through Socket.IO events. The REST API handles session management, matchmaking, and data retrieval. Game state transitions happen server-side only — clients are thin renderers.

### 3. Server-Authoritative Game State
The server is the single source of truth for all game state. Clients never mutate state directly — they send intents (e.g. `game:play_card`). The server validates, transitions, and broadcasts new state. This prevents cheating.

### 4. Separation of Concerns
```
REST API  → auth, lobby, profile, history
Socket.IO → game events, real-time sync
AI Engine → isolated, runs server-side as a service
```

### 5. Testability by Design
- Services are pure functions where possible
- Game logic is fully unit-testable without a database or network
- Socket handlers are thin wrappers over services

---

## Monorepo Package Map

```
/
├── artifacts/
│   └── api-server/          # Express + Socket.IO server
│       └── src/
│           ├── routes/      # REST route handlers
│           ├── socket/      # Socket.IO event handlers
│           ├── services/    # Business logic (GameService, RoomService…)
│           ├── middlewares/ # Auth, rate-limit, error handling
│           └── lib/         # Logger, helpers
│
├── lib/
│   ├── db/                  # Drizzle ORM schema + migrations
│   │   └── src/schema/      # users, rooms, games, game_players…
│   ├── api-spec/            # OpenAPI 3.1 specification
│   ├── api-client-react/    # Generated React Query hooks (web debug)
│   └── api-zod/             # Generated Zod schemas (shared validation)
│
├── flutter_client/          # Flutter mobile app
│   └── lib/
│       ├── core/            # DI, router, theme, constants
│       ├── features/        # auth, lobby, game, profile, leaderboard
│       ├── shared/          # Shared widgets, utils, extensions
│       └── data/            # Repositories, data sources, models
│
└── docs/                    # Architecture, game design, roadmaps
```

---

## Security Model

| Layer | Control |
|---|---|
| Transport | TLS everywhere (enforced by proxy) |
| Auth | JWT (15min) + Refresh token (30d, httpOnly cookie) |
| Game actions | Server validates every action against game state |
| Rate limiting | Express rate-limiter per IP and per user |
| Input validation | Zod on every REST endpoint and Socket event |
| Password | Argon2id, never stored in plaintext |
| Guest play | Ephemeral JWT, no password, limited features |

---

## Scalability Plan

### Phase 1 (Current): Single Instance
- One Node.js process handles both REST and WebSocket
- PostgreSQL for all persistence
- No caching layer needed at this scale

### Phase 2: Horizontal Scaling
- Redis adapter for Socket.IO (pub/sub across instances)
- Redis for session cache and leaderboard sorted sets
- Read replicas for PostgreSQL

### Phase 3: Global Distribution
- CDN for Flutter web assets
- Regional API instances
- Sticky sessions or stateless game protocol

---

## See Also
- `docs/GAME_DESIGN.md` — Chhakri rules and card mechanics
- `docs/MULTIPLAYER_DESIGN.md` — Socket.IO event protocol
- `docs/DATABASE_SCHEMA.md` — Full schema definitions
- `docs/AI_DESIGN.md` — AI opponent architecture
- `docs/ROADMAP.md` — Development phases and milestones
- `docs/FLUTTER_CLIENT.md` — Flutter app structure and patterns
