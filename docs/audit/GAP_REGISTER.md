# Official Gap Register
## Volume 3 — Part 6 | Bundelkhandi Chhakri

**Authority:** Volume 2 Official Rulebook (RULE-001 to RULE-030)
**Total Gaps:** 51 (GAP-001 through GAP-051)
**Classifications:** DIFFERENT (21) | MISSING (28) | PARTIAL (2)

---

### Classification Key
- **DIFFERENT** — Behavior exists in repository but differs from Rulebook
- **MISSING** — Required behavior absent entirely from repository
- **PARTIAL** — Behavior exists but is incomplete stub only

---

## DIFFERENT GAPS (21)

| Gap ID | Rulebook Section | Description |
|---|---|---|
| GAP-002 | Deck Construction | 4-player deck uses all 52 cards; Rulebook requires 32 (remove ranks 2–6) |
| GAP-004 | Player Seating | `room_players` seat constraint is `0–3`; 6-player requires `0–5` |
| GAP-005 | Player Seating | `game_players` seat constraint is `0–3`; 6-player requires `0–5` |
| GAP-007 | Room Management | Room code is 6 characters; Rulebook requires 5 |
| GAP-008 | Room Management | `passwordHash` column exists; Rulebook has no room passwords |
| GAP-009 | Deck Construction | `maxPlayers` DB constraint allows only 4; Rulebook allows 4 or 6 |
| GAP-015 | Bidding | Bid values accepted are 51–100; Rulebook allows only 5, 6, 7, 8 |
| GAP-017 | Bidding | Bidding uses pass-elimination model; Rulebook requires exactly 2 rounds |
| GAP-018 | Bidding | `winningBid` column has no constraint; must accept only 5/6/7/8 |
| GAP-022 | Reconnection | Connection state machine absent; DB has no RECONNECTING / AI_PLAYING states |
| GAP-027 | Trick Resolution | Chhakri consecutive trick rule causes early round end; Rulebook prohibits it |
| GAP-029 | Scoring | Scoring uses card-point accumulation; Rulebook uses trick count vs bid |
| GAP-030 | Scoring | Scoring formula uses multiplier model; Rulebook requires zero-sum |
| GAP-031 | Scoring | Chhakri scoring bonus applied; Rulebook has no such bonus |
| GAP-032 | Series Engine | Series target is 500; Rulebook requires +52 |
| GAP-034 | Series Engine | Dealer rotation logic incorrect; Rulebook requires trailing team becomes dealer |
| GAP-035 | Series Engine | DB `targetScore` constrained to {300,500,750}; must be 52 |
| GAP-036 | Validation Chain | Auth middleware unconditional pass-through; must enforce Identity step |
| GAP-037 | Validation Chain | Socket auth not enforced on handshake for either namespace |
| GAP-039 | Validation Chain | Zod schemas not generated; `@workspace/api-zod/generated/` effectively empty |
| GAP-051 | Socket Synchronization | Socket broadcast handlers are stubs; no actual broadcasts occur |

---

## MISSING GAPS (28)

| Gap ID | Rulebook Section | Description |
|---|---|---|
| GAP-001 | Card Zone Structure | No card zone types exist (SecretHand, FaceDown, FaceUp) |
| GAP-003 | Distribution Sequence | No phased dealing (2 Secret Hand → bid pause → 3 Face-down → 3 Face-up) |
| GAP-006 | Player Seating | No seat-lock enforcement when match transitions to `in_game` |
| GAP-010 | Room Management | Room socket handlers are stubs; no functional create/join/leave |
| GAP-011 | Admin System | No room admin socket events (lock, shuffle, add AI, stop match, transfer) |
| GAP-012 | Admin System | No Dual Admin in DB; no one-admin-per-team schema |
| GAP-013 | Admin System | No admin authority validation in socket handlers |
| GAP-014 | Primary Bid | No Primary Bid phase; no mandatory bid=5 by first Secret Hand recipient |
| GAP-016 | Trump | No Primary Trump state; no distinction between Primary and Final Trump |
| GAP-019 | Trump | No Primary vs Final Trump storage in round state |
| GAP-020 | Turn Engine | `game:your_turn` emits `timeoutAt: null`; no turn timer |
| GAP-021 | Turn Engine | No AI takeover on turn timeout |
| GAP-023 | Legal Move Validation | `getLegalMoves()` has no zone awareness; operates on flat card list |
| GAP-024 | Legal Move Validation | No void-in-suit zone restriction (Face-down excluded unless both zones void) |
| GAP-025 | Card Zone Structure | No card zone types defined anywhere in the engine |
| GAP-026 | Face-down Logic | No face-down reveal logic; no eligibility check; no compulsory reveal |
| GAP-028 | UI Presentation | No Live Match Panel (permanently visible during gameplay) |
| GAP-033 | Series Engine | No Perfect 8/8 Instant Series Victory |
| GAP-038 | Validation Chain | No seven-step validation chain (Identity→Match State→Turn→Action→Rule→Update→Sync) |
| GAP-040 | Socket Synchronization | No snapshot writes to `game_state_snapshots` after each game event |
| GAP-041 | Reconnection | No reconnect timer on player disconnect |
| GAP-042 | Reconnection | No player-return-restores-control logic |
| GAP-043 | Reconnection | No one-account-one-active-device enforcement |
| GAP-044 | AI Control | No AI move generation module |
| GAP-045 | AI Control | No AI takeover on reconnect timer expiry |
| GAP-046 | Voice | No voice socket events; no mic/speaker controls |
| GAP-047 | Error Recovery | No error recovery broadcast; no state snapshot sent on reconnect |
| GAP-048 | UI Presentation | No Flutter game UI (only placeholder screen) |
| GAP-049 | UI Presentation | No landscape-only enforcement in Flutter |
| GAP-050 | UI Presentation | No player identity display (photo, name, village, status, badges) |

---

## PARTIAL GAPS (2)

| Gap ID | Rulebook Section | Description |
|---|---|---|
| GAP-010 | Room Management | Room handlers exist but are stubs returning no-op responses |
| GAP-051 | Socket Synchronization | Socket sync structure exists but broadcasts never execute |

---

## DOCUMENTATION FINDINGS (non-blocking)

| Finding ID | Description |
|---|---|
| DF-001 | RULE-008 to RULE-019 and RULE-021 to RULE-030 not assigned individual numbers in received Volume 2 documents; all behaviors captured functionally in this register |
| DF-002 | `@workspace/game-engine` not in `@workspace/api-server` package.json dependencies; not formally a Gap ID but must be resolved as GAP-052 / MIG-052 before Phase 2 begins |
| DF-003 | MIG-019 (Zod codegen) has no dedicated rejection test; add one explicitly during acceptance |
