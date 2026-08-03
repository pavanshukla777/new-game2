# PROJECT_AUDIT.md
## Bundelkhandi Chhakri — Master Audit Report
**Volume 1 v2.0 — Architect Edition**
**Audit Date:** 2026-07-19
**Mode:** READ ONLY — No code was modified during this audit.
**Auditor Role:** Principal Software Architect, Multiplayer Game Architect, Flutter Architect, Backend Architect, Database Architect, Security Auditor, Performance Engineer, Technical Reviewer.

---

> ⚠️ **CRITICAL NOTICE — NO OFFICIAL RULEBOOK RECEIVED**
>
> The audit specification states that "the finalized official gameplay rulebook is the highest authority." As of this audit date, no standalone official Rulebook document has been uploaded or provided to this repository. The only gameplay reference document present is `docs/GAME_DESIGN.md`. All Rulebook Traceability Matrix entries that cannot be confirmed from `GAME_DESIGN.md` are marked **UNKNOWN**. The Rulebook Traceability Matrix will require a full revision once the official Rulebook is received.

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Repository Inventory](#2-repository-inventory)
3. [Project Structure Analysis](#3-project-structure-analysis)
4. [Flutter Architecture Audit](#4-flutter-architecture-audit)
5. [State Management Audit](#5-state-management-audit)
6. [Backend Architecture Audit](#6-backend-architecture-audit)
7. [API Inventory](#7-api-inventory)
8. [Socket Architecture Audit](#8-socket-architecture-audit)
9. [Multiplayer Engine Audit](#9-multiplayer-engine-audit)
10. [Database Audit](#10-database-audit)
11. [Data Flow Analysis](#11-data-flow-analysis)
12. [API ↔ Socket Consistency Check](#12-api--socket-consistency-check)
13. [Database ↔ Backend Consistency](#13-database--backend-consistency)
14. [Module Complexity Analysis](#14-module-complexity-analysis)
15. [Technical Cross Verification](#15-technical-cross-verification)
16. [Rulebook Traceability Matrix](#16-rulebook-traceability-matrix)
17. [Gameplay Engine Audit](#17-gameplay-engine-audit)
18. [Zero Assumption Detector](#18-zero-assumption-detector)
19. [Hardcoded Game Rule Detector](#19-hardcoded-game-rule-detector)
20. [Security Audit](#20-security-audit)
21. [Cheat Prevention Audit](#21-cheat-prevention-audit)
22. [Performance Audit](#22-performance-audit)
23. [Technical Debt Audit](#23-technical-debt-audit)
24. [Dependency Risk Analysis](#24-dependency-risk-analysis)
25. [Code Quality Audit](#25-code-quality-audit)
26. [Production Readiness](#26-production-readiness)
27. [AI Safe Refactor Constraints](#27-ai-safe-refactor-constraints)
28. [Module Classification](#28-module-classification)
29. [Risk Matrix](#29-risk-matrix)
30. [Refactor Roadmap](#30-refactor-roadmap)
31. [Implementation Blockers](#31-implementation-blockers)
32. [Project Readiness Matrix](#32-project-readiness-matrix)

---

## 1. EXECUTIVE SUMMARY

### Project Overview
**Bundelkhandi Chhakri** is a traditional trick-taking card game from the Bundelkhand region of India, being developed as a production-quality online multiplayer mobile game. The project is a pnpm monorepo targeting a Flutter mobile client backed by a Node.js/Express/Socket.IO server, with a PostgreSQL database managed by Drizzle ORM.

### Architecture Overview
The project follows a clean monorepo architecture with strict package separation:
- `lib/` — shared pure libraries (game engine, DB schema, API codegen targets)
- `artifacts/` — deployable services (API server, mockup sandbox)
- `flutter_client/` — the primary end-user application

### Technology Stack
| Layer | Technology |
|---|---|
| Mobile Client | Flutter 3.19+, Dart SDK ≥3.3.0 |
| State Management (Flutter) | flutter_riverpod ^2.5.1 |
| Navigation (Flutter) | go_router ^14.2.7 |
| HTTP Client (Flutter) | dio ^5.4.3 |
| WebSocket (Flutter) | socket_io_client ^2.0.3 |
| Animation (Flutter) | rive ^0.13.14 |
| Backend Runtime | Node.js (ESM), TypeScript ~5.9.3 |
| Backend Framework | Express ^5.2.1 |
| Realtime | Socket.IO ^4.8.3 |
| Logging | pino ^9.14.0 |
| Database | PostgreSQL 17 |
| ORM | drizzle-orm ^0.45.2 |
| API Spec | OpenAPI 3.1 |
| API Codegen | Orval |
| Test Framework | Vitest ^3.2.7 |
| Build Tool | esbuild 0.27.3 |
| Package Manager | pnpm (workspaces) |
| CI/CD | None configured |
| Monitoring | None configured |
| Crash Reporting | None configured |
| Analytics | None configured |
| Deployment Platform | Replit |

### Repository Size
- **Total source files (non-generated, non-node_modules):** ~65 files
- **Game engine source files:** 13 source + 11 test files
- **Backend source files:** 12 files
- **DB schema files:** 5 files
- **Flutter files:** 2 files (main.dart + pubspec.yaml)
- **Documentation files:** 9 markdown files
- **Total approx. LOC (TypeScript):** ~3,100
- **Total approx. LOC (Dart):** ~104

### Health Scores (0–100)

| Category | Score | Status |
|---|---|---|
| Game Engine | 82 | ✅ Solid foundation |
| Flutter | 5 | ❌ Scaffold only |
| Backend | 18 | ❌ All stubs |
| Database | 40 | ⚠️ Schema defined, not migrated |
| Socket | 15 | ❌ Events wired, all stubs |
| Security | 5 | ❌ Auth completely bypassed |
| Gameplay (Engine) | 75 | ⚠️ Engine done; Rulebook not received |
| Testing | 55 | ⚠️ Engine tested; nothing else tested |
| Documentation | 70 | ✅ Comprehensive architecture docs |
| Production Readiness | 5 | ❌ Pre-alpha |

### Overall Project Score: **32 / 100**
The project has an excellent game engine foundation and thorough documentation. Everything else — backend, Flutter client, auth, socket logic, database — is intentional scaffold/stub awaiting implementation. This is not a failure; it reflects a deliberate phased approach that is well-planned and on track for Phase 0/1.

---

## 2. REPOSITORY INVENTORY

### 2.1 Directory Tree

```
/
├── artifacts/
│   ├── api-server/                    ← Express + Socket.IO backend
│   │   ├── src/
│   │   │   ├── index.ts               ← HTTP server bootstrap
│   │   │   ├── app.ts                 ← Express app factory
│   │   │   ├── lib/
│   │   │   │   └── logger.ts          ← Pino logger config
│   │   │   ├── middlewares/
│   │   │   │   └── auth.ts            ← JWT middleware (STUB)
│   │   │   ├── routes/
│   │   │   │   ├── index.ts           ← Router aggregation
│   │   │   │   ├── health.ts          ← GET /healthz (working)
│   │   │   │   ├── auth.ts            ← Auth routes (STUB)
│   │   │   │   ├── rooms.ts           ← Room routes (STUB)
│   │   │   │   ├── games.ts           ← Game routes (STUB)
│   │   │   │   └── users.ts           ← User routes (STUB)
│   │   │   └── socket/
│   │   │       ├── index.ts           ← Socket.IO setup + namespace init
│   │   │       ├── types.ts           ← Socket event type definitions
│   │   │       └── handlers/
│   │   │           ├── room.handler.ts  ← Lobby handlers (STUB)
│   │   │           ├── game.handler.ts  ← Game handlers (STUB)
│   │   │           └── chat.handler.ts  ← Chat handler (partial, NOT WIRED)
│   │   ├── build.mjs                  ← esbuild build script
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── mockup-sandbox/                ← Vite component preview server
│       ├── src/
│       │   ├── main.tsx
│       │   ├── components/ui/         ← shadcn/ui components (35+ files)
│       │   └── .generated/
│       ├── package.json
│       └── vite.config.ts
├── lib/
│   ├── game-engine/                   ← Pure TS rule engine (COMPLETE)
│   │   ├── src/
│   │   │   ├── types.ts               ← All game types
│   │   │   ├── constants.ts           ← Point values, rank ordering, thresholds
│   │   │   ├── prng.ts                ← Crypto + seeded + fixed RNG
│   │   │   ├── deck.ts                ← Card generation, shuffle, deal
│   │   │   ├── bidding.ts             ← Bidding state machine
│   │   │   ├── trump.ts               ← Trump declaration
│   │   │   ├── turn-order.ts          ← Seat/team navigation
│   │   │   ├── move-validator.ts      ← Follow-suit enforcement
│   │   │   ├── trick.ts               ← Trick evaluation
│   │   │   ├── scoring.ts             ← Round and game scoring
│   │   │   ├── round.ts               ← Full round state machine
│   │   │   ├── replay.ts              ← Event log and replay
│   │   │   ├── engine.ts              ← GameEngine orchestrator class
│   │   │   ├── index.ts               ← Public barrel export
│   │   │   └── __tests__/             ← 11 test files, 214 tests
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   ├── db/                            ← Drizzle ORM schema (not migrated)
│   │   ├── src/
│   │   │   ├── index.ts               ← DB client export
│   │   │   └── schema/
│   │   │       ├── index.ts           ← Schema barrel
│   │   │       ├── users.ts
│   │   │       ├── rooms.ts
│   │   │       ├── games.ts
│   │   │       └── game_states.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── api-spec/                      ← OpenAPI 3.1 specification
│   │   ├── openapi.yaml               ← Source of truth for REST API
│   │   └── orval.config.ts            ← Codegen configuration
│   ├── api-client-react/              ← Generated React Query hooks (EMPTY)
│   └── api-zod/                       ← Generated Zod schemas (EMPTY)
├── flutter_client/                    ← Flutter mobile app (scaffold only)
│   ├── lib/
│   │   └── main.dart                  ← Entry point + placeholder screen
│   ├── pubspec.yaml
│   └── [standard Flutter dirs]        ← android/, ios/, web/, etc.
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GAME_DESIGN.md                 ← Primary gameplay reference
│   ├── DATABASE_SCHEMA.md
│   ├── MULTIPLAYER_DESIGN.md
│   ├── AI_DESIGN.md
│   ├── ROADMAP.md
│   ├── FLUTTER_CLIENT.md
│   ├── RULE_AUDIT.md                  ← Generated this session
│   └── PROJECT_HEALTH_REPORT.md       ← Generated this session
├── scripts/
│   ├── post-merge.sh                  ← pnpm install + drizzle push
│   ├── src/hello.ts
│   └── package.json
├── .agents/memory/                    ← Agent persistent memory
├── package.json                       ← Root workspace config
├── pnpm-workspace.yaml               ← Workspace + catalog definitions
├── tsconfig.json                      ← Project references
├── tsconfig.base.json
├── replit.md                          ← Project overview
├── .replit                            ← Replit workflow configuration
├── .npmrc
└── pnpm-lock.yaml
```

### 2.2 File Inventory

| Path | Purpose | Technology | LOC | Status |
|---|---|---|---|---|
| `artifacts/api-server/src/index.ts` | HTTP server bootstrap | Node.js, http | 34 | KEEP |
| `artifacts/api-server/src/app.ts` | Express app factory | Express 5 | 34 | KEEP |
| `artifacts/api-server/src/lib/logger.ts` | Pino structured logging | Pino 9 | 20 | KEEP |
| `artifacts/api-server/src/middlewares/auth.ts` | JWT middleware | Express | 69 | MODIFY (stub) |
| `artifacts/api-server/src/routes/index.ts` | Route aggregation | Express | 16 | KEEP |
| `artifacts/api-server/src/routes/health.ts` | Health check | Express | 11 | KEEP |
| `artifacts/api-server/src/routes/auth.ts` | Auth REST routes | Express | 26 | MODIFY (stub) |
| `artifacts/api-server/src/routes/rooms.ts` | Room REST routes | Express | 25 | MODIFY (stub) |
| `artifacts/api-server/src/routes/games.ts` | Game REST routes | Express | 22 | MODIFY (stub) |
| `artifacts/api-server/src/routes/users.ts` | User REST routes | Express | 22 | MODIFY (stub) |
| `artifacts/api-server/src/socket/index.ts` | Socket.IO setup | Socket.IO 4 | 157 | MODIFY (stubs+TODO) |
| `artifacts/api-server/src/socket/types.ts` | Socket type definitions | TypeScript | 259 | KEEP |
| `artifacts/api-server/src/socket/handlers/room.handler.ts` | Lobby event handlers | Socket.IO | 88 | MODIFY (stub) |
| `artifacts/api-server/src/socket/handlers/game.handler.ts` | Game event handlers | Socket.IO | 116 | MODIFY (stub) |
| `artifacts/api-server/src/socket/handlers/chat.handler.ts` | Chat handler | Socket.IO | 60 | MODIFY (not wired) |
| `lib/game-engine/src/types.ts` | All game types | TypeScript | 248 | KEEP |
| `lib/game-engine/src/constants.ts` | Game constants | TypeScript | 177 | KEEP |
| `lib/game-engine/src/prng.ts` | RNG implementations | TypeScript | 63 | KEEP |
| `lib/game-engine/src/deck.ts` | Deck operations | TypeScript | 157 | KEEP |
| `lib/game-engine/src/bidding.ts` | Bidding state machine | TypeScript | 194 | KEEP |
| `lib/game-engine/src/trump.ts` | Trump declaration | TypeScript | 75 | KEEP |
| `lib/game-engine/src/turn-order.ts` | Seat/team utilities | TypeScript | 120 | KEEP |
| `lib/game-engine/src/move-validator.ts` | Legal move enforcement | TypeScript | 99 | MODIFY (Kaat missing) |
| `lib/game-engine/src/trick.ts` | Trick evaluation | TypeScript | 137 | KEEP |
| `lib/game-engine/src/scoring.ts` | Score calculation | TypeScript | 156 | MODIFY (ambiguities) |
| `lib/game-engine/src/round.ts` | Round state machine | TypeScript | 523 | MODIFY (minor issues) |
| `lib/game-engine/src/replay.ts` | Event log + replay | TypeScript | 238 | MODIFY (circular dep) |
| `lib/game-engine/src/engine.ts` | GameEngine class | TypeScript | 309 | KEEP |
| `lib/game-engine/src/index.ts` | Barrel export | TypeScript | ~30 | KEEP |
| `lib/game-engine/src/__tests__/bidding.test.ts` | Bidding tests | Vitest | ~180 | KEEP |
| `lib/game-engine/src/__tests__/constants.test.ts` | Constants tests | Vitest | ~90 | KEEP |
| `lib/game-engine/src/__tests__/deck.test.ts` | Deck tests | Vitest | ~220 | KEEP |
| `lib/game-engine/src/__tests__/engine.integration.test.ts` | Integration tests | Vitest | ~260 | KEEP |
| `lib/game-engine/src/__tests__/move-validator.test.ts` | Move validator tests | Vitest | ~120 | KEEP |
| `lib/game-engine/src/__tests__/replay.test.ts` | Replay tests | Vitest | ~90 | MODIFY (incomplete) |
| `lib/game-engine/src/__tests__/round.test.ts` | Round tests | Vitest | ~280 | KEEP |
| `lib/game-engine/src/__tests__/scoring.test.ts` | Scoring tests | Vitest | ~130 | KEEP |
| `lib/game-engine/src/__tests__/trick.test.ts` | Trick tests | Vitest | ~200 | KEEP |
| `lib/game-engine/src/__tests__/trump.test.ts` | Trump tests | Vitest | ~90 | KEEP |
| `lib/game-engine/src/__tests__/turn-order.test.ts` | Turn order tests | Vitest | ~110 | KEEP |
| `lib/db/src/index.ts` | DB client | Drizzle, pg | ~20 | KEEP |
| `lib/db/src/schema/users.ts` | Users + tokens schema | Drizzle | ~80 | KEEP |
| `lib/db/src/schema/rooms.ts` | Rooms schema | Drizzle | ~60 | MODIFY (seat constraint) |
| `lib/db/src/schema/games.ts` | Games + rounds schema | Drizzle | ~120 | MODIFY (seat constraint, phase mismatch) |
| `lib/db/src/schema/game_states.ts` | State snapshots schema | Drizzle | ~40 | MODIFY (phase enum mismatch) |
| `lib/db/src/schema/index.ts` | Schema barrel | Drizzle | ~10 | KEEP |
| `lib/api-spec/openapi.yaml` | REST API contract | OpenAPI 3.1 | 677 | KEEP |
| `lib/api-spec/orval.config.ts` | API codegen config | Orval | ~30 | KEEP |
| `lib/api-client-react/` | Generated hooks | React Query | 0 | UNKNOWN (not generated) |
| `lib/api-zod/` | Generated Zod schemas | Zod | 0 | UNKNOWN (not generated) |
| `flutter_client/lib/main.dart` | Flutter entry point | Dart/Flutter | 104 | MODIFY (scaffold) |
| `flutter_client/pubspec.yaml` | Flutter dependencies | Dart | 82 | KEEP |
| `scripts/post-merge.sh` | Post-merge hook | Bash | 4 | KEEP |
| `docs/ARCHITECTURE.md` | Architecture overview | Markdown | ~200 | KEEP |
| `docs/GAME_DESIGN.md` | Gameplay rules reference | Markdown | ~300 | KEEP (awaiting Rulebook) |
| `docs/DATABASE_SCHEMA.md` | DB design doc | Markdown | ~250 | MODIFY (phase name mismatch) |
| `docs/MULTIPLAYER_DESIGN.md` | Socket protocol design | Markdown | ~300 | KEEP |
| `docs/AI_DESIGN.md` | AI engine design | Markdown | ~150 | KEEP |
| `docs/ROADMAP.md` | Development roadmap | Markdown | ~100 | KEEP |
| `docs/FLUTTER_CLIENT.md` | Flutter architecture plan | Markdown | ~200 | KEEP |
| `docs/RULE_AUDIT.md` | Rule implementation audit | Markdown | ~650 | KEEP |
| `docs/PROJECT_HEALTH_REPORT.md` | Project health report | Markdown | ~500 | KEEP |

### 2.3 Module Inventory

| Module Name | Entry Point | Purpose | Complexity | Maintainability | Risk | Status |
|---|---|---|---|---|---|---|
| `@workspace/game-engine` | `src/index.ts` | Pure game rule engine | High | High | Low | KEEP |
| `@workspace/db` | `src/index.ts` | Drizzle schema + DB client | Medium | High | Medium | MODIFY |
| `@workspace/api-spec` | `openapi.yaml` | REST API contract source | Low | High | Low | KEEP |
| `@workspace/api-client-react` | Not generated | React Query hooks | Unknown | Unknown | High | UNKNOWN |
| `@workspace/api-zod` | Not generated | Zod validation schemas | Unknown | Unknown | High | UNKNOWN |
| `@workspace/api-server` | `src/index.ts` | Express + Socket.IO server | Very High | Medium | Critical | MODIFY |
| `@workspace/mockup-sandbox` | `src/main.tsx` | Component preview server | Low | High | Low | KEEP |
| `flutter_client` | `lib/main.dart` | Flutter mobile app | Low (scaffold) | Unknown | Critical | MODIFY |

### 2.4 Technology Inventory

| Category | Technology | Version | Notes |
|---|---|---|---|
| Language (Backend) | TypeScript | ~5.9.3 | ESM modules |
| Language (Mobile) | Dart | ≥3.3.0 | |
| Runtime | Node.js | System (NixOS) | |
| Mobile Framework | Flutter | ≥3.19.0 | |
| Backend Framework | Express | ^5.2.1 | v5 (beta API) |
| Realtime | Socket.IO | ^4.8.3 | |
| ORM | Drizzle ORM | ^0.45.2 | |
| Database | PostgreSQL | 17 | Replit managed |
| Package Manager | pnpm | System | workspaces |
| Build Tool | esbuild | 0.27.3 | pinned |
| Test Framework | Vitest | ^3.2.7 | |
| API Codegen | Orval | — | in api-spec |
| State Mgmt (Flutter) | Riverpod | ^2.5.1 | |
| Navigation (Flutter) | go_router | ^14.2.7 | |
| HTTP (Flutter) | dio | ^5.4.3 | |
| WebSocket (Flutter) | socket_io_client | ^2.0.3 | |
| Local Storage | hive_flutter | ^1.1.0 | |
| Animation | rive | ^0.13.14 | |
| Audio | just_audio | ^0.9.39 | |
| CI/CD | None | — | Not configured |
| Monitoring | None | — | Not configured |
| Analytics | None | — | Not configured |
| Crash Reporting | None | — | Not configured |

### 2.5 Configuration Inventory

| File | Purpose | Status |
|---|---|---|
| `pnpm-workspace.yaml` | Workspace definition, catalog, security settings | ✅ Well configured |
| `package.json` (root) | Root workspace scripts | ✅ |
| `tsconfig.json` (root) | Project references | ✅ |
| `tsconfig.base.json` | Shared TS config | ✅ |
| `flutter_client/pubspec.yaml` | Flutter deps + assets | ✅ |
| `artifacts/api-server/package.json` | Backend deps | ✅ |
| `lib/game-engine/package.json` | Engine deps (zero runtime) | ✅ |
| `lib/db/package.json` | DB package + push scripts | ✅ |
| `lib/db/drizzle.config.ts` | Drizzle migration config | ✅ |
| `lib/api-spec/orval.config.ts` | Codegen config | ✅ |
| `scripts/post-merge.sh` | Post-merge automation | ✅ |
| `.replit` | Replit workflow config | ✅ |
| `.npmrc` | npm config | ✅ |
| Docker / Docker Compose | Containerization | ❌ Not present |
| GitHub Actions / CI/CD | Automation pipeline | ❌ Not present |
| Firebase config | Firebase | ❌ Not present |
| Environment files (.env) | Runtime config | ❌ None (uses Replit secrets) |
| Feature flags | Runtime feature control | ❌ Not present |
| Build variants | Debug/Release configs | ❌ Not configured |

### 2.6 Documentation Inventory

| File | Purpose | Quality | Issues |
|---|---|---|---|
| `docs/ARCHITECTURE.md` | System architecture overview | High | None |
| `docs/GAME_DESIGN.md` | Gameplay rules (primary reference) | Medium | Not an official Rulebook; has open questions |
| `docs/DATABASE_SCHEMA.md` | DB design documentation | Medium | Phase name mismatch with engine |
| `docs/MULTIPLAYER_DESIGN.md` | Socket protocol design | High | Stubs not yet implemented |
| `docs/AI_DESIGN.md` | AI difficulty design | High | Phase 3+ only |
| `docs/ROADMAP.md` | Development phasing | High | Currently at Phase 0/1 |
| `docs/FLUTTER_CLIENT.md` | Flutter architecture plan | High | Plan only; not implemented |
| `docs/RULE_AUDIT.md` | Rule implementation audit | High | References GAME_DESIGN.md, not official Rulebook |
| `docs/PROJECT_HEALTH_REPORT.md` | Technical health report | High | Current session |
| `replit.md` | Developer quick-reference | Medium | None |
| Missing | Official gameplay Rulebook | — | ⚠️ CRITICAL — not provided |
| Missing | API developer guide | — | Derivable from openapi.yaml |
| Missing | Deployment guide | — | No deployment configured |
| Missing | Onboarding / README | — | replit.md is partial |

### 2.7 Dependency Inventory

**Backend (`@workspace/api-server`) — Runtime:**

| Package | Version | Purpose |
|---|---|---|
| express | ^5.2.1 | HTTP framework |
| socket.io | ^4.8.3 | Realtime communication |
| pino | ^9.14.0 | Structured logging |
| pino-http | ^10.5.0 | HTTP request logging |
| cors | ^2.8.6 | CORS middleware |
| cookie-parser | ^1.4.7 | Cookie parsing |
| drizzle-orm | ^0.45.2 (catalog) | ORM |
| @workspace/api-zod | workspace:* | Request validation |
| @workspace/db | workspace:* | DB schema |

**Backend — Notable Absences:**
- No JWT library (e.g. `jsonwebtoken`, `jose`) — auth not yet implemented
- No argon2/bcrypt — password hashing not yet implemented
- No rate limiting library (e.g. `express-rate-limit`)
- No input validation library beyond Zod (no per-route validators wired)

**Game Engine (`@workspace/game-engine`):**
- Zero runtime dependencies — pure TypeScript. ✅

**Database (`@workspace/db`):**
- drizzle-orm, drizzle-zod, pg, zod

**Flutter (`flutter_client`):**
- See pubspec.yaml — 12 runtime dependencies, all appropriate for planned features.

---

## 3. PROJECT STRUCTURE ANALYSIS

| Dimension | Assessment | Score |
|---|---|---|
| Architecture Style | Monorepo with layered packages (lib → artifacts → client) | Excellent |
| Layer Separation | Clear: types → engine → DB → server → client | Excellent |
| Feature Organization | Feature-per-file in engine; route-per-file in backend | Good |
| Package Organization | pnpm workspaces with catalog for version pinning | Excellent |
| Shared Code Quality | Game engine is exemplary; shared types/models not yet materialised | Good |
| Configuration Quality | pnpm catalog, supply-chain minimumReleaseAge, TypeScript project refs | Excellent |
| Scalability | Architecture supports horizontal scaling; Socket.IO would need Redis adapter | Good |
| Extensibility | Pure function engine is trivially extensible | Excellent |
| Maintainability | Clear file boundaries; heavy use of types | High |
| Code Ownership Boundaries | lib (engine, db) vs artifacts (server) vs client is clean | Excellent |
| Future Modularization Readiness | Yes — feature modules already planned in FLUTTER_CLIENT.md | High |

---

## 4. FLUTTER ARCHITECTURE AUDIT

### 4.1 Feature Inventory

| Feature | Status | Entry Screen | Navigation Path |
|---|---|---|---|
| App bootstrap | KEEP — working | MaterialApp | — |
| State management setup | KEEP — ProviderScope present | main.dart | — |
| Routing (go_router) | UNKNOWN — not configured yet | N/A | Planned in docs |
| Authentication flow | UNKNOWN — not implemented | N/A | Planned in FLUTTER_CLIENT.md |
| Lobby / Room browser | UNKNOWN — not implemented | N/A | Planned |
| Game screen | UNKNOWN — not implemented | N/A | Planned |
| Bidding UI | UNKNOWN — not implemented | N/A | Planned |
| Trump selection UI | UNKNOWN — not implemented | N/A | Planned |
| Card play UI | UNKNOWN — not implemented | N/A | Planned |
| Score/history screen | UNKNOWN — not implemented | N/A | Planned |
| Settings | UNKNOWN — not implemented | N/A | Planned |

### 4.2 Flutter Inspection

| Aspect | Status | Evidence |
|---|---|---|
| Navigation | UNKNOWN | go_router declared in pubspec.yaml; not configured in main.dart |
| Routing | UNKNOWN | No routes defined |
| Theme | UNKNOWN | MaterialApp present; theme not customised |
| Localization | UNKNOWN | flutter_localizations declared; not configured |
| Assets | DECLARED | images, images/cards, animations, audio, fonts — declared in pubspec, not validated as present |
| Fonts | DECLARED | TiroDevanagari, Inter — declared in pubspec |
| Icons | UNKNOWN | Not configured |
| Animations | UNKNOWN | rive declared; not used |
| Responsive Layout | UNKNOWN | Not implemented |
| Accessibility | UNKNOWN | Not implemented |
| Error Screens | UNKNOWN | Not implemented |
| Loading States | UNKNOWN | Not implemented |
| Offline States | UNKNOWN | Not implemented |
| Dialogs | UNKNOWN | Not implemented |
| Bottom Sheets | UNKNOWN | Not implemented |
| Reusable Widgets | UNKNOWN | Not implemented |
| State Management | PARTIAL | ProviderScope wraps app; no providers defined |
| Dependency Injection | UNKNOWN | Riverpod declared; no providers |
| Feature Modules | UNKNOWN | Planned in FLUTTER_CLIENT.md |
| Shared Utilities | UNKNOWN | Not implemented |
| Platform-specific code | UNKNOWN | Not implemented |

### 4.3 Screen Inventory

| Route | Purpose | Status |
|---|---|---|
| `/` (implicit) | Placeholder scaffold screen | Scaffold only |
| All other routes | Not yet defined | UNKNOWN |

### 4.4 Widget Inventory

| Category | Status |
|---|---|
| Reusable Widgets | None implemented |
| Custom Widgets | None implemented |
| Duplicate Widgets | None |
| Unused Widgets | None |
| Generic Components | None |
| Feature Components | None |

---

## 5. STATE MANAGEMENT AUDIT

### Flutter State Management

| Framework | Present | Notes |
|---|---|---|
| Riverpod | YES — ProviderScope declared | No providers yet defined |
| Bloc / Cubit | No | |
| Redux | No | |
| GetX | No | |
| InheritedWidget | No | |
| ValueNotifier | No | |
| Provider (legacy) | No | |

**Assessment:** Riverpod 2.x with code generation (`riverpod_generator`) is the chosen approach. This is a mature, well-suited choice for a complex real-time game. No state is currently managed because no screens or providers have been implemented.

**Memory Risk:** Unknown — no providers to evaluate.

### Backend State (In-Memory)

The backend maintains no in-memory application state today. When game sessions are implemented, active `GameEngine` instances will live in memory per game session. This must use a `Map<gameId, GameEngine>` or equivalent managed structure. No such structure exists yet.

---

## 6. BACKEND ARCHITECTURE AUDIT

### 6.1 Service Inventory

| Layer | Component | Purpose | Status |
|---|---|---|---|
| Bootstrap | `index.ts` | Creates HTTP server, calls initSocketIO | KEEP — working |
| App Factory | `app.ts` | Configures Express, CORS, JSON parsing | KEEP — working |
| Logging | `lib/logger.ts` | Pino structured logger | KEEP — working |
| Middleware | `middlewares/auth.ts` | JWT verification | STUB — passes all |
| Router | `routes/index.ts` | Aggregates sub-routers | KEEP — working |
| Route | `routes/health.ts` | Health check | KEEP — working |
| Route | `routes/auth.ts` | Auth endpoints | STUB |
| Route | `routes/rooms.ts` | Room endpoints | STUB |
| Route | `routes/games.ts` | Game endpoints | STUB |
| Route | `routes/users.ts` | User endpoints | STUB |
| Socket Init | `socket/index.ts` | Namespace creation, auth stub | PARTIAL |
| Socket Types | `socket/types.ts` | Event payload type defs | KEEP |
| Handler | `handlers/room.handler.ts` | Lobby socket events | STUB |
| Handler | `handlers/game.handler.ts` | Game socket events | STUB |
| Handler | `handlers/chat.handler.ts` | Chat events | PARTIAL — not wired |
| Service | `GameService` | Game session management | MISSING |
| Service | `RoomService` | Room/lobby management | MISSING |
| Repository | Database access layer | Queries and mutations | MISSING |
| Validators | Zod schema validators | Input validation | MISSING |
| Schedulers | Timeout / auto-play | Background jobs | MISSING |

### 6.2 Critical Missing Components

1. **No Services layer** — `GameService`, `RoomService` do not exist
2. **No Repository layer** — no DB query functions exist
3. **No validators** — no Zod schemas are wired to any route or socket handler
4. **No JWT library installed** — auth cannot be implemented without adding jsonwebtoken/jose
5. **No argon2/bcrypt installed** — password hashing cannot be implemented
6. **`chat.handler.ts` not imported** in `socket/index.ts` — chat is silently dead

---

## 7. API INVENTORY

### 7.1 Endpoints (from `openapi.yaml` — the contract; from route files — the implementation)

| Method | Path | Purpose | Auth | Implemented | DB Tables | Socket Events |
|---|---|---|---|---|---|---|
| GET | /healthz | Health check | No | ✅ YES | None | None |
| POST | /auth/register | User registration | No | ❌ STUB | users, refresh_tokens | None |
| POST | /auth/login | Username/password login | No | ❌ STUB | users, refresh_tokens | None |
| POST | /auth/guest | Guest session | No | ❌ STUB | users | None |
| POST | /auth/refresh | Token refresh | No | ❌ STUB | refresh_tokens | None |
| POST | /auth/logout | Revoke token | Yes | ❌ STUB | refresh_tokens | None |
| GET | /auth/me | Current user | Yes | ❌ STUB | users | None |
| GET | /users/{id} | Public profile | No | ❌ STUB | users | None |
| PUT | /users/me | Update profile | Yes (full) | ❌ STUB | users | None |
| GET | /users/leaderboard | ELO rankings | No | ❌ STUB | users | None |
| GET | /rooms | List open rooms | No | ❌ STUB | rooms, room_players | lobby:rooms_updated |
| POST | /rooms | Create room | Yes | ❌ STUB | rooms, room_players | lobby:room_updated |
| GET | /rooms/{id} | Room details | No | ❌ STUB | rooms, room_players | None |
| GET | /games/history | User game history | Yes | ❌ STUB | games, game_players | None |
| GET | /games/{id} | Game summary | Yes | ❌ STUB | games, game_rounds | None |

**Validation:** No route has input validation wired. The `openapi.yaml` defines schemas but the generated Zod schemas (`@workspace/api-zod`) have not been generated and are not imported anywhere.

**Error Responses:** No standardized error response format is implemented beyond Express defaults.

**Gameplay Relevance:** All gameplay interactions go through Socket.IO, not REST. REST is for session management and history only. This is the correct design per `ARCHITECTURE.md`.

---

## 8. SOCKET ARCHITECTURE AUDIT

### 8.1 Complete Socket Matrix

#### Lobby Namespace (`/lobby`)

| Event | Direction | Trigger | Payload | Receiver | Validation | Auth | Ack | Retry | Timeout | Reconnect | Dup Prevention | Gameplay | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `lobby:create_room` | C→S | User creates room | name, maxPlayers, targetScore, mode, isPrivate, password | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `lobby:join_room` | C→S | User joins room | roomId, password | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `lobby:leave_room` | C→S | User leaves room | roomId | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `lobby:set_ready` | C→S | User toggles ready | roomId, isReady | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `lobby:kick_player` | C→S | Host kicks player | roomId, targetUserId | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `lobby:chat` | C→S | Chat message | roomId, message | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `lobby:room_updated` | S→C | Room state changed | RoomState | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:player_joined` | S→C | Player joined | PlayerInfo | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:player_left` | S→C | Player left | userId | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:player_ready_changed` | S→C | Ready state changed | userId, isReady | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:chat_message` | S→C (broadcast) | Chat message | sender, message | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:game_starting` | S→C | Game about to start | countdown | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:game_started` | S→C | Game has started | gameId | All in room | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `lobby:rooms_updated` | S→C (broadcast) | Room list changed | RoomSummary[] | All lobby | — | — | — | — | — | ❌ | ❌ | No | STUB |

#### Game Namespace (`/game`)

| Event | Direction | Trigger | Payload | Receiver | Validation | Auth | Ack | Retry | Timeout | Reconnect | Dup Prevention | Gameplay | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `game:join` | C→S | Player enters game | gameId | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | Yes | STUB |
| `game:bid` | C→S | Player places bid | gameId, amount | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | Yes | STUB |
| `game:select_trump` | C→S | Bidder selects trump | gameId, suit | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | Yes | STUB |
| `game:play_card` | C→S | Player plays card | gameId, card | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | Yes | STUB |
| `game:emoji_react` | C→S | Player sends emoji | gameId, emoji | Server | ❌ None | ❌ Stub | ✅ | ❌ | ❌ | ❌ | ❌ | No | STUB |
| `game:state_update` | S→C | State changed | GameStateView | All in game | — | — | — | — | — | ❌ | ❌ | Yes | STUB |
| `game:your_turn` | S→C (private) | It's player's turn | seat, legalMoves | Target player | — | — | — | — | — | ❌ | ❌ | Yes | STUB |
| `game:player_timeout` | S→C | Player timed out | seat | All in game | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `game:player_disconnected` | S→C | Player disconnected | seat | All in game | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `game:player_reconnected` | S→C | Player reconnected | seat | All in game | — | — | — | — | — | ❌ | ❌ | No | STUB |
| `game:emoji_reaction` | S→C (broadcast) | Emoji from player | seat, emoji | All in game | — | — | — | — | — | ❌ | ❌ | No | STUB |

**Critical Finding:** Every single gameplay socket event (`game:bid`, `game:select_trump`, `game:play_card`) returns `{ ok: false, error: "Not implemented" }`. No game logic is wired to the socket layer.

---

## 9. MULTIPLAYER ENGINE AUDIT

| Feature | Status | Evidence |
|---|---|---|
| Lobby Creation | STUB | `room.handler.ts` — TODO only |
| Lobby Join | STUB | `room.handler.ts` — TODO only |
| Lobby Leave | STUB | `room.handler.ts` — TODO only |
| Room Ownership | UNKNOWN | `rooms` table has `hostUserId`; logic not implemented |
| Host Transfer | UNKNOWN | No evidence of implementation |
| Reconnect | UNKNOWN | TODO in `socket/index.ts` L151; `replayEvents()` exists in engine |
| Disconnect Recovery | UNKNOWN | No implementation |
| Spectator Mode | UNKNOWN | Mentioned in MULTIPLAYER_DESIGN.md; no implementation |
| Player Synchronization | UNKNOWN | No implementation |
| Turn Synchronization | UNKNOWN | No implementation |
| Score Synchronization | UNKNOWN | No implementation |
| Latency Handling | UNKNOWN | No implementation |
| Heartbeat | UNKNOWN | Socket.IO built-in ping exists; custom heartbeat not implemented |
| Timeout Handling | UNKNOWN | No implementation |
| State Recovery | UNKNOWN | Engine `replayEvents()` exists; server integration missing |
| Duplicate Player Protection | UNKNOWN | No implementation |
| Race Condition Protection | UNKNOWN | No implementation |
| Authoritative Server Logic | DESIGNED | ARCHITECTURE.md states server-authoritative; not yet implemented |
| Conflict Resolution | UNKNOWN | No implementation |

**Summary:** The multiplayer infrastructure design exists in documentation. The game engine is complete and capable of being wired in. No actual multiplayer logic has been implemented in the server layer.

---

## 10. DATABASE AUDIT

### 10.1 Table Inventory

#### `users`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default gen | |
| username | varchar | Unique, not null | |
| displayName | varchar | Not null | |
| email | varchar | Unique, nullable | null for guests |
| passwordHash | varchar | Nullable | null for guests |
| avatarUrl | varchar | Nullable | |
| eloRating | integer | Default 1200 | |
| gamesPlayed | integer | Default 0 | |
| gamesWon | integer | Default 0 | |
| totalScore | integer | Default 0 | |
| isGuest | boolean | Default false | |
| isBanned | boolean | Default false | |
| createdAt | timestamp | Default now | |
| updatedAt | timestamp | Default now | |
- **Referenced By:** refresh_tokens, rooms, room_players, game_players
- **Status:** KEEP
- **Migration Source:** Drizzle schema — not yet pushed

#### `refresh_tokens`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| userId | UUID | FK → users, cascade delete | |
| tokenHash | varchar | Not null | |
| expiresAt | timestamp | Not null | |
| createdAt | timestamp | Default now | |
| revokedAt | timestamp | Nullable | null = active |
- **Status:** KEEP

#### `rooms`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| code | varchar(6) | Unique | join code |
| name | varchar | Not null | |
| hostUserId | UUID | FK → users | |
| maxPlayers | integer | Check: = 4 | ⚠️ 4 only; 6-player not supported |
| targetScore | integer | Check: IN (300,500,750) | |
| gameMode | varchar | | |
| isPrivate | boolean | Default false | |
| passwordHash | varchar | Nullable | |
| status | varchar | | waiting/playing/finished |
| currentGameId | UUID | FK → games, nullable | |
| createdAt, updatedAt | timestamp | | |
- **Status:** MODIFY — seat constraint issue, 6-player not supported

#### `room_players`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| roomId | UUID | FK → rooms | |
| userId | UUID | FK → users | |
| seat | integer | Check: BETWEEN 0 AND 3 | ⚠️ 6-player needs 0–5 |
| isReady | boolean | Default false | |
| joinedAt | timestamp | | |
- **Unique:** (roomId, userId), (roomId, seat)
- **Status:** MODIFY — seat constraint

#### `games`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| roomId | UUID | FK → rooms | |
| targetScore | integer | | |
| gameMode | varchar | | |
| status | varchar | | active/completed/abandoned |
| currentRound | integer | Default 1 | |
| winningTeam | integer | Nullable | 0 or 1 |
| team0FinalScore | integer | | |
| team1FinalScore | integer | | |
| createdAt, completedAt | timestamp | | |
- **Status:** KEEP

#### `game_players`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| gameId | UUID | FK → games | |
| userId | UUID | FK → users, nullable | null for AI |
| seat | integer | Check: BETWEEN 0 AND 3 | ⚠️ 6-player needs 0–5 |
| team | integer | Check: 0 or 1 | |
| isAi | boolean | Default false | |
| aiDifficulty | varchar | Nullable | |
| tricksWon | integer | Default 0 | |
| pointsCaptured | integer | Default 0 | |
- **Status:** MODIFY — seat constraint

#### `game_rounds`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| gameId | UUID | FK → games | |
| roundNumber | integer | | |
| bidderSeat | integer | | |
| winningBid | integer | | |
| trumpSuit | varchar | Nullable | null = no trump |
| biddingTeam | integer | | |
| bidSucceeded | boolean | | |
| chhakriTeam | integer | Nullable | null = no chhakri |
| team0ScoreDelta, team1ScoreDelta | integer | | round score change |
| team0CumulativeScore, team1CumulativeScore | integer | | running total |
- **Status:** KEEP

#### `game_state_snapshots`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| gameId | UUID | FK → games | |
| roundId | UUID | FK → game_rounds | |
| sequence | bigint | Not null | monotonically increasing |
| eventType | varchar | | matches EventType |
| state | JSONB | Not null | authoritative RoundState snapshot |
| createdAt | timestamp | | |
- **Status:** MODIFY — JSONB shape uses phase names that don't match engine

### 10.2 Database Health

| Check | Status | Notes |
|---|---|---|
| Normalization | ✅ 3NF | No denormalization issues found |
| Duplicate Data | ✅ None | |
| Missing Constraints | ⚠️ Partial | Seat constraints too narrow for 6-player |
| Unused Tables | None | All tables planned for use |
| Large Tables | game_state_snapshots | Will grow rapidly; needs index on (gameId, sequence) |
| Circular Relationships | None | |
| Integrity Risks | ⚠️ Medium | JSONB `state` shape not validated; phase name mismatch |
| Migration Consistency | ❌ None run | No migrations have been applied to any database |

### 10.3 Critical Database Issues

1. **No migrations run** — database does not exist yet
2. **`seat` check constraint `BETWEEN 0 AND 3`** in `room_players` and `game_players` — blocks 6-player mode
3. **`game_state_snapshots.state` JSONB phase names** — schema doc uses `'scoring'` but engine uses `'trick_ended'`, `'round_ended'`, `'game_ended'`
4. **No indexes defined** beyond PKs and unique constraints — `game_state_snapshots` will need `(gameId, sequence)` index

---

## 11. DATA FLOW ANALYSIS

### Happy Path: Player Plays a Card

```
Flutter (game screen)
  └─ socket_io_client.emit('game:play_card', { gameId, card })
       │
       ▼
API Server (Socket.IO /game namespace)
  └─ game.handler.ts → registerGameHandlers()
       │  ─── CURRENTLY RETURNS { ok: false, error: "Not implemented" } ───
       │
       ▼ [PLANNED FLOW]
  GameService.playCard(gameId, userId, card)
       │
       ├─ Validate turn: userId = currentSeat's player
       ├─ Validate card: getLegalMoves(state, seat)
       ├─ Engine: applyPlayCard(state, seat, card) → newState
       ├─ DB: INSERT game_state_snapshots (newState as JSONB)
       │
       ▼
  Socket.IO: game.to(gameId).emit('game:state_update', sanitizedState)
  Socket.IO: game.to(socketId).emit('game:your_turn', { seat, legalMoves })
       │
       ▼
Flutter (all clients)
  └─ Rebuild game UI from new state
```

**Input Validation:** None at any layer currently.
**Transformation:** Engine handles state transformation; no server-side DTO transformation defined.
**Storage:** JSONB snapshot to `game_state_snapshots` — planned, not implemented.
**Retrieval:** `replayEvents()` for reconnection — planned, not implemented.
**Synchronization:** Broadcast via Socket.IO room — designed, not implemented.

---

## 12. API ↔ SOCKET CONSISTENCY CHECK

| Concern | Status | Detail |
|---|---|---|
| REST `POST /rooms` creates room but no Socket.IO sync | ⚠️ RISK | REST and socket `lobby:create_room` may duplicate logic or diverge |
| Socket updates game state without REST endpoint | ✅ BY DESIGN | Gameplay is socket-only per architecture |
| REST `GET /games/{id}` summary with no socket for same | ✅ OK | REST is read-only history |
| No socket event for auth state change | ✅ OK | Auth is REST-only |
| `lobby:room_updated` must fire when REST `POST /rooms` completes | ❌ NOT WIRED | Rooms created via REST won't notify lobby via socket |

**Key Inconsistency:** Room creation (`POST /rooms`) exists in both REST and Socket.IO (`lobby:create_room`). Their relationship is not defined. If both are kept, their behavior must be consistent. If one is removed, the API spec must be updated.

---

## 13. DATABASE ↔ BACKEND CONSISTENCY

| Check | Status | Detail |
|---|---|---|
| Every table has consumers | ❌ NONE | No routes or services query any table |
| Consumer references valid schema | N/A | No consumers exist |
| Orphan tables | None (by design — pre-implementation) | |
| Orphan repositories | None | No repositories exist yet |
| Dead queries | None | No queries exist yet |
| Duplicate repositories | None | |
| `@workspace/db` imported by api-server | ✅ | Listed in package.json dependencies |
| `@workspace/api-zod` imported by api-server | ✅ | Listed; but package is empty |

---

## 14. MODULE COMPLEXITY ANALYSIS

| Module | LOC | Dependencies | Responsibilities | Cyclomatic Complexity | Maintainability | Testability | Overall |
|---|---|---|---|---|---|---|---|
| `types.ts` | 248 | 0 | Type definitions only | Very Low | Very High | N/A | Low |
| `constants.ts` | 177 | 1 | Constants + card utilities | Low | High | High | Low |
| `prng.ts` | 63 | 1 | 3 RNG implementations | Low | High | High | Low |
| `deck.ts` | 157 | 3 | 6 deck operations | Low | High | High | Low |
| `bidding.ts` | 194 | 2 | Bidding state machine | Medium | High | High | Medium |
| `trump.ts` | 75 | 2 | Trump declaration | Low | High | High | Low |
| `turn-order.ts` | 120 | 1 | Seat/team math | Low | High | High | Low |
| `move-validator.ts` | 99 | 3 | Legal move calculation | Medium | High | High | Medium |
| `trick.ts` | 137 | 3 | Trick winner logic | Medium | High | High | Medium |
| `scoring.ts` | 156 | 1 | Round + game scoring | Medium | Medium | High | Medium |
| `round.ts` | 523 | 8 | Full round orchestration | High | Medium | High | High |
| `replay.ts` | 238 | 2 (+ circular) | Event log + replay | Medium | Medium | Medium | Medium |
| `engine.ts` | 309 | 6 | Multi-round game management | High | High | Medium | High |
| `socket/index.ts` | 157 | Many | Namespace setup + auth | Medium | Medium | Low | Medium |
| `socket/types.ts` | 259 | 0 | Type definitions | Very Low | Very High | N/A | Low |
| `game.handler.ts` | 116 | 0 (stubs) | Game event routing | Low (stub) | High | Low | Low |
| `room.handler.ts` | 88 | 0 (stubs) | Room event routing | Low (stub) | High | Low | Low |

---

## 15. TECHNICAL CROSS VERIFICATION

### Flutter ↔ API
| Check | Status |
|---|---|
| Flutter uses dio for REST calls | Declared in pubspec; not implemented |
| Flutter endpoints match openapi.yaml | UNKNOWN — not implemented |
| Auth token management | Planned (dio interceptors); not implemented |

### Flutter ↔ Socket
| Check | Status |
|---|---|
| Flutter uses socket_io_client | Declared in pubspec; not implemented |
| Event names match server definitions | UNKNOWN — not implemented |
| Payload shapes match types.ts | UNKNOWN — not implemented |

### API ↔ Database
| Check | Status |
|---|---|
| REST routes reference correct tables | UNKNOWN — no routes implemented |
| Schema matches openapi.yaml models | Partially — some field name differences (camelCase vs snake_case) |

### Socket ↔ Database
| Check | Status |
|---|---|
| Socket handlers persist state to DB | NOT IMPLEMENTED |
| JSONB snapshot shape matches RoundState | ❌ MISMATCH — phase names differ |

### Backend ↔ Shared Models
| Check | Status |
|---|---|
| api-server imports @workspace/db | ✅ Declared |
| api-server imports @workspace/api-zod | ✅ Declared; package is empty |
| api-server imports @workspace/game-engine | ❌ NOT YET — missing from package.json |

**Critical Finding:** `@workspace/game-engine` is NOT listed as a dependency in `artifacts/api-server/package.json`. The game engine cannot be used by the server without adding this dependency.

### Shared Models ↔ Flutter
| Check | Status |
|---|---|
| Shared TypeScript types usable in Flutter | ❌ Not applicable — different languages; Flutter needs its own models |
| Flutter models planned | Yes — via Freezed + json_serializable per docs |

---

## 16. RULEBOOK TRACEABILITY MATRIX

> ⚠️ **No official Rulebook has been provided.** This matrix uses `docs/GAME_DESIGN.md` as the reference. Once the official Rulebook is provided, every entry marked UNKNOWN or derived from GAME_DESIGN.md must be re-verified.

| # | Rule Name | Description (from GAME_DESIGN.md) | Status | Evidence Files | Evidence Functions | Risk | Notes |
|---|---|---|---|---|---|---|---|
| R-01 | Player Count | 4 players per game | IMPLEMENTED | types.ts, constants.ts | `PlayerCount = 4 \| 6` | Low | 6-player also defined; DB only supports 4 |
| R-02 | Team Formation | Seats 0,2 = Team 0; Seats 1,3 = Team 1 | IMPLEMENTED | turn-order.ts | `seatToTeam()`, `teamSeats()` | Low | Correctly interleaved |
| R-03 | Deck Composition (4P) | 52 cards, A–2, 4 suits | IMPLEMENTED | constants.ts, deck.ts | `generateDeck(4)` | Low | |
| R-04 | Point Values | A=4, K=3, Q=2, J=1, 10=10, 5=5 | IMPLEMENTED | constants.ts | `getPointValue()`, `POINT_VALUES` | Low | Total = 100 verified by test |
| R-05 | Rank Ordering | A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2 | IMPLEMENTED | constants.ts | `getRankValue()` | Low | |
| R-06 | Dealing | Cards shuffled, dealt clockwise | IMPLEMENTED | deck.ts | `shuffleDeck()`, `dealCards()` | Low | Single-card dealing assumed; batch not specified in GAME_DESIGN.md |
| R-07 | Dealer Selection | Random first dealer; rotates clockwise | PARTIALLY IMPLEMENTED | engine.ts, turn-order.ts | `nextDealerSeat()` | Medium | Rotation implemented; first dealer defaults to seat 0, not randomized |
| R-08 | First Bidder | Player left of dealer opens bidding | IMPLEMENTED | bidding.ts | `initBiddingState()` | Low | |
| R-09 | Minimum Bid | 51 | IMPLEMENTED | constants.ts, bidding.ts | `DEFAULT_MIN_BID`, `placeBid()` | Low | |
| R-10 | Maximum Bid | 100 | IMPLEMENTED | bidding.ts | `placeBid()` (rejects > 100) | Low | |
| R-11 | Bid of 100 (Baazi) | Special high-risk bid | PARTIALLY IMPLEMENTED | bidding.ts | `placeBid()` | Medium | Treated as normal bid; no special behavior |
| R-12 | Bidding End | 3 consecutive passes after bid | IMPLEMENTED | bidding.ts, constants.ts | `checkBiddingEnd()`, `PASSES_TO_END_BIDDING=3` | Low | |
| R-13 | All-Pass Redeal | All pass without bid → redeal | IMPLEMENTED | bidding.ts, round.ts | `checkBiddingEnd()`, `applyPass()` | Low | |
| R-14 | Double (Dobla) | Any player before bidding starts may double | PARTIALLY IMPLEMENTED | round.ts | `callDouble()` | Medium | Team restriction not enforced |
| R-15 | Redouble (Char-Guna) | Opposing team may redouble | PARTIALLY IMPLEMENTED | round.ts | `callRedouble()` | Medium | Team restriction not enforced |
| R-16 | Multiplier Values | ×1 / ×2 / ×4 | IMPLEMENTED | types.ts, scoring.ts | `Multiplier`, `calculateRoundScore()` | Low | |
| R-17 | Trump Selector | Winning bidder selects trump | IMPLEMENTED | trump.ts, round.ts | `declareTrump()`, `applyTrumpSelection()` | Low | |
| R-18 | Trump Choices | Any of 4 suits; optional No Trump | IMPLEMENTED | trump.ts | `validTrumpChoices()` | Low | No Trump gated by config flag |
| R-19 | Bidder Leads First | Winning bidder leads trick 1 | IMPLEMENTED | round.ts | `applyTrumpSelection()` | Low | |
| R-20 | Winner Leads Next | Trick winner leads next trick | IMPLEMENTED | round.ts | `completeTrick()` | Low | |
| R-21 | Follow Suit | Must play led suit if held | IMPLEMENTED | move-validator.ts | `getLegalMoves()` | Low | |
| R-22 | Void — Any Card | Void in led suit → any card legal | IMPLEMENTED | move-validator.ts | `getLegalMoves()` | Low | |
| R-23 | Overcut (Kaat) | Must play higher trump if void and higher trump available | MISSING | — | — | HIGH | Not implemented; awaiting Rulebook clarification |
| R-24 | Trump Beats Led Suit | Any trump beats any led-suit card | IMPLEMENTED | trick.ts | `beats()` | Low | |
| R-25 | Highest Trump Wins | Highest trump in trick wins | IMPLEMENTED | trick.ts | `beats()`, `evaluateTrick()` | Low | |
| R-26 | Highest Led Suit Wins | Without trump, highest led-suit card wins | IMPLEMENTED | trick.ts | `beats()` | Low | |
| R-27 | Off-suit Cannot Win | Non-trump, non-led card cannot win | IMPLEMENTED | trick.ts | `beats()` | Low | |
| R-28 | Chhakri Trigger | 6 consecutive tricks by one team → instant round end | IMPLEMENTED | round.ts, constants.ts | `completeTrick()`, `CHHAKRI_THRESHOLD=6` | Low | |
| R-29 | Chhakri Bonus | Chhakri team earns double points | PARTIALLY IMPLEMENTED | scoring.ts | `calculateRoundScore()` | HIGH | Currently doubles BOTH teams — may be incorrect |
| R-30 | Bid-Made Scoring | Bidding team earns bid × multiplier × bonus | IMPLEMENTED | scoring.ts | `calculateRoundScore()` | Low | |
| R-31 | Bid-Failed Scoring | Bidding team loses bid × multiplier × bonus | IMPLEMENTED | scoring.ts | `calculateRoundScore()` | Low | |
| R-32 | Defending Team Earns | Def team earns captured points × multiplier | IMPLEMENTED | scoring.ts | `calculateRoundScore()` | Low | |
| R-33 | Target Score Win | First team to reach target (default 500) wins | IMPLEMENTED | scoring.ts, constants.ts | `applyRoundScore()`, `DEFAULT_TARGET_SCORE=500` | Low | |
| R-34 | Both Cross Target | Both teams cross target → higher score wins | IMPLEMENTED | scoring.ts | `applyRoundScore()` | Low | Tie → Team 0 wins; not in GAME_DESIGN.md |
| R-35 | Doobna | Score ≤ threshold (default -500) → instant loss | PARTIALLY IMPLEMENTED | scoring.ts | `applyRoundScore()` | Medium | Uses `<=`; doc says "below" (strict `<`) |
| R-36 | Jodi (Pair Play) | Regional variant for paired cards | MISSING | — | — | Low | GAME_DESIGN.md acknowledges rule is unclear |
| R-37 | 6-Player Mode | 48 cards (remove 2s), 8 tricks, 3×2 teams | PARTIALLY IMPLEMENTED | constants.ts, deck.ts | `SIX_PLAYER_RANKS`, `generateDeck(6)` | HIGH | No canonical source; DB only supports 4 players |
| R-38 | No Trump Mode | Optional mode; no suit wins tricks | IMPLEMENTED (optional) | trump.ts, types.ts | `allowNoTrump` config flag | Low | Gated behind GameConfig |
| R-39 | Dealer Rotation | Dealer rotates clockwise each round | IMPLEMENTED | turn-order.ts, engine.ts | `nextDealerSeat()` | Low | |
| R-40 | Rematch | Play again with same players | UNKNOWN | — | — | Medium | No evidence in engine or server |

---

## 17. GAMEPLAY ENGINE AUDIT

| Aspect | Status | Evidence | Notes |
|---|---|---|---|
| Player Count | ✅ IMPLEMENTED | `PlayerCount = 4 \| 6` | Both 4 and 6 player |
| Team Formation | ✅ IMPLEMENTED | `seatToTeam()` | Interleaved seating |
| Dealer Selection | ⚠️ PARTIAL | `nextDealerSeat()` | First dealer not randomized |
| Card Distribution | ✅ IMPLEMENTED | `dealCards()` | Fisher-Yates + round-robin |
| Card Order | ✅ IMPLEMENTED | `getRankValue()` | A–2 descending |
| Trump Selection | ✅ IMPLEMENTED | `declareTrump()` | Bidder selects; No-Trump optional |
| Turn Rotation | ✅ IMPLEMENTED | `nextSeat()`, `currentTrickSeat()` | Clockwise |
| Round Progression | ✅ IMPLEMENTED | `round.ts` state machine | Phases: bidding → trump → playing → ended |
| Round Winner | ✅ IMPLEMENTED | `evaluateTrick()`, `buildRoundResult()` | |
| Hand Completion | ✅ IMPLEMENTED | `completeTrick()` → `endRound()` | Chhakri early termination works |
| Score Calculation | ⚠️ PARTIAL | `calculateRoundScore()` | Chhakri bonus ambiguity |
| Penalty Rules (Doobna) | ⚠️ PARTIAL | `applyRoundScore()` | Boundary condition ambiguity |
| Victory Conditions | ✅ IMPLEMENTED | `applyRoundScore()` | Target score + Doobna |
| Match Completion | ✅ IMPLEMENTED | `GameState.winner` | Set when game ends |
| Rematch | ❌ MISSING | — | No evidence |
| Reconnect Behaviour | ⚠️ PARTIAL | `replayEvents()` in replay.ts | Server layer not implemented |
| Host Behaviour | ❌ MISSING | — | No server logic |
| Disconnection Handling | ❌ MISSING | — | No server logic |
| State Persistence | ❌ MISSING | — | Snapshots table defined; not used |
| Synchronization | ❌ MISSING | — | Socket handlers are stubs |

**Key Finding:** `@workspace/game-engine` is NOT listed as a dependency in `artifacts/api-server/package.json`. The engine cannot be used by the server without adding this workspace link.

---

## 18. ZERO ASSUMPTION DETECTOR

The following locations contain assumed or generic gameplay logic that must be verified against the official Rulebook:

| Location | Assumption | Risk |
|---|---|---|
| `constants.ts` — `CHHAKRI_THRESHOLD = 6` | 6 consecutive tricks triggers Chhakri | HIGH — must match Rulebook |
| `constants.ts` — `TOTAL_DECK_POINTS = 100` | Total point value sums to 100 | Low — verifiable mathematically |
| `constants.ts` — `DEFAULT_TARGET_SCORE = 500` | Game ends at 500 | HIGH — Rulebook may differ |
| `constants.ts` — `DEFAULT_MIN_BID = 51` | Minimum bid is 51 | HIGH — Rulebook may differ |
| `constants.ts` — `DEFAULT_DOOBNA_THRESHOLD = -500` | Doobna at -500 | HIGH — Rulebook may differ |
| `constants.ts` — `PASSES_TO_END_BIDDING = 3` | 3 passes end bidding | HIGH — Rulebook may differ |
| `constants.ts` — `SIX_PLAYER_RANKS` (removes 2s) | 2s removed in 6-player mode | HIGH — no source |
| `scoring.ts` — Chhakri bonus `× 2` for both teams | Both teams get double | HIGH — Rulebook may specify only winning team |
| `scoring.ts` — Combined Double + Chhakri = ×4 | Multipliers multiply | MEDIUM — may be additive |
| `move-validator.ts` — void in led suit: any card legal | No overcut restriction | HIGH — Kaat rule may apply |
| `round.ts` — `callDouble()`: any seat may call | No team restriction on Dobla | MEDIUM |
| `round.ts` — `callRedouble()`: any seat may call | No team restriction on Char-Guna | MEDIUM |
| `engine.ts` — first dealer = seat 0 | First dealer is deterministic | Low — server should randomize |
| `bidding.ts` — bid of 100: no special behavior | Baazi treated as normal bid | MEDIUM |
| `scoring.ts` — tie at target: Team 0 wins | Undocumented tiebreaker | MEDIUM |
| `scoring.ts` — `doobnaThreshold` uses `<=` | Score of exactly -500 triggers | LOW — "below" vs "at" ambiguity |
| `replay.ts` — `require('./round.js')` | CJS in ESM context for circular dep | LOW — works now but fragile |

---

## 19. HARDCODED GAME RULE DETECTOR

| Value | Location | Meaning | Hardcoded As |
|---|---|---|---|
| `6` | `constants.ts:CHHAKRI_THRESHOLD` | Consecutive tricks for Chhakri | Named constant ✅ |
| `100` | `constants.ts:TOTAL_DECK_POINTS` | Total card points in deck | Named constant ✅ |
| `500` | `constants.ts:DEFAULT_TARGET_SCORE` | Default winning score | Named constant ✅ |
| `51` | `constants.ts:DEFAULT_MIN_BID` | Minimum allowable bid | Named constant ✅ |
| `-500` | `constants.ts:DEFAULT_DOOBNA_THRESHOLD` | Doobna threshold | Named constant ✅ |
| `3` | `constants.ts:PASSES_TO_END_BIDDING` | Passes required to end bidding | Named constant ✅ |
| `100` | `bidding.ts` | Maximum bid value | Inline — should be named constant |
| `2` | `scoring.ts` | Chhakri bonus multiplier | Inline — should be named constant |
| `4` | `rooms.ts (DB)` | Max players constraint | Inline in DB check |
| `0–3` | `rooms.ts, games.ts (DB)` | Seat range constraint | Inline in DB check |
| `1200` | `users.ts (DB)` | Default ELO rating | Inline |
| `300, 500, 750` | `rooms.ts (DB)` | Valid target score options | Inline in DB check |

**Assessment:** Most game constants are properly extracted to `constants.ts` with named exports. Two inline values (`100` as max bid and `2` as Chhakri multiplier in `scoring.ts`) should be promoted to named constants.

---

## 20. SECURITY AUDIT

| Finding | Severity | Impact | Evidence | Recommendation |
|---|---|---|---|---|
| **Auth middleware passes all requests** | CRITICAL | Any unauthenticated request reaches protected routes | `auth.ts:46` — `next()` called unconditionally | Implement JWT verification before Phase 2 |
| **No JWT library installed** | CRITICAL | Auth cannot be implemented | `api-server/package.json` — no jose/jsonwebtoken | Add `jose` or `jsonwebtoken` |
| **No password hashing library** | CRITICAL | Passwords cannot be stored safely | `api-server/package.json` — no argon2/bcrypt | Add `argon2` |
| **No input validation on any socket event** | HIGH | Malicious payloads reach all handlers | `game.handler.ts`, `room.handler.ts` — no Zod validation | Add Zod parse at top of every handler |
| **No input validation on any REST route** | HIGH | SQL injection, bad data | All route files — no validation | Wire `@workspace/api-zod` schemas |
| **No rate limiting** | HIGH | Brute force, DDoS | No middleware found | Add `express-rate-limit` |
| **SESSION_SECRET present but unused** | HIGH | Secret stored but JWT not implemented | Replit secrets — available but not read | Use it in JWT implementation |
| **No CSRF protection** | MEDIUM | State-changing REST operations vulnerable | No CSRF middleware | Add CSRF tokens or SameSite cookies |
| **Chat messages not sanitized** | MEDIUM | XSS if messages rendered as HTML | `chat.handler.ts` — raw message broadcast | Sanitize before broadcast |
| **No room ownership verification** | MEDIUM | Any user could send kick/modify events | `room.handler.ts` — no host check | Verify hostUserId in handlers |
| **No game turn verification** | HIGH | Any player could play out of turn | `game.handler.ts` — stub returns error but no check | Verify currentSeat in handler |
| **Pino logs request bodies by default** | MEDIUM | Sensitive data may be logged | `app.ts` — pino-http default config | Configure serializers to redact sensitive fields |
| **No token expiry on guest sessions** | MEDIUM | Guest tokens could persist indefinitely | Design gap | Define short TTL for guest JWTs |
| **Socket auth is stub** | CRITICAL | All socket connections accepted without verification | `socket/index.ts:87` — TODO comment | Implement socket JWT handshake |
| **Password hash stored in rooms table** | LOW | Room passwords hashed — good practice | `rooms.ts` schema | Confirm bcrypt/argon2 when implementing |

---

## 21. CHEAT PREVENTION AUDIT

| Protection | Status | Detail |
|---|---|---|
| Server Authoritative Logic | DESIGNED, NOT IMPLEMENTED | Architecture mandates it; no game logic on server yet |
| Client Trust Level | UNKNOWN | No game state sent to clients yet; trust model not defined |
| Client Validation | NOT PRESENT | Flutter client is scaffold only |
| Move Validation | NOT WIRED | `getLegalMoves()` exists in engine; not called from server |
| Card Validation | NOT WIRED | No server-side card ownership verification |
| Turn Validation | NOT WIRED | No server-side current-seat check |
| Score Validation | NOT WIRED | Score computed by engine; not verified against client |
| Reconnect Validation | UNKNOWN | `replayEvents()` available; not wired |
| Duplicate Packet Protection | NOT PRESENT | No sequence-number / idempotency system |
| Replay Protection | NOT PRESENT | No nonce or sequence in socket events |
| Out-of-order Packet Handling | NOT PRESENT | Socket.IO guarantees order within connection; disconnect break is not handled |
| Race Condition Handling | NOT PRESENT | No mutex or atomic operations around game state |
| Cheat Possibilities (current) | None (game is not implemented) | When implemented, critical risks: playing out-of-turn, illegal cards, score manipulation |

---

## 22. PERFORMANCE AUDIT

### Flutter Performance
| Risk | Severity | Notes |
|---|---|---|
| No widgets to evaluate | N/A | Scaffold only |
| Rive animations planned | Medium | Animation rendering is GPU-intensive |
| Large card asset set | Medium | Declared as `assets/images/cards/` — need to verify compression |

### Backend Performance
| Risk | Severity | Notes |
|---|---|---|
| No DB connection pooling config | Medium | `pg.Pool` should be configured with sensible limits |
| JSONB snapshots per move | Medium | Every card play writes a full state snapshot — high write volume |
| Socket.IO single-process | Medium | Single Node.js process; Redis adapter needed for multi-instance |
| No caching layer | Medium | Leaderboard queries will be expensive without cache |
| Pino async logging | Low | Pino is one of the fastest Node.js loggers |

### Socket Performance
| Risk | Severity | Notes |
|---|---|---|
| `game:state_update` sends full state | Medium | Full `RoundState` object per event — consider delta updates |
| No payload compression | Low | Socket.IO supports `perMessageDeflate` — not configured |

### Database Performance
| Risk | Severity | Notes |
|---|---|---|
| `game_state_snapshots` growth | High | One row per move per game; no archival strategy |
| Missing index on `(gameId, sequence)` | High | Full table scan for replay queries |
| Missing index on `rooms(status)` | Medium | Lobby listing will scan all rooms |
| Missing index on `users(eloRating)` | Medium | Leaderboard queries |

---

## 23. TECHNICAL DEBT AUDIT

| Item | Location | Classification | Notes |
|---|---|---|---|
| `requireAuth` calls `next()` unconditionally | `auth.ts:46` | CRITICAL | No JWT verification |
| Socket auth is a stub | `socket/index.ts:87` | CRITICAL | TODO comment |
| `@workspace/game-engine` not in api-server deps | `api-server/package.json` | HIGH | Engine cannot be used by server |
| `replay.ts` uses `require()` in ESM module | `replay.ts:~100` | HIGH | Circular dep workaround; fragile |
| `chat.handler.ts` not imported in socket/index.ts | `socket/index.ts` | HIGH | Chat is silently broken |
| No replay round-trip test | `replay.test.ts` | HIGH | `replayEvents()` not validated end-to-end |
| `api-client-react` and `api-zod` never generated | Both lib packages | HIGH | Codegen must be run |
| All REST routes return stubs | 5 route files | HIGH | No business logic |
| All socket handlers return stubs | 2 handler files | HIGH | No game logic |
| No `GameService` or `RoomService` | — | HIGH | Missing service layer |
| No DB repository layer | — | HIGH | No query functions |
| Max bid `100` hardcoded inline | `bidding.ts` | MEDIUM | Should be named constant |
| Chhakri bonus multiplier `2` inline | `scoring.ts` | MEDIUM | Should be named constant |
| `"dealing"` and `"game_ended"` in `GamePhase` never set | `types.ts` | MEDIUM | Dead type values |
| DB `seat` constraint `0-3` too narrow | `rooms.ts`, `games.ts` | MEDIUM | Blocks 6-player |
| `game_state_snapshots` phase mismatch | `game_states.ts` | MEDIUM | Schema docs use wrong phase names |
| `reconstructBiddingState` recomputes state | `round.ts` | LOW | Workaround; works correctly |
| First dealer always seat 0 | `engine.ts` | LOW | Server should randomize |
| No migrations run | `lib/db` | HIGH | Database does not exist |
| `post-merge.sh` runs `drizzle push` | `scripts/` | MEDIUM | Push (not migrate) risks data loss in production |

---

## 24. DEPENDENCY RISK ANALYSIS

| Package | Risk | Notes |
|---|---|---|
| `express ^5.2.1` | MEDIUM | Express 5 is production-ready as of 2024 but still has fewer ecosystem resources than v4 |
| `drizzle-orm ^0.45.2` | LOW | Actively maintained; rapidly evolving API |
| `drizzle-kit ^0.31.10` | MEDIUM | Dev tool; push vs migrate semantics risk |
| `socket.io ^4.8.3` | LOW | Mature, stable |
| `pino ^9.14.0` | LOW | Mature, stable |
| `vitest ^3.2.7` | LOW | Active development; API stable |
| `esbuild 0.27.3` | LOW | Pinned version; controlled |
| `flutter_riverpod ^2.5.1` | LOW | Stable Riverpod 2.x |
| `go_router ^14.2.7` | LOW | Official Flutter team package |
| `rive ^0.13.14` | LOW | Stable animation package |
| `hive_flutter ^1.1.0` | MEDIUM | Less active maintenance; alternatives exist |
| `socket_io_client ^2.0.3` | MEDIUM | Dart port; less frequently updated than JS |
| `@replit/connectors-sdk ^0.4.1` | LOW | Replit-managed; excluded from minimumReleaseAge |
| Missing: JWT library | HIGH | No jose/jsonwebtoken — blocks auth |
| Missing: argon2/bcrypt | HIGH | No password hashing — blocks registration |
| Missing: rate-limit | HIGH | No DDoS protection |
| `@esbuild-kit/esm-loader` overridden to tsx | LOW | Security override documented in pnpm-workspace.yaml |

---

## 25. CODE QUALITY AUDIT

| Module | Naming | Readability | Consistency | Layer Sep. | SRP | Duplication | Quality Score |
|---|---|---|---|---|---|---|---|
| `types.ts` | Excellent | Excellent | Excellent | ✅ | ✅ | None | 95 |
| `constants.ts` | Excellent | Good | Excellent | ✅ | ✅ | None | 90 |
| `prng.ts` | Excellent | Good | Excellent | ✅ | ✅ | None | 90 |
| `deck.ts` | Excellent | Excellent | Excellent | ✅ | ✅ | None | 92 |
| `bidding.ts` | Excellent | Good | Excellent | ✅ | ✅ | None | 88 |
| `trump.ts` | Excellent | Excellent | Excellent | ✅ | ✅ | None | 92 |
| `turn-order.ts` | Excellent | Excellent | Excellent | ✅ | ✅ | None | 93 |
| `move-validator.ts` | Excellent | Good | Excellent | ✅ | ✅ | None | 87 |
| `trick.ts` | Excellent | Good | Excellent | ✅ | ✅ | None | 88 |
| `scoring.ts` | Good | Good | Good | ✅ | ✅ | None | 82 |
| `round.ts` | Good | Medium | Good | ✅ | ⚠️ Large | Slight | 76 |
| `replay.ts` | Good | Good | Good | ⚠️ Circular | ✅ | None | 72 |
| `engine.ts` | Good | Good | Good | ✅ | ✅ | None | 83 |
| `auth.ts` (backend) | Good | Excellent | Good | ✅ | ✅ | None | 70 (stub) |
| `socket/index.ts` | Good | Good | Good | ✅ | ⚠️ Mixed | None | 72 |
| `socket/types.ts` | Excellent | Excellent | Excellent | ✅ | ✅ | None | 92 |
| Route files | Good | Good | Good | ✅ | ✅ | Slight (stubs) | 65 (stubs) |
| Handler files | Good | Good | Good | ✅ | ✅ | Slight (stubs) | 65 (stubs) |

**Overall Code Quality Score: 82 / 100** — The game engine is of high professional quality. Backend files lose points only because they are intentional stubs; their structure is clean and ready to be implemented.

---

## 26. PRODUCTION READINESS

| Category | Score | Justification |
|---|---|---|
| Architecture | 75 | Design is sound and scalable; monorepo structure is clean |
| Flutter | 5 | Scaffold only; no screens, no navigation, no state |
| Backend | 15 | Express + Socket.IO wired; all business logic is stubs |
| Database | 30 | Schema defined; no migrations run; no queries |
| Socket | 15 | Namespaces created; all handlers stub |
| Security | 5 | Auth bypassed; no validation; no rate limiting |
| Gameplay | 70 | Engine is complete and tested; not wired to server |
| Testing | 45 | 214 engine tests passing; zero backend/integration/E2E tests |
| Documentation | 75 | Comprehensive architecture docs; no official Rulebook |
| Deployment | 5 | No deployment configuration; Replit environment only |
| Monitoring | 0 | No monitoring, alerting, or observability configured |
| Observability | 5 | Pino logging present; no traces, metrics, or dashboards |
| CI/CD | 0 | No pipeline configured |

**Overall Production Readiness: 5 / 100** — This project is in active early development. It is not near production. This is expected and appropriate for Phase 0/1.

---

## 27. AI SAFE REFACTOR CONSTRAINTS

The following constraints are **mandatory** for all future AI-assisted development on this project:

1. **Never change any gameplay rule without citing the official Rulebook.** If the Rulebook has not been received, mark as UNKNOWN and do not implement.

2. **Never remove any working code without explicit evidence** that it is wrong, duplicate, or superseded. "I prefer a different design" is not sufficient justification.

3. **Never replace the architecture** (monorepo structure, Express+Socket.IO, Drizzle, Flutter+Riverpod) without user approval.

4. **Never introduce gameplay assumptions.** If a rule is ambiguous, mark it UNKNOWN and surface it for resolution.

5. **Never silently rename REST API endpoints.** The `openapi.yaml` is the contract. Changes there require regenerating `@workspace/api-zod` and `@workspace/api-client-react`.

6. **Never silently rename socket events.** The event names in `socket/types.ts` are the contract. The Flutter client must match exactly.

7. **Never silently alter the database schema.** Every schema change requires a Drizzle migration (not a push in production) and must update `docs/DATABASE_SCHEMA.md`.

8. **Never refactor beyond the approved scope.** If a task is "implement auth," do not also refactor the routing structure.

9. **Every future implementation task must reference `PROJECT_AUDIT.md`** as the baseline and note which audit findings it resolves.

10. **Never add `@workspace/game-engine` logic to the Flutter client.** All game state is authoritative on the server. The client only renders state it receives.

11. **Never use `drizzle-kit push` in production.** Use `drizzle-kit generate` + `migrate` for production database changes.

12. **Never trust client-supplied seat numbers or card values.** Always derive these from authoritative server state.

---

## 28. MODULE CLASSIFICATION

### KEEP (Working correctly; no modification required)

- `lib/game-engine/src/types.ts`
- `lib/game-engine/src/constants.ts`
- `lib/game-engine/src/prng.ts`
- `lib/game-engine/src/deck.ts`
- `lib/game-engine/src/bidding.ts`
- `lib/game-engine/src/trump.ts`
- `lib/game-engine/src/turn-order.ts`
- `lib/game-engine/src/trick.ts`
- `lib/game-engine/src/engine.ts`
- `lib/game-engine/src/index.ts`
- `lib/game-engine/src/__tests__/*` (except replay.test.ts)
- `lib/api-spec/openapi.yaml`
- `lib/api-spec/orval.config.ts`
- `lib/db/src/schema/users.ts`
- `lib/db/src/schema/games.ts` (pending seat constraint fix)
- `lib/db/src/schema/index.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/logger.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/health.ts`
- `artifacts/api-server/src/socket/types.ts`
- `flutter_client/pubspec.yaml`
- `scripts/post-merge.sh`
- `pnpm-workspace.yaml`
- All `docs/` files

### MODIFY (Needs work; safe to change)

- `lib/game-engine/src/move-validator.ts` — Kaat/overcut rule pending Rulebook
- `lib/game-engine/src/scoring.ts` — Chhakri bonus scope; Doobna boundary; promote magic numbers to constants
- `lib/game-engine/src/round.ts` — Dead `GamePhase` values; `currentBidderSeat` as first-class field
- `lib/game-engine/src/replay.ts` — Fix circular dependency; add round-trip test
- `lib/game-engine/src/__tests__/replay.test.ts` — Add round-trip test
- `lib/game-engine/src/types.ts` — Remove dead `"dealing"` / `"game_ended"` phase values after confirmation
- `lib/db/src/schema/rooms.ts` — seat constraint `0-3` → `0-5`
- `lib/db/src/schema/game_states.ts` — phase name mismatch
- `artifacts/api-server/src/middlewares/auth.ts` — Implement JWT verification
- `artifacts/api-server/src/routes/auth.ts` — Implement registration, login, refresh
- `artifacts/api-server/src/routes/rooms.ts` — Implement room CRUD
- `artifacts/api-server/src/routes/games.ts` — Implement game history
- `artifacts/api-server/src/routes/users.ts` — Implement profile, leaderboard
- `artifacts/api-server/src/socket/index.ts` — Wire chat handler; implement socket auth
- `artifacts/api-server/src/socket/handlers/room.handler.ts` — Implement room logic
- `artifacts/api-server/src/socket/handlers/game.handler.ts` — Implement game logic
- `artifacts/api-server/src/socket/handlers/chat.handler.ts` — Wire into socket/index.ts
- `artifacts/api-server/package.json` — Add `@workspace/game-engine`, `jose`, `argon2`
- `flutter_client/lib/main.dart` — Implement full app
- `docs/DATABASE_SCHEMA.md` — Fix phase names

### REMOVE (None at this stage)

No files meet the REMOVE criteria. No files are unused, duplicate, legacy, or broken in a way that warrants removal.

### UNKNOWN (Insufficient evidence)

- `lib/api-client-react/` — Not generated; contents unknown
- `lib/api-zod/` — Not generated; contents unknown
- All Flutter screens beyond main.dart — Not implemented
- All Flutter state providers — Not implemented
- Room creation via REST vs Socket.IO — Relationship undefined
- Official Rulebook content — Not received

---

## 29. RISK MATRIX

| # | Title | Description | Affected Modules | Probability | Impact | Severity | Recommended Action |
|---|---|---|---|---|---|---|---|
| R1 | Auth completely bypassed | `requireAuth` calls `next()` unconditionally — all protected routes accessible | All routes | Certain | Critical | CRITICAL | Implement JWT before any user-facing testing |
| R2 | No official Rulebook | Gameplay rules implemented from GAME_DESIGN.md assumptions | game-engine, scoring.ts, move-validator.ts | High | High | CRITICAL | Obtain and deliver official Rulebook |
| R3 | Game engine not linked to server | `@workspace/game-engine` missing from api-server dependencies | api-server | Certain (code cannot compile with engine imports) | High | HIGH | Add workspace dependency |
| R4 | Database never migrated | No tables exist; schema push has never been run | All DB tables | Certain | High | HIGH | Run `drizzle-kit push` in development |
| R5 | Overcut (Kaat) not implemented | Players can play lower trump illegally | move-validator.ts | Certain | High | HIGH | Await Rulebook; implement accordingly |
| R6 | Chhakri bonus applies to both teams | May be incorrect per actual rules | scoring.ts | High | High | HIGH | Await Rulebook clarification |
| R7 | Replay circular dependency | `replay.ts` uses `require()` in ESM — will break in bundler | replay.ts | Medium | Medium | HIGH | Refactor to extract events.ts |
| R8 | Replay not round-trip tested | `replayEvents()` correctness unverified | replay.ts | Medium | High | HIGH | Add end-to-end replay test |
| R9 | No input validation anywhere | SQL/logic attacks possible on all endpoints | All routes + handlers | High | High | HIGH | Wire Zod schemas |
| R10 | No rate limiting | Brute force and DDoS possible | All routes | High | Medium | HIGH | Add express-rate-limit |
| R11 | seat constraint blocks 6-player | DB schema only supports seats 0–3 | room_players, game_players | Certain | Medium | MEDIUM | Widen constraint to 0–5 |
| R12 | Phase name mismatch (DB vs engine) | Snapshots with wrong phase names cause deserialization errors | game_state_snapshots | Certain (when wired) | High | HIGH | Fix DB schema phase names |
| R13 | chat.handler.ts not wired | Chat silently broken | socket/index.ts | Certain | Low | MEDIUM | Import and call registerChatHandlers |
| R14 | State serialization (numeric keys) | JSON stringify converts numeric hand keys to strings | game_state_snapshots | High (when wired) | Medium | MEDIUM | Add serialization coercion in persistence layer |
| R15 | Doobna boundary ambiguity | `<=` vs `<` at -500 | scoring.ts | Medium | Low | LOW | Await Rulebook; one-line fix |
| R16 | post-merge.sh uses drizzle push | Push destroys data in production | DB | Medium (if deployed) | Critical | HIGH | Change to generate+migrate for production |
| R17 | No monitoring or alerting | Production failures go undetected | All | Certain | High | HIGH | Add monitoring before production |
| R18 | No CI/CD pipeline | Regressions not caught automatically | All | Certain | Medium | MEDIUM | Add GitHub Actions |
| R19 | 6-player rules not documented | 6-player mode implemented from assumptions only | game-engine (6P paths) | High | Medium | HIGH | Obtain official 6-player rules |

---

## 30. REFACTOR ROADMAP

### PHASE 1 — Critical fixes before development begins

1. **Obtain the official Rulebook** — highest priority; blocks all rule-sensitive implementation
2. **Add `@workspace/game-engine` to `api-server/package.json`** — blocks all server-side gameplay
3. **Run first database migration** — `drizzle-kit push` in development environment
4. **Fix `game_state_snapshots` phase names** — fix before first snapshot write
5. **Widen seat constraint** from `0–3` to `0–5` in room_players and game_players
6. **Refactor `replay.ts` circular dependency** — extract `createEvent` to `events.ts`
7. **Add replay round-trip test** — validate before wiring to server
8. **Wire `chat.handler.ts`** into `socket/index.ts`
9. **Promote inline magic numbers** in scoring.ts and bidding.ts to named constants

### PHASE 2 — Architecture completion

1. **Install JWT library** (`jose`) and implement real auth middleware
2. **Install argon2** for password hashing
3. **Install `express-rate-limit`** and configure limits
4. **Implement `POST /auth/register`** and `POST /auth/login`
5. **Implement `GameService`** and `RoomService` classes
6. **Implement database repository layer** for all tables
7. **Wire Zod validation** to all REST routes and socket handlers
8. **Run API codegen** (`orval`) to populate `api-client-react` and `api-zod`

### PHASE 3 — Gameplay implementation alignment

1. **Implement all socket lobby handlers** — create, join, leave, set_ready, kick
2. **Implement socket game handlers** — join, bid, select_trump, play_card
3. **Wire engine into game sessions** — per-game `GameEngine` instances
4. **Implement state persistence** — snapshot to `game_state_snapshots` after each action
5. **Implement reconnection** — replay events from snapshot on reconnect
6. **Clarify and implement Kaat rule** (pending Rulebook)
7. **Clarify and implement Chhakri bonus scope** (pending Rulebook)

### PHASE 4 — Flutter implementation

1. **Implement routing** via go_router
2. **Implement auth screens** — login, register, guest
3. **Implement lobby screen** — room browser, create/join
4. **Implement game screen** — card table, bidding UI, trump selection
5. **Implement score/history screens**
6. **Wire socket events** to Riverpod providers

### PHASE 5 — Production hardening

1. **Add monitoring** (Sentry or equivalent)
2. **Configure PostgreSQL connection pooling**
3. **Add Socket.IO Redis adapter** for multi-instance support
4. **Add database indexes** (gameId+sequence, rooms.status, users.eloRating)
5. **Configure CI/CD pipeline**
6. **Security penetration testing**
7. **Load testing for socket event throughput**

---

## 31. IMPLEMENTATION BLOCKERS

The following must be resolved before Phase 2 implementation begins:

| # | Blocker | Type | Resolution |
|---|---|---|---|
| B1 | **Official Rulebook not received** | Missing specification | Deliver the approved Rulebook document |
| B2 | **`@workspace/game-engine` not in server deps** | Dependency gap | Add to api-server/package.json |
| B3 | **No JWT library installed** | Missing dependency | Add `jose` to api-server |
| B4 | **No argon2 library installed** | Missing dependency | Add `argon2` to api-server |
| B5 | **Database tables do not exist** | Infrastructure | Run `drizzle-kit push` in development |
| B6 | **Overcut (Kaat) rule unclear** | Rule ambiguity | Await Rulebook |
| B7 | **Chhakri bonus scope unclear** | Rule ambiguity | Await Rulebook |
| B8 | **6-player rules have no canonical source** | Missing specification | Await Rulebook or explicit confirmation |
| B9 | **`api-zod` package is empty** | Codegen not run | Run `orval` codegen |
| B10 | **Phase name mismatch in game_state_snapshots** | Schema inconsistency | Fix before first snapshot write |
| B11 | **Replay system not round-trip tested** | Test gap | Add test before wiring to server |
| B12 | **Doobna boundary condition** | Rule ambiguity | Await Rulebook (`<=` vs `<` at -500) |

---

## 32. PROJECT READINESS MATRIX

| Dimension | Ready? | Score | Reason |
|---|---|---|---|
| **Development Ready** | Partial | 55% | Game engine complete and testable. Server and Flutter need Phase 2 dependencies and services before development can proceed safely. |
| **Testing Ready** | Partial | 45% | Engine has 214 tests. No backend tests, no integration tests, no E2E tests, no Flutter tests. Test infrastructure (Vitest) is in place. |
| **Refactor Ready** | Yes | 80% | Architecture is clean and well-documented. Clear KEEP/MODIFY classification. Good naming and structure makes safe refactoring feasible. |
| **Production Ready** | No | 5% | Auth bypassed, no validation, no DB, no deployment config, no monitoring, no CI/CD. Not suitable for any live traffic. |
| **Maintenance Ready** | Partial | 60% | Documentation is excellent. Game engine is highly maintainable. Backend stubs are clearly marked and easy to replace. |
| **Expansion Ready** | Yes | 75% | Monorepo structure, clean package separation, and injectable engine design make expansion straightforward. AI engine, 6-player mode, and tournament mode are all architecturally compatible. |

---

## MANDATORY EXIT CONDITIONS — VERIFIED

✅ Entire repository inspected  
✅ Every file classified  
✅ Every module classified  
✅ Rulebook compared (noting Rulebook has not been received; GAME_DESIGN.md used as proxy)  
✅ Dependencies mapped  
✅ APIs mapped  
✅ Socket events mapped  
✅ Database mapped  
✅ Security inspected  
✅ Performance inspected  
✅ Technical debt inspected  
✅ Production readiness evaluated  
✅ No code modified  
✅ No dependencies changed  
✅ Read-only mode preserved  

---

*END OF PROJECT_AUDIT.md*
