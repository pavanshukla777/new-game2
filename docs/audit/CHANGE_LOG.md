# Official Change Log
## Bundelkhandi Chhakri — Append-Only Implementation Record

**Authority:** docs/audit/GOVERNANCE.md
**Format:** CHG-{NNN} | MIG-{ID} | GAP-{ID} | Date | Status | Summary
**Rule:** Never edit or delete an entry. Append only.

---

## CHG-001 | MIG-001 | GAP-025 | 2026-07-20 | COMPLETE

**Rulebook Section:** Card Zone Structure
**Module:** `@workspace/game-engine`
**Files Modified:** `lib/game-engine/src/types.ts`, `lib/game-engine/src/index.ts`

**Summary:**
Added `CardZone` type and `PlayerCards` interface to the engine's public type system.
- `CardZone` = `"secret_hand" | "face_down" | "face_up"` — the three physical zones.
- `PlayerCards` — per-player allocation: `secretHand` (2), `faceDown` (3), `faceUp` (3).
- Both types are exported from `@workspace/game-engine` barrel.
- This is a type-only, additive change. No runtime behavior changed.
- `RoundState.hands` remains a flat `Record<number, CardCode[]>` pending MIG-017 (Phase 2).

**Verification:**
- L1: Types present in `types.ts` and re-exported from `index.ts`. ✓
- L2: TypeScript compilation clean. ✓
- L3: All 214 regression tests pass. ✓
- L4: No circular imports introduced. ✓

---

## CHG-002 | MIG-002 | GAP-002 | 2026-07-20 | COMPLETE

**Rulebook Section:** Deck Construction
**Module:** `@workspace/game-engine`
**Files Modified:**
- `lib/game-engine/src/constants.ts` — added `FOUR_PLAYER_RANKS`, updated `CARDS_PER_PLAYER[4]` and `TRICKS_PER_ROUND[4]` to 8, added `DECK_TOTAL_POINTS`.
- `lib/game-engine/src/deck.ts` — `generateDeck(4)` now uses `FOUR_PLAYER_RANKS` (32 cards).
- `lib/game-engine/src/index.ts` — exported new constants.
- `lib/game-engine/src/__tests__/deck.test.ts` — updated expectations to 32-card / 80-point 4-player deck.
- `lib/game-engine/src/__tests__/round.test.ts` — updated hand size (13→8), capturedPoints total (100→80), trick count (13→8).
- `lib/game-engine/src/__tests__/engine.integration.test.ts` — updated target scores and expectations.

**Summary:**
4-player deck now conforms to Official Rulebook:
- Removed ranks 2–6 from 4-player deck → 8 ranks × 4 suits = 32 cards.
- CARDS_PER_PLAYER[4]: 13 → 8. TRICKS_PER_ROUND[4]: 13 → 8.
- DECK_TOTAL_POINTS[4] = 80 (5 is excluded; 5s are worth 5 pts).
- DECK_TOTAL_POINTS[6] = 100 (unchanged).
- TOTAL_DECK_POINTS = 100 retained for backward compatibility (6-player reference).

**Verification:**
- L1: `generateDeck(4).length === 32`. ✓
- L2: No 2–6 ranked cards in 4-player deck. ✓
- L3: All regression tests pass. ✓
- L4: 6-player deck unchanged (48 cards, 100 pts). ✓

---

## CHG-003 | MIG-003 | GAP-029 | 2026-07-20 | COMPLETE

**Rulebook Section:** Scoring — trick count model
**Module:** `@workspace/game-engine`
**Files Modified:**
- `lib/game-engine/src/types.ts` — `RoundResult.capturedPoints` replaced by `tricksWon: [number, number]`.
- `lib/game-engine/src/scoring.ts` — `calculateRoundScore` uses `tricksWon[bidTeam] >= bid` for bid-success; `defTeamDelta` uses trick count.
- `lib/game-engine/src/round.ts` — `buildRoundResult` counts per-team tricks from `completedTricks`.
- `lib/game-engine/src/scoring.ts` — added `tricksNeeded()`; kept `pointsNeeded()` as deprecated alias.
- `lib/game-engine/src/index.ts` — exported `tricksNeeded`.
- `lib/game-engine/src/__tests__/scoring.test.ts` — fully rewritten for trick-count model.
- `lib/game-engine/src/__tests__/round.test.ts` — `buildRoundResult` tests updated.

**Summary:**
Bid success is now determined by trick count versus bid value, not card-point accumulation.
- `RoundResult.tricksWon` = per-team count of tricks won this round.
- `bidMet = tricksWon[bidTeam] >= bid`.
- Defending team delta = `tricksWon[defTeam] × multiplier × chhakrBonus` (interim; MIG-012 converts to zero-sum).

**Verification:**
- L1: `RoundResult` has `tricksWon: [number, number]` and no `capturedPoints`. ✓
- L2: `buildRoundResult` counts `completedTricks` by `winnerTeam`. ✓
- L3: All regression tests pass. ✓
- L4: `RoundState.capturedPoints` untouched (still valid for UI display). ✓

---

## CHG-004 | MIG-004 | GAP-015 | 2026-07-20 | COMPLETE

**Rulebook Section:** Bidding — valid values
**Module:** `@workspace/game-engine`
**Files Modified:**
- `lib/game-engine/src/constants.ts` — `DEFAULT_MIN_BID` 51→5, added `MAX_BID = 8`, added `VALID_BID_VALUES = Set([5,6,7,8])`.
- `lib/game-engine/src/bidding.ts` — `placeBid` enforces values ∈ {5,6,7,8}; `getValidBidRange` returns `{min, max:8}` or null when no bids remain.
- `lib/game-engine/src/engine.ts` — imported `MAX_BID`; `getValidBidRange` uses `MAX_BID`.
- `lib/game-engine/src/index.ts` — exported `MAX_BID`, `VALID_BID_VALUES`.
- `lib/game-engine/src/__tests__/bidding.test.ts` — fully rewritten for {5,6,7,8} values.
- `lib/game-engine/src/__tests__/round.test.ts` — all `applyBid(..., 55, ...)` changed to 5.
- `lib/game-engine/src/__tests__/engine.integration.test.ts` — `bidAmount` default 60→5; `getValidBidRange` assertion updated.

**Summary:**
Valid bid values are now exactly {5, 6, 7, 8}, representing trick-count targets.
- Bids outside this set throw immediately (`too low` for <5; `exceeds maximum` for >8).
- Bids within the set but ≤ current highest throw "too low".
- `getValidBidRange` returns null when current bid = 8 (no valid bids remain).
- Two-round bidding structure (GAP-017) deferred to MIG-025 (Phase 2).

**Verification:**
- L1: `placeBid(s, seat, 4, cfg)` throws. `placeBid(s, seat, 9, cfg)` throws. `placeBid(s, seat, 5, cfg)` succeeds. ✓
- L2: `getValidBidRange` returns `{min:5, max:8}` at round start. ✓
- L3: All regression tests pass. ✓
- L4: 6-player games unaffected. ✓

---

## CHG-005 | MIG-005 | GAP-036 | 2026-07-20 | COMPLETE

**Rulebook Section:** Validation Chain — Identity
**Module:** `@workspace/api-server`
**Files Modified:**
- `artifacts/api-server/src/middlewares/auth.ts` — Implemented real JWT verification.
- `artifacts/api-server/package.json` — Added `jsonwebtoken` dependency and `@types/jsonwebtoken` devDependency.

**Summary:**
`requireAuth` middleware now enforces Identity step of the 7-step validation chain.
- Reads `Authorization: Bearer <token>` header; returns 401 if absent or malformed.
- Verifies JWT signature with `SESSION_SECRET` env var (HS256, via `jsonwebtoken`).
- Returns 401 with distinct message for expired vs. invalid tokens.
- Returns 403 when `payload.banned === true`.
- Returns 500 when `SESSION_SECRET` is not set (server misconfiguration guard).
- Attaches `payload` to `(req as AuthenticatedRequest).user` on success.
- `requireFullAuth` continues to reject guest tokens (isGuest=true → 403).

**Verification:**
- L1: Real `jwt.verify()` call with `SESSION_SECRET`. ✓
- L2: Returns 401 without valid Bearer token. ✓
- L3: No engine tests affected (different package). ✓
- L4: `AuthPayload.banned` field added; backward-compatible (optional). ✓

---

## CHG-006 | MIG-006 | GAP-004 | 2026-07-20 | COMPLETE

**Rulebook Section:** Player Seating
**Module:** `@workspace/db`
**Files Modified:** `lib/db/src/schema/rooms.ts`

**Summary:**
`room_players.seat` DB check constraint expanded to allow seats 0–5 for 6-player games.
- Old: `CHECK (seat BETWEEN 0 AND 3)` — only supported 4-player seat numbers.
- New: `CHECK (seat BETWEEN 0 AND 5)` — supports 4-player (0–3) and 6-player (0–5).
- Unique index `room_players_room_seat_unique` is unchanged; still enforces no two players share a seat within a room.
- Additive change — no existing 4-player rows are invalidated.

**Verification:**
- L1: Check constraint name `room_players_seat_check` updated to `BETWEEN 0 AND 5`. ✓
- L2: `@workspace/db` TypeScript compilation clean. ✓
- L3: All 223 engine tests unaffected (different package). ✓
- L4: No circular imports. ✓

---

## CHG-007 | MIG-007 | GAP-005 | 2026-07-20 | COMPLETE

**Rulebook Section:** Player Seating
**Module:** `@workspace/db`
**Files Modified:** `lib/db/src/schema/games.ts`

**Summary:**
`game_players.seat` DB check constraint expanded to allow seats 0–5 for 6-player games.
- Old: `CHECK (seat BETWEEN 0 AND 3)`.
- New: `CHECK (seat BETWEEN 0 AND 5)`.
- Unique index `game_players_game_seat_unique` unchanged.

**Verification:**
- L1: Check constraint `game_players_seat_check` updated to `BETWEEN 0 AND 5`. ✓
- L2: Compilation clean. ✓
- L3: Engine tests unaffected. ✓

---

## CHG-008 | MIG-008 | GAP-009 | 2026-07-20 | COMPLETE

**Rulebook Section:** Deck Construction
**Module:** `@workspace/db`, `@workspace/api-server`
**Files Modified:**
- `lib/db/src/schema/rooms.ts` — `rooms_max_players_check` constraint.
- `artifacts/api-server/src/socket/types.ts` — `seatPreference` and `maxPlayers` types.

**Summary:**
`rooms.maxPlayers` DB constraint expanded to allow 4 or 6.
- Old: `CHECK (max_players = 4)` — 6-player rooms could not be persisted.
- New: `CHECK (max_players IN (4, 6))`.
- `LobbyClientToServerEvents["lobby:create_room"].maxPlayers` typed as `4 | 6`.
- `LobbyClientToServerEvents["lobby:join_room"].seatPreference` typed as `0 | 1 | 2 | 3 | 4 | 5` (was `0 | 1 | 2 | 3`).
- `RoomDetail.players` now includes `isAdmin` field (required by MIG-009).

**Verification:**
- L1: `rooms_max_players_check` → `IN (4, 6)`. ✓
- L2: `seatPreference` union expanded. ✓
- L3: API server typecheck clean. ✓
- L4: Engine tests unaffected. ✓

---

## CHG-009 | MIG-009 | GAP-012 | 2026-07-20 | COMPLETE

**Rulebook Section:** Admin System — Dual Admin
**Module:** `@workspace/db`
**Files Modified:**
- `lib/db/src/schema/rooms.ts` — `isAdmin` column on `room_players`.
- `lib/db/src/schema/games.ts` — `isAdmin` column on `game_players` + partial unique index.

**Summary:**
Added Dual Admin support to the DB schema (one admin per team per game).
- `room_players.isAdmin: boolean DEFAULT false` — lobby admin flag; application assigns
  exactly two admins (one per team) at room creation. DB does not enforce team pairing
  in the lobby because teams are not yet assigned there; invariant is application-layer.
- `game_players.isAdmin: boolean DEFAULT false` — in-game admin flag.
- Partial unique index `game_players_one_admin_per_team` on `(gameId, team) WHERE isAdmin = true`
  — DB-enforces at most one admin per team per game once teams are assigned.

**Verification:**
- L1: `isAdmin` column present on both `room_players` and `game_players`. ✓
- L2: Partial unique index present on `game_players`. ✓
- L3: Existing rows unaffected (column is nullable-equivalent via DEFAULT false). ✓
- L4: Compilation and engine tests clean. ✓

---

## CHG-010 | MIG-010 | GAP-022 | 2026-07-20 | COMPLETE

**Rulebook Section:** Reconnection
**Module:** `@workspace/db`, `@workspace/api-server`
**Files Modified:**
- `lib/db/src/schema/games.ts` — `connectionState` column + check constraint + index on `game_players`.
- `lib/db/src/schema/game_states.ts` — `SeatState.connectionState` replaces `SeatState.isConnected`; `ConnectionState` type exported.
- `artifacts/api-server/src/socket/types.ts` — `SocketData.connectionState` added; `ConnectionState` re-exported.

**Summary:**
Introduced the four-state reconnection state machine to the DB and JSONB state type.

Connection state values:
- `CONNECTED` — player is live on the socket; normal play.
- `DISCONNECTED` — socket dropped; transitional state before window starts.
- `RECONNECTING` — reconnect window active; AI has not yet taken over.
- `AI_PLAYING` — window expired; AI controls this seat.

DB changes:
- `game_players.connectionState TEXT NOT NULL DEFAULT 'CONNECTED'`
  with `CHECK ... IN ('CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'AI_PLAYING')`.
- Performance index `game_players_connection_state_idx` on `connectionState` for fast
  lookups during reconnect handling.

Type changes:
- `SeatState.isConnected: boolean` removed; replaced by `SeatState.connectionState: ConnectionState`.
- `ConnectionState` exported from `@workspace/db` barrel and re-exported from `socket/types.ts`.
- `SocketData.connectionState: ConnectionState | null` added for fast in-memory access.

State transition diagram (full implementation in MIG-042 through MIG-045):
  CONNECTED → DISCONNECTED → RECONNECTING → CONNECTED (rejoined)
                                          → AI_PLAYING → CONNECTED (returned)

**Verification:**
- L1: `connectionState` column with check constraint present in `game_players`. ✓
- L2: `SeatState.connectionState: ConnectionState` in `game_states.ts`. ✓
- L3: `SocketData.connectionState` typed correctly. ✓
- L4: `ConnectionState` type flows from `games.ts` → `game_states.ts` → barrel → `socket/types.ts` without circular imports. ✓
- L5: API server and DB packages typecheck clean. ✓
- L6: All 223 engine tests unaffected. ✓

---

## CHG-011
**MIG-011 | GAP-018 | Bidding — winningBid DB check constraint**
**Files:** `lib/db/src/schema/games.ts`
**Date:** 2026-07-20

Added `game_rounds_winning_bid_check` constraint to `game_rounds` table.

Previous state: `winningBid INTEGER` with no constraint; any integer value was accepted at the DB level.

New constraint:
```sql
CHECK (winning_bid IN (5, 6, 7, 8) OR winning_bid IS NULL)
```
NULL is permitted because `winningBid` is not populated until the round ends.

This enforces the Rulebook bid value set `{5, 6, 7, 8}` at the database layer, matching the engine-layer enforcement added in MIG-004.

**Verification:**
- L1: `game_rounds_winning_bid_check` constraint present in `gameRoundsTable`. ✓
- L2: NULL case explicitly included (pre-round rows are valid). ✓
- L3: DB package compiles clean. ✓
- L4: All 223 engine tests unaffected. ✓

---

## CHG-012
**MIG-012 | GAP-030 | Scoring — zero-sum formula**
**Files:** `lib/game-engine/src/scoring.ts`, `lib/game-engine/src/__tests__/scoring.test.ts`, `lib/game-engine/src/__tests__/engine.integration.test.ts`
**Date:** 2026-07-20

Replaced the trick-count defending-team formula with the Rulebook zero-sum formula in `calculateRoundScore`.

Previous formula (post MIG-003):
- Bid made:   bidTeam = `+bid × m × cb`;   defTeam = `+tricksWon[def] × m × cb`
- Bid failed: bidTeam = `−bid × m × cb`;   defTeam = `+tricksWon[def] × m × cb`

New zero-sum formula:
- Let `bidUnitScore = bid × multiplier × chhakrBonus`
- Bid made:   bidTeam = `+bidUnitScore`;    defTeam = `−bidUnitScore`   (net = 0)
- Bid failed: bidTeam = `−bidUnitScore`;    defTeam = `+(2 × bidUnitScore)`

`multiplier` (1 / 2 / 4) and `chhakrBonus` (1 / 2) continue to apply to both sides.

Scoring tests fully rewritten for the new formula. Engine integration test assertion updated from `sum !== 0` to `scores !== [0, 0]` (zero-sum bid-made produces net 0; `not.toEqual([0, 0])` is always valid).

**Verification:**
- L1: Formula implemented in `calculateRoundScore`. ✓
- L2: All scoring unit tests updated and passing. ✓
- L3: All 223 engine tests pass. ✓
- L4: API server typecheck clean. ✓

---

## CHG-013
**MIG-013 | GAP-032 | Series Engine — +52 target**
**Files:** `lib/game-engine/src/constants.ts`, `lib/game-engine/src/index.ts`, `lib/db/src/schema/games.ts`
**Date:** 2026-07-20

Updated the series target score from 500 to 52 per the Rulebook.

Changes:
- `constants.ts`: Added `SERIES_TARGET = 52`; `DEFAULT_TARGET_SCORE` is now an alias for `SERIES_TARGET`. Old value was 500.
- `index.ts`: `SERIES_TARGET` added to the barrel export.
- `games.ts`: `gamesTable.targetScore.default(52)` (was 500).

**Verification:**
- L1: `SERIES_TARGET = 52` in `constants.ts`. ✓
- L2: `DEFAULT_TARGET_SCORE` delegates to `SERIES_TARGET`. ✓
- L3: `gamesTable.targetScore` default is 52. ✓
- L4: `SERIES_TARGET` exported from `@workspace/game-engine` barrel. ✓
- L5: DB compiles clean. ✓
- L6: All 223 engine tests pass (no test hard-depends on the 500 value). ✓

---

## CHG-014
**MIG-014 | GAP-035 | Series Engine — targetScore DB constraint**
**Files:** `lib/db/src/schema/rooms.ts`, `artifacts/api-server/src/socket/types.ts`
**Date:** 2026-07-20

Replaced the `rooms_target_score_check` constraint and updated related types.

Previous constraint: `CHECK (target_score IN (300, 500, 750))`
New constraint:      `CHECK (target_score = 52)`

Previous default: 500
New default:      52

Socket payload type updated:
- `LobbyClientToServerEvents["lobby:create_room"].targetScore`: `300 | 500 | 750` → `52`

This eliminates the legacy 300/500/750 game length options that have no Rulebook basis.

**Verification:**
- L1: `rooms_target_score_check` constraint updated in `roomsTable`. ✓
- L2: `roomsTable.targetScore` default is 52. ✓
- L3: `lobby:create_room` payload type reflects the single valid value. ✓
- L4: DB compiles clean. ✓
- L5: All 223 engine tests unaffected. ✓

---

## CHG-015
**MIG-015 | GAP-037 | Validation Chain — socket auth enforcement**
**Files:** `artifacts/api-server/src/socket/index.ts`
**Date:** 2026-07-20

Replaced the Phase 0 socket auth stub with real JWT verification on both namespaces.

Previous behaviour:
- No token → logged a warning, assigned a dev-user identity, and allowed connection.
- Token present → used token string as userId without verification.

New behaviour:
- No token → `next(new Error("UNAUTHORIZED"))` — connection rejected.
- `SESSION_SECRET` not set → `next(new Error("SERVER_ERROR"))` — connection rejected.
- Invalid / malformed token → `next(new Error("TOKEN_INVALID"))` — rejected.
- Expired token → `next(new Error("TOKEN_EXPIRED"))` — rejected.
- Banned account (`payload.banned === true`) → `next(new Error("ACCOUNT_BANNED"))` — rejected.
- Valid token → `socket.data` populated from verified `AuthPayload`; `connectionState: null`.

The `AuthPayload` interface is imported from `src/middlewares/auth.ts` to keep identity verification consistent between HTTP and WebSocket layers.

Both `/lobby` and `/game` namespaces use the same `authMiddleware` function.

**Verification:**
- L1: No-token path calls `next(new Error("UNAUTHORIZED"))`. ✓
- L2: JWT verification uses `jwt.verify(token, SESSION_SECRET)`. ✓
- L3: `AuthPayload` reused from the HTTP auth middleware. ✓
- L4: `socket.data` fully satisfies `SocketData` including `connectionState: null`. ✓
- L5: Dev bypass removed — no unconditional pass-through remains. ✓
- L6: API server typecheck clean. ✓
- L7: All 223 engine tests unaffected. ✓

---

## CHG-016
**MIG-016 | GAP-038 | Validation Chain — 7-step chain**
**Files:** `artifacts/api-server/src/socket/validation.ts` (new)
**Date:** 2026-07-20

Created the server-side 7-step validation chain as a composable pure-function pipeline.

Step coverage:
| Step | Name | Implementation |
|---|---|---|
| 1 | Identity | Enforced at handshake (MIG-015). Identity already in `socket.data`. |
| 2 | Match State | `validateMatchState()` — rejects ended/dealing phases, verifies player membership. |
| 3 | Turn | `validateTurn()` — rejects if requesting seat ≠ `currentSeat`. |
| 4 | Action | `validateAction()` — enforces `VALID_ACTIONS_BY_PHASE` mapping. |
| 5 | Rule | `validateBidRule()` / `validateTrumpRule()` / `validateCardRule()` — action-specific Rulebook checks. |
| 6 | Update | Handler responsibility (not in this module). |
| 7 | Sync | Handler responsibility (not in this module). |

Key exports: `ValidationContext`, `MatchStateContext`, `TurnContext`, `ValidationResult<T>`,
`VALID_ACTIONS_BY_PHASE`, `runValidationChain`, `validateMatchState`, `validateTurn`,
`validateAction`, `validateBidRule`, `validateTrumpRule`, `validateCardRule`.

`runValidationChain` composes Steps 2–4 in sequence with early-exit on any failure.
Step 5 is separated because the Rule check is action-specific (bid/trump/card).

Also resolved GAP-052 (DF-002): added `@workspace/game-engine` to
`@workspace/api-server` `package.json` dependencies and `tsconfig.json`
`references` so the engine types are available to the validation chain and
future Phase 2 handlers.

**Verification:**
- L1: `runValidationChain` composes Steps 2–4 with short-circuit on failure. ✓
- L2: `VALID_ACTIONS_BY_PHASE` is exhaustive over all `GamePhase` values. ✓
- L3: `validateBidRule` rejects bid values outside `{5,6,7,8}`. ✓
- L4: `@workspace/game-engine` dependency present in `package.json` and `tsconfig.json`. ✓
- L5: API server typecheck clean. ✓
- L6: All 223 engine tests unaffected. ✓

---

## CHG-017
**MIG-017 | GAP-001 | Card Zone Structure — zone-aware round state**
**Files:** `lib/game-engine/src/dealing.ts` (new), `lib/game-engine/src/types.ts`, `lib/game-engine/src/round.ts`, `lib/game-engine/src/index.ts`
**Date:** 2026-07-20

Added zone-aware card tracking to `RoundState` and created the dealing utilities module.

`lib/game-engine/src/types.ts` change:
- Added optional field `playerCards?: Record<number, PlayerCards>` to `RoundState`.
  Optional to preserve backward compatibility with any test that constructs a
  `RoundState` literal (all such tests call `initRound()` which populates it).

`lib/game-engine/src/dealing.ts` (new — zone utility half):
- `SECRET_HAND_COUNT = 2`, `FACE_DOWN_COUNT = 3`, `FACE_UP_COUNT = 3` (Rulebook constants).
- `emptyPlayerCards()` — empty zone structure.
- `assignCardsToZones(hand)` — splits a flat 8-card hand: [0-1]→secretHand, [2-4]→faceDown, [5-7]→faceUp.
- `buildZonedHands(hands)` — converts `Record<number, CardCode[]>` to `Record<number, PlayerCards>`.
- `flattenPlayerCards(cards)` — merges all zones into a flat array.
- `getAccessibleHand(cards)` — derives accessible hand with zone priority: faceUp+secretHand first; faceDown only if both are empty.

`lib/game-engine/src/round.ts` change:
- `initRound` now calls `buildZonedHands(hands)` after dealing and populates `state.playerCards`.

**Verification:**
- L1: `RoundState.playerCards` field present in `types.ts` (optional). ✓
- L2: `initRound` populates `playerCards` from dealt hands. ✓
- L3: `assignCardsToZones` produces exactly 2+3+3 per player. ✓
- L4: `getAccessibleHand` returns faceDown only when secretHand+faceUp empty. ✓
- L5: Engine package compiles clean. ✓
- L6: All 223 engine tests pass (playerCards is additive, no test broken). ✓

---

## CHG-018
**MIG-018 | GAP-023 | Legal Move Validation — zone-aware**
**Files:** `lib/game-engine/src/move-validator.ts`, `lib/game-engine/src/index.ts`
**Date:** 2026-07-20

Added zone-aware move validation functions to the move-validator module.

New exports:
- `getLegalMovesZoned(playerCards, trickSoFar)` — returns legal moves from the accessible
  zone hand. Applies zone priority: faceUp+secretHand first; faceDown only when both empty.
  Then applies standard suit-following rules to the accessible subset.
- `validateMoveZoned(card, playerCards, trickSoFar)` — validates a card play against
  zone-structured hand; first checks the player holds the card (any zone), then checks
  legality via `getLegalMovesZoned`.

Existing functions (`getLegalMoves`, `validateMove`, `getLedSuit`) are unchanged.
`move-validator.ts` imports `getAccessibleHand` from the new `dealing.ts` module.

Zone restriction implemented (Rulebook / GAP-023):
- Face-down cards excluded from legal moves unless face_up AND secret_hand are exhausted.
- When primary (faceUp+secretHand) accessible hand is empty, face_down cards become the
  accessible hand and normal suit-following rules apply.
- The additional void-in-suit zone restriction (GAP-024) is deferred to MIG-023.

**Verification:**
- L1: `getLegalMovesZoned` delegates suit-following to existing `getLegalMoves`. ✓
- L2: faceDown exclusion: if secretHand+faceUp non-empty, faceDown not in legal set. ✓
- L3: faceDown fallback: if secretHand+faceUp empty, faceDown cards are accessible. ✓
- L4: `validateMoveZoned` checks possession across all zones before legality. ✓
- L5: Engine package compiles clean. ✓
- L6: All 223 engine tests pass (new functions are additive). ✓

---

## CHG-019
**MIG-019 | GAP-039 | Validation Chain — Zod schemas regenerated**
**Files:** `lib/api-spec/openapi.yaml`, `lib/api-zod/src/index.ts`, `lib/api-zod/src/generated/` (regenerated), `lib/api-client-react/src/generated/` (regenerated)
**Date:** 2026-07-20

Updated `openapi.yaml` to fix stale Rulebook violations, then re-ran orval codegen.

OpenAPI spec changes:
| Field | Old value | New value | Authority |
|---|---|---|---|
| `RoomSummary.targetScore` | `enum: [300, 500, 750]` | `enum: [52]` | MIG-013, GAP-032 |
| `CreateRoomRequest.targetScore` | `enum: [300, 500, 750], default: 500` | `enum: [52], default: 52` | MIG-014, GAP-035 |
| `RoomPlayer.seat` | `maximum: 3` | `maximum: 5` | MIG-006/007, GAP-004/005 |
| `RoomSummary.playerCount` | `maximum: 4` | `maximum: 6` | MIG-008, GAP-009 |
| `RoomSummary.maxPlayers` | no enum | `enum: [4, 6]` | MIG-008, GAP-009 |

`lib/api-zod/src/index.ts`: Removed duplicate re-export lines (4 lines → 2 lines).

Codegen output changes (orval v8.21.0):
- `RoomSummaryTargetScore`: `{NUMBER_300, NUMBER_500, NUMBER_750}` → `{NUMBER_52: 52}`
- `CreateRoomRequestTargetScore`: same collapse to `{NUMBER_52: 52}`
- `RoomPlayer.seat`: `@maximum 5` in generated type comment.
- `RoomSummaryMaxPlayers`: regenerated with `{NUMBER_4, NUMBER_6}` enum.
- Room code length (6 chars) intentionally unchanged — MIG-031 will update this in Phase 3.

**Verification:**
- L1: `RoomSummaryTargetScore.NUMBER_52 === 52` in generated types. ✓
- L2: `CreateRoomRequestTargetScore.NUMBER_52 === 52` in generated types. ✓
- L3: `RoomPlayer.seat` carries `@maximum 5` annotation in generated type. ✓
- L4: `lib/api-zod/src/index.ts` has no duplicate export lines. ✓
- L5: Orval codegen exited cleanly with no errors. ✓
- L6: API server typecheck clean. ✓
- L7: All 223 engine tests unaffected. ✓

---

## CHG-020
**MIG-021 | GAP-026 | Face-down Logic — zone mutation utilities + applyPlayCard sync**
**Files:** `lib/game-engine/src/dealing.ts`, `lib/game-engine/src/round.ts`, `lib/game-engine/src/index.ts`, `lib/db/src/schema/game_states.ts`
**Date:** 2026-07-20

Added zone mutation utilities to `dealing.ts`:
- `removeCardFromZone(playerCards, card)` — pure; searches faceUp → secretHand → faceDown; throws if not found.
- `isInFaceDownPhase(playerCards)` — true when faceUp+secretHand empty and faceDown non-empty.
- `getRevealableCards(playerCards)` — returns faceDown contents when in face-down phase, else [].

Updated `applyPlayCard` in `round.ts`:
- Uses `validateMoveZoned` (zone-aware) when `state.playerCards?.[seat]` is present; falls back to flat `validateMove` otherwise.
- After removing from flat `hands`, also calls `removeCardFromZone` to keep `state.playerCards` in sync.

Updated `SeatState` in `game_states.ts`:
- Added optional zone fields: `secretHand?`, `faceDown?`, `faceUp?: CardCode[]`, `inFaceDownPhase?: boolean`.

Updated `AuthoritativeGameState` in `game_states.ts`:
- Added `playerCards?: Record<number, { secretHand, faceDown, faceUp: CardCode[] }>` for server-side zone tracking.

Updated `ClientGameState`:
- Seats now carry `hand: CardCode[] | null`, `secretHand: CardCode[] | null`, `faceDownCount: number`, `faceUp: CardCode[]`.
- Added convenience aliases: `mySecretHand`, `myFaceDown`, `myFaceUp`.

All new functions exported from `lib/game-engine/src/index.ts`.

**Verification:**
- L1: `removeCardFromZone` removes from correct zone (search order faceUp→secretHand→faceDown). ✓
- L2: `removeCardFromZone` throws when card not found. ✓
- L3: `isInFaceDownPhase` returns true only when faceUp+secretHand empty and faceDown non-empty. ✓
- L4: `getRevealableCards` returns faceDown when in phase, [] otherwise. ✓
- L5: `applyPlayCard` keeps flat `hands` and `playerCards` zones in sync after every play. ✓
- L6: Full round simulation maintains zone consistency throughout 8 tricks. ✓
- L7: DB typecheck passes after SeatState/AuthoritativeGameState/ClientGameState updates. ✓
- L8: All 253 engine tests pass (223 existing + 30 new zone-aware tests). ✓

---

**MIG-023 | GAP-024 | Zone-aware getLegalMovesForSeat + getLegalMovesZonedForSeat**
**Files:** `lib/game-engine/src/round.ts`, `lib/game-engine/src/index.ts`
**Date:** 2026-07-20

Updated `getLegalMovesForSeat` to use `getLegalMovesZoned` (zone-aware path) when `state.playerCards?.[seat]` is present. Falls back to flat `getLegalMoves` for pre-zone fixtures.

Added new export `getLegalMovesZonedForSeat` — always zone-aware; throws if `playerCards` is not populated. Use this in socket handlers that know they have a fully-initialized round.

**Verification:**
- L1: `getLegalMovesForSeat` returns only accessible zone cards (faceUp+secretHand) when playerCards populated. ✓
- L2: faceDown cards appear only after accessible zones exhausted. ✓
- L3: `getLegalMovesZonedForSeat` throws when playerCards absent. ✓
- L4: All 253 engine tests pass. ✓

---

**CHG-NEW-GS | GameService + lobby:set_ready + game:join**
**Files:** `artifacts/api-server/src/services/game.service.ts` (new), `artifacts/api-server/src/socket/handlers/room.handler.ts`, `artifacts/api-server/src/socket/handlers/game.handler.ts`
**Date:** 2026-07-20

Created `GameService` with static methods:
- `validateSeatAssignments` — validates seats form complete 0..playerCount-1 coverage.
- `validatePlayerCount` — validates player list size.
- `buildTeamAssignments` — assigns team 0/1 by seat parity.
- `initializeGame` — DB transaction: create game → game_players → game_round → engine.startRound → snapshot.
- `buildAuthoritativeSnapshot` — maps engine RoundState + seat metadata to AuthoritativeGameState.
- `buildClientGameState` — derives ClientGameState from AuthoritativeGameState, hiding opponent card data.
- `loadLatestSnapshot` / `findGamePlayer` — DB query helpers.

Implemented `lobby:set_ready` handler:
- Updates room_players.is_ready in DB.
- Broadcasts `lobby:player_ready_changed`.
- Acks immediately; then checks if all seats filled + all ready.
- If all ready: calls `GameService.initializeGame`, updates room status to `in_game`, emits `lobby:game_starting` (countdown=3) + `lobby:game_started` (after 3s).

Implemented `game:join` handler:
- Verifies userId is a player in gameId (via game_players table).
- Joins the Socket.IO game room.
- Loads latest snapshot and builds ClientGameState.
- Acks with full client game state.
- If player was DISCONNECTED/RECONNECTING: updates connectionState, emits `game:player_reconnected`.

**Verification:**
- L1: `pnpm --filter @workspace/db exec tsc -p tsconfig.json` — clean. ✓
- L2: `pnpm --filter @workspace/game-engine run test` — 253 tests pass (223 + 30 new). ✓
- L3: `pnpm --filter @workspace/game-engine exec tsc -p tsconfig.json` — clean. ✓
- L4: `pnpm --filter @workspace/api-server run typecheck` — clean. ✓

---

**MIG-020 | GAP-003 | Distribution Sequence — phased dealing functions**
**Files:** `lib/game-engine/src/dealing.ts` (extended), `lib/game-engine/src/index.ts`
**Date:** 2026-07-20

Added three phased-deal functions to `dealing.ts` implementing the Rulebook
distribution sequence: 2 cards → Primary Bid pause → 3 face-down → 3 face-up.

New exports (phase result types + functions):
- `Phase1DealResult` — `{ playerCards, remainingDeck, shuffledDeck }` — secretHand only.
- `Phase2DealResult` — `{ playerCards, remainingDeck }` — secretHand + faceDown.
- `Phase3DealResult` — `{ playerCards }` — all three zones fully populated.
- `dealPhase1Cards(playerCount, dealerSeat, rng)` — shuffles deck, deals 2 per player.
- `dealPhase2Cards(playerCards, remainingDeck, playerCount, dealerSeat)` — deals 3 faceDown per player.
- `dealPhase3Cards(playerCards, remainingDeck, playerCount, dealerSeat)` — deals 3 faceUp per player.
- `assertCompletePlayerCards(playerCards, playerCount)` — asserts 2+3+3 for all seats.

All three functions are pure — they do not modify `RoundState` directly.
`initRound` (round.ts) is NOT changed to call `dealPhase1Cards` yet; phased
invocation is wired in MIG-024 when the Primary Bid phase is implemented.
The deck flows through phases via the `remainingDeck` return value; the
full `shuffledDeck` is stored in the Phase 1 result for event replay.

**Verification:**
- L1: `dealPhase1Cards` deals exactly `SECRET_HAND_COUNT (2)` cards per player. ✓
- L2: `dealPhase2Cards` deals exactly `FACE_DOWN_COUNT (3)` cards per player. ✓
- L3: `dealPhase3Cards` deals exactly `FACE_UP_COUNT (3)` cards per player. ✓
- L4: Full Phase 1→2→3 chain produces `assertCompletePlayerCards` = 8 per player. ✓
- L5: Functions are pure; no shared mutable state; player cards deep-copied. ✓
- L6: Engine package compiles clean. ✓
- L7: All 223 engine tests pass (new functions are additive, `initRound` unchanged). ✓

---

## CHG-022 | MIG-022 | GAP-016 | 2026-07-20 | COMPLETE

**Rulebook Section:** Trump — Primary Trump State (state model only)
**Module:** `@workspace/db`, `@workspace/api-server`
**Files Modified:**
- `lib/db/src/schema/game_states.ts` — `AuthoritativeGameState` and `ClientGameState` extended
- `artifacts/api-server/src/services/game.service.ts` — `buildAuthoritativeSnapshot` updated

**Summary:**
Added trump and bidding-lifecycle fields to `AuthoritativeGameState` (JSONB type-only change —
no DB schema migration required) to enable full `RoundState` reconstruction from snapshots.

New fields added to `AuthoritativeGameState`:
- `dealerSeat: number` — needed to recompute turn order from snapshot
- `biddingStatus: "ongoing" | "won" | "redeal"` — bidding lifecycle state
- `consecutivePasses: number` — pass counter for 3-consecutive-passes rule
- `multiplier: 1 | 2 | 4` — Double / Redouble multiplier
- `doubleSeat: number | null` — seat that called Double
- `redoubleSeat: number | null` — seat that called Redouble
- `noTrump: boolean` — whether bidder declared No Trump
- `consecutiveWins: [number, number]` — per-team consecutive trick win tracker
- `chhakri: { team: number; trickIndex: number } | null` — Chhakri detection state
- Exported `BiddingStatus` type from schema

`buildAuthoritativeSnapshot` updated to populate all new fields from `RoundState`.
`ClientGameState` automatically inherits new fields (via `extends Omit<AuthoritativeGameState, ...>`).

No gameplay logic added. Trump suit selection socket wiring is deferred to Part 7 (MIG-026).

**Verification:**
- L1: `pnpm --filter @workspace/db exec tsc -p tsconfig.json` — clean. ✓
- L2: `pnpm --filter @workspace/api-server run typecheck` — clean. ✓
- L3: All 287 engine tests pass. ✓

---

## CHG-024 | MIG-024-SOCKET | GAP-014 | 2026-07-20 | PARTIAL

**Rulebook Section:** Bidding — socket infrastructure
**Module:** `@workspace/api-server`
**Files Created / Modified:**
- `artifacts/api-server/src/socket/handlers/game.handler.ts` — `game:bid` fully implemented
- `artifacts/api-server/src/services/game.service.ts` — `applyBidAction`, `snapshotToRoundState`, `loadLatestSnapshotRow`, `buildValidActions` added

**Summary:**
Implements the complete `game:bid` socket handler replacing the `NOT_YOUR_TURN` stub.

The handler follows the 7-step Rulebook validation chain:
1. Identity — JWT verified at handshake (socket.data.userId guaranteed)
2. Match State — game exists in DB, phase = "bidding", userId is a registered player
3. Turn — `currentBidderSeat === player.seat`
4. Action — "bid" or "pass" are valid in the bidding phase
5. Rule — `validateBidRule`: amount ∈ {5,6,7,8} and strictly > `highestBid`
6. Update — `applyBidAction`: reconstructs `RoundState` via `snapshotToRoundState`,
             calls engine `applyBid` / `applyPass`, saves new snapshot to DB
7. Sync — per-player `game:state_update` broadcast (each socket sees their own `ClientGameState`);
           `game:your_turn` notification to next bidder (bidding phase) or winning bidder
           (trump_selection phase when `biddingStatus === "won"`)

New `GameService` static methods:
- `snapshotToRoundState(authState, playerCount)` — converts `AuthoritativeGameState`
  (JSONB snapshot) back to engine `RoundState`. Maps DB bid format
  `{ seat, amount: number | "pass" }` → engine format `{ seat, action, amount? }`.
  `completedTricks = []` (safe for bidding phase; full history deferred to Part 7).
- `loadLatestSnapshotRow(gameId)` — returns `{ state, roundId, sequence }` for
  the highest-sequence snapshot; used by bid handler to read state and pass `roundId`
  to the new snapshot row.
- `applyBidAction(params)` — transactional: load snapshot → reconstruct RoundState →
  apply engine action → build new `AuthoritativeGameState` → insert DB row.
- `buildValidActions(authState, seat, playerCount)` — returns `ValidAction[]`
  for `game:your_turn`; bid action includes `minBid` / `maxBid` range.

Note: MIG-024 engine constraint (first bidder MUST bid exactly 5) is NOT yet implemented.
This requires wiring the phased deal (MIG-020) into `initRound` and adding a
`"primary_bid"` phase or pre-bid validation to `placeBid`. Scheduled for Part 7.

**Verification:**
- L1: `pnpm --filter @workspace/api-server run typecheck` — clean. ✓
- L2: All 287 engine tests pass. ✓
- L3: 30 new `game-service-bidding.test.ts` tests pass. ✓

---

## CHG-025 | MIG-025-TESTS | GAP-017 | 2026-07-20 | PARTIAL

**Rulebook Section:** Bidding — tests and infrastructure
**Module:** `@workspace/game-engine`, `@workspace/api-server`
**Files Created:**
- `lib/game-engine/src/__tests__/bidding-extended.test.ts` — 34 new engine bidding tests
- `artifacts/api-server/src/__tests__/game-service-bidding.test.ts` — 30 new service tests
- `artifacts/api-server/vitest.config.ts` — vitest config for api-server unit tests
- `artifacts/api-server/package.json` — added vitest devDependency + test script

**Summary:**
Expands bidding test coverage across the engine and service layers.

`bidding-extended.test.ts` adds:
- Turn order verification after dealer rotation (4-player and 6-player, all dealer seats)
- Complete bidding sequences: single bidder, multi-raise contests, bid=8 max
- `consecutivePasses` reset behavior after a raise
- All-pass redeal (4-player and 6-player)
- `isCurrentBidder` correctness mid-sequence and when bidding is finished
- `getValidBidRange` edge cases: min derivation, null at max bid, null after completion
- Bid history (`bids[]`) ordering and `highestBidderSeat` tracking
- All error conditions: wrong seat, wrong phase, fractional amount, out-of-range values

`game-service-bidding.test.ts` adds (unit tests, no DB required):
- `snapshotToRoundState`: empty state, bids list conversion, trump_selection phase,
  playerCards reconstruction, 6-player, missing fields
- `buildValidActions`: current bidder, minBid updates, highestBid=8 pass-only,
  non-active seat, trump_selection phase, won-bidding guard
- `currentBidderSeat` derivation formula correctness (6 parameterised cases)
- `buildClientGameState` hiding rules: own cards visible, opponent cards hidden,
  faceDownCount exposed, faceUp always visible, bidding info public across all views
- Snapshot roundtrip invariants: bid fields, multiplier, consecutiveWins, chhakri, noTrump

Note: MIG-025 two-round bidding structure (replace pass-elimination with exactly-2-rounds model)
is NOT yet implemented. Requires Rulebook clarification on exact mechanics.
Current `PASSES_TO_END_BIDDING = 3` model remains in place. Scheduled for Part 7.

Total test count after Part 6: **317 tests (287 engine + 30 api-server service).**
Regression baseline (engine): all 287 pass (was 253 before Part 6 added 34 bidding-extended tests).

**Verification:**
- L1: `pnpm --filter @workspace/db exec tsc -p tsconfig.json` — clean. ✓
- L2: `pnpm --filter @workspace/game-engine exec tsc -p tsconfig.json` — clean. ✓
- L3: `pnpm --filter @workspace/game-engine run test` — 287 tests pass. ✓
- L4: `pnpm --filter @workspace/api-server run typecheck` — clean. ✓
- L5: `pnpm --filter @workspace/api-server run test` — 30 tests pass. ✓

---

## CHG-024 — Primary Bid Phase (MIG-024 / GAP-014)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "Primary Bid"
**Files changed:**
- `lib/game-engine/src/types.ts` — Added `"primary_bid"` / `"primary_trump_selection"` to `GamePhase`; added `useTwoRoundBidding`, `primaryTrump`, `remainingDeck` to `RoundState` and `GameConfig`; added event types.
- `lib/game-engine/src/constants.ts` — Added `PRIMARY_BID_AMOUNT = 5`, `BIDDING_ROUNDS = 2`.
- `lib/game-engine/src/round.ts` — Added `applyPrimaryBid` (forced bid=5, no bids[] entry, → `primary_trump_selection`); added `applyPrimaryTrumpSelection` (deals Phase 2+3, sets primaryTrump, clears remainingDeck, → `bidding`); updated `initRound` to branch on `useTwoRoundBidding`.
- `lib/game-engine/src/index.ts` — Exported `applyPrimaryBid`, `applyPrimaryTrumpSelection`, `PRIMARY_BID_AMOUNT`, `BIDDING_ROUNDS`.
- `lib/db/src/schema/game_states.ts` — Added optional `primaryTrump?`, `useTwoRoundBidding?`, `remainingDeck?` to `AuthoritativeGameState`; added new phases and event types.
- `artifacts/api-server/src/services/game.service.ts` — Added `applyPrimaryBidAction`; updated `buildAuthoritativeSnapshot`, `snapshotToRoundState`, `buildValidActions`.
- `artifacts/api-server/src/socket/validation.ts` — Added new phases to `VALID_ACTIONS_BY_PHASE`; added `validatePrimaryBidRule`.
- `artifacts/api-server/src/socket/handlers/game.handler.ts` — Updated `game:bid` for `primary_bid` phase (no-pass, amount=5).
- `artifacts/api-server/src/socket/types.ts` — Added new phases to `game:your_turn`; added `"PRIMARY_BID_CANNOT_PASS"` error to `game:bid`.

**Invariants:**
- Primary Bid is NOT in `bids[]` — sets `highestBid=5` / `highestBidderSeat` directly.
- `remainingDeck` present only during `primary_bid` / `primary_trump_selection`; cleared after Phase 2+3 dealt.
- `useTwoRoundBidding=false` default keeps all existing tests green.

---

## CHG-025 — Two-Round Bidding Structure (MIG-025 / GAP-017)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "Bidding Rounds"
**Files changed:**
- `lib/game-engine/src/bidding.ts` — Added `useTwoRoundBidding` to `BiddingState`; updated `initBiddingState` opts; updated `checkBiddingEnd` to branch (2×playerCount actions vs. pass-elimination); added `currentBiddingRound` helper.
- `lib/game-engine/src/round.ts` — Updated `reconstructBiddingState` to forward `useTwoRoundBidding`, `initialHighestBid`, `initialHighestBidderSeat`.
- `lib/game-engine/src/engine.ts` — Added `useTwoRoundBidding: false` default to `defaultGameConfig`.

**Invariants:**
- Two-round: bidding ends after `2 × playerCount` regular actions; round-1 passes are never permanent.
- Legacy: bidding ends on 3 consecutive passes (unchanged).

---

## CHG-026 — Primary vs Final Trump (MIG-026 / GAP-019)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "Trump — Primary vs Final"
**Files changed:**
- `lib/game-engine/src/round.ts` — Added `applyBiddingWon`; `primaryTrump !== null && highestBid === PRIMARY_BID_AMOUNT` → phase=`"playing"`, `trumpSuit=primaryTrump`; otherwise → `"trump_selection"`.
- `artifacts/api-server/src/services/game.service.ts` — Added `applyTrumpAction` (both `primary_trump_selection` and `trump_selection`); added `applyRedealAction`.
- `artifacts/api-server/src/socket/handlers/game.handler.ts` — Fully implemented `game:select_trump` (7-step chain, both phases, next-actor notifications); wired redeal path in `game:bid`.

**Test baseline after Part 7:** 329 engine tests + 30 api-server tests = **359 total**. All green.

---

## CHG-027 — No Early Round Termination (MIG-027 / GAP-027)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "Trick Count: Always exactly 8 tricks per round; no early termination."
**Files changed:**
- `lib/game-engine/src/round.ts` — Removed `return endRound(next, config)` from the Chhakri block inside `completeTrick`. Chhakri event is still recorded and `state.chhakri` is still set; the round continues to all 8 tricks.

**Invariants:**
- `completedTricks.length === TRICKS_PER_ROUND[playerCount]` always true at `phase === "round_ended"`.
- `capturedPoints[0] + capturedPoints[1] === DECK_TOTAL_POINTS[playerCount]` always true (all cards played).
- Chhakri event and `state.chhakri` are preserved for display/audit; only the early `endRound` call is removed.

**Tests added:** `lib/game-engine/src/__tests__/trick-resolution.test.ts` (8 tests — MIG-027 section)

---

## CHG-028 — No Chhakri Scoring Bonus (MIG-028 / GAP-031)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "No Bonus: No Chhakri bonus or multiplier applies to scoring."
**Files changed:**
- `lib/game-engine/src/scoring.ts` — Removed `chhakrBonus` multiplier from `calculateRoundScore`. `bidUnitScore = bid × multiplier` (no chhakri factor). Outcome labels `chhakri_bid_team` / `chhakri_def_team` retained for UI/display.

**Invariants:**
- `calculateRoundScore({ ...result, chhakri: x }).deltas === calculateRoundScore({ ...result, chhakri: null }).deltas` for any `x`.
- Score deltas are identical regardless of whether `chhakri` field is set.

**Tests added:** `lib/game-engine/src/__tests__/trick-resolution.test.ts` (11 tests — MIG-028 section)
**Tests updated:** `lib/game-engine/src/__tests__/scoring.test.ts` — Chhakri section updated; `lib/game-engine/src/__tests__/round.test.ts` — full-round and Chhakri rule tests updated.

---

## CHG-029 — Perfect 8/8 Instant Series Victory (MIG-029 / GAP-033)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "Perfect 8/8: Bid=8 + Bid Team wins all 8 tricks → Instant Series Victory."
**Files changed:**
- `lib/game-engine/src/scoring.ts` — Added `checkPerfect8Victory(result, playerCount): boolean`. Returns true iff `result.bid === MAX_BID && result.tricksWon[result.bidTeam] === TRICKS_PER_ROUND[playerCount]`.
- `lib/game-engine/src/engine.ts` — In `finaliseRound`: imported `checkPerfect8Victory`; added `perfect8` check; `finalWinner = perfect8 ? result.bidTeam : gameScoreResult.winner` overrides normal win check.
- `lib/game-engine/src/index.ts` — Exported `checkPerfect8Victory`.

**Invariants:**
- Perfect 8/8 sets `game.winner` even if cumulative scores have not reached `targetScore`.
- Only fires when `bid === 8` (MAX_BID) AND bidTeam won ALL tricks; bid=7 with all-8-wins does NOT trigger.

**Tests added:** `lib/game-engine/src/__tests__/series-engine.test.ts` (unit + integration — MIG-029 section)

---

## CHG-030 — Trailing Team Becomes Dealer (MIG-030 / GAP-034)

**Date:** 2026-07-20
**Rulebook ref:** RULEBOOK_SUMMARY.md § "Dealer Rotation: Team currently behind in series score becomes Dealer Team for next round."
**Files changed:**
- `lib/game-engine/src/turn-order.ts` — Added `trailingTeamDealerSeat(currentDealerSeat, scores, playerCount): number`. Finds the first seat clockwise from current dealer that belongs to the trailing team. Falls back to normal clockwise rotation on tied scores.
- `lib/game-engine/src/engine.ts` — In `finaliseRound`: replaced `nextDealerSeat(...)` with `trailingTeamDealerSeat(round.dealerSeat, gameScoreResult.scores, this.config.playerCount)`.
- `lib/game-engine/src/index.ts` — Exported `trailingTeamDealerSeat`.

**Invariants:**
- Trailing team = team with lower cumulative series score after this round's scoring.
- Tied scores → clockwise fallback (equivalent to old `nextDealerSeat`).
- Always returns a valid seat ∈ [0, playerCount).

**Tests added:** `lib/game-engine/src/__tests__/series-engine.test.ts` (unit + integration — MIG-030 section)
**Tests updated:** `lib/game-engine/src/__tests__/engine.integration.test.ts` — dealer rotation test updated to verify trailing-team invariant instead of fixed [0,1,2,3] sequence.

**Test baseline after Part 8:** 375 engine tests + 30 api-server tests = **405 total**. All green.

---

## CHG-010 — [MIG-010] Connection State Machine wired to socket disconnect
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/index.ts`
**Description:**
On game-namespace socket disconnect, the player's `connectionState` is
atomically set to `DISCONNECTED` in the DB and the room receives
`game:player_disconnected` (with `reconnectWindowSeconds`). The
`startReconnectTimer` is called immediately after, transitioning the player
to `RECONNECTING`, then `AI_PLAYING` on expiry.
**Rulebook Section:** "Reconnection — connection state machine"

---

## CHG-040 — [MIG-040] Snapshot writes for all game events + completedTricks in snapshot
**Date:** 2026-07-20
**Files:**
- `lib/db/src/schema/game_states.ts` — added optional `completedTricks` field
- `artifacts/api-server/src/services/game.service.ts` — `buildAuthoritativeSnapshot`, `snapshotToRoundState`, `applyPlayCardAction`
**Description:**
Full completed-trick list is stored in every playing-phase snapshot.
`applyPlayCardAction` persists `play_card`, `round_ended`, `game_ended`,
and `deal` (new round) snapshots after every game event.
**Rulebook Section:** "Snapshots after every game event"

---

## CHG-041 — [MIG-041] Full room handlers implemented
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/handlers/room.handler.ts`
**Description:**
All lobby handlers replaced with production implementations:
`lobby:create_room` (5-char code, DB transaction), `lobby:join_room`
(by ID or code, seat assignment, TOCTOU-safe transaction),
`lobby:leave_room` (host transfer), `lobby:kick_player` (admin-only socket
eviction), `lobby:set_ready` (triggers `initializeGame` when all ready).
**Rulebook Section:** "Lobby — room lifecycle"

---

## CHG-042 — [MIG-042] Reconnect timer on disconnect
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/services/reconnect.service.ts` — NEW
- `artifacts/api-server/src/socket/index.ts`
**Description:**
`ReconnectService` manages per-player windows with an in-memory Map.
On disconnect: `startReconnectTimer` → `RECONNECTING` (immediate DB),
then on expiry → `AI_PLAYING` (DB) + `game:player_timeout` broadcast.
Notify fires synchronously for testability with `vi.useFakeTimers`.
**Rulebook Section:** "Reconnection — reconnect window"

---

## CHG-046 — [MIG-046] Complete socket broadcasts for game:play_card
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/socket/handlers/game.handler.ts`
- `artifacts/api-server/src/services/game.service.ts` — `applyPlayCardAction`, `buildValidActions`
**Description:**
Full 7-step validation chain + broadcast sequence: `CARD_PLAYED` always;
`TRICK_WON` when trick completed and round ongoing; `ROUND_ENDED` after
8 tricks; `GAME_ENDED` on series win; `CARDS_DEALT` + `game:your_turn`
on new round; `game:your_turn` to next trick player otherwise.
`buildValidActions` now calls `getLegalMovesZonedForSeat` in playing phase.
**Rulebook Section:** "Trick-taking — state broadcasts"

---

## CHG-047 — [MIG-047] Error recovery on reconnect (cancel timer)
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/handlers/game.handler.ts`
**Description:**
`game:join` reconnect branch calls `cancelReconnectTimer(gameId, userId)`
before transitioning `connectionState → CONNECTED` and broadcasting
`game:player_reconnected`. Prevents AI-takeover on successful return.
**Rulebook Section:** "Reconnection — player return cancels AI takeover"

**Test baseline after Part 9:** 375 engine tests + 51 api-server tests = **426 total**. All green.

---

## CHG-033 — [MIG-033] Voice socket events on /game namespace
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/socket/types.ts` — `VoiceClientToServerEvents`, `VoiceServerToClientEvents` merged into `GameClientToServerEvents` / `GameServerToClientEvents`
- `artifacts/api-server/src/socket/handlers/voice.handler.ts` — NEW
**Description:**
WebRTC signaling relay: `voice:offer`, `voice:answer`, `voice:ice_candidate`
relayed to target seat; `voice:toggle_mute` → broadcast `voice:mute_changed`; 
`voice:hang_up` → broadcast `voice:player_hung_up`. All on /game namespace 
(players already authenticated). `GameService.findGamePlayerBySeat` added to 
look up target userId for routing.
**Rulebook Section:** "Voice — signaling"

---

## CHG-034 — [MIG-034] One-device enforcement on /lobby and /game namespaces
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/index.ts`
**Description:**
`connectedLobbyUsers` and `connectedGameUsers` Maps track `userId → socketId`.
On new connection for a userId that already has an active socket, the OLD socket
is immediately disconnected ("second login kicks first"). Map entries cleared
on disconnect via same-socket guard.
**Rulebook Section:** "Reconnection — one device per account"

---

## CHG-035 — [MIG-035] Admin socket events on /game namespace
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/socket/types.ts` — `AdminClientToServerEvents`, `AdminServerToClientEvents`
- `artifacts/api-server/src/socket/handlers/admin.handler.ts` — NEW
- `artifacts/api-server/src/services/reconnect.service.ts` — `setReconnectWindowForGame`, `getReconnectWindowSeconds`
**Description:**
In-game admin controls: `game:admin_set_timer`, `game:admin_set_reconnect`,
`game:admin_transfer`, `game:admin_kick_player`. `requireAdmin` helper checks
`isAdmin=true` in DB before every action. Per-game turn-timer and reconnect-window
overrides stored in in-memory maps; cleared on demand.
**Rulebook Section:** "Admin System — socket events"

---

## CHG-036 — [MIG-036] Dual-admin auto-reassign on disconnect and room leave
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/socket/index.ts` — disconnect handler auto-reassigns admin to connected teammate
- `artifacts/api-server/src/socket/handlers/room.handler.ts` — `lobby:leave_room` reassigns admin to same-team player
**Description:**
When a player with `isAdmin=true` disconnects from a game, admin role transfers
to the lowest-seat connected teammate on the same team (seat % 2). Same logic
applies when an admin voluntarily leaves the pre-game room lobby.
`game:admin_changed` broadcast fired to the room. Teams determined by seat parity
(0/2/4 = team 0, 1/3/5 = team 1).
**Rulebook Section:** "Admin System — dual-admin model"

---

## CHG-038 — [MIG-038] Turn timer per seat in all game phases
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/services/turn-timer.service.ts` — NEW
- `artifacts/api-server/src/socket/handlers/game.handler.ts` — cancel on action; start after every `game:your_turn` emit
**Description:**
`startTurnTimer(gameId, seat, seconds, onExpire)` fires `onExpire(seat)` after
the configured duration. `cancelTurnTimer` called at start of every `game:bid`,
`game:select_trump`, `game:play_card` (player acted in time). Timer restarted
on `game:join` reconnect if it's the player's current turn. 
`DEFAULT_TURN_TIMER_SECONDS` map configures per-phase defaults.
Admin can override duration via `setGameTimerDuration(gameId, seconds)`.
Fires synchronously (like reconnect timer) for `vi.useFakeTimers` testability.
**Rulebook Section:** "Turn Timer"

---

## CHG-039 — [MIG-039] AI move generation (engine-level deterministic picker)
**Date:** 2026-07-20
**Files:**
- `lib/game-engine/src/ai.ts` — NEW
- `lib/game-engine/src/index.ts` — re-exports `pickAiAction`, `AiAction`
**Description:**
`pickAiAction(round, seat, playerCount, config)` returns a valid `AiAction`
for any actionable phase. Strategy: `primary_bid` → bid 5; trump phases → first
valid suit (Spades); `bidding` → bid DEFAULT_MIN_BID if highestBid=0, else pass
(guarantees bidding terminates); `playing` → first zone-aware legal card from
`getLegalMovesZonedForSeat`.
**Rulebook Section:** "AI Control — move generation"

---

## CHG-043 — [MIG-043] AI fires on turn-timer expiry
**Date:** 2026-07-20
**Files:**
- `artifacts/api-server/src/services/ai.service.ts` — NEW (`applyAiTurn`, `scheduleAiIfNeeded`)
- `artifacts/api-server/src/socket/handlers/game.handler.ts` — `onExpire` callback passes to `applyAiTurn`
**Description:**
`applyAiTurn(game, gameId, seat)` loads latest snapshot, checks it's still that
seat's turn (`isSeatsTurn` guard), calls `pickAiAction`, then dispatches to the
appropriate `GameService.apply*Action`. After each AI action, broadcasts state
update and schedules next actor via `scheduleAiIfNeeded`. `scheduleAiIfNeeded`
fires AI immediately (50 ms delay) when seat is `AI_PLAYING` or `isAi=true`;
otherwise starts a normal turn timer.
**Rulebook Section:** "AI Control — timeout takeover"

---

## CHG-045 — [MIG-045] AI takeover fires when reconnect window expires
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/index.ts`
**Description:**
`startReconnectTimer` `onExpire` callback now also calls `applyAiTurn(game, gameId, seat)`
after broadcasting `game:player_timeout`. `applyAiTurn` guards against "not your turn"
internally, so it is safe to call unconditionally — AI only acts if the expired seat is
currently the active actor.
**Rulebook Section:** "AI Control — AI takeover on disconnect"

---

**Test baseline after Part 10:** 384 engine tests + 69 api-server tests = **453 total**. All green.
(Engine +9: ai-picker suite. API-server +18: turn-timer suite.)

---

## CHG-031 — [MIG-031] 5-char room code DB CHECK constraint
**Date:** 2026-07-20
**Files:** `lib/db/src/schema/rooms.ts`
**Description:**
Added `check("rooms_code_length_check", sql\`char_length(${t.code}) = 5\`)` to
`roomsTable` constraints array.  Any attempt to INSERT or UPDATE a rooms row with
a code that is not exactly 5 characters will be rejected by the database.
**Rulebook Section:** "Room Management — Room Code: Exactly 5 characters"

---

## CHG-032 — [MIG-032] Remove passwordHash column from rooms table
**Date:** 2026-07-20
**Files:** `lib/db/src/schema/rooms.ts`
**Description:**
Removed `passwordHash: text("password_hash")` column from `roomsTable`.
Rulebook specifies rooms are Public or Private — no passwords.
The column still exists on `usersTable` for account authentication; only the
rooms table copy is removed.
**Rulebook Section:** "Room Management — Room Types: no passwords"

---

## CHG-037 — [MIG-037] Seat lock on match start (verified / status recorded)
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/handlers/room.handler.ts` (MIG-041)
**Description:**
Seat lock is enforced by the existing `room.status !== "waiting"` guard in
`lobby:join_room` (added during MIG-041).  Once the room transitions to
`"in_game"` the handler throws `ROOM_NOT_FOUND`, preventing any new player from
joining or taking a seat.  Within an active game, `game:join` looks up a player
by userId — seat cannot be changed.  No additional code required; CHG recorded
to close the gap.
**Rulebook Section:** "Player Seating — Seat assignments fixed at match start"

---

## CHG-044 — [MIG-044] Player return fully restores control from AI
**Date:** 2026-07-20
**Files:** `artifacts/api-server/src/socket/handlers/game.handler.ts`
**Description:**
Extended the `game:join` reconnect branch to also handle `AI_PLAYING` state —
previously only `RECONNECTING` and `DISCONNECTED` were covered.  Added
`cancelTurnTimer(gameId, player.seat)` at the top of the reconnect path so that
any AI turn timer queued for the returning player's seat is immediately cancelled
before the human's timer is started.  This guarantees no stale AI action fires
after the player resumes control.
**Rulebook Section:** "Reconnection — AI Takeover: player resumes on return"

---

## CHG-048 — [MIG-048] Live Match Panel widget
**Date:** 2026-07-20
**Files:** `flutter_client/lib/widgets/live_panel.dart` (NEW)
**Description:**
`LivePanel` StatefulWidget permanently visible on the right side of the game
screen.  Displays: round number, phase chip, Team A / Team B score progress bars
(vs target 52), current bid and bidder seat, trump suit once declared, trick
progress (N/8 pips), per-team trick counts, and a live countdown timer with
urgency highlight at ≤10 s.
**Rulebook Section:** "UI — Live Match Panel permanently visible during gameplay"

---

## CHG-049 — [MIG-049] Flutter Game UI screen
**Date:** 2026-07-20
**Files:**
- `flutter_client/lib/screens/game_screen.dart` (NEW)
- `flutter_client/lib/widgets/card_widget.dart` (NEW)
- `flutter_client/lib/models/game_state.dart` (NEW)
- `flutter_client/lib/models/card.dart` (NEW)
- `flutter_client/lib/services/socket_service.dart` (NEW)
**Description:**
`GameScreen` StatefulWidget: oval wooden-texture table rendered with a Stack +
elliptical gradient Container; four seat positions (South=local, West, North,
East) each hosting `PlayerIdentityWidget` + card zones; current trick displayed
in a cross pattern at table centre; trump indicator; bid/trump/pass action bar
when it is the local player's turn; round-end and game-end popup overlays.
`CardWidget` renders face-up cards (rank + suit symbol) and card backs (crimson
gradient + decorative border).  `CardHandWidget` fans cards with lift-on-select
and double-tap-to-confirm interaction.
**Rulebook Section:** "UI — Table: Oval, wooden texture; Card Zones: three per player"

---

## CHG-050 — [MIG-050] Landscape enforcement
**Date:** 2026-07-20
**Files:** `flutter_client/lib/main.dart`
**Description:**
`main()` now calls `SystemChrome.setPreferredOrientations([landscapeLeft,
landscapeRight])` before `runApp`.  Also enables `SystemUiMode.immersiveSticky`
for full-screen game experience.  `ChhakriApp` MaterialApp updated with full
dark theme and an `_EntryScreen` that accepts server URL + JWT token + game ID
to connect to a running backend.
**Rulebook Section:** "UI — Orientation: Landscape only"

---

## CHG-051 — [MIG-051] Player Identity Display widget
**Date:** 2026-07-20
**Files:** `flutter_client/lib/widgets/player_identity.dart` (NEW)
**Description:**
`PlayerIdentityWidget` with two variants: `full` (sidebar) and `compact`
(in-seat overlay).  Full variant: circular avatar with initials fallback,
team-colour border, active-turn gold glow, connection-state icon + label
(Online/Offline/Reconnecting/AI), mute icon, Admin/Dealer/Bid-Winner badge
chips.  Compact variant: mini avatar + name + icon row — used at table seats.
AnimatedContainer transitions glow on/off as `isCurrentPlayer` changes.
**Rulebook Section:** "UI — Player Identity: Profile Photo, Display Name, Village Name,
Online/Connection/Mic Status, Admin/Dealer/Bid Winner badges"

---

**Test baseline after Part 11:** 384 engine tests + 69 api-server tests = **453 total**. All green.
Volume 4 complete — all 51 MIGs implemented (MIG-001 through MIG-051).

