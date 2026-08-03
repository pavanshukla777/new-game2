# Official Migration Plan
## Volume 3 — Part 8 | Bundelkhandi Chhakri

**Authority:** Gap Register (GAP-001 to GAP-051)
**Total Migration Items:** 51 (MIG-001 through MIG-051)
**Traceability:** Every MIG-ID maps 1:1 to a GAP-ID

---

## PHASE 1 — FOUNDATION (MIG-001 to MIG-016)
*P0 Critical — must be complete before any Phase 2 item begins*

| MIG-ID | GAP-ID | Rulebook Section | Responsible Module | Affected Files | Phase |
|---|---|---|---|---|---|
| MIG-001 | GAP-025 | Card Zone Structure | `@workspace/game-engine` | `lib/game-engine/src/types.ts` | 1 |
| MIG-002 | GAP-002 | Deck Construction | `@workspace/game-engine` | `lib/game-engine/src/deck.ts` | 1 |
| MIG-003 | GAP-029 | Scoring — trick count model | `@workspace/game-engine` | `lib/game-engine/src/scoring.ts` | 1 |
| MIG-004 | GAP-015 | Bidding — valid values | `@workspace/game-engine` | `lib/game-engine/src/bidding.ts`, `constants.ts` | 1 |
| MIG-005 | GAP-036 | Validation Chain — Identity | `@workspace/api-server` | `src/middleware/auth.ts` | 1 |
| MIG-006 | GAP-004 | Player Seating — room constraint | `@workspace/db` | `lib/db/src/schema.ts` | 1 |
| MIG-007 | GAP-005 | Player Seating — game constraint | `@workspace/db` | `lib/db/src/schema.ts` | 1 |
| MIG-008 | GAP-009 | Deck Construction — maxPlayers | `@workspace/db` | `lib/db/src/schema.ts` | 1 |
| MIG-009 | GAP-012 | Admin System — Dual Admin DB | `@workspace/db` | `lib/db/src/schema.ts` | 1 |
| MIG-010 | GAP-022 | Reconnection — connection state | `@workspace/db`, `@workspace/api-server` | `lib/db/src/schema.ts`, `src/socket/types.ts` | 1 |
| MIG-011 | GAP-018 | Bidding — winningBid constraint | `@workspace/db` | `lib/db/src/schema.ts` | 1 |
| MIG-012 | GAP-030 | Scoring — zero-sum formula | `@workspace/game-engine` | `lib/game-engine/src/scoring.ts` | 1 |
| MIG-013 | GAP-032 | Series Engine — +52 target | `@workspace/game-engine`, `@workspace/db` | `lib/game-engine/src/engine.ts`, `lib/game-engine/src/constants.ts`, `lib/db/src/schema.ts` | 1 |
| MIG-014 | GAP-035 | Series Engine — targetScore DB | `@workspace/db` | `lib/db/src/schema.ts` | 1 |
| MIG-015 | GAP-037 | Validation Chain — socket auth | `@workspace/api-server` | `src/socket/index.ts` | 1 |
| MIG-016 | GAP-038 | Validation Chain — 7-step chain | `@workspace/api-server` | `src/socket/validation.ts` (new) | 1 |

---

## PHASE 2 — CORE GAMEPLAY (MIG-017 to MIG-030)
*P1 Core — requires all Phase 1 items ACCEPTED*
*Note: Resolve GAP-052 (game-engine → api-server dependency) as first Phase 2 action*

| MIG-ID | GAP-ID | Rulebook Section | Responsible Module | Affected Files | Phase |
|---|---|---|---|---|---|
| MIG-017 | GAP-001 | Card Zone Structure | `@workspace/game-engine` | `lib/game-engine/src/dealing.ts`, `round.ts` | 2 |
| MIG-018 | GAP-023 | Legal Move Validation — zone-aware | `@workspace/game-engine` | `lib/game-engine/src/moves.ts` | 2 |
| MIG-019 | GAP-039 | Validation Chain — Zod schemas | `@workspace/api-zod` | `lib/api-zod/generated/` (codegen run) | 2 |
| MIG-020 | GAP-003 | Distribution Sequence — phased | `@workspace/game-engine` | `lib/game-engine/src/dealing.ts` | 2 |
| MIG-021 | GAP-026 | Face-down Logic | `@workspace/game-engine` | `lib/game-engine/src/moves.ts`, `dealing.ts` | 2 |
| MIG-022 | GAP-016 | Trump — Primary Trump state | `@workspace/game-engine` | `lib/game-engine/src/trump.ts`, `round.ts` | 2 |
| MIG-023 | GAP-024 | Legal Move — void-in-suit zone | `@workspace/game-engine` | `lib/game-engine/src/moves.ts` | 2 |
| MIG-024 | GAP-014 | Primary Bid phase | `@workspace/game-engine` | `lib/game-engine/src/bidding.ts`, `engine.ts` | 2 |
| MIG-025 | GAP-017 | Bidding — two-round structure | `@workspace/game-engine` | `lib/game-engine/src/bidding.ts` | 2 |
| MIG-026 | GAP-019 | Trump — Primary vs Final | `@workspace/game-engine` | `lib/game-engine/src/trump.ts`, `round.ts` | 2 |
| MIG-027 | GAP-027 | Trick Resolution — no early end | `@workspace/game-engine` | `lib/game-engine/src/round.ts` | 2 |
| MIG-028 | GAP-031 | Scoring — no Chhakri bonus | `@workspace/game-engine` | `lib/game-engine/src/scoring.ts` | 2 |
| MIG-029 | GAP-033 | Series Engine — Perfect 8/8 | `@workspace/game-engine` | `lib/game-engine/src/engine.ts` | 2 |
| MIG-030 | GAP-034 | Series Engine — dealer rotation | `@workspace/game-engine` | `lib/game-engine/src/engine.ts` | 2 |

---

## PHASE 3 — MULTIPLAYER (MIG-031 to MIG-047)
*P2 Multiplayer — requires all Phase 2 items ACCEPTED*

| MIG-ID | GAP-ID | Rulebook Section | Responsible Module | Affected Files | Phase |
|---|---|---|---|---|---|
| MIG-031 | GAP-007 | Room Management — 5-char code | `@workspace/db`, `@workspace/api-server` | `lib/db/src/schema.ts`, `src/socket/lobby.handler.ts` | 3 |
| MIG-032 | GAP-008 | Room Management — no password | `@workspace/db` | `lib/db/src/schema.ts` | 3 |
| MIG-033 | GAP-046 | Voice | `@workspace/api-server`, Flutter Client | `src/socket/types.ts`, `src/socket/voice.handler.ts` (new) | 3 |
| MIG-034 | GAP-043 | Reconnection — one device | `@workspace/api-server` | `src/socket/index.ts`, `src/middleware/session.ts` | 3 |
| MIG-035 | GAP-013 | Admin System — socket events | `@workspace/api-server` | `src/socket/admin.handler.ts` (new) | 3 |
| MIG-036 | GAP-011 | Admin System — room events | `@workspace/api-server` | `src/socket/lobby.handler.ts` | 3 |
| MIG-037 | GAP-006 | Player Seating — seat lock | `@workspace/api-server` | `src/socket/game.handler.ts` | 3 |
| MIG-038 | GAP-020 | Turn Engine — turn timer | `@workspace/api-server` | `src/socket/game.handler.ts`, `src/services/timer.ts` (new) | 3 |
| MIG-039 | GAP-044 | AI Control — move generation | `@workspace/game-engine`, `@workspace/api-server` | `lib/game-engine/src/ai.ts` (new), `src/services/ai.ts` (new) | 3 |
| MIG-040 | GAP-040 | Socket Sync — snapshot writes | `@workspace/api-server`, `@workspace/db` | `src/socket/game.handler.ts` | 3 |
| MIG-041 | GAP-010 | Room Management — handlers | `@workspace/api-server` | `src/socket/lobby.handler.ts` | 3 |
| MIG-042 | GAP-041 | Reconnection — timer | `@workspace/api-server` | `src/services/reconnect.ts` (new) | 3 |
| MIG-043 | GAP-021 | Turn Engine — AI on timeout | `@workspace/api-server` | `src/services/timer.ts`, `src/services/ai.ts` | 3 |
| MIG-044 | GAP-042 | Reconnection — player return | `@workspace/api-server` | `src/socket/index.ts`, `src/services/reconnect.ts` | 3 |
| MIG-045 | GAP-045 | AI Control — takeover on disconnect | `@workspace/api-server` | `src/services/reconnect.ts`, `src/services/ai.ts` | 3 |
| MIG-046 | GAP-051 | Socket Sync — broadcast implementation | `@workspace/api-server` | `src/socket/game.handler.ts`, `lobby.handler.ts` | 3 |
| MIG-047 | GAP-047 | Error Recovery — state broadcast | `@workspace/api-server` | `src/socket/index.ts` | 3 |

---

## PHASE 4 — PRESENTATION (MIG-048 to MIG-051)
*P3 Presentation — requires all Phase 3 items ACCEPTED*

| MIG-ID | GAP-ID | Rulebook Section | Responsible Module | Affected Files | Phase |
|---|---|---|---|---|---|
| MIG-048 | GAP-028 | UI — Live Match Panel | Flutter Client | `flutter_client/lib/widgets/live_panel.dart` (new) | 4 |
| MIG-049 | GAP-048 | UI — Flutter Game UI | Flutter Client | `flutter_client/lib/screens/game_screen.dart` (new) | 4 |
| MIG-050 | GAP-049 | UI — Landscape Enforcement | Flutter Client | `flutter_client/lib/main.dart` | 4 |
| MIG-051 | GAP-050 | UI — Player Identity Display | Flutter Client | `flutter_client/lib/widgets/player_identity.dart` (new) | 4 |

---

## PENDING REGISTRATION

| Item | Description | Status |
|---|---|---|
| GAP-052 / MIG-052 | `@workspace/game-engine` not in `@workspace/api-server` package.json dependencies — must be resolved as first action of Phase 2 | To be registered before Phase 2 begins |
