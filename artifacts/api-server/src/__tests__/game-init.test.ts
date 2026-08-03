/**
 * Volume 6 Part 2 — Official Game Initialization Tests
 *
 * Tests that do NOT require a live database. They exercise:
 *   - GameService static validation methods
 *   - Engine-level initialization (dealer, player order, team assignment)
 *   - buildAuthoritativeSnapshot for correct initial state
 *   - validateInitialSnapshot integrity checks
 *
 * Official Rulebook references:
 *   [RULE-001] 4 or 6 players only
 *   [RULE-005] Alternating A-B seating
 *   [RULE-006] Seat assignments fixed at match start
 *   [RULE-007] Server authority over all initialization
 */

import { describe, it, expect } from "vitest";
import { GameService, type GameInitPlayer } from "../services/game.service.js";
import {
  GameEngine,
  defaultGameConfig,
  createSeededRng,
  seatToTeam,
} from "@workspace/game-engine";
import type { AuthoritativeGameState } from "@workspace/db";

// ============================================================================
// Test helpers
// ============================================================================

/** Build a minimal player list occupying seats 0..count-1. */
function makePlayers(count: 4 | 6): GameInitPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i}`,
    seat: i,
    displayName: `Player ${i}`,
    isAdmin: i === 0,
    isAi: false,
  }));
}

/** Create a GameEngine with the Official Chhakri production config. */
function makeOfficialEngine(playerCount: 4 | 6, seed = 42) {
  const config = defaultGameConfig(playerCount, {
    useTwoRoundBidding: true,
    allowDobla: false,
  });
  return new GameEngine(config, createSeededRng(seed));
}

/**
 * Build a minimal AuthoritativeGameState for snapshot validation tests.
 * Only the fields validated by validateInitialSnapshot are populated.
 */
function makeMinimalSnapshot(
  overrides: Partial<AuthoritativeGameState> & { playerCount?: 4 | 6 } = {},
): AuthoritativeGameState {
  const playerCount = overrides.playerCount ?? 4;
  const seats: AuthoritativeGameState["seats"] = {};
  for (let s = 0; s < playerCount; s++) {
    seats[s] = {
      userId: `user-${s}`,
      displayName: `Player ${s}`,
      team: (s % 2) as 0 | 1,
      hand: [],
      tricksWon: 0,
      pointsCaptured: 0,
      connectionState: "CONNECTED",
      isAi: false,
      secretHand: [],
      faceDown: [],
      faceUp: [],
      inFaceDownPhase: false,
    };
  }

  const { playerCount: _pc, ...rest } = overrides;

  const base: AuthoritativeGameState = {
    gameId: "test-game",
    roundNumber: 1,
    phase: "primary_bid",
    sequence: 0,
    seats,
    dealerSeat: 0,
    currentBidderSeat: null,
    highestBid: 0,
    highestBidderSeat: null,
    bids: [],
    biddingStatus: "ongoing",
    consecutivePasses: 0,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,
    noTrump: false,
    primaryTrump: null,
    useTwoRoundBidding: true,
    remainingDeck: undefined,
    currentTrickLeaderSeat: null,
    currentTrick: [],
    completedTricksThisRound: 0,
    consecutiveTricks: null,
    consecutiveWins: [0, 0],
    chhakri: null,
    team0PointsThisRound: 0,
    team1PointsThisRound: 0,
    team0Score: 0,
    team1Score: 0,
    targetScore: 52,
    completedTricks: [],
  };

  return { ...base, ...rest };
}

// ============================================================================
// 4-player initialization — engine + snapshot
// ============================================================================

describe("4-player initialization", () => {
  it("creates a round with the correct initial phase (primary_bid)", () => {
    const engine = makeOfficialEngine(4);
    const game = engine.createGame("test-game-4p");
    const { game: started } = engine.startRound(game);

    expect(started.currentRound).not.toBeNull();
    expect(started.currentRound!.phase).toBe("primary_bid");
  });

  it("Phase 1: deals exactly 2 secret-hand cards per seat at initialization", () => {
    // [Official Rulebook] Phased deal: Phase 1 deals 2 secret-hand cards before
    // the Primary Bid. The remaining 6 cards (3 face-down + 3 face-up) are dealt
    // in Phases 2 and 3 AFTER the Primary Bid. hands[seat] holds Phase 1 only.
    const engine = makeOfficialEngine(4);
    const game = engine.createGame("test-game-4p");
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;

    for (let seat = 0; seat < 4; seat++) {
      expect(round.hands[seat]).toHaveLength(2); // Phase 1: secret hand only
    }
  });

  it("Phase 1: 8 total cards dealt (2 × 4 seats), 24 held in remainingDeck", () => {
    // 4-player deck = 32 cards; Phase 1 = 2 per seat × 4 seats = 8 dealt; 24 remaining
    const engine = makeOfficialEngine(4);
    const { game: started } = engine.startRound(engine.createGame("4p-phase1"));
    const round = started.currentRound!;

    const dealtInPhase1 = Object.values(round.hands).flat();
    expect(dealtInPhase1).toHaveLength(8);
    expect(new Set(dealtInPhase1).size).toBe(8);   // all unique
    expect(round.remainingDeck).toHaveLength(24);   // 32 - 8 = 24
  });

  it("dealer seat 0 → first card recipient is seat 1 (clockwise)", () => {
    const engine = makeOfficialEngine(4, 1);
    const game = engine.createGame("test-game-dealer0", 0);
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;

    // shuffledDeck[0] should appear in seat 1's hand
    const firstCard = round.shuffledDeck?.[0];
    expect(firstCard).toBeDefined();
    expect(round.hands[1]).toContain(firstCard);
  });

  it("dealer seat 2 → first card recipient is seat 3", () => {
    const engine = makeOfficialEngine(4, 2);
    const game = engine.createGame("test-game-dealer2", 2);
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;

    const firstCard = round.shuffledDeck?.[0];
    expect(firstCard).toBeDefined();
    expect(round.hands[3]).toContain(firstCard);
  });

  it("initial scores are [0, 0]", () => {
    const engine = makeOfficialEngine(4);
    const game = engine.createGame("test-game-4p");
    expect(game.scores).toEqual([0, 0]);
  });

  it("round 1 is always the first round", () => {
    const engine = makeOfficialEngine(4);
    const game = engine.createGame("test-game-4p");
    const { game: started } = engine.startRound(game);
    expect(started.roundNumber).toBe(1);
  });

  it("buildAuthoritativeSnapshot produces correct initial structure for 4P", () => {
    const engine = makeOfficialEngine(4, 99);
    const game = engine.createGame("snap-4p", 0);
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;

    const players = makePlayers(4);
    const snapshot = GameService.buildAuthoritativeSnapshot({
      gameId: "snap-4p",
      sequence: 0,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      gameMode: "standard",
      seatData: players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        displayName: p.displayName,
        isAi: p.isAi ?? false,
        connectionState: "CONNECTED" as const,
      })),
    });

    expect(snapshot.sequence).toBe(0);
    expect(snapshot.roundNumber).toBe(1);
    expect(snapshot.phase).toBe("primary_bid");
    expect(snapshot.team0Score).toBe(0);
    expect(snapshot.team1Score).toBe(0);
    expect(Object.keys(snapshot.seats)).toHaveLength(4);
  });
});

// ============================================================================
// 6-player initialization — engine + snapshot
// ============================================================================

describe("6-player initialization", () => {
  it("creates a round with the correct initial phase (primary_bid)", () => {
    const engine = makeOfficialEngine(6);
    const game = engine.createGame("test-game-6p");
    const { game: started } = engine.startRound(game);

    expect(started.currentRound!.phase).toBe("primary_bid");
  });

  it("Phase 1: deals exactly 2 secret-hand cards per seat at initialization", () => {
    // [Official Rulebook] Phased deal: Phase 1 deals 2 secret-hand cards before
    // the Primary Bid. The remaining 6 cards (3 face-down + 3 face-up) are dealt
    // in Phases 2 and 3 AFTER the Primary Bid. hands[seat] holds Phase 1 only.
    const engine = makeOfficialEngine(6);
    const game = engine.createGame("test-game-6p");
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;

    for (let seat = 0; seat < 6; seat++) {
      expect(round.hands[seat]).toHaveLength(2); // Phase 1: secret hand only
    }
  });

  it("Phase 1: 12 total cards dealt (2 × 6 seats), 36 held in remainingDeck", () => {
    // 6-player deck = 48 cards; Phase 1 = 2 per seat × 6 seats = 12 dealt; 36 remaining
    const engine = makeOfficialEngine(6);
    const { game: started } = engine.startRound(engine.createGame("6p-phase1"));
    const round = started.currentRound!;

    const dealtInPhase1 = Object.values(round.hands).flat();
    expect(dealtInPhase1).toHaveLength(12);
    expect(new Set(dealtInPhase1).size).toBe(12); // all unique
    expect(round.remainingDeck).toHaveLength(36);  // 48 - 12 = 36
  });

  it("initial scores are [0, 0]", () => {
    const engine = makeOfficialEngine(6);
    const game = engine.createGame("test-game-6p");
    expect(game.scores).toEqual([0, 0]);
  });

  it("buildAuthoritativeSnapshot produces correct initial structure for 6P", () => {
    const engine = makeOfficialEngine(6, 77);
    const game = engine.createGame("snap-6p", 0);
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;

    const players = makePlayers(6);
    const snapshot = GameService.buildAuthoritativeSnapshot({
      gameId: "snap-6p",
      sequence: 0,
      roundNumber: 1,
      roundState: round,
      playerCount: 6,
      gameScores: [0, 0],
      targetScore: 52,
      gameMode: "standard",
      seatData: players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        displayName: p.displayName,
        isAi: p.isAi ?? false,
        connectionState: "CONNECTED" as const,
      })),
    });

    expect(snapshot.sequence).toBe(0);
    expect(snapshot.roundNumber).toBe(1);
    expect(snapshot.phase).toBe("primary_bid");
    expect(Object.keys(snapshot.seats)).toHaveLength(6);
  });
});

// ============================================================================
// Team assignment — [RULE-005] Alternating A-B seating
// ============================================================================

describe("Team assignment [RULE-005] — alternating A-B seating", () => {
  it("4-player: even seats (0, 2) → Team 0; odd seats (1, 3) → Team 1", () => {
    expect(seatToTeam(0)).toBe(0);
    expect(seatToTeam(2)).toBe(0);
    expect(seatToTeam(1)).toBe(1);
    expect(seatToTeam(3)).toBe(1);
  });

  it("6-player: even seats (0, 2, 4) → Team 0; odd seats (1, 3, 5) → Team 1", () => {
    expect(seatToTeam(0)).toBe(0);
    expect(seatToTeam(2)).toBe(0);
    expect(seatToTeam(4)).toBe(0);
    expect(seatToTeam(1)).toBe(1);
    expect(seatToTeam(3)).toBe(1);
    expect(seatToTeam(5)).toBe(1);
  });

  it("4-player snapshot has correct team assignments in every seat", () => {
    const engine = makeOfficialEngine(4, 33);
    const game = engine.createGame("team-4p", 0);
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;
    const players = makePlayers(4);

    const snapshot = GameService.buildAuthoritativeSnapshot({
      gameId: "team-4p",
      sequence: 0,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        displayName: p.displayName,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    for (const [seatStr, seatState] of Object.entries(snapshot.seats)) {
      const seat = Number(seatStr);
      expect(seatState.team).toBe(seat % 2);
    }
  });

  it("6-player snapshot has correct team assignments in every seat", () => {
    const engine = makeOfficialEngine(6, 44);
    const game = engine.createGame("team-6p", 0);
    const { game: started } = engine.startRound(game);
    const round = started.currentRound!;
    const players = makePlayers(6);

    const snapshot = GameService.buildAuthoritativeSnapshot({
      gameId: "team-6p",
      sequence: 0,
      roundNumber: 1,
      roundState: round,
      playerCount: 6,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        displayName: p.displayName,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    for (const [seatStr, seatState] of Object.entries(snapshot.seats)) {
      const seat = Number(seatStr);
      expect(seatState.team).toBe(seat % 2);
    }
  });
});

// ============================================================================
// Dealer selection — validateDealer
// ============================================================================

describe("Dealer selection — validateDealer", () => {
  it("accepts seat 0 as dealer for 4-player game", () => {
    expect(() => GameService.validateDealer(0, 4)).not.toThrow();
  });

  it("accepts seat 3 (last seat) as dealer for 4-player game", () => {
    expect(() => GameService.validateDealer(3, 4)).not.toThrow();
  });

  it("accepts seat 5 (last seat) as dealer for 6-player game", () => {
    expect(() => GameService.validateDealer(5, 6)).not.toThrow();
  });

  it("rejects seat 4 for a 4-player game (out of range)", () => {
    expect(() => GameService.validateDealer(4, 4)).toThrow("INVALID_DEALER");
  });

  it("rejects seat 6 for a 6-player game (out of range)", () => {
    expect(() => GameService.validateDealer(6, 6)).toThrow("INVALID_DEALER");
  });

  it("rejects negative seat numbers", () => {
    expect(() => GameService.validateDealer(-1, 4)).toThrow("INVALID_DEALER");
  });

  it("rejects non-integer seat numbers", () => {
    expect(() => GameService.validateDealer(1.5, 4)).toThrow("INVALID_DEALER");
  });
});

// ============================================================================
// Invalid initialization — validateTeamMapping
// ============================================================================

describe("Invalid initialization — validateTeamMapping [RULE-005]", () => {
  it("accepts a balanced 4-player player list", () => {
    expect(() =>
      GameService.validateTeamMapping(makePlayers(4), 4),
    ).not.toThrow();
  });

  it("accepts a balanced 6-player player list", () => {
    expect(() =>
      GameService.validateTeamMapping(makePlayers(6), 6),
    ).not.toThrow();
  });

  it("rejects a list where one team has more players (all even seats)", () => {
    const skewed: GameInitPlayer[] = [
      { userId: "u0", seat: 0, displayName: "P0", isAdmin: true },
      { userId: "u1", seat: 2, displayName: "P1", isAdmin: false }, // should be odd
      { userId: "u2", seat: 4, displayName: "P2", isAdmin: false }, // should be odd
      { userId: "u3", seat: 1, displayName: "P3", isAdmin: false },
    ];
    expect(() => GameService.validateTeamMapping(skewed, 4)).toThrow(
      "UNBALANCED_TEAMS",
    );
  });
});

// ============================================================================
// Invalid initialization — validatePlayerCount / validateSeatAssignments
// ============================================================================

describe("Invalid initialization — player count and seats", () => {
  it("rejects 3 players for a 4-player game", () => {
    expect(() =>
      GameService.validatePlayerCount(makePlayers(4).slice(0, 3), 4),
    ).toThrow("INSUFFICIENT_PLAYERS");
  });

  it("rejects 5 players for a 6-player game", () => {
    expect(() =>
      GameService.validatePlayerCount(makePlayers(6).slice(0, 5), 6),
    ).toThrow("INSUFFICIENT_PLAYERS");
  });

  it("rejects duplicate seat numbers", () => {
    const dup = makePlayers(4);
    dup[1] = { ...dup[1], seat: 0 }; // seat 0 appears twice
    expect(() => GameService.validateSeatAssignments(dup, 4)).toThrow(
      "DUPLICATE_SEATS",
    );
  });

  it("rejects missing seat (gap in seats)", () => {
    const gap = makePlayers(4);
    gap[3] = { ...gap[3], seat: 4 }; // replaces seat 3 with seat 4
    expect(() => GameService.validateSeatAssignments(gap, 4)).toThrow();
  });

  it("rejects out-of-range seat number", () => {
    const oob = makePlayers(4);
    oob[0] = { ...oob[0], seat: 99 };
    expect(() => GameService.validateSeatAssignments(oob, 4)).toThrow(
      "INVALID_SEAT",
    );
  });
});

// ============================================================================
// Snapshot creation — validateInitialSnapshot
// ============================================================================

describe("validateInitialSnapshot — accepts valid snapshots", () => {
  it("accepts a valid initial snapshot with phase=primary_bid", () => {
    expect(() =>
      GameService.validateInitialSnapshot(makeMinimalSnapshot(), 4),
    ).not.toThrow();
  });

  it("accepts a valid initial snapshot with phase=bidding (legacy)", () => {
    expect(() =>
      GameService.validateInitialSnapshot(
        makeMinimalSnapshot({ phase: "bidding" }),
        4,
      ),
    ).not.toThrow();
  });

  it("accepts a valid 6-player initial snapshot", () => {
    expect(() =>
      GameService.validateInitialSnapshot(makeMinimalSnapshot({ playerCount: 6 }), 6),
    ).not.toThrow();
  });
});

describe("validateInitialSnapshot — rejects invalid snapshots", () => {
  it("rejects snapshot with sequence ≠ 0", () => {
    expect(() =>
      GameService.validateInitialSnapshot(makeMinimalSnapshot({ sequence: 1 }), 4),
    ).toThrow("INVALID_INITIAL_SEQUENCE");
  });

  it("rejects snapshot with roundNumber ≠ 1", () => {
    expect(() =>
      GameService.validateInitialSnapshot(
        makeMinimalSnapshot({ roundNumber: 2 }),
        4,
      ),
    ).toThrow("INVALID_INITIAL_ROUND");
  });

  it("rejects snapshot with phase=playing (not a valid initial phase)", () => {
    expect(() =>
      GameService.validateInitialSnapshot(
        makeMinimalSnapshot({ phase: "playing" }),
        4,
      ),
    ).toThrow("INVALID_INITIAL_PHASE");
  });

  it("rejects snapshot with phase=round_ended", () => {
    expect(() =>
      GameService.validateInitialSnapshot(
        makeMinimalSnapshot({ phase: "round_ended" }),
        4,
      ),
    ).toThrow("INVALID_INITIAL_PHASE");
  });

  it("rejects snapshot with non-zero initial scores", () => {
    expect(() =>
      GameService.validateInitialSnapshot(
        makeMinimalSnapshot({ team0Score: 5 }),
        4,
      ),
    ).toThrow("INVALID_INITIAL_SCORES");
  });

  it("rejects snapshot where seat count doesn't match playerCount", () => {
    // makeMinimalSnapshot with playerCount=4 but we validate as 6
    expect(() =>
      GameService.validateInitialSnapshot(makeMinimalSnapshot({ playerCount: 4 }), 6),
    ).toThrow("INVALID_SEAT_COUNT");
  });

  it("rejects snapshot where a seat has the wrong team assignment", () => {
    const snap = makeMinimalSnapshot();
    // Corrupt seat 0's team from 0 to 1
    const corruptSeats = {
      ...snap.seats,
      0: { ...snap.seats[0], team: 1 as 0 | 1 },
    };
    expect(() =>
      GameService.validateInitialSnapshot({ ...snap, seats: corruptSeats }, 4),
    ).toThrow("INVALID_TEAM_ASSIGNMENT");
  });
});

// ============================================================================
// Server authority — initialization is engine-driven
// ============================================================================

describe("Server authority [RULE-007]", () => {
  it("engine.createGame + startRound determines all initial state without client input", () => {
    const engine = makeOfficialEngine(4, 123);
    const game1 = engine.createGame("game-authority-1");
    const { game: started1 } = engine.startRound(game1);

    // Dealer seat, hands, phase — all determined server-side by the engine
    expect(started1.currentRound).not.toBeNull();
    expect(started1.currentRound!.dealerSeat).toBe(0); // default first dealer
    expect(started1.currentRound!.phase).toBe("primary_bid");
  });

  it("different seeds always produce different initial hands (no client influence)", () => {
    const e1 = makeOfficialEngine(4, 1);
    const { game: g1 } = e1.startRound(e1.createGame("ga"));

    const e2 = makeOfficialEngine(4, 2);
    const { game: g2 } = e2.startRound(e2.createGame("gb"));

    // Hands are different (different seeds → different shuffles)
    expect(g1.currentRound!.hands[0]).not.toEqual(g2.currentRound!.hands[0]);
  });

  it("same seed always produces the same initial hands (deterministic)", () => {
    const e1 = makeOfficialEngine(4, 42);
    const { game: g1 } = e1.startRound(e1.createGame("ga"));

    const e2 = makeOfficialEngine(4, 42);
    const { game: g2 } = e2.startRound(e2.createGame("gb"));

    expect(g1.currentRound!.hands[0]).toEqual(g2.currentRound!.hands[0]);
  });
});
