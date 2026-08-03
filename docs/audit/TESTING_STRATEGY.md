# Testing Strategy & Rulebook Compliance
## Volume 3 — Part 12 | Bundelkhandi Chhakri

**Authority:** Official Rulebook + Migration Plan
**Total Tests:** 95 (TEST-001 through TEST-095)
**Current Status:** All BLOCKED (implementation not yet begun)

**Compliance Threshold:** All 95 tests PASS + no unresolved P0/P1 gaps + no regression failures

---

## STATUS KEY
| Status | Meaning |
|---|---|
| PASS | Executed; behavior matches Rulebook exactly |
| FAIL | Executed; behavior does not match Rulebook |
| BLOCKED | Implementation not yet complete |

---

## CATEGORY 1 — RULEBOOK TESTS (TEST-001 to TEST-044)

### 1.1 Card Distribution

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-001 | Deck Construction — 4-Player | MIG-002 | `generateDeck(4)` = 32 cards; no rank 2–6; ranks 7–A × 4 suits | BLOCKED |
| TEST-002 | Deck Construction — 6-Player | MIG-002 | `generateDeck(6)` = 48 cards; no rank 2 in any suit | BLOCKED |
| TEST-003 | Card Zone Structure | MIG-017 | Each player: secretHand=2, faceDown=3, faceUp=3; total = numPlayers×8 | BLOCKED |
| TEST-004 | Phased Dealing — Primary Bid Pause | MIG-020 | After 2 Secret Hand cards dealt, state = BIDDING_PRIMARY; no further cards dealt | BLOCKED |
| TEST-005 | Phased Dealing — Completion | MIG-020 | After Primary Bid: 3 Face-down dealt per player, then 3 Face-up | BLOCKED |
| TEST-006 | Card Zone Visibility | MIG-017 | Secret Hand → owner only; Face-down → no player; Face-up → all players | BLOCKED |

### 1.2 Team Formation & Seating

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-007 | Player Count Validation | MIG-008 | numPlayers=4 succeeds; numPlayers=6 succeeds; any other value rejected | BLOCKED |
| TEST-008 | Alternating A-B Seating — 4-Player | MIG-006 | Seats 0,2 = Team A; seats 1,3 = Team B | BLOCKED |
| TEST-009 | Alternating A-B Seating — 6-Player | MIG-006 | Seats 0,2,4 = Team A; seats 1,3,5 = Team B | BLOCKED |
| TEST-010 | Seat-Lock on Match Start | MIG-037 | After match = in_game, seat re-assignment rejected | BLOCKED |
| TEST-011 | Team Assignment Persistence | MIG-037 | Team and seat unchanged across all rounds in a series | BLOCKED |

### 1.3 Primary Bid

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-012 | Primary Bid — Mandatory | MIG-024 | Only first Secret Hand recipient bids; value fixed at 5; any other value rejected | BLOCKED |
| TEST-013 | Primary Bid — No Pass | MIG-024 | Pass during Primary Bid phase returns error; state does not advance | BLOCKED |
| TEST-014 | Primary Trump Selection | MIG-022 | Primary Trump requested immediately after bid=5 accepted; state = TRUMP_PRIMARY | BLOCKED |
| TEST-015 | Primary Trump — Wrong Player Rejected | MIG-022 | Trump from non-Primary-Bidder during TRUMP_PRIMARY rejected | BLOCKED |

### 1.4 Final Bid & Trump

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-016 | Two-Round Bidding Structure | MIG-025 | Exactly 2 bidding rounds; ends automatically after round 2 | BLOCKED |
| TEST-017 | Valid Bid Values | MIG-004 | 5/6/7/8 accepted; all other values rejected | BLOCKED |
| TEST-018 | Pass — Not Permanent | MIG-025 | Player who passes in Round 1 may still bid in Round 2 | BLOCKED |
| TEST-019 | Final Trump — Required on Bid Increase | MIG-026 | Final Bid > Primary Bid → state = TRUMP_FINAL; finalTrump stored separately | BLOCKED |
| TEST-020 | Final Trump — Not Required When Bid Unchanged | MIG-026 | Final Bid = Primary Bid → no Final Trump; finalTrump = primaryTrump | BLOCKED |

### 1.5 Turn Order

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-021 | Turn Order — Sequential | MIG-016 | Turn advances by seat number; wrap-around correct | BLOCKED |
| TEST-022 | Turn Ownership Enforcement | MIG-016 | Card play from non-active seat rejected; game state unchanged | BLOCKED |
| TEST-023 | Trick Lead Turn | MIG-016 | Trick winner leads next trick; their seat becomes active turn | BLOCKED |

### 1.6 Legal Move Validation

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-024 | Legal Move — Follow Lead Suit from Face-up | MIG-018 | Lead Suit in Face-up → must play from Face-up or Secret Hand; other suit rejected | BLOCKED |
| TEST-025 | Legal Move — Follow Lead Suit from Secret Hand | MIG-018 | Lead Suit absent from Face-up but in Secret Hand → must play from Secret Hand | BLOCKED |
| TEST-026 | Legal Move — Free Choice When Void | MIG-023 | Lead Suit absent from both zones → any card from Face-up or Secret Hand; Face-down still excluded | BLOCKED |
| TEST-027 | Legal Move — Face-down Eligibility | MIG-021 | Face-down only when Lead Suit absent from BOTH Face-up AND Secret Hand | BLOCKED |

### 1.7 Face-down Logic

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-028 | Face-down Reveal — Compulsory | MIG-021 | When eligible, exactly one card revealed and played; player does not choose which | BLOCKED |
| TEST-029 | Face-down — Zone Depletion | MIG-021 | Revealed card removed from Face-down zone; count decrements | BLOCKED |
| TEST-030 | Face-down — All Revealed | MIG-021 | When all 3 Face-down played, zone empty; no further Face-down plays attempted | BLOCKED |

### 1.8 Trick Resolution

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-031 | Trick Resolution — Trump Wins | MIG-027 | Any Trump played → highest Trump wins; Lead Suit irrelevant | BLOCKED |
| TEST-032 | Trick Resolution — No Trump | MIG-027 | No Trump played → highest Lead Suit wins; off-suit does not win | BLOCKED |
| TEST-033 | Trick Count — Always 8 | MIG-027 | Round plays exactly 8 tricks regardless of any score condition | BLOCKED |
| TEST-034 | No Early Round End | MIG-027, MIG-028 | Chhakri (consecutive tricks) does not terminate round; always 8 tricks | BLOCKED |

### 1.9 Round Resolution & Scoring

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-035 | Scoring — Bid Success | MIG-012 | Bid Team won ≥ Bid tricks → Bid Team +Bid, Opponent −Bid | BLOCKED |
| TEST-036 | Scoring — Bid Failure | MIG-012 | Bid Team won < Bid tricks → Bid Team −(2×Bid), Opponent +(2×Bid) | BLOCKED |
| TEST-037 | Scoring — Zero-Sum Integrity | MIG-012 | After any round: Team A score + Team B score = 0 | BLOCKED |
| TEST-038 | Scoring — No Chhakri Bonus | MIG-028 | No multiplier or bonus in any scoring path | BLOCKED |
| TEST-039 | Scoring — All Bid Values | MIG-012 | Bid=5/6/7/8 each produce correct ±Bid (success) and ±2×Bid (failure) amounts | BLOCKED |

### 1.10 Series Completion

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-040 | Series End — +52 Threshold | MIG-013 | Series ends when either team reaches +52; no further rounds | BLOCKED |
| TEST-041 | Series End — Exactly at +52 | MIG-013 | Exactly +52 wins; threshold is inclusive | BLOCKED |
| TEST-042 | Perfect 8/8 — Instant Series Victory | MIG-029 | Bid=8 + all 8 tricks won → Instant Series Victory immediately | BLOCKED |
| TEST-043 | Dealer Rotation — Trailing Team | MIG-030 | Team with lower cumulative score becomes Dealer Team for next round | BLOCKED |
| TEST-044 | Series State Persistence | MIG-013 | Cumulative scores persist correctly across all rounds | BLOCKED |

---

## CATEGORY 2 — MULTIPLAYER TESTS (TEST-045 to TEST-072)

### 2.1 Room Creation

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-045 | Room Code — 5 Characters | MIG-031 | Room code = exactly 5 characters | BLOCKED |
| TEST-046 | Room Type — Public and Private | MIG-041 | Public and Private rooms; no password field | BLOCKED |
| TEST-047 | Room — No Password | MIG-032 | Request with `password` field rejected; `passwordHash` column absent | BLOCKED |

### 2.2 Player Join

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-048 | Room Join — Valid Code | MIG-041 | `lobby:join_room` with valid 5-char code succeeds | BLOCKED |
| TEST-049 | Room Join — Invalid Code | MIG-041 | Unknown room code returns structured error; state unchanged | BLOCKED |
| TEST-050 | Room Join — Capacity Enforcement | MIG-008 | 5th player blocked from 4-player room; 7th from 6-player room | BLOCKED |

### 2.3 Ready System

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-051 | Ready System | MIG-041 | `lobby:set_ready` toggles state; match blocked until all seats full and ready | BLOCKED |
| TEST-052 | Match Start — Player Count Validated | MIG-007, MIG-008 | Match blocked unless exactly 4 or 6 players | BLOCKED |

### 2.4 Admin Controls

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-053 | Dual Admin — One Per Team | MIG-009 | Team A Admin and Team B Admin exist simultaneously; equal authority | BLOCKED |
| TEST-054 | Admin Authority — Equal | MIG-035 | Neither admin subordinate to the other | BLOCKED |
| TEST-055 | Admin Actions — Non-Admin Rejection | MIG-035 | Admin-only events from non-admin rejected with auth error | BLOCKED |
| TEST-056 | Admin — Auto-Reassign on Departure | MIG-009, MIG-036 | Admin role auto-transferred when admin leaves; no admin-less state | BLOCKED |
| TEST-057 | Admin — Turn Timer Configuration | MIG-038 | Admin can set timer duration; applies to subsequent turns | BLOCKED |

### 2.5 Socket Synchronization

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-058 | Socket Auth — Lobby Namespace | MIG-015 | Connection to `/lobby` without token rejected UNAUTHORIZED | BLOCKED |
| TEST-059 | Socket Auth — Game Namespace | MIG-015 | Connection to `/game` without token rejected UNAUTHORIZED | BLOCKED |
| TEST-060 | State Broadcast — Public Events | MIG-046 | All players receive state update after each game event | BLOCKED |
| TEST-061 | State Broadcast — Private Events | MIG-046 | Secret Hand broadcast only to card owner | BLOCKED |
| TEST-062 | Snapshot Integrity | MIG-040 | Snapshot row written after each event; full history reconstructable | BLOCKED |

### 2.6 Reconnection

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-063 | Reconnect Timer — Starts on Disconnect | MIG-042 | Disconnect starts timer; all others receive `game:player_disconnected` with countdown | BLOCKED |
| TEST-064 | Reconnect Timer — AI Takeover on Expiry | MIG-045 | Timer expiry → player state = AI_PLAYING; game continues | BLOCKED |
| TEST-065 | Player Return — Same Seat | MIG-044 | Returning player reconnects to original seat with all card zones intact | BLOCKED |
| TEST-066 | Player Return — AI Relinquishes | MIG-044 | AI stops acting; player regains control on their next turn | BLOCKED |
| TEST-067 | One Account — One Active Device | MIG-034 | Second login terminates first device session; game state preserved | BLOCKED |

### 2.7 AI Takeover

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-068 | AI — Legal Moves Only | MIG-039 | AI move always legal per `getLegalMoves()` | BLOCKED |
| TEST-069 | AI — Same Validation Chain | MIG-043 | AI move passes through full 7-step validation chain | BLOCKED |
| TEST-070 | AI — Turn Timer Coverage | MIG-043 | AI submits move before turn timer expires | BLOCKED |

### 2.8 Voice Rules

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-071 | Voice — Server Events Defined | MIG-033 | Voice events in `types.ts`; server handles without crashing | BLOCKED |
| TEST-072 | Voice — Mic Status Visible | MIG-033 | Each player's mic on/off status in broadcasted player state | BLOCKED |

---

## CATEGORY 3 — UI TESTS (TEST-073 to TEST-087)

### 3.1 Card Visibility

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-073 | UI — Three Card Zones Per Player | MIG-049 | Three distinct zones rendered per player; zones visually differentiated | BLOCKED |
| TEST-074 | UI — Secret Hand Privacy | MIG-049 | Owner sees face-up; others see face-down placeholders | BLOCKED |
| TEST-075 | UI — Face-up Always Visible | MIG-049 | Face-up cards visible rank/suit to all players | BLOCKED |
| TEST-076 | UI — Face-down Hidden | MIG-049 | Face-down shown as placeholder to all players including owner | BLOCKED |

### 3.2 Match Progress Panel

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-077 | UI — Live Match Panel Always Visible | MIG-048 | Panel cannot be dismissed; visible at all times | BLOCKED |
| TEST-078 | UI — Panel Updates After Each Trick | MIG-048 | Trick count updates immediately after each trick resolves | BLOCKED |
| TEST-079 | UI — Panel Reflects Server State | MIG-048 | All panel data from server broadcast; no client-side calculation | BLOCKED |

### 3.3 Scoreboard

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-080 | UI — Result Popup After Each Round | MIG-049 | Result Popup shows round score + cumulative series scores for both teams | BLOCKED |
| TEST-081 | UI — Series Result Screen | MIG-049 | Series end screen identifies winner; displays final scores | BLOCKED |

### 3.4 Notifications

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-082 | UI — Turn Indicator | MIG-038 | Active player highlighted; countdown reflects server `timeoutAt` | BLOCKED |
| TEST-083 | UI — Player Identity Elements | MIG-051 | Photo, Name, Village, Online Status, Admin/Dealer/Bid Winner badges per player | BLOCKED |
| TEST-084 | UI — Disconnect Notification | MIG-046 | In-game notification shows disconnected player name and reconnect countdown | BLOCKED |

### 3.5 Result Screens

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-085 | UI — Landscape Mode Only | MIG-050 | App locks landscape; portrait rotation ignored on Android and iOS | BLOCKED |
| TEST-086 | UI — Oval Table Presentation | MIG-049 | Oval wooden-texture table; player positions around oval matching seat assignments | BLOCKED |
| TEST-087 | UI — State Accuracy | MIG-046 | Every UI element reflects most recent server state broadcast | BLOCKED |

---

## CATEGORY 4 — REGRESSION TESTS (TEST-088 to TEST-095)

| Test ID | Rulebook Section | MIG-ID | Expected Result | Status |
|---|---|---|---|---|
| TEST-088 | Regression — Engine Baseline | All Phase 1 + Phase 2 | All 214 existing Vitest engine tests pass; no test deleted to accommodate migration | BLOCKED |
| TEST-089 | Regression — API Server Compilation | All api-server MIG items | `@workspace/api-server` compiles without TS errors after each item | BLOCKED |
| TEST-090 | Regression — Database Schema | All db MIG items | `@workspace/db` compiles; constraint changes non-breaking to valid data | BLOCKED |
| TEST-091 | Regression — Socket Events | MIG-046, MIG-047 | All previously working socket events continue working after each item | BLOCKED |
| TEST-092 | Regression — Phase Gate Integrity | All MIG items | No Phase N+1 item begins before all Phase N entries show ACCEPTED | BLOCKED |
| TEST-093 | Regression — Flutter Compilation | All Phase 4 MIG items | Flutter app compiles without errors after each Phase 4 item | BLOCKED |
| TEST-094 | Regression — Seven-Step Validation | MIG-016 | Validation chain intact after every Phase 2 and Phase 3 item | BLOCKED |
| TEST-095 | Regression — Zero-Sum Invariant | MIG-012 | Team A + Team B = 0 after every round in every test scenario | BLOCKED |
