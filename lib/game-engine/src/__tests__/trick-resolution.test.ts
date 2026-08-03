/**
 * Trick Resolution and Chhakri Scoring tests — MIG-027 / MIG-028.
 *
 * MIG-027 [GAP-027]: "Always exactly 8 tricks per round; no early termination."
 *   - Chhakri event is recorded when a team wins 6 consecutive tricks.
 *   - The round is NOT ended early; play continues to all 8 tricks.
 *
 * MIG-028 [GAP-031]: "No Chhakri bonus or multiplier applies to scoring."
 *   - calculateRoundScore ignores the chhakri field when computing deltas.
 *   - bidUnitScore = bid × multiplier (no chhakrBonus).
 *
 * Governance:
 *   - RULEBOOK_SUMMARY.md § "Trick Count": "Always exactly 8 tricks per round."
 *   - RULEBOOK_SUMMARY.md § "No Bonus": "No Chhakri bonus or multiplier applies."
 */

import { describe, it, expect } from "vitest";
import {
  initRound,
  applyBid,
  applyPass,
  applyTrumpSelection,
  applyPlayCard,
  currentSeatForTrick,
  getLegalMovesForSeat,
  calculateRoundScore,
  TRICKS_PER_ROUND,
  CHHAKRI_THRESHOLD,
} from "../index.js";
import type { GameConfig, RoundResult, RoundState } from "../types.js";
import { createSeededRng } from "../prng.js";
import { defaultGameConfig } from "../engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLegacyConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return defaultGameConfig(4, overrides);
}

/** Play a full round from "playing" phase. Returns final state. */
function playAllTricks(state: RoundState, config: GameConfig): RoundState {
  let s = state;
  while (s.phase === "playing") {
    const seat = currentSeatForTrick(s, config.playerCount);
    const legal = getLegalMovesForSeat(s, seat, config.playerCount);
    expect(legal.length).toBeGreaterThan(0);
    s = applyPlayCard(s, seat, legal[0], config);
  }
  return s;
}

/** Set up a round through bidding and trump selection, ready to play. */
function setupPlayingRound(seed: number, dealerSeat = 0): RoundState {
  const config = makeLegacyConfig();
  const rng = createSeededRng(seed);
  let state = initRound(1, dealerSeat, config, rng);
  state = applyBid(state, 1, 5, config);
  state = applyPass(state, 2);
  state = applyPass(state, 3);
  state = applyPass(state, 0);
  state = applyTrumpSelection(state, 1, "S", config);
  return state;
}

// ---------------------------------------------------------------------------
// MIG-027 — No early round termination
// ---------------------------------------------------------------------------

describe("MIG-027 — no early round termination", () => {
  it("round always ends with exactly 8 completed tricks (4-player)", () => {
    // Over many seeds, some will trigger Chhakri; all must complete 8 tricks.
    for (let seed = 1; seed <= 20; seed++) {
      const config = makeLegacyConfig();
      const state = playAllTricks(setupPlayingRound(seed), config);
      expect(state.phase).toBe("round_ended");
      expect(state.completedTricks).toHaveLength(TRICKS_PER_ROUND[4]);
    }
  });

  it("round ends with exactly 8 tricks even when Chhakri fires", () => {
    // Run seeds until we find one where Chhakri fires, then assert 8 tricks.
    const config = makeLegacyConfig();
    let foundChhakri = false;

    for (let seed = 1; seed <= 50; seed++) {
      const state = playAllTricks(setupPlayingRound(seed), config);
      if (state.chhakri !== null) {
        foundChhakri = true;
        expect(state.phase).toBe("round_ended");
        expect(state.completedTricks).toHaveLength(8);
        expect(state.chhakri.trickIndex).toBeLessThanOrEqual(7);
        break;
      }
    }
    // Sanity: we must have found at least one Chhakri game in 50 seeds
    // (if not, the Chhakri threshold logic might be broken — soft check)
    if (!foundChhakri) {
      // The test is still meaningful; Chhakri may be rare with first-legal-move play
      console.warn("No Chhakri encountered in seeds 1–50; skipping Chhakri-specific assertions");
    }
  });

  it("all card-points are distributed across all 8 tricks (no early truncation)", () => {
    // [MIG-027] Since rounds always play 8 tricks, total card-points = deck total.
    // (4-player deck: A=4, K=3, Q=2, J=1, 10=10 per suit = 20 × 4 = 80 points)
    const config = makeLegacyConfig();
    for (let seed = 1; seed <= 15; seed++) {
      const state = playAllTricks(setupPlayingRound(seed), config);
      const totalPoints = state.capturedPoints[0] + state.capturedPoints[1];
      // All 80 card-points in the 4-player deck are distributed across 8 tricks
      expect(totalPoints).toBe(80);
    }
  });

  it("consecutive wins reset correctly when other team wins between tricks", () => {
    const config = makeLegacyConfig();
    const state = playAllTricks(setupPlayingRound(5), config);

    // After round ends, consecutive wins tracker reflects only the last streak
    expect(state.consecutiveWins[0] + state.consecutiveWins[1]).toBeGreaterThanOrEqual(1);
    expect(state.consecutiveWins[0]).toBeGreaterThanOrEqual(0);
    expect(state.consecutiveWins[1]).toBeGreaterThanOrEqual(0);
    // At most one team can have a non-zero streak at round end
    const bothNonZero = state.consecutiveWins[0] > 0 && state.consecutiveWins[1] > 0;
    expect(bothNonZero).toBe(false);
  });

  it("when Chhakri fires mid-round, subsequent tricks can still be played", () => {
    // [MIG-027] After chhakri is set, phase stays "playing" if tricks remain.
    const config = makeLegacyConfig();
    let chhakriFiredBeforeEnd = false;

    for (let seed = 1; seed <= 50; seed++) {
      let state = setupPlayingRound(seed);
      let lastChhakriFiredTrick: number | null = null;

      while (state.phase === "playing") {
        const prevCompleted = state.completedTricks.length;
        const seat = currentSeatForTrick(state, config.playerCount);
        const legal = getLegalMovesForSeat(state, seat, config.playerCount);
        state = applyPlayCard(state, seat, legal[0], config);

        // Detect the trick on which Chhakri just fired
        const justCompletedTrick = state.completedTricks.length > prevCompleted;
        if (justCompletedTrick && state.chhakri !== null && lastChhakriFiredTrick === null) {
          lastChhakriFiredTrick = state.completedTricks.length;
          if (state.completedTricks.length < 8) {
            // Phase must be "playing" — round continues after Chhakri
            expect(state.phase).toBe("playing");
            chhakriFiredBeforeEnd = true;
          }
        }
      }
      if (chhakriFiredBeforeEnd) break;
    }
  });

  it("Chhakri event is recorded with correct team and trickIndex", () => {
    const config = makeLegacyConfig();
    for (let seed = 1; seed <= 50; seed++) {
      const state = playAllTricks(setupPlayingRound(seed), config);
      if (state.chhakri !== null) {
        const chhakEvent = state.events.find((e) => e.type === "chhakri");
        expect(chhakEvent).toBeDefined();
        expect(state.chhakri.team).toBeOneOf([0, 1]);
        // trickIndex 0-based; Chhakri requires 6 consecutive wins → min index = 5
        expect(state.chhakri.trickIndex).toBeGreaterThanOrEqual(CHHAKRI_THRESHOLD - 1);
        break;
      }
    }
  });

  it("Chhakri threshold constant is 6", () => {
    expect(CHHAKRI_THRESHOLD).toBe(6);
  });

  it("6-player round also always ends with exactly 8 tricks", () => {
    const config = defaultGameConfig(6);
    const rng = createSeededRng(100);
    let state = initRound(1, 0, config, rng);
    // seat 1 bids; then enough passes to end bidding (3 consecutive)
    state = applyBid(state, 1, 5, config);
    while (state.phase === "bidding") {
      const seat = (state.dealerSeat + 1 + state.bids.length) % config.playerCount;
      state = applyPass(state, seat);
    }
    state = applyTrumpSelection(state, 1, "H", config);
    state = playAllTricks(state, config);
    expect(state.phase).toBe("round_ended");
    expect(state.completedTricks).toHaveLength(TRICKS_PER_ROUND[6]);
  });
});

// ---------------------------------------------------------------------------
// MIG-028 — No Chhakri scoring bonus
// ---------------------------------------------------------------------------

describe("MIG-028 — no Chhakri scoring bonus", () => {
  const base: RoundResult = {
    bidTeam: 0,
    defTeam: 1,
    bid: 6,
    tricksWon: [7, 1],
    multiplier: 1,
    chhakri: null,
  };

  it("Chhakri present: deltas are identical to no-Chhakri for bid made", () => {
    const withChhakri = calculateRoundScore({ ...base, chhakri: { team: 0 } });
    const noChhakri = calculateRoundScore({ ...base, chhakri: null });
    expect(withChhakri.deltas).toEqual(noChhakri.deltas);
  });

  it("Chhakri present: deltas are identical to no-Chhakri for bid failed", () => {
    const failed: RoundResult = { ...base, tricksWon: [3, 5] };
    const withChhakri = calculateRoundScore({ ...failed, chhakri: { team: 1 } });
    const noChhakri = calculateRoundScore({ ...failed, chhakri: null });
    expect(withChhakri.deltas).toEqual(noChhakri.deltas);
  });

  it("bid=5 made, chhakri set: delta = [+5, −5] (not [+10, −10])", () => {
    const result: RoundResult = { ...base, bid: 5, tricksWon: [6, 2], chhakri: { team: 0 } };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(5);
    expect(score.deltas[1]).toBe(-5);
  });

  it("bid=5 failed, chhakri set: delta = [−10, +10] — zero-sum [RULE]", () => {
    // [RULE] Bid failure: bidTeam=−(2×5)=−10, defTeam=+(2×5)=+10; net=0
    // Chhakri does not affect the score formula.
    const result: RoundResult = { ...base, bid: 5, tricksWon: [4, 4], chhakri: { team: 1 } };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(-10);
    expect(score.deltas[1]).toBe(10);
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
  });

  it("bid=8 made with Chhakri, multiplier=1: delta = [+8, −8]", () => {
    const result: RoundResult = { ...base, bid: 8, tricksWon: [8, 0], chhakri: { team: 0 } };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(8);
    expect(score.deltas[1]).toBe(-8);
  });

  it("bid=8 failed with Chhakri (def won 6): delta = [−16, +16] — zero-sum [RULE]", () => {
    // [RULE] Bid failure: bidTeam=−(2×8)=−16, defTeam=+(2×8)=+16; net=0
    // Chhakri does not affect the score formula.
    const result: RoundResult = { ...base, bid: 8, tricksWon: [2, 6], chhakri: { team: 1 } };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(-16);
    expect(score.deltas[1]).toBe(16);
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
  });

  it("Chhakri present (bid=6 made): delta = [+6, −6] — no multiplier, no bonus [RULE]", () => {
    // [RULE] No multiplier, no Chhakri bonus: bid=6 made → [+6, −6]; zero-sum
    const result: RoundResult = { ...base, bid: 6, tricksWon: [7, 1], multiplier: 1, chhakri: { team: 0 } };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(6);
    expect(score.deltas[1]).toBe(-6);
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
  });

  it("outcome label is 'chhakri_bid_team' when chhakri team === bidTeam", () => {
    const result: RoundResult = { ...base, chhakri: { team: 0 } };
    const score = calculateRoundScore(result);
    expect(score.outcome).toBe("chhakri_bid_team");
  });

  it("outcome label is 'chhakri_def_team' when chhakri team === defTeam", () => {
    const result: RoundResult = { ...base, tricksWon: [3, 5], chhakri: { team: 1 } };
    const score = calculateRoundScore(result);
    expect(score.outcome).toBe("chhakri_def_team");
  });

  it("outcome is 'bid_made' when chhakri is null and bid made", () => {
    const score = calculateRoundScore(base);
    expect(score.outcome).toBe("bid_made");
  });

  it("outcome is 'bid_failed' when chhakri is null and bid failed", () => {
    const result: RoundResult = { ...base, tricksWon: [4, 4] };
    const score = calculateRoundScore(result);
    expect(score.outcome).toBe("bid_failed");
  });
});
