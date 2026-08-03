# Bundelkhandi Chhakri

A production-grade, real-time multiplayer card game built with Node.js/TypeScript backend and Flutter mobile client.

## Project structure

This is a **pnpm monorepo** with three layers:

```
lib/                        # Shared TypeScript libraries
  game-engine/              # Core card game logic (bidding, trick-play, scoring, AI)
  db/                       # Drizzle ORM schema + migrations (PostgreSQL)
  api-spec/                 # Shared types / Zod schemas for API contracts

artifacts/
  api-server/               # Express 5 + Socket.IO backend (entry: src/index.ts)

flutter_client/             # Flutter 3.x mobile client (entry: lib/main.dart)

docs/                       # Architecture, game design, roadmap, audit docs
scripts/                    # Utility scripts
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20+, Express 5, Socket.IO 4, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Shared logic | Zod, TypeScript project references |
| Mobile client | Flutter 3.x, Dart 3.x, Riverpod 2, GoRouter, Dio, Socket.IO client |

## Key architecture notes

- **Two Socket.IO namespaces:** `/lobby` (room browsing) and `/game` (live game + voice + admin)
- **Auth:** JWT Bearer token in `socket.handshake.auth.token` (uses `SESSION_SECRET`)
- **AI players:** `lib/game-engine/src/ai.ts` → `pickAiAction()` for bot seat fills
- **One-device enforcement:** second connection for same userId forcibly disconnects the first

## Running the backend (when ready)

```bash
# 1. Install dependencies
pnpm install

# 2. Set up PostgreSQL (Replit managed database recommended)

# 3. Build shared libs (order matters)
pnpm --filter @workspace/db exec tsc
pnpm --filter @workspace/game-engine exec tsc

# 4. Run migrations
pnpm --filter @workspace/db run migrate

# 5. Start dev server
pnpm --filter api-server run dev
```

Requires the `SESSION_SECRET` environment variable (already configured in Replit secrets).

## Flutter client

```bash
cd flutter_client
flutter pub get
flutter run          # requires Flutter SDK + emulator/device
```

Note: `ConnectionState` from `lib/models/game_state.dart` conflicts with `flutter:foundation` — use `import ... as gs` alias.

## Development status

All 51 implementation milestones (MIG-001 → MIG-051) complete. Test baseline: 384 engine + 69 api-server = **453 tests**, all green.

See `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, and `docs/ROADMAP.md` for deeper context.

## User preferences

_None recorded yet._
