# Implementation Roadmap
## Volume 3 — Part 9 | Bundelkhandi Chhakri

**Authority:** Migration Plan (MIG-001 to MIG-051)
**Total Phases:** 4
**Total Items:** 51

---

## PHASE GATE CRITERIA

| Gate | Condition |
|---|---|
| Phase 1 → Phase 2 | All 16 Phase 1 Change Log entries show ACCEPTED |
| Phase 2 → Phase 3 | All 14 Phase 2 entries ACCEPTED + engine plays full Rulebook-compliant series |
| Phase 3 → Phase 4 | All 17 Phase 3 entries ACCEPTED + two players complete a series over network |
| Phase 4 → Complete | All 4 Phase 4 entries ACCEPTED + Flutter meets all Rulebook UI requirements |

---

## PHASE 1 — FOUNDATION

**Objective:** Correct all data model, type system, auth, and scoring fundamentals before any gameplay logic.
**Prerequisite:** None. Phase 1 is the starting point.
**Regression Baseline:** 214 engine tests must continue passing after every item.

| Sprint Order | MIG-ID | GAP-ID | Description | Dependency |
|---|---|---|---|---|
| 1 | MIG-001 | GAP-025 | Define card zone types (SecretHand, FaceDown, FaceUp) | None |
| 2 | MIG-002 | GAP-002 | Correct 4-player deck (32 cards, remove ranks 2–6) | MIG-001 |
| 3 | MIG-003 | GAP-029 | Replace card-point scoring with trick-count model | MIG-001 |
| 4 | MIG-004 | GAP-015 | Restrict bid values to {5, 6, 7, 8} | MIG-001 |
| 5 | MIG-005 | GAP-036 | Enforce auth middleware (HTTP routes) | None |
| 6 | MIG-006 | GAP-004 | Expand room_players seat constraint to 0–5 | None |
| 7 | MIG-007 | GAP-005 | Expand game_players seat constraint to 0–5 | None |
| 8 | MIG-008 | GAP-009 | Fix maxPlayers constraint to accept 4 or 6 | None |
| 9 | MIG-009 | GAP-012 | Add Dual Admin columns to DB schema | None |
| 10 | MIG-010 | GAP-022 | Add RECONNECTING / AI_PLAYING connection states | MIG-006, MIG-007 |
| 11 | MIG-011 | GAP-018 | Add winningBid check constraint {5,6,7,8} | MIG-004 |
| 12 | MIG-012 | GAP-030 | Implement zero-sum scoring formula | MIG-003 |
| 13 | MIG-013 | GAP-032 | Set series end threshold to +52; TARGET_SCORE = 52 | MIG-012 |
| 14 | MIG-014 | GAP-035 | Remove targetScore constraint {300,500,750}; default 52 | MIG-013 |
| 15 | MIG-015 | GAP-037 | Enforce socket auth on handshake (both namespaces) | MIG-005 |
| 16 | MIG-016 | GAP-038 | Implement seven-step validation chain | MIG-015 |

---

## PHASE 2 — CORE GAMEPLAY

**Objective:** Implement all Rulebook gameplay mechanics end-to-end in the engine and wire to api-server.
**Prerequisite:** All Phase 1 items ACCEPTED.
**First action:** Register and resolve GAP-052 / MIG-052 (game-engine → api-server package.json dependency).

| Sprint Order | MIG-ID | GAP-ID | Description | Dependency |
|---|---|---|---|---|
| 1 | MIG-052* | GAP-052* | Add game-engine to api-server dependencies | Phase 1 complete |
| 2 | MIG-017 | GAP-001 | Implement card zone structure in dealing output | MIG-001 |
| 3 | MIG-018 | GAP-023 | Make getLegalMoves() zone-aware | MIG-017 |
| 4 | MIG-019 | GAP-039 | Run Zod codegen against current API spec | MIG-016 |
| 5 | MIG-020 | GAP-003 | Implement phased dealing sequence | MIG-017 |
| 6 | MIG-021 | GAP-026 | Implement face-down reveal logic | MIG-018, MIG-020 |
| 7 | MIG-022 | GAP-016 | Add Primary Trump state to round model | MIG-004 |
| 8 | MIG-023 | GAP-024 | Enforce void-in-suit zone restriction | MIG-018, MIG-021 |
| 9 | MIG-024 | GAP-014 | Implement Primary Bid phase (mandatory bid=5) | MIG-004, MIG-022 |
| 10 | MIG-025 | GAP-017 | Implement two-round bidding structure | MIG-024 |
| 11 | MIG-026 | GAP-019 | Separate Primary Trump and Final Trump storage | MIG-022, MIG-025 |
| 12 | MIG-027 | GAP-027 | Remove early round termination; always 8 tricks | MIG-023 |
| 13 | MIG-028 | GAP-031 | Remove Chhakri scoring bonus | MIG-012 |
| 14 | MIG-029 | GAP-033 | Implement Perfect 8/8 Instant Series Victory | MIG-013, MIG-027 |
| 15 | MIG-030 | GAP-034 | Fix dealer rotation (trailing team becomes dealer) | MIG-013 |

*MIG-052 / GAP-052 to be formally registered before Phase 2 begins per DF-002.

---

## PHASE 3 — MULTIPLAYER

**Objective:** Implement full real-time multiplayer: rooms, admin, reconnection, AI, socket sync.
**Prerequisite:** All Phase 2 items ACCEPTED.

| Sprint Order | MIG-ID | GAP-ID | Description | Dependency |
|---|---|---|---|---|
| 1 | MIG-041 | GAP-010 | Full room handler implementation | Phase 2 complete |
| 2 | MIG-031 | GAP-007 | Room code 5 characters | MIG-041 |
| 3 | MIG-032 | GAP-008 | Remove passwordHash column | MIG-041 |
| 4 | MIG-037 | GAP-006 | Enforce seat lock on match start | MIG-041 |
| 5 | MIG-009 | GAP-012 | Wire Dual Admin to socket events | MIG-041 |
| 6 | MIG-035 | GAP-013 | Admin socket event handlers | MIG-009 |
| 7 | MIG-036 | GAP-011 | Admin room event handlers | MIG-035 |
| 8 | MIG-046 | GAP-051 | Implement actual socket broadcasts | MIG-041 |
| 9 | MIG-040 | GAP-040 | Snapshot writes after each game event | MIG-046 |
| 10 | MIG-010 | GAP-022 | Connection state machine (wire to socket) | MIG-046 |
| 11 | MIG-042 | GAP-041 | Reconnect timer on disconnect | MIG-010 |
| 12 | MIG-039 | GAP-044 | AI move generation module | MIG-018 |
| 13 | MIG-045 | GAP-045 | AI takeover on reconnect timer expiry | MIG-039, MIG-042 |
| 14 | MIG-044 | GAP-042 | Player return restores control from AI | MIG-045 |
| 15 | MIG-038 | GAP-020 | Turn timer (configurable by Admin) | MIG-036 |
| 16 | MIG-043 | GAP-021 | AI takeover on turn timeout | MIG-038, MIG-039 |
| 17 | MIG-034 | GAP-043 | One-account one-device enforcement | MIG-010 |
| 18 | MIG-047 | GAP-047 | Error recovery state broadcast on reconnect | MIG-040, MIG-044 |
| 19 | MIG-033 | GAP-046 | Voice socket events and mic status | MIG-046 |

---

## PHASE 4 — PRESENTATION

**Objective:** Build the complete Flutter game UI matching all Rulebook visual and interaction requirements.
**Prerequisite:** All Phase 3 items ACCEPTED.

| Sprint Order | MIG-ID | GAP-ID | Description | Dependency |
|---|---|---|---|---|
| 1 | MIG-050 | GAP-049 | Landscape mode enforcement | Phase 3 complete |
| 2 | MIG-049 | GAP-048 | Flutter game screen (oval table, 3 zones, bidding UI, Result Popup) | MIG-050 |
| 3 | MIG-048 | GAP-028 | Live Match Panel (permanently visible) | MIG-049 |
| 4 | MIG-051 | GAP-050 | Player identity display (photo, name, village, badges) | MIG-049 |
