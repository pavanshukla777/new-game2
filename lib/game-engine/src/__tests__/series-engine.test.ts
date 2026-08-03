/**
 * Series Engine tests — MIG-029 / MIG-030.
 *
 * MIG-029 [GAP-033]: "Perfect 8/8 Instant Series Victory"
 *   - Bid=8 AND Bidding Team wins ALL tricks → Instant Series Victory.
 *   - Fires regardless of current cumulative scores.
 *   - checkPerfect8Victory() is the pure check function.
 *
 * MIG-030 [GAP-034]: "Dealer rotation — trailing team becomes dealer"
 *   - After each round, the team with the lower series score becomes Dealer Team.
 *   - trailingTeamDealerSeat() returns the first seat clockwise from current
 *     dealer that belongs to the trailing team.
 *   - Ties fall back to normal clockwise rotation.
 *
 * Governance:
 *   - RULEBOOK_SUMMARY.md § "Perfect 8/8": "Bid=8 + Bid Team wins all 8 tricks
 *     → Instant Series Victory."
 *   - RULEBOOK_SUMMARY.md § "Dealer Rotation": "Team currently behind in series
 *     score becomes Dealer Team for next round."
 */

import { describe, it, expect } from "vitest";
import {
  checkPerfect8Victory,
  trailingTeamDealerSeat,
  nextDealerSeat,
  TRICKS_PER_ROUND,
  MAX_BID,
} from "../index.js";
import type { RoundResult, PlayerCount } from "../types.js";
import { GameEngine, defaultGameConfig } from "../engine.js";
import { createSeededRng } from "../prng.js";
import { applyBid, applyPass, applyTrumpSelection, applyPlayCard, getLegalMovesForSeat, currentSeatForTrick, initRound } from "../index.js";

// ---------------------------------------------------------------------------
// MIG-029 — checkPerfect8Victory (pure function)
// ---------------------------------------------------------------------------

describe("checkPerfect8Victory — unit (MIG-029)", () => {
  function makeResult(overrides: Partial<RoundResult> = {}): RoundResult {
    return {
      bidTeam: 0,
      defTeam: 1,
      bid: 8,
      tricksWon: [8, 0],
      multiplier: 1,
      chhakri: null,
      ...overrides,
    };
  }

  it("returns true: bid=8, bidTeam wins all 8 tricks (4-player)", () => {
    expect(checkPerfect8Victory(makeResult(), 4)).toBe(true);
  });

  it("returns true: bid=8, bidTeam wins all 8 tricks (6-player)", () => {
    expect(checkPerfect8Victory(makeResult(), 6)).toBe(true);
  });

  it("returns false: bid=8 but bidTeam wins only 7 tricks", () => {
    expect(checkPerfect8Victory(makeResult({ tricksWon: [7, 1] }), 4)).toBe(false);
  });

  it("returns false: bid=7, bidTeam wins all 8 tricks", () => {
    expect(checkPerfect8Victory(makeResult({ bid: 7, tricksWon: [8, 0] }), 4)).toBe(false);
  });

  it("returns false: bid=8, bidTeam wins 0 tricks", () => {
    expect(checkPerfect8Victory(makeResult({ tricksWon: [0, 8] }), 4)).toBe(false);
  });

  it("returns false: bid=5, bidTeam wins all 8 tricks (not a Perfect 8 bid)", () => {
    expect(checkPerfect8Victory(makeResult({ bid: 5, tricksWon: [8, 0] }), 4)).toBe(false);
  });

  it("returns false: bid=6, bidTeam wins all 8 tricks", () => {
    expect(checkPerfect8Victory(makeResult({ bid: 6, tricksWon: [8, 0] }), 4)).toBe(false);
  });

  it("returns true: Team 1 is bidder, wins all 8", () => {
    expect(
      checkPerfect8Victory(makeResult({ bidTeam: 1, defTeam: 0, tricksWon: [0, 8] }), 4),
    ).toBe(true);
  });

  it("MAX_BID constant is 8 (sanity check)", () => {
    expect(MAX_BID).toBe(8);
  });

  it("TRICKS_PER_ROUND[4] is 8, TRICKS_PER_ROUND[6] is 8", () => {
    expect(TRICKS_PER_ROUND[4]).toBe(8);
    expect(TRICKS_PER_ROUND[6]).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// MIG-029 — Engine integration: winner is set on Perfect 8/8
// ---------------------------------------------------------------------------

describe("MIG-029 — Perfect 8/8 sets game winner via engine", () => {
  /**
   * Plays a round such that bidTeam wins all 8 tricks with bid=8.
   * We achieve this by: having one seat bid 8 and then always playing that
   * seat's highest legal card (which includes their trump). This won't
   * deterministically win all 8 tricks for any seed, so we use a controlled
   * approach: manually build a state where bid=8 and tricksWon[bidTeam]=8.
   *
   * The cleanest integration test: manually call finaliseRound on an engine
   * with a crafted round state.
   */
  it("game.winner is set when bid=8 and bidTeam wins all 8 tricks", () => {
    // Build a game with scores well below 52 (so normal scoring wouldn't win)
    const config = defaultGameConfig(4, { targetScore: 52 });
    const engine = new GameEngine(config, createSeededRng(1));
    let game = engine.createGame("g");
    game = { ...game, scores: [0, 0] };

    // Start a round
    const { game: g1 } = engine.startRound(game);

    // Manually construct a round state at round_ended where bid=8 and
    // Team 1 (seat 1) won all 8 tricks.
    const round = g1.currentRound!;
    // Inject a "round_ended" state with bid=8, bidder=seat 1, all tricks won by team 1
    const completedTricks = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      cards: [],
      ledSuit: "S" as const,
      winnerSeat: 1,
      winnerTeam: 1 as const,
      points: 0,
    }));
    const manipulatedRound = {
      ...round,
      phase: "round_ended" as const,
      biddingStatus: "won" as const,
      highestBid: 8,
      highestBidderSeat: 1,
      trumpSuit: "S" as const,
      completedTricks,
    };
    const g2: typeof g1 = { ...g1, currentRound: manipulatedRound };

    const { game: finalGame } = engine.finaliseRound(g2);

    // Perfect 8/8: bid=8, bidTeam=1 (seat 1), tricksWon[1]=8 → instant win
    expect(finalGame.winner).toBe(1);
    // Scores should still be low (not due to cumulative 52 crossing)
    expect(finalGame.scores[0] + finalGame.scores[1]).toBeLessThan(52);
  });

  it("game.winner is null when bid=8 but bidTeam wins only 7 tricks and scores < 52", () => {
    const config = defaultGameConfig(4, { targetScore: 52 });
    const engine = new GameEngine(config, createSeededRng(1));
    let game = engine.createGame("g");
    game = { ...game, scores: [0, 0] };
    const { game: g1 } = engine.startRound(game);

    const round = g1.currentRound!;
    // 7 tricks to team 1, 1 trick to team 0
    const completedTricks = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      cards: [],
      ledSuit: "S" as const,
      winnerSeat: i < 7 ? 1 : 0,
      winnerTeam: (i < 7 ? 1 : 0) as 0 | 1,
      points: 0,
    }));
    const manipulatedRound = {
      ...round,
      phase: "round_ended" as const,
      biddingStatus: "won" as const,
      highestBid: 8,
      highestBidderSeat: 1,
      trumpSuit: "S" as const,
      completedTricks,
    };
    const g2 = { ...g1, currentRound: manipulatedRound };
    const { game: finalGame } = engine.finaliseRound(g2);

    // Bid=8 but only 7 won → bid FAILED, no Perfect 8 → no instant win
    // Scores are [0,0] + delta from bid=8 fail (bidTeam=1 loses −8)
    expect(finalGame.winner).toBeNull();
  });

  it("game.winner is NOT set when bid=7 and bidTeam wins all 8 tricks and scores < 52", () => {
    const config = defaultGameConfig(4, { targetScore: 52 });
    const engine = new GameEngine(config, createSeededRng(1));
    let game = engine.createGame("g");
    game = { ...game, scores: [0, 0] };
    const { game: g1 } = engine.startRound(game);

    const round = g1.currentRound!;
    const completedTricks = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      cards: [],
      ledSuit: "S" as const,
      winnerSeat: 1,
      winnerTeam: 1 as const,
      points: 0,
    }));
    const manipulatedRound = {
      ...round,
      phase: "round_ended" as const,
      biddingStatus: "won" as const,
      highestBid: 7,   // bid=7, not 8
      highestBidderSeat: 1,
      trumpSuit: "S" as const,
      completedTricks,
    };
    const g2 = { ...g1, currentRound: manipulatedRound };
    const { game: finalGame } = engine.finaliseRound(g2);

    // bid=7 (not 8) → no Perfect 8/8 → no instant win; scores = [0+0, 0+7] = [0,7] < 52
    expect(finalGame.winner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MIG-030 — trailingTeamDealerSeat (pure function)
// ---------------------------------------------------------------------------

describe("trailingTeamDealerSeat — unit (MIG-030)", () => {
  // 4-player: Team 0 = seats 0,2; Team 1 = seats 1,3

  it("Team 0 trailing: first Team-0 seat clockwise from current dealer", () => {
    // dealer=0, scores=[5,10] (Team 0 behind)
    // Clockwise from 0: seat 1 (T1), seat 2 (T0) → return 2
    expect(trailingTeamDealerSeat(0, [5, 10], 4)).toBe(2);
  });

  it("Team 0 trailing from dealer=2: next Team-0 seat is seat 0", () => {
    // Clockwise from 2: seat 3 (T1), seat 0 (T0) → return 0
    expect(trailingTeamDealerSeat(2, [5, 10], 4)).toBe(0);
  });

  it("Team 1 trailing from dealer=0: first Team-1 seat is seat 1", () => {
    // Clockwise from 0: seat 1 (T1) → return 1
    expect(trailingTeamDealerSeat(0, [10, 5], 4)).toBe(1);
  });

  it("Team 1 trailing from dealer=1: next Team-1 seat is seat 3", () => {
    // Clockwise from 1: seat 2 (T0), seat 3 (T1) → return 3
    expect(trailingTeamDealerSeat(1, [10, 5], 4)).toBe(3);
  });

  it("Team 1 trailing from dealer=3: wraps to seat 1", () => {
    // Clockwise from 3: seat 0 (T0), seat 1 (T1) → return 1
    expect(trailingTeamDealerSeat(3, [10, 5], 4)).toBe(1);
  });

  it("scores tied: falls back to normal clockwise rotation", () => {
    expect(trailingTeamDealerSeat(0, [5, 5], 4)).toBe(nextDealerSeat(0, 4));
    expect(trailingTeamDealerSeat(3, [0, 0], 4)).toBe(nextDealerSeat(3, 4));
  });

  it("scores tied with negative values (both below zero): clockwise fallback", () => {
    expect(trailingTeamDealerSeat(2, [-10, -10], 4)).toBe(nextDealerSeat(2, 4));
  });

  it("works correctly for 6-player: Team 0 = seats 0,2,4; Team 1 = seats 1,3,5", () => {
    // dealer=0, Team 0 trailing (scores=[2,8])
    // Clockwise from 0: 1(T1),2(T0) → return 2
    expect(trailingTeamDealerSeat(0, [2, 8], 6)).toBe(2);

    // dealer=4, Team 0 trailing
    // Clockwise from 4: 5(T1),0(T0) → return 0
    expect(trailingTeamDealerSeat(4, [2, 8], 6)).toBe(0);

    // dealer=0, Team 1 trailing
    // Clockwise from 0: 1(T1) → return 1
    expect(trailingTeamDealerSeat(0, [8, 2], 6)).toBe(1);

    // dealer=5, Team 1 trailing
    // Clockwise from 5: 0(T0),1(T1) → return 1
    expect(trailingTeamDealerSeat(5, [8, 2], 6)).toBe(1);
  });

  it("negative scores: trailing team is the one with lower (more negative) score", () => {
    // Team 0 at -10, Team 1 at +5 → Team 0 is trailing
    expect(trailingTeamDealerSeat(1, [-10, 5], 4)).toBe(2); // T0 seats: next from 1 = 2
  });

  it("returned seat is always a valid seat for the player count", () => {
    const checks: Array<[number, [number, number], PlayerCount]> = [
      [0, [10, 5], 4], [1, [5, 10], 4], [2, [5, 10], 6], [3, [10, 5], 6],
    ];
    for (const [dealer, scores, pc] of checks) {
      const seat = trailingTeamDealerSeat(dealer, scores, pc);
      expect(seat).toBeGreaterThanOrEqual(0);
      expect(seat).toBeLessThan(pc);
    }
  });
});

// ---------------------------------------------------------------------------
// MIG-030 — Engine integration: dealer follows trailing team
// ---------------------------------------------------------------------------

describe("MIG-030 — engine finaliseRound uses trailingTeamDealerSeat", () => {
  function buildEndedRound(
    engine: GameEngine,
    game: ReturnType<GameEngine["createGame"]>,
    bidSeat: number,
    bidAmount: number,
    trickWinnerSeat: number,
  ) {
    const { game: g1 } = engine.startRound(game);
    const round = g1.currentRound!;
    const winnerTeam = (trickWinnerSeat % 2) as 0 | 1;
    const completedTricks = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      cards: [],
      ledSuit: "S" as const,
      winnerSeat: trickWinnerSeat,
      winnerTeam,
      points: 0,
    }));
    const manipulatedRound = {
      ...round,
      phase: "round_ended" as const,
      biddingStatus: "won" as const,
      highestBid: bidAmount,
      highestBidderSeat: bidSeat,
      trumpSuit: "S" as const,
      completedTricks,
    };
    return { ...g1, currentRound: manipulatedRound };
  }

  it("next dealer is from Team 0 when Team 0 is trailing after round", () => {
    // bid=5 by seat 1 (Team 1), all tricks won by team 1 → team 1 gets +5, team 0 gets −5
    // After round: scores=[−5, +5] → Team 0 is trailing → next dealer is a Team-0 seat
    const config = defaultGameConfig(4, { targetScore: 52 });
    const engine = new GameEngine(config, createSeededRng(1));
    const game = engine.createGame("g");
    const g2 = buildEndedRound(engine, game, 1, 5, 1); // seat 1 wins all
    const { game: final } = engine.finaliseRound(g2);

    // Team 0 trailing → next dealer is a Team-0 seat (0 or 2)
    expect(final.nextDealerSeat % 2).toBe(0); // even seat = Team 0
  });

  it("next dealer is from Team 1 when Team 1 is trailing after round", () => {
    // bid=5 by seat 0 (Team 0), all tricks won by team 0 → team 0 +5, team 1 −5
    // After round: scores=[+5, −5] → Team 1 is trailing → next dealer is a Team-1 seat
    const config = defaultGameConfig(4, { targetScore: 52 });
    const engine = new GameEngine(config, createSeededRng(1));
    const game = engine.createGame("g");
    const { game: g1 } = engine.startRound(game);
    const round = g1.currentRound!;
    const completedTricks = Array.from({ length: 8 }, (_, i) => ({
      index: i,
      cards: [],
      ledSuit: "S" as const,
      winnerSeat: 0,
      winnerTeam: 0 as const,
      points: 0,
    }));
    const manipulatedRound = {
      ...round,
      phase: "round_ended" as const,
      biddingStatus: "won" as const,
      highestBid: 5,
      highestBidderSeat: 0,
      trumpSuit: "S" as const,
      completedTricks,
    };
    const g2 = { ...g1, currentRound: manipulatedRound };
    const { game: final } = engine.finaliseRound(g2);

    // Team 1 trailing → next dealer is a Team-1 seat (1 or 3)
    expect(final.nextDealerSeat % 2).toBe(1); // odd seat = Team 1
  });
});
