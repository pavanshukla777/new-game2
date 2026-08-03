# Bundelkhandi Chhakri — Rule Implementation Audit

**Date:** 2026-07-19  
**Engine version:** `lib/game-engine` (Phase 1 complete, 214/214 tests passing)  
**Reference document:** `docs/GAME_DESIGN.md`  
**Audit scope:** Every rule implemented in the engine, cross-referenced against the design doc, with assumptions and gaps flagged.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Matches game design exactly |
| ⚠️ | Implemented with an assumption or approximation |
| ❌ | Not implemented (gap or deliberate deferral) |
| ℹ️ | Optional variant (implemented behind a config flag) |

---

## 1. Deck & Cards

### 1.1 Standard Deck — 4-player
**Implemented rule:** 52 cards (13 ranks × 4 suits). Ranks A–2, all four suits (S, H, D, C).  
**Source file:** `lib/game-engine/src/constants.ts` — `ALL_RANKS`, `SUITS`; `lib/game-engine/src/deck.ts` — `generateDeck(4)`  
**Status:** ✅ Matches design doc exactly.

---

### 1.2 6-player Deck — 2s Removed
**Implemented rule:** 48 cards (ranks 3–A × 4 suits). 2s are excluded. 8 cards per player.  
**Source file:** `lib/game-engine/src/constants.ts` — `SIX_PLAYER_RANKS`; `lib/game-engine/src/deck.ts` — `generateDeck(6)`  
**Status:** ⚠️ **Assumption made.**  
`GAME_DESIGN.md` documents only the 4-player (52-card) variant. The 6-player deck and its rules (8 tricks, 6 players, 3-per-team) are not in the design doc. The decision to remove 2s (which carry 0 points) was made to preserve the 100-point total. No canonical source was consulted for this decision.  
**Required verification:** Confirm with a Bundelkhandi Chhakri player that 6-player removes 2s and uses 8 tricks.

---

### 1.3 Point Values
**Implemented rule:** A=4, K=3, Q=2, J=1, 10=10, 5=5. All other ranks = 0. Total = 100.  
**Source file:** `lib/game-engine/src/constants.ts` — `POINT_VALUES`, `getPointValue()`  
**Status:** ✅ Matches design doc table exactly.

---

### 1.4 Rank Ordering
**Implemented rule:** A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2 (descending strength).  
**Source file:** `lib/game-engine/src/constants.ts` — `RANK_VALUE`  
**Status:** ✅ Matches design doc exactly.

---

### 1.5 Dealing Method
**Implemented rule:** Cards are shuffled (Fisher-Yates), then dealt one card at a time clockwise starting from the seat to the dealer's left. All players receive equal hands.  
**Source file:** `lib/game-engine/src/deck.ts` — `shuffleDeck()`, `dealCards()`  
**Status:** ⚠️ **Assumption made.**  
The design doc says "Cards are shuffled and dealt clockwise, 13 to each player" but does not specify whether cards are dealt one at a time or in batches (e.g., 4+4+5 or 4+4+4+1). The implementation deals one card at a time (standard round-robin). Regional variants sometimes deal in batches.  
**Required verification:** Confirm single-card dealing is correct for this regional variant.

---

### 1.6 Dealer Selection
**Implemented rule:** First dealer defaults to seat 0 (`createGame(gameId, firstDealerSeat = 0)`). Dealer rotates clockwise after each round.  
**Source file:** `lib/game-engine/src/engine.ts` — `createGame()`, `finaliseRound()`; `lib/game-engine/src/turn-order.ts` — `nextDealerSeat()`  
**Status:** ⚠️ **Assumption made.**  
The design doc says "Dealer is chosen randomly for the first game." The engine does not randomise the first dealer — it defaults to seat 0. The server layer is responsible for passing a random first dealer seat. Dealer rotation (clockwise) is correctly implemented.

---

## 2. Bidding

### 2.1 First Bidder
**Implemented rule:** The player to the dealer's left opens bidding (seat = `(dealerSeat + 1) % playerCount`).  
**Source file:** `lib/game-engine/src/bidding.ts` — `initBiddingState()`  
**Status:** ✅ Matches design doc.

---

### 2.2 Minimum Bid
**Implemented rule:** Minimum bid is 51. Each subsequent bid must be strictly greater than the current highest bid (`highestBid + 1` minimum).  
**Source file:** `lib/game-engine/src/bidding.ts` — `placeBid()`; `lib/game-engine/src/constants.ts` — `DEFAULT_MIN_BID = 51`  
**Status:** ✅ Matches design doc.

---

### 2.3 Maximum Bid (Baazi / Chhakri Bid)
**Implemented rule:** Maximum bid is 100. A bid of 100 is accepted as a normal bid with no special enforcement.  
**Source file:** `lib/game-engine/src/bidding.ts` — `placeBid()` (check: `amount > 100 → throw`)  
**Status:** ⚠️ **Assumption made.**  
The design doc calls a bid of 100 "Chhakri" or "Baazi" and notes it is "high risk, high reward." However, it provides no distinct scoring rule for a 100-bid beyond the normal bid-made/bid-failed formula. The implementation treats a bid of 100 identically to any other bid value. If there is a special reward multiplier or rule for bidding 100 (e.g., instant round win or bonus points), that is not implemented.

---

### 2.4 Bidding End — Three Consecutive Passes
**Implemented rule:** After a bid has been placed, 3 consecutive passes end the bidding. The last bidder becomes the winner.  
**Source file:** `lib/game-engine/src/bidding.ts` — `checkBiddingEnd()`, `PASSES_TO_END_BIDDING = 3`  
**Status:** ✅ Matches design doc exactly.

---

### 2.5 Bidding End — All Pass (Redeal)
**Implemented rule:** If all players pass without any bid being placed (4 passes in 4-player, 6 passes in 6-player), the result is `"redeal"`. The engine records a `redeal` event and transitions to `biddingStatus: "redeal"`. The server is responsible for initiating a new deal.  
**Source file:** `lib/game-engine/src/bidding.ts` — `checkBiddingEnd()`; `lib/game-engine/src/round.ts` — `applyPass()`  
**Status:** ✅ Matches design doc. A `redeal` event is recorded in the event log.  
**Note:** After a `redeal`, the server must call `startRound()` again on the same dealer (or advance dealer — policy is not specified in the design doc; this is left to the server layer).

---

### 2.6 Bidding Turn Order
**Implemented rule:** Bidding proceeds clockwise. Each call to `placeBid()` or `passBid()` advances `currentSeat` by 1 (mod playerCount). The `currentSeat` in `reconstructBiddingState` is derived as `(firstSeat + bids.length) % playerCount`.  
**Source file:** `lib/game-engine/src/bidding.ts` — `advanceTurn()`; `lib/game-engine/src/round.ts` — `reconstructBiddingState()`  
**Status:** ✅ Correct.  
**Technical note:** `RoundState` does not store `currentBidderSeat` as a first-class field — it is recomputed from `bids.length` each time. This is a workaround that works correctly but could be made explicit.

---

## 3. Double and Redouble (Dobla / Char-Guna)

### 3.1 Double (Dobla) Timing
**Implemented rule:** A double may only be called during the bidding phase, before any bids have been placed (`bids.length === 0`). Only one double may be called per round.  
**Source file:** `lib/game-engine/src/round.ts` — `callDouble()`  
**Status:** ✅ Matches design doc ("After cards are dealt but before bidding").

---

### 3.2 Double — Who May Call It
**Implemented rule:** Any seat may call Double. No team restriction is enforced.  
**Source file:** `lib/game-engine/src/round.ts` — `callDouble()` (no team check)  
**Status:** ⚠️ **Assumption made.**  
The design doc says "any player may call Double" without restricting by team, which the implementation follows literally. However, in some regional variants only the defending team may call Double. No team restriction is enforced.

---

### 3.3 Redouble (Char-Guna) Timing and Restriction
**Implemented rule:** A redouble may only be called after a double has been declared and before any bids. Only one redouble may be called.  
**Source file:** `lib/game-engine/src/round.ts` — `callRedouble()`  
**Status:** ⚠️ **Assumption made.**  
The design doc says "The opposing team may call Redouble (Char-Guna)." The implementation does NOT enforce the "opposing team" constraint — any seat may call Redouble, not just the team opposing the Double caller. This is a deliberate assumption: the team constraint requires knowing which seat called Double and their team membership, which would add complexity. The team restriction should be added in Phase 2 when seat-to-userId mapping is available.

---

### 3.4 Multiplier Values
**Implemented rule:** Normal = ×1, Double = ×2, Redouble = ×4.  
**Source file:** `lib/game-engine/src/types.ts` — `Multiplier = 1 | 2 | 4`; `lib/game-engine/src/round.ts`  
**Status:** ✅ Matches design doc.

---

## 4. Trump Selection

### 4.1 Trump Selector
**Implemented rule:** Only the winning bidder may select trump. Any attempt by another seat throws.  
**Source file:** `lib/game-engine/src/trump.ts` — `declareTrump()`; `lib/game-engine/src/round.ts` — `applyTrumpSelection()`  
**Status:** ✅ Matches design doc exactly.

---

### 4.2 Valid Trump Choices
**Implemented rule:** Any of the four suits (S, H, D, C) is a valid trump choice. When `allowNoTrump = false` (the default), null is rejected. When `allowNoTrump = true`, null is accepted ("No Trump").  
**Source file:** `lib/game-engine/src/trump.ts` — `validTrumpChoices()`, `declareTrump()`  
**Status:** ✅ (No Trump variant correctly gated behind config flag.)

---

### 4.3 No Trump (Optional Variant)
**Implemented rule:** When `config.allowNoTrump = true`, the bidder may declare "No Trump." `isTrump()` always returns false when `trumpSuit === null`. All suits are equal; only the led suit wins.  
**Source file:** `lib/game-engine/src/trump.ts` — `isTrump()`; `lib/game-engine/src/types.ts` — `GameConfig.allowNoTrump`  
**Status:** ℹ️ Optional variant — correctly gated and implemented. Default is `allowNoTrump: false`.  
**Note:** No Trump scoring is the same as normal trump scoring. If No Trump has special scoring rules in the regional variant, that is not documented in `GAME_DESIGN.md` and is not implemented.

---

## 5. Trick-Taking

### 5.1 Who Leads the First Trick
**Implemented rule:** The winning bidder leads the first trick. After `applyTrumpSelection()`, `currentTrickLeaderSeat` is set to the bidder's seat.  
**Source file:** `lib/game-engine/src/round.ts` — `applyTrumpSelection()`  
**Status:** ✅ Matches design doc ("The bidder leads the first trick").

---

### 5.2 Who Leads Subsequent Tricks
**Implemented rule:** The winner of the current trick leads the next trick. After `completeTrick()`, `currentTrickLeaderSeat` is set to `result.winnerSeat`.  
**Source file:** `lib/game-engine/src/round.ts` — `completeTrick()`  
**Status:** ✅ Matches design doc ("The player who wins the previous trick leads the next").

---

### 5.3 Must-Follow-Suit Rule
**Implemented rule:** If a player holds one or more cards of the led suit, they must play one of those cards. If void in the led suit, any card is legal (including trump).  
**Source file:** `lib/game-engine/src/move-validator.ts` — `getLegalMoves()`  
**Status:** ✅ Matches design doc exactly.

---

### 5.4 Leading — No Restrictions
**Implemented rule:** When leading a trick, any card from hand is legal.  
**Source file:** `lib/game-engine/src/move-validator.ts` — `getLegalMoves()` (empty trick → full hand)  
**Status:** ✅

---

### 5.5 Overcut (Kaat) Rule — MISSING
**Design doc rule:** "Cutting with a lower trump when a higher trump is already played is called **overcut** — it must be avoided if higher trump is available."  
**Status:** ❌ **Not implemented.**  
When a player is void in the led suit, they may play any card including any trump. The engine does NOT check whether a higher trump is available when a lower trump is being played into a trick where a higher trump already sits. The current `getLegalMoves()` returns all cards when void in led suit, without trump-priority filtering.  
**Impact:** A player could legally play the 2 of trump into a trick where the Ace of trump is already winning, even if they hold the King of trump. In strict play, when you void in the led suit and must cut, you should be required to overcut if you can (or at least not play a lower trump than one already played). This is a **known gap** that will require a rule clarification before Phase 2.  
**Required action before Phase 2:** Verify with game rules whether overcut is mandatory (must beat the current winning trump if possible) or merely advisable (player's choice). Update `getLegalMoves()` accordingly.

---

### 5.6 Voluntary Trump When Holding Led Suit
**Implemented rule:** A player may NOT voluntarily play trump if they hold the led suit — the must-follow-suit rule prevents it.  
**Source file:** `lib/game-engine/src/move-validator.ts` — `getLegalMoves()`  
**Status:** ✅ Correctly enforced. (Test in `move-validator.test.ts`: "cannot play trump instead of led suit when holding led suit.")

---

### 5.7 Trick Winner — No Trump Played
**Implemented rule:** Highest card of the led suit wins. Off-suit non-trump cards cannot win regardless of rank.  
**Source file:** `lib/game-engine/src/trick.ts` — `beats()`  
**Status:** ✅ Matches design doc exactly.

---

### 5.8 Trick Winner — Trump Played
**Implemented rule:** If one or more trump cards were played, the highest trump wins. Trump beats any led-suit card regardless of rank (e.g., 2 of trump beats Ace of led suit).  
**Source file:** `lib/game-engine/src/trick.ts` — `beats()`  
**Status:** ✅ Matches design doc exactly.

---

### 5.9 Point Collection
**Implemented rule:** The winning seat's team captures all point values from cards in the trick. Running totals accumulate in `capturedPoints: [number, number]`.  
**Source file:** `lib/game-engine/src/round.ts` — `completeTrick()`; `lib/game-engine/src/trick.ts` — `evaluateTrick()`  
**Status:** ✅

---

### 5.10 Consecutive Wins Tracking
**Implemented rule:** `consecutiveWins: [number, number]` tracks the current streak for each team. When Team A wins a trick, `consecutiveWins[A]` increments and `consecutiveWins[B]` resets to 0.  
**Source file:** `lib/game-engine/src/round.ts` — `completeTrick()`  
**Status:** ✅ Correct implementation of independent streak tracking.

---

## 6. Chhakri Rule (6 Consecutive Tricks)

### 6.1 Chhakri Trigger
**Implemented rule:** If either team's `consecutiveWins` count reaches or exceeds `CHHAKRI_THRESHOLD = 6`, the Chhakri rule fires immediately after that trick is completed. The round ends immediately; no more tricks are played.  
**Source file:** `lib/game-engine/src/round.ts` — `completeTrick()`; `lib/game-engine/src/constants.ts` — `CHHAKRI_THRESHOLD = 6`  
**Status:** ✅ Matches design doc ("If a player wins 6 consecutive tricks, their team immediately wins the round").

---

### 6.2 Chhakri — Which Team's Streak Counts
**Implemented rule:** Either team can trigger Chhakri. The triggering team is recorded in `RoundState.chhakri = { team, trickIndex }`.  
**Source file:** `lib/game-engine/src/round.ts` — `completeTrick()`  
**Status:** ✅ Both teams can trigger Chhakri.  
**Note:** The design doc says "If a player wins 6 consecutive tricks" — the engine correctly treats this as a team-level streak (any player on the team contributing to the streak).

---

### 6.3 Chhakri — Threshold in 6-player Mode
**Implemented rule:** `CHHAKRI_THRESHOLD = 6` regardless of player count. In 6-player mode (8 tricks per round), 6 consecutive tricks is still required.  
**Source file:** `lib/game-engine/src/constants.ts` — `CHHAKRI_THRESHOLD = 6`  
**Status:** ⚠️ **Assumption made.**  
The design doc does not document 6-player Chhakri rules. Whether the threshold changes (e.g., should it be proportional at 75% of tricks = 6/8) or stays at exactly 6 is unknown. The implementation keeps it at 6, which means Chhakri is harder to trigger proportionally in 6-player mode (6/8 = 75%) than in 4-player (6/13 ≈ 46%).

---

### 6.4 Chhakri — Points Not Summing to 100
**Implemented rule:** When Chhakri fires, the round ends mid-game. `capturedPoints[0] + capturedPoints[1]` will be less than 100 (the remaining cards in hands have not been played). This is by design and tested.  
**Source file:** `lib/game-engine/src/round.ts` — `completeTrick()` → `endRound()`  
**Status:** ✅ Correct. The 100-point invariant only holds at normal round completion (all tricks played), not after Chhakri.

---

## 7. Scoring

### 7.1 Bid Met — Bidding Team Earns Bid
**Implemented rule:** If `capturedPoints[bidTeam] >= bid`, the bidding team earns `bid × multiplier × chhakrBonus` points.  
**Source file:** `lib/game-engine/src/scoring.ts` — `calculateRoundScore()`  
**Status:** ✅ Matches design doc.

---

### 7.2 Bid Met — Defending Team Earns Their Captured Points
**Implemented rule:** Defending team earns `capturedPoints[defTeam] × multiplier × chhakrBonus` points regardless of bid outcome.  
**Source file:** `lib/game-engine/src/scoring.ts` — `calculateRoundScore()`  
**Status:** ✅ Matches design doc ("Defending team earns the points they captured").

---

### 7.3 Bid Failed — Bidding Team Loses Bid
**Implemented rule:** If `capturedPoints[bidTeam] < bid`, the bidding team loses `bid × multiplier × chhakrBonus` points (negative delta).  
**Source file:** `lib/game-engine/src/scoring.ts` — `calculateRoundScore()`  
**Status:** ✅ Matches design doc ("Bidding team loses their bid value").

---

### 7.4 Chhakri Bonus — Both Teams Doubled
**Implemented rule:** When Chhakri fires, `chhakrBonus = 2`. This multiplier applies to BOTH teams' score calculations — the bidding team's gain/loss and the defending team's gain are both doubled.  
**Source file:** `lib/game-engine/src/scoring.ts` — `calculateRoundScore()`  
**Status:** ⚠️ **Assumption made.**  
The design doc says: "If a team wins by Chhakri (6 consecutive tricks), they earn double points." The phrase "they" is ambiguous — it could mean only the Chhakri-winning team earns double, or all teams are doubled. The implementation doubles both teams. If the intent is that only the Chhakri team earns double (while the other team earns at ×1), the scoring formula needs to change.  
**Required verification:** Does Chhakri bonus apply to both teams or only the team that triggered Chhakri?

---

### 7.5 Combined Multipliers (Double + Chhakri)
**Implemented rule:** `totalMultiplier = multiplier × chhakrBonus`. A Double + Chhakri game produces ×4 total (×2 from Double, ×2 from Chhakri).  
**Source file:** `lib/game-engine/src/scoring.ts` — `calculateRoundScore()`  
**Status:** ⚠️ **Assumption made.**  
The design doc documents Double (×2) and Chhakri bonus (×2) separately but does not address their combination. The implementation multiplies them together. If the correct combination is additive instead of multiplicative, the formula differs.

---

### 7.6 Target Score Win
**Implemented rule:** The first team to reach `config.targetScore` (default 500) wins the game. If both teams cross the target in the same round, the team with the higher final score wins.  
**Source file:** `lib/game-engine/src/scoring.ts` — `applyRoundScore()`  
**Status:** ✅ Matches design doc ("First team to reach 500 wins; if both cross in same round, higher score wins").  
**Assumption:** If both teams have exactly equal scores after crossing the target simultaneously, Team 0 wins (the `>=` comparison favors Team 0 in a tie). The design doc does not specify a tiebreaker.

---

### 7.7 Doobna — Instant Loss Below Threshold
**Implemented rule:** If a team's cumulative score drops to `doobnaThreshold` or below (default -500), they lose immediately. The opposing team wins.  
**Source file:** `lib/game-engine/src/scoring.ts` — `applyRoundScore()` (check: `newScores[x] <= config.doobnaThreshold`)  
**Status:** ⚠️ **Boundary ambiguity.**  
The design doc says "If a team's score goes **below** -500." The word "below" implies strictly less than -500 (i.e., -501 triggers Doobna, but -500 does not). The implementation uses `<=`, so a score of exactly -500 also triggers Doobna. This is a one-point boundary discrepancy.  
**Required clarification:** Does a score of exactly -500 trigger Doobna, or only scores below -500?

---

### 7.8 Game Score Accumulation
**Implemented rule:** `GameState.scores` accumulates round deltas across all rounds. `finaliseRound()` applies the round score and checks win conditions.  
**Source file:** `lib/game-engine/src/engine.ts` — `finaliseRound()`  
**Status:** ✅ Correct.

---

## 8. Jodi (Pair Play) — NOT IMPLEMENTED

**Design doc rule:** "If a player holds both cards of the same rank in a suit, specific local rules apply. Configurable in game settings as a regional variant."  
**Status:** ❌ Not implemented.  
The design doc acknowledges this is a regional variant that "varies" and says it is "configurable." No `allowJodi` flag exists in `GameConfig`. This is explicitly deferred — the design doc is itself unclear on the exact rule.

---

## 9. Replay System

### 9.1 Event Logging
**Implemented rule:** Every state transition appends a `GameEvent` to `RoundState.events`. Events have a monotonically increasing `sequence` number, a type, an optional `seat`, a `payload`, and a `timestamp`.  
**Source file:** `lib/game-engine/src/replay.ts` — `createEvent()`; `lib/game-engine/src/round.ts` — `appendEvent()`  
**Status:** ✅ All action types log events: `deal`, `bid`, `pass`, `bid_won`, `double`, `redouble`, `trump_selected`, `play_card`, `trick_ended`, `chhakri`, `round_ended`, `game_ended`, `redeal`.

---

### 9.2 Event Replay (Round-Trip)
**Implemented rule:** `replayEvents()` reconstructs `RoundState` from an event log by re-applying each action event to a freshly initialised round.  
**Source file:** `lib/game-engine/src/replay.ts` — `replayEvents()`, `applyReplayEvent()`  
**Status:** ⚠️ **Implemented but not round-trip tested.**  
The `replayEvents()` function exists and is wired. However, the test suite (`replay.test.ts`) only tests `createEvent`, `getEventsByType`, and `summariseEvents`. There is **no test that performs a round-trip** (play a full round, capture events, replay from events, compare final state). The replay correctness is thus untested end-to-end.

---

### 9.3 Circular Dependency Workaround in Replay
**Implemented rule:** `applyReplayEvent()` uses `require('./round.js')` inside the function body to avoid a circular ESM import at module load time (`round.ts` → `replay.ts` for `createEvent`; `replay.ts` → `round.ts` for replay).  
**Source file:** `lib/game-engine/src/replay.ts` — `applyReplayEvent()` line 214  
**Status:** ⚠️ **Technical debt.**  
This works in the current Node.js/Vitest environment (`--experimental-require-module`). It will silently fail or throw in a strict ESM bundler (esbuild, Rollup, Webpack). Needs to be refactored to either:
- Break the circular dependency by extracting `createEvent` to a separate file
- Use dynamic `import()` inside `applyReplayEvent`

---

## 10. Game Phases

### 10.1 Phase State Machine
**Implemented phases:** `bidding → trump_selection → playing → trick_ended → round_ended`  
**Source file:** `lib/game-engine/src/types.ts` — `GamePhase`; `lib/game-engine/src/round.ts`  
**Status:** ✅ Phase transitions are correctly enforced.

---

### 10.2 Unused `"dealing"` Phase
**Implemented rule:** The `GamePhase` type includes `"dealing"` as a valid value.  
**Source file:** `lib/game-engine/src/types.ts` — `GamePhase`  
**Status:** ⚠️ **Dead type value.**  
The `"dealing"` phase is never set anywhere in the engine — `initRound()` immediately sets `phase: "bidding"`. Cards are dealt synchronously before the round state is returned. The `"dealing"` phase exists in the type union but has no corresponding state transition. It exists to support a future async dealing animation flow but creates a false impression that the engine enters a dealing phase.

---

### 10.3 Phase `"game_ended"` in Type vs. `GameState.winner`
**Implemented rule:** Game-end is represented by `GameState.winner !== null`, not by a `GamePhase`. The `GamePhase = "game_ended"` value in the type union is never set by the engine.  
**Source file:** `lib/game-engine/src/types.ts` — `GamePhase`; `lib/game-engine/src/engine.ts` — `finaliseRound()`  
**Status:** ⚠️ **Inconsistency.** `"game_ended"` is in `GamePhase` but game end is signaled via `GameState.winner`, not by transitioning `currentRound.phase` to `"game_ended"`. This could confuse server-side code checking for game end by phase.

---

## 11. Generic Trick-Taking vs. Chhakri-Specific Rules

The following items use generic trick-taking card game rules where Chhakri-specific rules have not been verified:

| Rule | Generic or Chhakri-Specific? | Status |
|---|---|---|
| Must follow suit | Generic (universal) | ✅ Correct |
| Trump beats led suit | Generic (universal) | ✅ Correct |
| Highest trump wins | Generic (universal) | ✅ Correct |
| Highest led suit wins (no trump) | Generic (universal) | ✅ Correct |
| Off-suit cannot win | Generic (universal) | ✅ Correct |
| Dealer rotates clockwise | Generic (universal) | ✅ Appears correct |
| Bidding starts left of dealer | Generic (universal) | ✅ Appears correct |
| Bid winner leads first trick | Generic (some games give opener to a fixed seat) | ⚠️ Assumed Chhakri-standard |
| Bid of 100 no special rule | Generic fallback | ⚠️ Not verified as Chhakri-specific |
| Overcut (Kaat) rule | **Chhakri-specific** | ❌ **NOT IMPLEMENTED** |
| Jodi (Pair Play) | **Chhakri-specific local variant** | ❌ Not implemented |
| 6-player rules | **Chhakri-specific (regional)** | ⚠️ Extrapolated, not documented |
| Dobla team restriction | **May be Chhakri-specific** | ⚠️ No team restriction enforced |

---

## 12. Summary Table of All Rules

| Rule | File | Implemented | Assumption / Gap |
|---|---|---|---|
| 4-player 52-card deck | `deck.ts`, `constants.ts` | ✅ | — |
| 6-player 48-card deck (no 2s) | `deck.ts`, `constants.ts` | ⚠️ | 6P rules not in design doc |
| Point values (A=4, K=3, Q=2, J=1, 10=10, 5=5) | `constants.ts` | ✅ | — |
| Rank ordering (A high) | `constants.ts` | ✅ | — |
| Single-card clockwise dealing | `deck.ts` | ⚠️ | Batch dealing not ruled out |
| Random first dealer | `engine.ts` | ⚠️ | Engine defaults to seat 0; server must randomise |
| Clockwise dealer rotation | `turn-order.ts` | ✅ | — |
| First bidder = left of dealer | `bidding.ts` | ✅ | — |
| Min bid 51 | `bidding.ts` | ✅ | — |
| Max bid 100 | `bidding.ts` | ✅ | — |
| Bid of 100 (Baazi) no special rule | `bidding.ts` | ⚠️ | No special reward for bidding 100 |
| 3 consecutive passes end bidding | `bidding.ts` | ✅ | — |
| All-pass → redeal | `bidding.ts` | ✅ | — |
| Dobla before bidding starts | `round.ts` | ✅ | — |
| Any seat can call Dobla | `round.ts` | ⚠️ | No team restriction |
| Redouble after Dobla, before bids | `round.ts` | ✅ | — |
| Redouble team restriction | `round.ts` | ⚠️ | Not enforced — any seat can redouble |
| Multiplier ×1/×2/×4 | `round.ts`, `scoring.ts` | ✅ | — |
| Bidder selects trump | `trump.ts`, `round.ts` | ✅ | — |
| No Trump optional variant | `trump.ts` | ℹ️ | Gated by `allowNoTrump` flag |
| Bidder leads first trick | `round.ts` | ✅ | — |
| Trick winner leads next | `round.ts` | ✅ | — |
| Must-follow-suit | `move-validator.ts` | ✅ | — |
| Void → any card legal | `move-validator.ts` | ✅ | — |
| Overcut (Kaat) restriction | — | ❌ | **Not implemented** |
| Trump beats led suit | `trick.ts` | ✅ | — |
| Highest trump wins | `trick.ts` | ✅ | — |
| Highest led-suit wins (no trump) | `trick.ts` | ✅ | — |
| Chhakri at 6 consecutive tricks | `round.ts`, `constants.ts` | ✅ | Threshold assumed same for 6P |
| Chhakri ends round immediately | `round.ts` | ✅ | — |
| Bid-made scoring | `scoring.ts` | ✅ | — |
| Bid-failed scoring | `scoring.ts` | ✅ | — |
| Defending team earns captured points | `scoring.ts` | ✅ | — |
| Chhakri bonus ×2 (both teams) | `scoring.ts` | ⚠️ | Assumes both teams doubled, not just winner |
| Combined multipliers (Double + Chhakri) | `scoring.ts` | ⚠️ | Multiplied, not added |
| Target score win (default 500) | `scoring.ts` | ✅ | — |
| Both-cross-target: higher wins | `scoring.ts` | ✅ | Tie → Team 0 wins (undocumented assumption) |
| Doobna ≤ -500 → instant loss | `scoring.ts` | ⚠️ | Uses `<=`, design says "below" (strict `<`) |
| Jodi (Pair Play) | — | ❌ | Not implemented, design doc unclear |
| Event replay system | `replay.ts` | ⚠️ | Exists but not round-trip tested |

---

## 13. Open Questions for Game Rules Owner

Before Phase 2, the following questions require a canonical answer from someone who knows the authoritative Bundelkhandi Chhakri rules:

1. **Overcut (Kaat):** When void in the led suit and cutting with trump, is a player required to play a higher trump if they hold one? Or is any trump legal?
2. **Chhakri bonus target:** Does the ×2 Chhakri bonus apply to both teams, or only to the team that triggered Chhakri?
3. **Dobla restriction:** Can any player call Double, or only the opposing team (the non-bidding team)?
4. **Baazi (bid of 100):** Is there a special rule or bonus for winning a 100-bid beyond the standard formula?
5. **Doobna boundary:** Does a score of exactly -500 trigger Doobna (equals threshold), or is it strictly below -500?
6. **Dealing method:** Are cards dealt one at a time (current) or in batches?
7. **Redeal dealer:** After an all-pass redeal, does the same dealer re-deal, or does the deal rotate?
8. **6-player rules:** Is the 6-player variant (48 cards, 3×2 teams, 8 tricks) an authentic regional variant? Is the Chhakri threshold still 6 in 6-player?
9. **Jodi:** What is the exact Jodi (pair play) rule and its scoring impact?
10. **Both teams reach target simultaneously with equal scores:** Who wins?
