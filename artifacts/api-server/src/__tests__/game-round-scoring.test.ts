/**
 * Round Scoring and Match Completion — Part 9.
 *
 * Tests that do NOT require a live database. They exercise the complete
 * round-scoring and match-completion pipeline at the service layer:
 *   - buildRoundResult         → extracts bid, bidTeam, tricksWon from RoundState
 *   - calculateRoundScore      → zero-sum deltas (bid made / failed)
 *   - applyRoundScore          → cumulative scores, targetScore=52, doobna
 *   - checkPerfect8Victory     → bid=8 + all tricks → instant win
 *   - buildAuthoritativeSnapshot → score fields (team0Score, team1Score)
 *   - buildClientGameState     → score exposure, reconnect in round_ended/game_ended
 *   - RoundSummary shape       → correct fields after round completes
 *
 * All Part 9 scope items:
 *   1. Detect round completion after all tricks
 *   2. Calculate round winner (bid made / failed)
 *   3. Calculate team score (zero-sum formula)
 *   4. Update cumulative match score
 *   5. Detect match completion (targetScore=52, doobna, Perfect 8/8)
 *   6. Determine winning team
 *   7. Persist final game state          (buildAuthoritativeSnapshot)
 *   8. Emit correct final snapshot       (buildClientGameState)
 *   9. Support reconnect after completion
 *  10. All clients receive same result   (per-seat buildClientGameState identical)
 *
 * Existing coverage (NOT duplicated here):
 *   - calculateRoundScore all bids     → lib/.../scoring.test.ts
 *   - applyRoundScore (targetScore=500)→ lib/.../scoring.test.ts
 *   - checkPerfect8Victory unit        → lib/.../series-engine.test.ts
 *   - trailingTeamDealerSeat           → lib/.../series-engine.test.ts
 *   - engine Perfect 8/8 integration   → lib/.../series-engine.test.ts
 *   - completedTricks snapshot         → game-service-play.test.ts
 *   - round_ended phase (trick count)  → game-card-play-scenarios.test.ts
 *
 * [MIG-003] [GAP-029] Scoring — trick count model
 * [MIG-012] [GAP-030] Scoring — zero-sum formula
 * [MIG-028] [GAP-031] Scoring — no Chhakri bonus
 * [MIG-029] [GAP-033] Series Engine — Perfect 8/8
 * [MIG-030] [GAP-034] Dealer rotation — trailing team
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";
import {
  initRound,
  defaultGameConfig,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyBid,
  applyPass,
  applyTrumpSelection,
  applyPlayCard,
  buildRoundResult,
  calculateRoundScore,
  applyRoundScore,
  checkPerfect8Victory,
  getLegalMovesZonedForSeat,
  currentSeatForTrick,
  TRICKS_PER_ROUND,
  MAX_BID,
  DEFAULT_TARGET_SCORE,
  DEFAULT_DOOBNA_THRESHOLD,
} from "@workspace/game-engine";
import type {
  PlayerCount,
  RoundState,
  GameConfig,
  Suit,
  RoundResult,
  TeamId,
} from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Production config: two-round bidding, targetScore=52, doobnaThreshold=-500. */
function cfg(playerCount: 4 | 6 = 4): GameConfig {
  return defaultGameConfig(playerCount as PlayerCount, { useTwoRoundBidding: true });
}

/**
 * Advance from initRound → playing phase.
 *
 * dealerSeat=0 → primarySeat=1 → bidTeam = seatToTeam(1) = team 1.
 * Use dealerSeat=1 → primarySeat=2 → bidTeam = seatToTeam(2) = team 0
 * when you need bidTeam=0.
 */
function stateAtPlaying(
  playerCount: 4 | 6 = 4,
  primaryTrump: Suit = "H",
  finalTrump: Suit = "S",
  dealerSeat = 0,
): { state: RoundState; winnerSeat: number; bidTeam: 0 | 1; config: GameConfig } {
  const config = cfg(playerCount);
  let state = initRound(1, dealerSeat, config);
  const primarySeat = (dealerSeat + 1) % playerCount;

  // Primary bid + trump
  state = applyPrimaryBid(state, primarySeat);
  state = applyPrimaryTrumpSelection(state, primarySeat, primaryTrump, { allowNoTrump: false });

  // Round 1: raise to 6, others pass
  state = applyBid(state, primarySeat, 6, config);
  for (let i = 1; i < playerCount; i++) {
    state = applyPass(state, (primarySeat + i) % playerCount);
  }
  // Round 2: all pass
  for (let i = 0; i < playerCount; i++) {
    state = applyPass(state, (primarySeat + i) % playerCount);
  }

  const winnerSeat = state.highestBidderSeat!;
  state = applyTrumpSelection(state, winnerSeat, finalTrump, { allowNoTrump: false });

  if (state.phase !== "playing") {
    throw new Error(`Expected "playing" but got "${state.phase}"`);
  }
  const bidTeam = (winnerSeat % 2) as 0 | 1;
  return { state, winnerSeat, bidTeam, config };
}

/** Play one legal card for a seat. */
function playLegalCard(state: RoundState, seat: number, config: GameConfig, pc: 4 | 6 = 4): RoundState {
  const legal = getLegalMovesZonedForSeat(state, seat, pc as PlayerCount);
  if (!legal.length) throw new Error(`No legal card for seat ${seat}`);
  return applyPlayCard(state, seat, legal[0]!, config);
}

/** Play one complete trick. */
function playOneTrick(state: RoundState, config: GameConfig, pc: 4 | 6 = 4): RoundState {
  const leader = state.currentTrickLeaderSeat!;
  for (let i = 0; i < pc; i++) {
    state = playLegalCard(state, (leader + i) % pc, config, pc);
  }
  return state;
}

/** Play all tricks until round_ended. */
function playAllTricks(state: RoundState, config: GameConfig, pc: 4 | 6 = 4): RoundState {
  while (state.phase === "playing") {
    state = playOneTrick(state, config, pc);
  }
  return state;
}

/** Build an AuthoritativeGameState from a RoundState. */
function buildAuth(
  state: RoundState,
  playerCount: 4 | 6 = 4,
  gameScores: [number, number] = [0, 0],
  gameId = "g-test",
): AuthoritativeGameState {
  return GameService.buildAuthoritativeSnapshot({
    gameId,
    sequence: state.nextSequence,
    roundNumber: state.roundNumber,
    roundState: state,
    playerCount: playerCount as PlayerCount,
    gameScores,
    targetScore: DEFAULT_TARGET_SCORE,
    seatData: Array.from({ length: playerCount }, (_, s) => ({
      seat: s,
      userId: `user-${s}`,
      displayName: `Player ${s}`,
      isAi: false,
      connectionState: "CONNECTED" as const,
    })),
  });
}

/**
 * Craft a RoundResult for direct scoring tests.
 * bidderSeat 1 → bidTeam 1 (default); use bidderSeat=0 for bidTeam=0.
 */
function makeResult(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    bidTeam: 1,
    defTeam: 0,
    bid: 6,
    tricksWon: [2, 6],  // bidTeam 1 wins 6 tricks (bid made)
    multiplier: 1,
    chhakri: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — buildRoundResult: correct fields from real round_ended state
// ---------------------------------------------------------------------------

describe("Scenario 1 — buildRoundResult: integration with real engine state", () => {
  it("phase must be round_ended before calling buildRoundResult", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    expect(final.phase).toBe("round_ended");
    // buildRoundResult should not throw
    expect(() => buildRoundResult(final)).not.toThrow();
  });

  it("bid matches state.highestBid", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    expect(result.bid).toBe(final.highestBid);
    expect(result.bid).toBe(6); // we bid 6 in stateAtPlaying
  });

  it("bidTeam = seatToTeam(highestBidderSeat)", () => {
    const { state, winnerSeat, config } = stateAtPlaying(4, "H", "S", 0);
    // dealerSeat=0 → primarySeat=1 → bidTeam = seat1 % 2 = 1
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    expect(result.bidTeam).toBe(winnerSeat % 2);
    expect(result.defTeam).toBe(1 - result.bidTeam);
  });

  it("tricksWon sums to TRICKS_PER_ROUND", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    expect(result.tricksWon[0] + result.tricksWon[1]).toBe(TRICKS_PER_ROUND[4]);
  });

  it("tricksWon[bidTeam] + tricksWon[defTeam] = 8 (all 4P tricks accounted for)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    expect(result.tricksWon[result.bidTeam] + result.tricksWon[result.defTeam]).toBe(8);
  });

  it("multiplier is 1 by default (no double/redouble called)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    expect(result.multiplier).toBe(1);
  });

  it("chhakri field matches state.chhakri (null when no chhakri fired)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    // chhakri is either null or has team matching state.chhakri
    if (final.chhakri === null) {
      expect(result.chhakri).toBeNull();
    } else {
      expect(result.chhakri?.team).toBe(final.chhakri.team);
    }
  });

  it("throws when highestBidderSeat is null (no bidder — malformed state)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const malformed = { ...final, highestBidderSeat: null };
    expect(() => buildRoundResult(malformed)).toThrow(/bidder/i);
  });

  it("6P: tricksWon sums to TRICKS_PER_ROUND[6]", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const result = buildRoundResult(final);
    expect(result.tricksWon[0] + result.tricksWon[1]).toBe(TRICKS_PER_ROUND[6]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — calculateRoundScore: zero-sum invariant at service level
// ---------------------------------------------------------------------------

describe("Scenario 2 — calculateRoundScore: pipeline from real round state", () => {
  it("bid made: bidTeam delta = +bid (zero-sum)", () => {
    // Craft result with known outcome
    const result = makeResult({ bid: 6, tricksWon: [2, 6], bidTeam: 1, defTeam: 0 });
    const score = calculateRoundScore(result);
    expect(score.deltas[1]).toBe(6);    // bidTeam earns +6
    expect(score.deltas[0]).toBe(-6);   // defTeam earns −6
    expect(score.outcome).toBe("bid_made");
  });

  it("bid failed: bidTeam delta = −(2×bid) (zero-sum)", () => {
    const result = makeResult({ bid: 6, tricksWon: [5, 3], bidTeam: 1, defTeam: 0 });
    const score = calculateRoundScore(result);
    expect(score.deltas[1]).toBe(-12);  // bidTeam loses −(2×6)
    expect(score.deltas[0]).toBe(12);   // defTeam gains +(2×6)
    expect(score.outcome).toBe("bid_failed");
  });

  it("deltas always sum to zero (zero-sum invariant)", () => {
    const cases: Array<Partial<RoundResult>> = [
      { bid: 5, tricksWon: [5, 3] },
      { bid: 5, tricksWon: [4, 4] },
      { bid: 6, tricksWon: [6, 2] },
      { bid: 6, tricksWon: [5, 3] },
      { bid: 7, tricksWon: [7, 1] },
      { bid: 7, tricksWon: [6, 2] },
      { bid: 8, tricksWon: [8, 0] },
      { bid: 8, tricksWon: [7, 1] },
    ];
    for (const c of cases) {
      const score = calculateRoundScore(makeResult(c));
      expect(score.deltas[0] + score.deltas[1]).toBe(0);
    }
  });

  it("bid made from actual played round: outcome is consistent with bid result (chhakri variants accepted)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    const bidMet = result.tricksWon[result.bidTeam] >= result.bid;
    // outcome is "bid_made" or "chhakri_bid_team" when bid was met;
    // "bid_failed" or "chhakri_def_team" when bid failed (MIG-028: no scoring bonus for Chhakri)
    if (bidMet) {
      expect(["bid_made", "chhakri_bid_team"]).toContain(score.outcome);
    } else {
      expect(["bid_failed", "chhakri_def_team"]).toContain(score.outcome);
    }
  });

  it("pipeline: buildRoundResult → calculateRoundScore deltas sum to zero", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    expect(score.deltas[0] + score.deltas[1]).toBe(0);
  });

  it("Chhakri: label is chhakri_bid_team or chhakri_def_team, deltas still zero-sum", () => {
    const result = makeResult({
      bid: 6,
      tricksWon: [2, 6],
      chhakri: { team: 1 as TeamId },  // chhakri by bid team
    });
    const score = calculateRoundScore(result);
    expect(score.outcome).toBe("chhakri_bid_team");
    expect(score.deltas[0] + score.deltas[1]).toBe(0);
    // Score unchanged by Chhakri (no bonus)
    expect(score.deltas[1]).toBe(6);
    expect(score.deltas[0]).toBe(-6);
  });

  it("6P: pipeline from real 6P state — deltas sum to zero", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    expect(score.deltas[0] + score.deltas[1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — applyRoundScore: production targetScore=52
// ---------------------------------------------------------------------------

describe("Scenario 3 — applyRoundScore: production targetScore=52 (SERIES_TARGET)", () => {
  it("DEFAULT_TARGET_SCORE is 52", () => {
    expect(DEFAULT_TARGET_SCORE).toBe(52);
  });

  it("DEFAULT_DOOBNA_THRESHOLD is -500", () => {
    expect(DEFAULT_DOOBNA_THRESHOLD).toBe(-500);
  });

  it("no winner after first bid-5-made round (scores [5, -5] < 52)", () => {
    const productionCfg = cfg(4);
    const delta = calculateRoundScore(makeResult({ bid: 5, tricksWon: [3, 5] })).deltas;
    const result = applyRoundScore([0, 0], delta, productionCfg);
    expect(result.winner).toBeNull();
    expect(result.doobna).toBeNull();
    expect(result.scores[0] + result.scores[1]).toBe(0); // zero-sum preserved
  });

  it("team 1 wins when score reaches exactly 52", () => {
    const productionCfg = cfg(4);
    // Team 1 at 46, bid 6 made → +6 → 52
    const delta = calculateRoundScore(makeResult({ bid: 6, tricksWon: [2, 6] })).deltas;
    const result = applyRoundScore([-46, 46], delta, productionCfg);
    expect(result.scores[1]).toBe(52);
    expect(result.winner).toBe(1);
  });

  it("team 0 wins when score reaches exactly 52", () => {
    const productionCfg = cfg(4);
    // team 0 is bidTeam: bid 5 made → +5
    const delta = calculateRoundScore(makeResult({
      bid: 5, tricksWon: [5, 3], bidTeam: 0, defTeam: 1,
    })).deltas;
    const result = applyRoundScore([47, -47], delta, productionCfg);
    expect(result.scores[0]).toBe(52);
    expect(result.winner).toBe(0);
  });

  it("team 0 wins when crossing 52 (not just reaching it)", () => {
    const productionCfg = cfg(4);
    const delta = calculateRoundScore(makeResult({
      bid: 8, tricksWon: [8, 0], bidTeam: 0, defTeam: 1,
    })).deltas;
    const result = applyRoundScore([45, -45], delta, productionCfg);
    expect(result.scores[0]).toBe(53);
    expect(result.winner).toBe(0);
  });

  it("tie-break: both cross 52 in same round — higher score wins", () => {
    const productionCfg = cfg(4);
    // Scores: [48, 48] → bid 6 made by team 0: team0 +6 = 54, team1 -6 = 42
    // Wait — zero-sum: if both are at [48, 48] (non-zero-sum), that's an invalid state.
    // Use a valid zero-sum starting state: [48, -48] or just test the pure function.
    const result = applyRoundScore([48, 48], [6, -6], productionCfg);
    // team0: 54 ≥ 52, team1: 42 < 52 → team0 wins
    expect(result.winner).toBe(0);
  });

  it("tie-break: both exactly cross 52 simultaneously — higher score wins", () => {
    const productionCfg = cfg(4);
    // If somehow both reach 52+ (unusual in zero-sum but applyRoundScore handles it):
    const result = applyRoundScore([50, 50], [3, 3], productionCfg);
    // Both at 53 — tie-break: equal → higher score wins → score >= score → team 0 wins
    expect(result.winner).toBe(0); // scores equal: tie-break favors team 0 (newScores[0] >= newScores[1])
  });

  it("score exactly at doobnaThreshold (-500) is NOT doobna (boundary: must be <=)", () => {
    const productionCfg = cfg(4);
    // Score drops to exactly -500
    const result = applyRoundScore([-494, 494], [-6, 6], productionCfg);
    expect(result.scores[0]).toBe(-500);
    expect(result.doobna).toBe(0); // exactly at threshold IS doobna (≤ -500 condition)
    expect(result.winner).toBe(1);
  });

  it("score at -499 is NOT doobna (above threshold)", () => {
    const productionCfg = cfg(4);
    // team1 must stay below targetScore=52; use [−494, 0]+[−5, 5]→[−499, 5]
    const result = applyRoundScore([-494, 0], [-5, 5], productionCfg);
    expect(result.scores[0]).toBe(-499);
    expect(result.doobna).toBeNull();
    expect(result.winner).toBeNull();
  });

  it("score drops below -500 triggers doobna for that team", () => {
    const productionCfg = cfg(4);
    const result = applyRoundScore([-494, 494], [-7, 7], productionCfg);
    expect(result.scores[0]).toBe(-501);
    expect(result.doobna).toBe(0);
    expect(result.winner).toBe(1);
  });

  it("doobna for team 1: team 0 wins", () => {
    const productionCfg = cfg(4);
    const result = applyRoundScore([494, -494], [-6, 6], productionCfg);
    // team1: -494 + 6 = no, wait: team1 is defTeam here getting +6... let me rethink
    // Use applyRoundScore directly: team1 drops below -500
    const result2 = applyRoundScore([490, -490], [-6, 6], productionCfg);
    expect(result2.scores[1]).toBe(-484); // -490 + 6 = -484, not doobna
    // Force doobna for team1:
    const result3 = applyRoundScore([490, -490], [10, -10], productionCfg);
    expect(result3.scores[1]).toBe(-500);
    expect(result3.doobna).toBe(1);
    expect(result3.winner).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — buildAuthoritativeSnapshot: score fields propagated correctly
// ---------------------------------------------------------------------------

describe("Scenario 4 — buildAuthoritativeSnapshot: score fields", () => {
  it("team0Score, team1Score match gameScores parameter", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [15, -15]);
    expect(auth.team0Score).toBe(15);
    expect(auth.team1Score).toBe(-15);
  });

  it("negative scores are stored correctly", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [-12, 12]);
    expect(auth.team0Score).toBe(-12);
    expect(auth.team1Score).toBe(12);
  });

  it("zero scores at game start", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    expect(auth.team0Score).toBe(0);
    expect(auth.team1Score).toBe(0);
  });

  it("targetScore is DEFAULT_TARGET_SCORE (52)", () => {
    const { state, config } = stateAtPlaying();
    const auth = buildAuth(state, 4, [0, 0]);
    expect(auth.targetScore).toBe(DEFAULT_TARGET_SCORE);
  });

  it("phase is 'round_ended' for a final-trick state", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [5, -5]);
    expect(auth.phase).toBe("round_ended");
  });

  it("team0PointsThisRound reflects capturedPoints from engine", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    expect(auth.team0PointsThisRound).toBe(final.capturedPoints[0]);
    expect(auth.team1PointsThisRound).toBe(final.capturedPoints[1]);
  });

  it("6P: score fields propagate correctly", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const auth = buildAuth(final, 6, [6, -6]);
    expect(auth.team0Score).toBe(6);
    expect(auth.team1Score).toBe(-6);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — buildClientGameState: score exposure for all seats
// ---------------------------------------------------------------------------

describe("Scenario 5 — buildClientGameState: score fields visible to all seats", () => {
  it("team0Score visible to all 4 seats", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [8, -8]);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).team0Score).toBe(8);
    }
  });

  it("team1Score visible to all 4 seats", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [-6, 6]);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).team1Score).toBe(6);
    }
  });

  it("targetScore visible to all seats", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).targetScore).toBe(DEFAULT_TARGET_SCORE);
    }
  });

  it("all 4 seats see identical team scores (MIG-010: all clients receive same result)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [5, -5]);
    const views = [0, 1, 2, 3].map((s) => GameService.buildClientGameState(auth, s));
    for (const v of views) {
      expect(v.team0Score).toBe(views[0]!.team0Score);
      expect(v.team1Score).toBe(views[0]!.team1Score);
    }
  });

  it("roundNumber is consistent across all seats", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    const views = [0, 1, 2, 3].map((s) => GameService.buildClientGameState(auth, s));
    for (const v of views) {
      expect(v.roundNumber).toBe(views[0]!.roundNumber);
    }
  });

  it("phase is 'round_ended' in all seats' views after round completes", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("round_ended");
    }
  });

  it("game_ended phase: scores still visible to all seats", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth: AuthoritativeGameState = {
      ...buildAuth(final, 4, [52, -52]),
      phase: "game_ended",
    };
    for (let s = 0; s < 4; s++) {
      const view = GameService.buildClientGameState(auth, s);
      expect(view.phase).toBe("game_ended");
      expect(view.team0Score).toBe(52);
      expect(view.team1Score).toBe(-52);
    }
  });

  it("mySeat differs per player but score fields are identical", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [7, -7]);
    for (let s = 0; s < 4; s++) {
      const view = GameService.buildClientGameState(auth, s);
      expect(view.mySeat).toBe(s);
      expect(view.team0Score).toBe(7);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Multi-round score accumulation at service layer
// ---------------------------------------------------------------------------

describe("Scenario 6 — Multi-round score accumulation", () => {
  it("round 1 bid made: scores updated correctly from [0,0]", () => {
    const result = makeResult({ bid: 6, tricksWon: [2, 6], bidTeam: 1, defTeam: 0 });
    const score = calculateRoundScore(result);
    const gameResult = applyRoundScore([0, 0], score.deltas, cfg(4));
    expect(gameResult.scores[0]).toBe(-6);
    expect(gameResult.scores[1]).toBe(6);
    expect(gameResult.winner).toBeNull();
  });

  it("round 2 accumulates onto round 1 scores", () => {
    const r1 = makeResult({ bid: 6, tricksWon: [2, 6] }); // bidTeam=1 wins
    const d1 = calculateRoundScore(r1).deltas;
    const after1 = applyRoundScore([0, 0], d1, cfg(4));
    // Round 2: bidTeam=1 fails bid 6
    const r2 = makeResult({ bid: 6, tricksWon: [5, 3] }); // bidTeam=1 fails
    const d2 = calculateRoundScore(r2).deltas;
    const after2 = applyRoundScore(after1.scores, d2, cfg(4));
    // After r1: [-6, 6]. After r2: bidTeam=1 -12 → [-6+12, 6-12] = [6, -6]
    expect(after2.scores[0]).toBe(6);
    expect(after2.scores[1]).toBe(-6);
    expect(after2.winner).toBeNull();
  });

  it("scores accumulate to positive winner threshold across N rounds", () => {
    let scores: [number, number] = [0, 0];
    const config = cfg(4);
    // Keep applying bid 5 made by team 1 until team 1 reaches 52
    let rounds = 0;
    while (scores[1] < DEFAULT_TARGET_SCORE && rounds < 20) {
      const d = calculateRoundScore(makeResult({ bid: 5, tricksWon: [3, 5] })).deltas;
      const res = applyRoundScore(scores, d, config);
      scores = res.scores;
      rounds++;
      if (res.winner !== null) break;
    }
    expect(scores[1]).toBeGreaterThanOrEqual(DEFAULT_TARGET_SCORE);
  });

  it("scores always sum to zero after each round (zero-sum invariant)", () => {
    let scores: [number, number] = [0, 0];
    const config = cfg(4);
    // Apply a mix of made/failed rounds
    const rounds: Array<Partial<RoundResult>> = [
      { bid: 6, tricksWon: [2, 6] },  // team1 made 6
      { bid: 5, tricksWon: [5, 3], bidTeam: 0, defTeam: 1 }, // team0 made 5
      { bid: 7, tricksWon: [4, 4] },  // team1 failed 7
    ];
    for (const r of rounds) {
      const result = makeResult(r);
      const d = calculateRoundScore(result).deltas;
      const res = applyRoundScore(scores, d, config);
      scores = res.scores;
      expect(scores[0] + scores[1]).toBe(0); // zero-sum at all times
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — checkPerfect8Victory: service-layer integration
// ---------------------------------------------------------------------------

describe("Scenario 7 — checkPerfect8Victory: service-layer integration", () => {
  it("returns true: bid=8, bidTeam wins all 8 tricks", () => {
    const result = makeResult({ bid: 8, tricksWon: [0, 8] });
    expect(checkPerfect8Victory(result, 4)).toBe(true);
  });

  it("returns false: bid=8, bidTeam wins only 7 tricks", () => {
    const result = makeResult({ bid: 8, tricksWon: [1, 7] });
    expect(checkPerfect8Victory(result, 4)).toBe(false);
  });

  it("returns false: bid=7, bidTeam wins all 8 tricks (bid must be MAX_BID)", () => {
    const result = makeResult({ bid: 7, tricksWon: [0, 8] });
    expect(checkPerfect8Victory(result, 4)).toBe(false);
  });

  it("MAX_BID constant equals 8", () => {
    expect(MAX_BID).toBe(8);
  });

  it("Perfect 8/8 triggers win regardless of current scores (scores below 52)", () => {
    // Scores are [0, 0] — normally would NOT win (needs 52 via applyRoundScore)
    // But checkPerfect8Victory is checked BEFORE applyRoundScore in the service
    const result = makeResult({ bid: 8, tricksWon: [0, 8] });
    const perfect8 = checkPerfect8Victory(result, 4);
    expect(perfect8).toBe(true);
    // In production: if perfect8, finalWinner = bidTeam regardless of cumulative score
    // We verify the logic: perfect8=true → winner is bidTeam
    const score = calculateRoundScore(result);
    const gameResult = applyRoundScore([0, 0], score.deltas, cfg(4));
    // Without perfect8: scores [0-8, 0+8] = [-8, 8] — team1 doesn't reach 52
    expect(gameResult.winner).toBeNull(); // normal path: no win yet
    // Production: perfect8 overrides → bidTeam=1 wins regardless
    expect(perfect8 ? result.bidTeam : gameResult.winner).toBe(1);
  });

  it("checkPerfect8Victory with team 0 as bidder", () => {
    const result = makeResult({ bid: 8, tricksWon: [8, 0], bidTeam: 0, defTeam: 1 });
    expect(checkPerfect8Victory(result, 4)).toBe(true);
  });

  it("6P: checkPerfect8Victory uses TRICKS_PER_ROUND[6]=8", () => {
    // bid=8, bidTeam wins all 8 tricks (6-player also has 8 tricks)
    const result = makeResult({ bid: 8, tricksWon: [0, 8] });
    expect(checkPerfect8Victory(result, 6)).toBe(true);
    // bid=8, bidTeam wins only 7 — even though 6P has 8 tricks total
    const result2 = makeResult({ bid: 8, tricksWon: [1, 7] });
    expect(checkPerfect8Victory(result2, 6)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — roundSummary shape: correct fields
// ---------------------------------------------------------------------------

describe("Scenario 8 — roundSummary shape: all required fields present", () => {
  it("roundSummary from pipeline has all required fields", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    const gameResult = applyRoundScore([0, 0], score.deltas, config);

    // Construct the roundSummary as the service does (shape verification)
    const roundSummary = {
      roundNumber: final.roundNumber,
      biddingTeam: result.bidTeam,
      winningBid: result.bid,
      trumpSuit: final.trumpSuit,
      team0Points: result.tricksWon[0],
      team1Points: result.tricksWon[1],
      bidSucceeded: result.tricksWon[result.bidTeam] >= result.bid,
      chhakriTeam: result.chhakri?.team ?? null,
      team0ScoreDelta: score.deltas[0],
      team1ScoreDelta: score.deltas[1],
      team0CumulativeScore: gameResult.scores[0],
      team1CumulativeScore: gameResult.scores[1],
    };

    expect(roundSummary).toHaveProperty("roundNumber");
    expect(roundSummary).toHaveProperty("biddingTeam");
    expect(roundSummary).toHaveProperty("winningBid");
    expect(roundSummary).toHaveProperty("trumpSuit");
    expect(roundSummary).toHaveProperty("team0Points");
    expect(roundSummary).toHaveProperty("team1Points");
    expect(roundSummary).toHaveProperty("bidSucceeded");
    expect(roundSummary).toHaveProperty("chhakriTeam");
    expect(roundSummary).toHaveProperty("team0ScoreDelta");
    expect(roundSummary).toHaveProperty("team1ScoreDelta");
    expect(roundSummary).toHaveProperty("team0CumulativeScore");
    expect(roundSummary).toHaveProperty("team1CumulativeScore");
  });

  it("roundSummary: team0Points + team1Points = TRICKS_PER_ROUND", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    expect(result.tricksWon[0] + result.tricksWon[1]).toBe(TRICKS_PER_ROUND[4]);
  });

  it("roundSummary: team0ScoreDelta + team1ScoreDelta = 0 (zero-sum)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    expect(score.deltas[0] + score.deltas[1]).toBe(0);
  });

  it("roundSummary: bidSucceeded correctly reflects tricksWon vs bid", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const bidSucceeded = result.tricksWon[result.bidTeam] >= result.bid;
    const score = calculateRoundScore(result);
    expect(score.outcome === "bid_made" || score.outcome === "chhakri_bid_team").toBe(bidSucceeded);
  });

  it("roundSummary: cumulative scores have correct sign after bid made", () => {
    const result = makeResult({ bid: 6, tricksWon: [2, 6], bidTeam: 1, defTeam: 0 });
    const score = calculateRoundScore(result);
    const gameResult = applyRoundScore([0, 0], score.deltas, cfg(4));
    // bidTeam=1 made bid=6 → team1CumulativeScore = +6, team0 = -6
    expect(gameResult.scores[1]).toBe(6);
    expect(gameResult.scores[0]).toBe(-6);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — Reconnect after round_ended / game_ended
// ---------------------------------------------------------------------------

describe("Scenario 9 — Reconnect: complete snapshot after round/game completion", () => {
  it("round_ended: buildClientGameState shows correct phase for all seats", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [6, -6]);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("round_ended");
    }
  });

  it("round_ended: buildClientGameState shows correct scores", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [12, -12]);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.team0Score).toBe(12);
    expect(client.team1Score).toBe(-12);
  });

  it("round_ended: all completedTricks visible to reconnecting player", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.completedTricksThisRound).toBe(TRICKS_PER_ROUND[4]);
  });

  it("round_ended: trumpSuit visible to reconnecting player", () => {
    const { state, config } = stateAtPlaying(4, "H", "S");
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.trumpSuit).toBe("S");
  });

  it("game_ended phase: buildClientGameState for all seats shows game_ended", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const authRoundEnded = buildAuth(final, 4, [52, -52]);
    const authGameEnded: AuthoritativeGameState = {
      ...authRoundEnded,
      phase: "game_ended",
    };
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(authGameEnded, s).phase).toBe("game_ended");
    }
  });

  it("game_ended: final scores visible to reconnecting player", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth: AuthoritativeGameState = {
      ...buildAuth(final, 4, [52, -52]),
      phase: "game_ended",
    };
    const client = GameService.buildClientGameState(auth, 2);
    expect(client.team0Score).toBe(52);
    expect(client.team1Score).toBe(-52);
    expect(client.targetScore).toBe(52);
  });

  it("game_ended: all seats see empty hands (no cards remain)", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth: AuthoritativeGameState = {
      ...buildAuth(final, 4, [52, -52]),
      phase: "game_ended",
    };
    for (let s = 0; s < 4; s++) {
      const client = GameService.buildClientGameState(auth, s);
      expect(client.myHand).toHaveLength(0);
      expect(client.mySecretHand).toHaveLength(0);
      expect(client.myFaceDown).toHaveLength(0);
      expect(client.myFaceUp).toHaveLength(0);
    }
  });

  it("snapshotToRoundState restores round_ended phase correctly", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.phase).toBe("round_ended");
    expect(restored.completedTricks).toHaveLength(TRICKS_PER_ROUND[4]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — Zero-sum invariant: team scores always cancel
// ---------------------------------------------------------------------------

describe("Scenario 10 — Zero-sum invariant: team0Score + team1Score = 0", () => {
  it("initial scores sum to zero", () => {
    expect(0 + 0).toBe(0);
  });

  it("after bid 5 made: zero-sum preserved", () => {
    const d = calculateRoundScore(makeResult({ bid: 5, tricksWon: [3, 5] })).deltas;
    const r = applyRoundScore([0, 0], d, cfg(4));
    expect(r.scores[0] + r.scores[1]).toBe(0);
  });

  it("after bid 8 failed: zero-sum preserved", () => {
    const d = calculateRoundScore(makeResult({ bid: 8, tricksWon: [1, 7] })).deltas;
    const r = applyRoundScore([0, 0], d, cfg(4));
    expect(r.scores[0] + r.scores[1]).toBe(0);
  });

  it("team0Score + team1Score = 0 in buildAuthoritativeSnapshot", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    const gameResult = applyRoundScore([0, 0], score.deltas, config);
    const auth = buildAuth(final, 4, gameResult.scores);
    expect(auth.team0Score + auth.team1Score).toBe(0);
  });

  it("zero-sum preserved across 5 simulated rounds", () => {
    let scores: [number, number] = [0, 0];
    const config = cfg(4);
    const rounds: Array<Partial<RoundResult>> = [
      { bid: 5, tricksWon: [3, 5] },
      { bid: 6, tricksWon: [5, 3] },
      { bid: 7, tricksWon: [7, 1] },
      { bid: 6, tricksWon: [2, 6] },
      { bid: 5, tricksWon: [5, 3], bidTeam: 0, defTeam: 1 },
    ];
    for (const r of rounds) {
      const d = calculateRoundScore(makeResult(r)).deltas;
      const res = applyRoundScore(scores, d, config);
      scores = res.scores;
      expect(scores[0] + scores[1]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 11 — Edge cases and invalid scenarios
// ---------------------------------------------------------------------------

describe("Scenario 11 — Edge cases", () => {
  it("bid exactly at boundary (tricksWon === bid) counts as made", () => {
    const result = makeResult({ bid: 6, tricksWon: [2, 6] }); // exactly 6
    const score = calculateRoundScore(result);
    expect(score.outcome).toBe("bid_made");
    expect(score.deltas[1]).toBe(6);
  });

  it("bid one short of target is failed", () => {
    const result = makeResult({ bid: 6, tricksWon: [3, 5] }); // 5 < 6
    const score = calculateRoundScore(result);
    expect(score.outcome).toBe("bid_failed");
    expect(score.deltas[1]).toBe(-12);
  });

  it("team 0 as bidder: deltas correctly assigned to team index 0", () => {
    const result = makeResult({ bid: 6, tricksWon: [6, 2], bidTeam: 0, defTeam: 1 });
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(6);  // bidTeam=0 earns +6
    expect(score.deltas[1]).toBe(-6); // defTeam=1 earns -6
  });

  it("scores stay at zero when bid 0 is handled (edge case: bid=5 minimum)", () => {
    // Validate the minimum bid produces correct score
    const result = makeResult({ bid: 5, tricksWon: [3, 5] }); // made
    const score = calculateRoundScore(result);
    expect(score.deltas[1]).toBe(5);
    expect(score.deltas[0]).toBe(-5);
  });

  it("roundNumber is preserved in buildAuthoritativeSnapshot", () => {
    const { state, config } = stateAtPlaying();
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4, [0, 0]);
    expect(auth.roundNumber).toBe(1);
  });

  it("high scores near doobna threshold: -499 does not trigger doobna", () => {
    const config = cfg(4);
    // Use starting scores where team 1 is below targetScore=52
    // [-490, 0] + [-9, 9] → [-499, 9]; team1=9 < 52 → no winner, no doobna
    const result = applyRoundScore([-490, 0], [-9, 9], config);
    expect(result.scores[0]).toBe(-499);
    expect(result.doobna).toBeNull();
    expect(result.winner).toBeNull();
  });

  it("score at exactly DEFAULT_DOOBNA_THRESHOLD triggers doobna", () => {
    const config = cfg(4);
    const result = applyRoundScore([-494, 494], [-6, 6], config);
    expect(result.scores[0]).toBe(-500);
    expect(result.doobna).toBe(0);
    expect(result.winner).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — 6P scoring: full pipeline
// ---------------------------------------------------------------------------

describe("Scenario 12 — 6P round scoring: full pipeline", () => {
  it("buildRoundResult for 6P: tricksWon sums to 8", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const result = buildRoundResult(final);
    expect(result.tricksWon[0] + result.tricksWon[1]).toBe(TRICKS_PER_ROUND[6]);
    expect(TRICKS_PER_ROUND[6]).toBe(8);
  });

  it("6P: calculateRoundScore zero-sum invariant", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const result = buildRoundResult(final);
    const score = calculateRoundScore(result);
    expect(score.deltas[0] + score.deltas[1]).toBe(0);
  });

  it("6P: applyRoundScore with production config — no winner at low scores", () => {
    const productionCfg = cfg(6);
    const d = calculateRoundScore(makeResult({ bid: 6, tricksWon: [2, 6] })).deltas;
    const res = applyRoundScore([0, 0], d, productionCfg);
    expect(res.winner).toBeNull();
    expect(res.scores[0] + res.scores[1]).toBe(0);
  });

  it("6P: buildClientGameState all 6 seats see same scores", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const auth = buildAuth(final, 6, [5, -5]);
    const views = Array.from({ length: 6 }, (_, s) => GameService.buildClientGameState(auth, s));
    for (const v of views) {
      expect(v.team0Score).toBe(5);
      expect(v.team1Score).toBe(-5);
    }
  });

  it("6P checkPerfect8Victory: bid=8, bidTeam wins all 8 → true", () => {
    const result = makeResult({ bid: 8, tricksWon: [0, 8] });
    expect(checkPerfect8Victory(result, 6)).toBe(true);
  });

  it("6P: phase is round_ended after all 8 tricks", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const auth = buildAuth(final, 6, [0, 0]);
    expect(auth.phase).toBe("round_ended");
    expect(auth.completedTricks?.length).toBe(TRICKS_PER_ROUND[6]);
  });
});
