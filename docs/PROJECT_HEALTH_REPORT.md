# Bundelkhandi Chhakri — Project Health Report

**Date:** 2026-07-19  
**Test status:** 214/214 passing  
**TypeScript:** Clean (0 errors)  
**Phases complete:** Phase 0 (Foundation), Phase 1 (Rule Engine)  
**Phase in progress:** None — awaiting Phase 2 approval

---

## 1. Project Structure

```
/
├── artifacts/
│   ├── api-server/                   ← Express 5 + Socket.IO 4 backend
│   │   └── src/
│   │       ├── routes/               ← auth.ts, rooms.ts, games.ts, users.ts (ALL STUBS)
│   │       ├── socket/               ← types.ts, index.ts, handlers/ (ALL STUBS)
│   │       ├── middlewares/          ← auth.ts (STUB — allows all requests)
│   │       ├── lib/                  ← logger.ts (Pino, working)
│   │       └── index.ts              ← http.createServer + Socket.IO wiring (working)
│   └── mockup-sandbox/               ← Component preview server (Vite)
│
├── lib/
│   ├── game-engine/                  ← ✅ COMPLETE — pure TS rule engine, 214 tests
│   │   └── src/
│   │       ├── types.ts              ← All game types
│   │       ├── constants.ts          ← Point values, rank ordering, deck sizes
│   │       ├── prng.ts               ← cryptoRng + createSeededRng (Mulberry32)
│   │       ├── deck.ts               ← generateDeck, shuffleDeck, dealCards
│   │       ├── bidding.ts            ← Bidding state machine
│   │       ├── trump.ts              ← Trump declaration + isTrump
│   │       ├── turn-order.ts         ← Seat/team helpers
│   │       ├── move-validator.ts     ← getLegalMoves, validateMove
│   │       ├── trick.ts              ← evaluateTrick, beats, point counting
│   │       ├── scoring.ts            ← calculateRoundScore, applyRoundScore
│   │       ├── round.ts              ← Full round state machine
│   │       ├── replay.ts             ← Event log + replay
│   │       ├── engine.ts             ← GameEngine orchestrator class
│   │       ├── index.ts              ← Public barrel export
│   │       └── __tests__/            ← 11 test files, 214 tests
│   ├── db/                           ← ✅ Drizzle ORM schema (not migrated yet)
│   │   └── src/schema/               ← users, rooms, games, game_states
│   ├── api-spec/                     ← ✅ OpenAPI 3.1 spec (stub routes documented)
│   ├── api-client-react/             ← ⚠️ Codegen target — not yet generated
│   └── api-zod/                      ← ⚠️ Codegen target — not yet generated
│
├── flutter_client/                   ← ⚠️ Scaffold only (pubspec.yaml + main.dart)
│
└── docs/
    ├── ARCHITECTURE.md               ← ✅ Complete
    ├── GAME_DESIGN.md                ← ✅ Complete (but 10 open questions — see RULE_AUDIT.md)
    ├── DATABASE_SCHEMA.md            ← ✅ Complete
    ├── MULTIPLAYER_DESIGN.md         ← ✅ Complete
    ├── AI_DESIGN.md                  ← ✅ Complete
    ├── ROADMAP.md                    ← ✅ Complete
    ├── FLUTTER_CLIENT.md             ← ✅ Complete
    ├── RULE_AUDIT.md                 ← ✅ NEW — this audit
    └── PROJECT_HEALTH_REPORT.md      ← ✅ NEW — this report
```

---

## 2. Completed Modules

### 2.1 `lib/game-engine` — Rule Engine ✅

The only fully complete package. Pure TypeScript, zero runtime dependencies. 214 tests passing across 11 test files. TypeScript compiles clean with `--noEmit`.

| Module | Status | Tests |
|---|---|---|
| `types.ts` — all game types | ✅ | — |
| `constants.ts` — point values, rank ordering | ✅ | `constants.test.ts` (11 tests) |
| `prng.ts` — crypto + seeded + fixed RNG | ✅ | (exercised via deck tests) |
| `deck.ts` — generate, shuffle, deal | ✅ | `deck.test.ts` (27 tests) |
| `bidding.ts` — bidding state machine | ✅ | `bidding.test.ts` (23 tests) |
| `trump.ts` — trump declaration | ✅ | `trump.test.ts` (11 tests) |
| `turn-order.ts` — seat/team helpers | ✅ | `turn-order.test.ts` (14 tests) |
| `move-validator.ts` — follow-suit enforcement | ✅ | `move-validator.test.ts` (9 tests) |
| `trick.ts` — trick winner + point counting | ✅ | `trick.test.ts` (22 tests) |
| `scoring.ts` — round + game scoring | ✅ | `scoring.test.ts` (12 tests) |
| `round.ts` — full round state machine | ✅ | `round.test.ts` (29 tests) |
| `replay.ts` — event log + replay | ⚠️ | `replay.test.ts` (9 tests — partial) |
| `engine.ts` — GameEngine orchestrator | ✅ | `engine.integration.test.ts` (20 tests) |

**Invariants verified by the test suite:**
- All 52 (4P) / 48 (6P) cards are dealt with no duplicates
- Point values sum to exactly 100 per deck
- Seeded RNG produces identical game outcomes across runs
- `capturedPoints[0] + capturedPoints[1] = 100` after normal round completion (10 seed samples)
- Chhakri fires correctly and ends the round immediately
- Scores accumulate correctly across multiple rounds
- Dealer rotates clockwise each round
- Win conditions (target score + Doobna) trigger correctly

---

### 2.2 `lib/db` — Database Schema ✅

Drizzle ORM schema files for all tables. TypeScript-typed. Schema has not been pushed to a database — no migration has been run. No seed script exists yet (documented as future work in `DATABASE_SCHEMA.md`).

**Tables defined:** `users`, `refresh_tokens`, `rooms`, `room_players`, `games`, `game_players`, `game_rounds`, `game_state_snapshots`

---

### 2.3 `lib/api-spec` — OpenAPI Specification ✅

Full OpenAPI 3.1 YAML covering auth, rooms, games, and user endpoints. All routes have request/response schemas. The spec is the source of truth for REST API contract. Codegen has not been run.

---

### 2.4 `docs/` — Architecture Documentation ✅

All seven planning documents are complete: ARCHITECTURE.md, GAME_DESIGN.md, DATABASE_SCHEMA.md, MULTIPLAYER_DESIGN.md, AI_DESIGN.md, ROADMAP.md, FLUTTER_CLIENT.md.

---

## 3. Incomplete Modules

### 3.1 `artifacts/api-server` — Backend ⚠️ (Skeleton Only)

The Express + Socket.IO server starts correctly and logs to stdout. However, every business-logic handler is a stub.

| Component | Status | Notes |
|---|---|---|
| HTTP server wiring | ✅ Working | `http.createServer(app)` + `initSocketIO()` |
| Logger (Pino) | ✅ Working | Structured JSON logging |
| Routes: `GET /api/health` | ✅ Working | Returns `{ status: "ok" }` |
| Auth middleware (`requireAuth`) | ❌ Stub | Passes all requests — no JWT verification |
| `POST /api/auth/register` | ❌ Stub | Returns placeholder |
| `POST /api/auth/login` | ❌ Stub | Returns placeholder |
| `GET /api/rooms` | ❌ Stub | Returns `{ rooms: [] }` |
| `GET /api/games/history` | ❌ Stub | Returns `{ games: [] }` |
| Socket.IO `/lobby` namespace | ❌ Stub | All handlers `ack({ ok: false })` |
| Socket.IO `/game` namespace | ❌ Stub | All handlers `ack({ ok: false })` |
| Chat handler | ❌ Not wired | `registerChatHandlers` exists but is not imported in `socket/index.ts` |
| `GameService` | ❌ Does not exist | No `src/services/` directory |
| `RoomService` | ❌ Does not exist | No `src/services/` directory |

---

### 3.2 `lib/api-client-react` — Generated Hooks ⚠️

Target directory exists but codegen has not been run. Generated React Query hooks are needed only for a future web debug client, not the Flutter app. Low priority.

---

### 3.3 `lib/api-zod` — Generated Zod Schemas ⚠️

Target directory exists but codegen has not been run. Zod schemas would be used for server-side request validation once the real routes are implemented.

---

### 3.4 `flutter_client/` — Mobile Client ⚠️ (Scaffold Only)

`pubspec.yaml` and a minimal `main.dart` exist. No screens, no state management, no API client, no Socket.IO integration. All of Phase 1 and Phase 2 Flutter work is future.

---

### 3.5 AI Engine — Does Not Exist

No AI code has been written. AI architecture is documented in `docs/AI_DESIGN.md` but implementation is Phase 3.

---

## 4. Technical Debt

### TD-1 · `replay.ts` Uses `require()` in ESM Context — HIGH RISK
**File:** `lib/game-engine/src/replay.ts:214`  
**Issue:** `applyReplayEvent()` uses `require('./round.js')` inside the function body to break a circular import (`round.ts` imports `createEvent` from `replay.ts`; `replay.ts` imports `applyBid` etc. from `round.ts`). This works in Node.js with `--experimental-require-module` and in Vitest's transform mode, but will silently fail or throw in a strict ESM bundler.  
**Risk:** High — if the server ever bundles `game-engine`, this breaks.  
**Fix:** Extract `createEvent` and related event utilities into a new `lib/game-engine/src/events.ts` file. Both `round.ts` and `replay.ts` import from there. Eliminates the circular dependency cleanly.

---

### TD-2 · Replay Round-Trip Not Tested — MEDIUM RISK
**File:** `lib/game-engine/src/__tests__/replay.test.ts`  
**Issue:** `replayEvents()` (the full round-trip replay function) has no test that plays a complete round, captures the event log, replays it, and verifies the final state matches. Only `createEvent`, `getEventsByType`, and `summariseEvents` are tested.  
**Risk:** Medium — the replay system is a core feature for reconnection and spectator mode. Bugs in `applyReplayEvent` could go undetected until Phase 2.  
**Fix:** Add a test that plays a full 4-player round, captures `state.events`, calls `replayEvents(events, config)`, and asserts the replayed state matches the original.

---

### TD-3 · `registerChatHandlers` Not Wired — LOW RISK
**File:** `artifacts/api-server/src/socket/index.ts`  
**Issue:** `registerChatHandlers` exists in `socket/handlers/chat.handler.ts` but is not imported or called in `socket/index.ts`. Chat is silently non-functional.  
**Risk:** Low right now (Phase 0 stub), but easy to forget when Phase 2 wires the other handlers.  
**Fix:** Add the import and call in `socket/index.ts` when wiring Phase 2 handlers.

---

### TD-4 · `"dealing"` and `"game_ended"` GamePhase Values Are Dead Code — LOW RISK
**File:** `lib/game-engine/src/types.ts` — `GamePhase`  
**Issue:** `GamePhase` includes `"dealing"` and `"game_ended"` as valid values, but neither is ever set by the engine. `initRound()` immediately enters `"bidding"`. Game end is signaled by `GameState.winner !== null`, not by a phase transition.  
**Risk:** Low, but could confuse server-side code that switches on `currentRound.phase` to detect game end.  
**Fix:** Either remove the dead values from the union, or document explicitly that `"dealing"` is reserved for future async dealing animation and `"game_ended"` is intentionally unused in favour of `GameState.winner`.

---

### TD-5 · `reconstructBiddingState` Is a Derived Computation, Not First-Class State — LOW RISK
**File:** `lib/game-engine/src/round.ts:508`  
**Issue:** The current bidder seat is recomputed from `(firstSeat + bids.length) % playerCount` every time `applyBid` or `applyPass` is called. This is a workaround for not storing `currentBidderSeat` directly in `RoundState`. It works correctly but is fragile if the bid-count formula ever changes (e.g., if a "bid withdrawn" action is added).  
**Risk:** Low (current rules have no bid withdrawal), but worth tracking.  
**Fix:** Add `currentBidderSeat: number | null` as a first-class field in `RoundState`, set explicitly on each bid/pass.

---

### TD-6 · Auth Middleware Passes Everything — CRITICAL (Security)
**File:** `artifacts/api-server/src/middlewares/auth.ts`  
**Issue:** `requireAuth()` calls `next()` unconditionally. All protected routes currently accept unauthenticated requests.  
**Risk:** Critical for any environment beyond local development. Must be resolved in Phase 2 before any live testing.  
**Fix:** Implement real JWT verification using `SESSION_SECRET` (which is already stored as a Replit secret).

---

### TD-7 · DB Schema Mismatches with Engine Types — MEDIUM RISK
Two specific mismatches between `docs/DATABASE_SCHEMA.md` / Drizzle schema and the engine:

**A. `game_state_snapshots.phase` enum mismatch:**
- DB schema JSONB shape uses: `'dealing' | 'bidding' | 'trump_selection' | 'playing' | 'scoring'`
- Engine uses: `'dealing' | 'bidding' | 'trump_selection' | 'playing' | 'trick_ended' | 'round_ended' | 'game_ended'`
- Mismatch: `'scoring'` (DB) vs `'trick_ended' | 'round_ended' | 'game_ended'` (engine). `'scoring'` does not exist in the engine.

**B. `room_players.seat` and `game_players.seat` constraint:**
- Both tables constrain `seat BETWEEN 0 AND 3`, which excludes seats 4 and 5 needed for 6-player mode.

**Risk:** Medium — these mismatches will cause constraint violations or deserialization errors when the server persists engine state in Phase 2.  
**Fix:** Update `DATABASE_SCHEMA.md` and the Drizzle schema to use the engine's actual phase names and expand the seat constraint to `0 AND 5`.

---

### TD-8 · `consecutiveWins` Tracks Streaks Per Team, Not Per Player
**File:** `lib/game-engine/src/round.ts`; `lib/game-engine/src/types.ts`  
**Issue:** `consecutiveWins: [number, number]` is indexed by team. When Team A wins a trick, their count increments and Team B's resets. This is the correct semantics for Chhakri detection. However, the DB schema field `consecutiveTricksBySeat` in `game_state_snapshots` suggests a per-seat tracking model, which does not match.  
**Risk:** Low (serialization discrepancy, not a logic bug).  
**Fix:** Align the DB schema field to match the engine's team-indexed model.

---

## 5. Rule Gaps (from Rule Audit)

The following game rule gaps were identified in the audit. They are listed here because they affect Phase 2 implementation decisions:

| Gap | Severity | Details |
|---|---|---|
| **Overcut (Kaat) not enforced** | HIGH | When void in led suit and cutting trump, no check that a higher trump is played if available. Needs rule clarification first. |
| **Chhakri bonus scope unclear** | HIGH | Does ×2 apply to both teams or only the triggering team? Current code applies to both. |
| **Doobna boundary condition** | MEDIUM | Code uses `<=` (score of exactly -500 triggers Doobna). Design says "below -500" (strict `<`). |
| **Dobla team restriction not enforced** | MEDIUM | Any seat can call Double; design may restrict to opposing team. |
| **Redouble team restriction not enforced** | MEDIUM | Any seat can Redouble; design says "opposing team may call Redouble." |
| **Baazi (bid of 100) no special rule** | LOW | Treated as a normal bid. May have special scoring or instant-win rules. |
| **Redeal dealer policy** | LOW | Engine fires a `redeal` event; server layer must decide whether same dealer re-deals or deal rotates. |
| **Replay not round-trip tested** | LOW | `replayEvents()` is functional but untested end-to-end. |
| **Jodi (Pair Play) not implemented** | LOW | Design doc acknowledges this is unclear. Deferred. |

See `docs/RULE_AUDIT.md` for the full breakdown of all 10 open questions.

---

## 6. Files Needing Attention Before Phase 2

Listed in priority order:

| Priority | File | Issue |
|---|---|---|
| 🔴 HIGH | `artifacts/api-server/src/middlewares/auth.ts` | Implement real JWT verification. Phase 2 cannot proceed without this. |
| 🔴 HIGH | `lib/game-engine/src/replay.ts` | Refactor circular dependency (`require()` → extract `events.ts`). |
| 🔴 HIGH | `lib/game-engine/src/__tests__/replay.test.ts` | Add round-trip replay test. |
| 🟡 MEDIUM | `lib/db/src/schema/game_states.ts` | Fix phase names to match engine (`scoring` → `trick_ended`, `round_ended`, `game_ended`). |
| 🟡 MEDIUM | `lib/db/src/schema/rooms.ts` + `games.ts` | Expand seat constraint from `0–3` to `0–5` for 6-player support. |
| 🟡 MEDIUM | `lib/game-engine/src/move-validator.ts` | Overcut (Kaat) rule — pending rule clarification. |
| 🟡 MEDIUM | `lib/game-engine/src/scoring.ts` | Chhakri bonus scope — pending rule clarification. |
| 🟢 LOW | `artifacts/api-server/src/socket/index.ts` | Wire `registerChatHandlers`. |
| 🟢 LOW | `lib/game-engine/src/types.ts` | Remove or document dead `"dealing"` and `"game_ended"` phase values. |
| 🟢 LOW | `lib/game-engine/src/round.ts` | Add `currentBidderSeat` as first-class field to `RoundState`. |

---

## 7. Possible Future Risks

### R-1 · State Serialization / Deserialization
The engine's `RoundState` and `GameState` will need to be serialized to JSONB in PostgreSQL and deserialized on reconnect. The engine uses TypeScript's `Record<number, CardCode[]>` for hands (`hands: Record<number, CardCode[]>`). JSON serialization converts numeric keys to strings (`"0"`, `"1"` etc.), which may break lookups at deserialization without explicit coercion. This is a **known footgun** that will surface the first time a state snapshot is round-tripped through the database.

### R-2 · Reconnection During Active Trick
The reconnection logic in Phase 2 must replay events to reconstruct state, but the `replayEvents()` function is not yet round-trip tested (TD-2). A reconnecting player in the middle of a trick could receive an incorrect state.

### R-3 · Timeout / Auto-Play Not Designed
The ROADMAP mentions "Auto-play on timeout (legal random move)" as a Phase 4 feature. However, if a player disconnects mid-game and the auto-play mechanism is not in place, a game will permanently stall. This needs to be considered in Phase 2's game session design, even if the full auto-play feature is Phase 4.

### R-4 · 6-Player Rules Not Documented
All 6-player logic (48-card deck, 8 tricks, 3×2 team structure, Chhakri threshold) is extrapolated without a canonical source. If a 6-player game is released without verification, the rules may not match regional expectations.

### R-5 · No Rate Limiting or Input Validation
The API server currently has no Zod validation on Socket.IO events and no rate limiting on any endpoint. A malicious client could send arbitrary payloads to game handlers. Phase 2 must include Zod validation on all Socket.IO event payloads.

### R-6 · Single RNG Instance Per Game Engine
The `GameEngine` class holds one `RangeRng` instance. In a multi-round game, the same RNG state continues across rounds (the Mulberry32 state accumulates). This is correct for production (each call produces a new random number) but means that a game can only be replayed deterministically by knowing the initial seed and replaying ALL rounds in sequence — you cannot independently replay a single round in the middle of a game without replaying all prior rounds first.

### R-7 · No Game State Versioning
`RoundState` has no schema version field. If Phase 2 or Phase 3 adds new fields to `RoundState` and old snapshots are loaded from the database, deserialization will produce objects with missing fields. Consider adding a `schemaVersion` field to `GameState` before the first DB persistence.

---

## 8. Recommended Next Phase (Phase 2)

Based on the health report, Phase 2 should proceed in this order:

### Step 1 — Resolve Rule Ambiguities (Before Writing Code)
Answer the 10 open questions in `docs/RULE_AUDIT.md`, minimally:
1. Overcut (Kaat) rule — HIGH impact on `move-validator.ts`
2. Chhakri bonus scope — HIGH impact on `scoring.ts`
3. Doobna boundary — MEDIUM impact on `scoring.ts`
4. Redeal dealer policy — impacts server-side round restart logic

### Step 2 — Fix Technical Debt First
Before adding any new code:
- Fix the `replay.ts` circular dependency (TD-1) — prevents future bundler breakage
- Add the replay round-trip test (TD-2) — de-risks reconnection
- Fix DB schema phase names and seat constraints (TD-7) — prevents constraint violations

### Step 3 — Auth Infrastructure
- Implement real JWT verification in `auth.ts` middleware using `SESSION_SECRET`
- Implement `POST /api/auth/register` and `POST /api/auth/login` with Argon2id password hashing
- Implement guest login (ephemeral JWT)
- Implement JWT refresh token flow

### Step 4 — Room / Lobby Service
- Create `artifacts/api-server/src/services/room.service.ts`
- Wire `registerLobbyHandlers` in `socket/index.ts`
- Implement: create room, join room, leave room, set ready, kick player
- Run Drizzle schema push to create tables

### Step 5 — Game Session Service
- Create `artifacts/api-server/src/services/game.service.ts` — wraps `GameEngine` from `@workspace/game-engine`
- Wire `registerGameHandlers` in `socket/index.ts`
- Implement: game start, deal, bidding, trump selection, card play, trick resolution, round scoring, game end
- Implement state snapshot persistence to `game_state_snapshots`
- Implement reconnection via `replayEvents()`

### Step 6 — Integration Testing
- Test a complete 4-player game from registration through to game end via the Socket.IO protocol
- Test reconnection mid-game

---

## 9. Current Test Coverage Summary

| Package | Tests | Pass | Fail | Coverage |
|---|---|---|---|---|
| `@workspace/game-engine` | 214 | 214 | 0 | Core rules fully covered; replay round-trip missing |
| `@workspace/api-server` | 0 | — | — | No tests exist |
| `@workspace/db` | 0 | — | — | No tests exist |

**Total: 214/214 tests passing. TypeScript: 0 errors.**

---

## 10. Summary

The project is in a **solid and honest state**. Phase 1 delivered exactly what was scoped: a complete, pure, well-tested rule engine. The rest of the project is intentional scaffolding and documented stubs — nothing is broken, nothing is silently incorrect, and the division between "complete" and "stub" is always marked with a clear TODO comment.

The two biggest risks before Phase 2 are:

1. **Rule ambiguities** — 10 open questions that affect code already written (Chhakri bonus scope, Kaat enforcement, Doobna boundary). These must be answered before Phase 2 rule engine modifications begin.
2. **Auth middleware** — the stub `requireAuth` that passes all requests must be replaced before any user-facing testing.

Everything else is ordered technical debt with a clear fix path.

**Awaiting your approval to proceed with Phase 2.**
