# Verification Framework
## Volume 3 — Part 10 | Bundelkhandi Chhakri

**Authority:** Migration Plan (MIG-001 to MIG-051)
**Total Verification Items:** 51
**Current Status:** All BLOCKED (implementation not yet begun)

---

## VERIFICATION LEVELS

| Level | Name | Condition |
|---|---|---|
| L1 | Compilation | Project builds without TypeScript/Flutter errors |
| L2 | Unit | Modified module passes its own tests |
| L3 | Integration | Cross-module communication operates correctly |
| L4 | Rulebook | Repository behavior matches Official Rulebook exactly |

## ACCEPTANCE STATUSES

| Status | Meaning |
|---|---|
| PASS | All required verification levels satisfied |
| FAIL | One or more verification levels failed |
| BLOCKED | Implementation not yet performed |

---

## PHASE 1 — FOUNDATION

| MIG-ID | GAP-ID | Required Levels | Key Evidence Required | Status |
|---|---|---|---|---|
| MIG-001 | GAP-025 | L1, L2, L4 | Types `SecretHand`, `FaceDown`, `FaceUp` importable; match Rulebook zone model (2+3+3) | BLOCKED |
| MIG-002 | GAP-002 | L1, L2, L4 | `generateDeck(4)` = 32 cards; no rank 2–6; all 214 engine tests pass | BLOCKED |
| MIG-003 | GAP-029 | L1, L2, L4 | `calculateRoundScore()` accepts trick counts not card points; scoring tests pass | BLOCKED |
| MIG-004 | GAP-015 | L1, L2, L4 | Bid validation rejects values outside {5,6,7,8}; bid constant tests pass | BLOCKED |
| MIG-005 | GAP-036 | L1, L2, L3, L4 | Unauthenticated request → 401; authenticated request passes to handler | BLOCKED |
| MIG-006 | GAP-004 | L1, L2, L4 | `room_players` seat constraint accepts 0–5; rejects 6+ | BLOCKED |
| MIG-007 | GAP-005 | L1, L2, L4 | `game_players` seat constraint accepts 0–5; rejects 6+ | BLOCKED |
| MIG-008 | GAP-009 | L1, L2, L4 | `maxPlayers` accepts 4 and 6; rejects all other values | BLOCKED |
| MIG-009 | GAP-012 | L1, L2, L4 | One admin column per team; nullable for auto-assign on departure | BLOCKED |
| MIG-010 | GAP-022 | L1, L2, L3, L4 | CONNECTED/RECONNECTING/AI_PLAYING states defined; disconnect triggers RECONNECTING | BLOCKED |
| MIG-011 | GAP-018 | L1, L2, L4 | `winningBid` check constraint accepts only 5,6,7,8 | BLOCKED |
| MIG-012 | GAP-030 | L1, L2, L4 | Bid success → bid team +Bid, opponent −Bid; failure → bid team −(2×Bid), opponent +(2×Bid) | BLOCKED |
| MIG-013 | GAP-032 | L1, L2, L4 | `applyRoundScore()` declares winner at +52; TARGET_SCORE=52 in constants | BLOCKED |
| MIG-014 | GAP-035 | L1, L2, L4 | `targetScore` constraint {300,500,750} removed; default = 52 | BLOCKED |
| MIG-015 | GAP-037 | L1, L2, L3, L4 | Socket connection without token rejected UNAUTHORIZED on both namespaces | BLOCKED |
| MIG-016 | GAP-038 | L1, L2, L3, L4 | All 7 steps present as distinct callable units; no state mutation if any step fails | BLOCKED |

---

## PHASE 2 — CORE GAMEPLAY

| MIG-ID | GAP-ID | Required Levels | Key Evidence Required | Status |
|---|---|---|---|---|
| MIG-017 | GAP-001 | L1, L2, L4 | `dealCards()` returns `{secretHand:2, faceDown:3, faceUp:3}` per player | BLOCKED |
| MIG-018 | GAP-023 | L1, L2, L4 | `getLegalMoves()` accepts zone-separated inputs; zone-aware tests pass | BLOCKED |
| MIG-019 | GAP-039 | L1, L2, L3 | `pnpm codegen` runs clean; generated schemas reject malformed bodies | BLOCKED |
| MIG-020 | GAP-003 | L1, L2, L4 | Deal 2 Secret Hand → pause for Primary Bid → deal 3 Face-down → 3 Face-up | BLOCKED |
| MIG-021 | GAP-026 | L1, L2, L4 | Face-down eligible only when Lead Suit absent from both Face-up AND Secret Hand | BLOCKED |
| MIG-022 | GAP-016 | L1, L2, L4 | Primary Trump stored as `primaryTrump`; selected immediately after Primary Bid=5 | BLOCKED |
| MIG-023 | GAP-024 | L1, L2, L4 | When void, legal moves restricted to Face-up + Secret Hand (not Face-down) unless both void | BLOCKED |
| MIG-024 | GAP-014 | L1, L2, L4 | Only first Secret Hand recipient may bid; value fixed at 5; cannot pass | BLOCKED |
| MIG-025 | GAP-017 | L1, L2, L4 | Exactly 2 bidding rounds; pass not permanent; bid values {5,6,7,8} only | BLOCKED |
| MIG-026 | GAP-019 | L1, L2, L4 | `finalTrump` stored separately; requested only when Final Bid > Primary Bid | BLOCKED |
| MIG-027 | GAP-027 | L1, L2, L4 | Round always plays 8 tricks; early-termination Chhakri logic removed; all 214 tests pass | BLOCKED |
| MIG-028 | GAP-031 | L1, L2, L4 | No chhakri multiplier; `chhakrBonus` removed; scoring tests pass zero-sum formula | BLOCKED |
| MIG-029 | GAP-033 | L1, L2, L4 | Bid=8 + all 8 tricks won → Instant Series Victory declared | BLOCKED |
| MIG-030 | GAP-034 | L1, L2, L4 | Team with lower cumulative score becomes Dealer Team for next round | BLOCKED |

---

## PHASE 3 — MULTIPLAYER

| MIG-ID | GAP-ID | Required Levels | Key Evidence Required | Status |
|---|---|---|---|---|
| MIG-031 | GAP-007 | L1, L2, L4 | Room code generation = exactly 5 characters | BLOCKED |
| MIG-032 | GAP-008 | L1, L2, L4 | `passwordHash` absent from schema; no code references this field | BLOCKED |
| MIG-033 | GAP-046 | L1, L2, L3, L4 | Voice events in `types.ts`; mic status in broadcasted player state | BLOCKED |
| MIG-034 | GAP-043 | L1, L2, L3, L4 | Second login terminates first session; game state preserved through transition | BLOCKED |
| MIG-035 | GAP-013 | L1, L2, L3, L4 | Admin event types defined; non-admin submission rejected with auth error | BLOCKED |
| MIG-036 | GAP-011 | L1, L2, L3, L4 | Lock/unlock/shuffle/add AI/remove AI/stop/transfer admin events functional | BLOCKED |
| MIG-037 | GAP-006 | L1, L2, L3, L4 | Seat re-assignment rejected once match status is `in_game` | BLOCKED |
| MIG-038 | GAP-020 | L1, L2, L3, L4 | `game:your_turn` includes `timeoutAt` real timestamp; timer configurable by Admin | BLOCKED |
| MIG-039 | GAP-044 | L1, L2, L3, L4 | AI produces legal move from `getLegalMoves()`; passes `validateMove()` | BLOCKED |
| MIG-040 | GAP-040 | L1, L2, L3, L4 | New row written to `game_state_snapshots` after each event; full history reconstructable | BLOCKED |
| MIG-041 | GAP-010 | L1, L2, L3, L4 | All room handlers return `{ok:true}` on valid input; structured errors on invalid | BLOCKED |
| MIG-042 | GAP-041 | L1, L2, L3, L4 | Disconnect starts timer; all others receive `game:player_disconnected` with countdown | BLOCKED |
| MIG-043 | GAP-021 | L1, L2, L3, L4 | Turn timer expiry → AI submits legal move through full validation chain | BLOCKED |
| MIG-044 | GAP-042 | L1, L2, L3, L4 | Returning player gets current snapshot; AI relinquishes; all receive `game:player_reconnected` | BLOCKED |
| MIG-045 | GAP-045 | L1, L2, L3, L4 | Reconnect timer expiry → player state = AI_PLAYING; AI begins acting | BLOCKED |
| MIG-046 | GAP-051 | L1, L2, L3, L4 | All handler functions execute real broadcasts; public to room, private to socket | BLOCKED |
| MIG-047 | GAP-047 | L1, L2, L3, L4 | On reconnect, server fetches latest snapshot and broadcasts full state to returning client | BLOCKED |

---

## PHASE 4 — PRESENTATION

| MIG-ID | GAP-ID | Required Levels | Key Evidence Required | Status |
|---|---|---|---|---|
| MIG-048 | GAP-028 | L1, L3, L4 | Live Match Panel permanently visible; updates after each trick; reflects server state | BLOCKED |
| MIG-049 | GAP-048 | L1, L3, L4 | Three card zones rendered per player; bidding UI {5,6,7,8}; Result Popup after each round; oval wooden-texture table | BLOCKED |
| MIG-050 | GAP-049 | L1, L3, L4 | App locks landscape on all devices; portrait rotation ignored | BLOCKED |
| MIG-051 | GAP-050 | L1, L3, L4 | Photo, Display Name, Village Name, Online/Connection/Mic Status, Admin/Dealer/Bid Winner badges | BLOCKED |

---

## REGRESSION POLICY

After every Migration Item:
1. Full `pnpm test` suite must pass across all packages
2. All 214 existing game engine tests must continue to pass
3. No previously working socket event may regress
4. Flutter app must compile and launch after each Phase 4 item
