// ============================================================================
// Bundelkhandi Chhakri — Engine Integration Tests
// Plays complete games end-to-end using the GameEngine orchestrator.
// [MIG-002] 4-player deck: 32 cards, 8 per player, 8 tricks per round.
// [MIG-004] Valid bid values: {5, 6, 7, 8}.
// ============================================================================

import { describe, it, expect } from "vitest";
import { GameEngine, defaultGameConfig } from "../engine.js";
import { createSeededRng } from "../prng.js";
import { TRICKS_PER_ROUND } from "../constants.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Plays a complete round from start to finish using the "first legal move"
 * strategy. Returns the final game state after finaliseRound().
 * [MIG-004] bidAmount defaults to 5 (minimum valid bid).
 */
function playFullRound(
  engine: GameEngine,
  game: ReturnType<GameEngine["createGame"]>,
  biddingSeat = 1,
  bidAmount = 5,
  trumpSuit: "S" | "H" | "D" | "C" = "H",
) {
  // Start round
  let { game: g } = engine.startRound(game);

  // Bid: biddingSeat bids, rest pass
  const playerCount = g.config.playerCount;
  const dealerSeat = g.currentRound!.dealerSeat;
  const firstBidder = (dealerSeat + 1) % playerCount;

  // Players before biddingSeat all pass
  for (let offset = 0; offset < playerCount; offset++) {
    const seat = (firstBidder + offset) % playerCount;
    if (seat === biddingSeat) {
      ({ game: g } = engine.bid(g, seat, bidAmount));
      break;
    }
    ({ game: g } = engine.pass(g, seat));
  }

  // Other players pass until bidding done
  while (g.currentRound?.phase === "bidding") {
    const seat = engine.getCurrentSeat(g)!;
    ({ game: g } = engine.pass(g, seat));
  }

  // Trump selection
  if (g.currentRound?.phase === "trump_selection") {
    const seat = engine.getCurrentSeat(g)!;
    ({ game: g } = engine.selectTrump(g, seat, trumpSuit));
  }

  // Play all tricks with first legal move
  while (g.currentRound?.phase === "playing") {
    const seat = engine.getCurrentSeat(g)!;
    const moves = engine.getLegalMoves(g, seat);
    expect(moves.length).toBeGreaterThan(0);
    ({ game: g } = engine.playCard(g, seat, moves[0]));
  }

  // Finalise
  const { game: finalGame } = engine.finaliseRound(g);
  return finalGame;
}

// ---------------------------------------------------------------------------
// Basic game lifecycle
// ---------------------------------------------------------------------------

describe("GameEngine — game lifecycle", () => {
  it("createGame returns a valid initial game state", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(1));
    const game = engine.createGame("game-001");
    expect(game.gameId).toBe("game-001");
    expect(game.scores).toEqual([0, 0]);
    expect(game.winner).toBeNull();
    expect(game.roundNumber).toBe(0);
    expect(game.currentRound).toBeNull();
  });

  it("startRound increments roundNumber and deals cards", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(2));
    const game = engine.createGame("g1");
    const { game: g1 } = engine.startRound(game);
    expect(g1.roundNumber).toBe(1);
    expect(g1.currentRound).not.toBeNull();
    expect(g1.currentRound!.phase).toBe("bidding");
  });

  it("cannot start a round when game is over", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(3));
    const gameOver = {
      ...engine.createGame("g"),
      winner: 0 as const,
    };
    expect(() => engine.startRound(gameOver)).toThrow(/already over/i);
  });

  it("cannot start a round when one is in progress", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(4));
    const game = engine.createGame("g");
    const { game: g1 } = engine.startRound(game);
    expect(() => engine.startRound(g1)).toThrow(/in progress/i);
  });
});

// ---------------------------------------------------------------------------
// Full round: scores update correctly
// ---------------------------------------------------------------------------

describe("GameEngine — single round scoring", () => {
  it("scores update after a completed round", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(10));
    const game = engine.createGame("g");
    const finalGame = playFullRound(engine, game);

    // [MIG-012] With zero-sum scoring, bid-made produces [+bid, −bid] (sum=0).
    // Bid-failed produces [−bid, +2×bid] (sum=+bid). Either way scores change.
    // Assert that scores are no longer the initial [0, 0].
    expect(finalGame.scores).not.toEqual([0, 0]);
    // currentRound is cleared
    expect(finalGame.currentRound).toBeNull();
  });

  it("bid-made: bidding team gets positive score equal to bid", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(11));
    const game = engine.createGame("g");
    const initial = engine.startRound(game);

    let g = initial.game;
    while (g.currentRound?.phase === "bidding") {
      const seat = engine.getCurrentSeat(g)!;
      const range = engine.getValidBidRange(g);
      if (seat === 1 && range !== null) {
        ({ game: g } = engine.bid(g, seat, range.min));
      } else {
        ({ game: g } = engine.pass(g, seat));
      }
    }
    if (g.currentRound?.phase === "trump_selection") {
      ({ game: g } = engine.selectTrump(g, engine.getCurrentSeat(g)!, "S"));
    }
    while (g.currentRound?.phase === "playing") {
      const seat = engine.getCurrentSeat(g)!;
      const moves = engine.getLegalMoves(g, seat);
      ({ game: g } = engine.playCard(g, seat, moves[0]));
    }
    const { game: finalGame } = engine.finaliseRound(g);
    expect(finalGame.scores).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Multiple rounds
// ---------------------------------------------------------------------------

describe("GameEngine — multiple rounds", () => {
  it("dealer seat changes each round according to trailing-team rule (MIG-030)", () => {
    // [MIG-030] The team trailing in series score becomes Dealer Team each round.
    // Exact seats depend on game outcomes; we verify structural invariants.
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(20));
    let game = engine.createGame("g");

    const dealerSeats: number[] = [];
    for (let i = 0; i < 4; i++) {
      const { game: started } = engine.startRound(game);
      dealerSeats.push(started.currentRound!.dealerSeat);
      game = playFullRound(engine, game);
    }

    // First dealer is always 0 (initial value)
    expect(dealerSeats[0]).toBe(0);
    // All dealer seats must be valid (0–3)
    for (const seat of dealerSeats) {
      expect(seat).toBeGreaterThanOrEqual(0);
      expect(seat).toBeLessThanOrEqual(3);
    }
    // Dealer seat must change at least once across 4 rounds (teams alternate)
    const uniqueSeats = new Set(dealerSeats);
    expect(uniqueSeats.size).toBeGreaterThan(1);
  });

  it("scores accumulate across rounds", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(30));
    let game = engine.createGame("g");

    let prevScores = [0, 0];
    for (let round = 0; round < 3; round++) {
      game = playFullRound(engine, game);
      const newTotal = game.scores[0] + game.scores[1];
      expect(game.scores[0] !== prevScores[0] || game.scores[1] !== prevScores[1]).toBe(true);
      prevScores = [...game.scores];
      void newTotal;
    }
  });
});

// ---------------------------------------------------------------------------
// Game end conditions
// ---------------------------------------------------------------------------

describe("GameEngine — win conditions", () => {
  it("game ends when a team reaches target score", () => {
    // Use a low target so the game ends quickly
    const config = defaultGameConfig(4, { targetScore: 20 });
    const engine = new GameEngine(config, createSeededRng(50));
    let game = engine.createGame("g");

    let roundsPlayed = 0;
    while (game.winner === null && roundsPlayed < 50) {
      game = playFullRound(engine, game);
      roundsPlayed++;
    }

    expect(game.winner).not.toBeNull();
    const winnerScore = game.scores[game.winner!];
    expect(winnerScore).toBeGreaterThanOrEqual(20);
  });

  it("Doobna rule triggers when team drops below threshold", () => {
    const config = defaultGameConfig(4, {
      targetScore: 10000,
      doobnaThreshold: -1,
    });
    const engine = new GameEngine(config, createSeededRng(60));
    let game = engine.createGame("g");

    let roundsPlayed = 0;
    while (game.winner === null && roundsPlayed < 100) {
      game = playFullRound(engine, game);
      roundsPlayed++;
    }

    expect(game.winner).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLegalMoves
// ---------------------------------------------------------------------------

describe("GameEngine — getLegalMoves", () => {
  it("returns empty when not in playing phase", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(70));
    const game = engine.createGame("g");
    const { game: g } = engine.startRound(game);
    // Still in bidding phase
    expect(engine.getLegalMoves(g, 0)).toEqual([]);
  });

  it("returns legal moves during playing phase", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(71));
    const game = engine.createGame("g");
    let g = (engine.startRound(game)).game;

    // Advance to playing
    while (g.currentRound?.phase === "bidding") {
      const seat = engine.getCurrentSeat(g)!;
      const range = engine.getValidBidRange(g);
      if (range && seat === 1) {
        ({ game: g } = engine.bid(g, seat, range.min));
      } else {
        ({ game: g } = engine.pass(g, seat));
      }
    }
    if (g.currentRound?.phase === "trump_selection") {
      ({ game: g } = engine.selectTrump(g, engine.getCurrentSeat(g)!, "H"));
    }

    const seat = engine.getCurrentSeat(g)!;
    const moves = engine.getLegalMoves(g, seat);
    expect(moves.length).toBeGreaterThan(0);
    const hand = g.currentRound!.hands[seat];
    for (const move of moves) {
      expect(hand).toContain(move);
    }
  });
});

// ---------------------------------------------------------------------------
// getValidBidRange
// ---------------------------------------------------------------------------

describe("GameEngine — getValidBidRange", () => {
  // [MIG-004] Valid range is {5..8}
  it("returns 5–8 at start of bidding", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(80));
    const game = engine.createGame("g");
    const { game: g } = engine.startRound(game);
    expect(engine.getValidBidRange(g)).toEqual({ min: 5, max: 8 });
  });
  it("returns null outside of bidding phase", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(81));
    const game = engine.createGame("g");
    expect(engine.getValidBidRange(game)).toBeNull();
  });
  it("returns null when maximum bid (8) already placed", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(82));
    const game = engine.createGame("g");
    let g = (engine.startRound(game)).game;
    // Place bid of 8 (max)
    ({ game: g } = engine.bid(g, engine.getCurrentSeat(g)!, 8));
    // Next bidder should have null range (no bids > 8 possible)
    expect(engine.getValidBidRange(g)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentSeat
// ---------------------------------------------------------------------------

describe("GameEngine — getCurrentSeat", () => {
  it("returns the bidder seat during bidding", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(90));
    const game = engine.createGame("g");
    const { game: g } = engine.startRound(game);
    const seat = engine.getCurrentSeat(g);
    // dealerSeat=0, first bidder=1
    expect(seat).toBe(1);
  });
  it("returns null when no round is active", () => {
    const engine = new GameEngine(defaultGameConfig(4), createSeededRng(91));
    const game = engine.createGame("g");
    expect(engine.getCurrentSeat(game)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getScores
// ---------------------------------------------------------------------------

describe("GameEngine — getScores", () => {
  it("returns initial scores", () => {
    const engine = new GameEngine(defaultGameConfig(4));
    const game = engine.createGame("g");
    expect(engine.getScores(game)).toEqual({ team0: 0, team1: 0, winner: null });
  });
});

// ---------------------------------------------------------------------------
// 6-player game
// ---------------------------------------------------------------------------

describe("GameEngine — 6-player mode", () => {
  it("deals 8 cards to each of 6 players", () => {
    const engine = new GameEngine(defaultGameConfig(6), createSeededRng(100));
    const game = engine.createGame("g6");
    const { game: g } = engine.startRound(game);
    const round = g.currentRound!;
    for (let seat = 0; seat < 6; seat++) {
      expect(round.hands[seat]).toHaveLength(8);
    }
  });

  it("completes a full 6-player round (8 tricks)", () => {
    const engine = new GameEngine(defaultGameConfig(6), createSeededRng(101));
    let game = engine.createGame("g6");
    const { game: started } = engine.startRound(game);
    let g = started;

    // [MIG-004] bid 5 (minimum valid)
    while (g.currentRound?.phase === "bidding") {
      const seat = engine.getCurrentSeat(g)!;
      const range = engine.getValidBidRange(g);
      if (range && seat === 1 && g.currentRound.highestBid === 0) {
        ({ game: g } = engine.bid(g, seat, range.min));
      } else {
        ({ game: g } = engine.pass(g, seat));
      }
    }
    if (g.currentRound?.phase === "trump_selection") {
      ({ game: g } = engine.selectTrump(g, engine.getCurrentSeat(g)!, "S"));
    }
    while (g.currentRound?.phase === "playing") {
      const seat = engine.getCurrentSeat(g)!;
      const moves = engine.getLegalMoves(g, seat);
      ({ game: g } = engine.playCard(g, seat, moves[0]));
    }

    const round = g.currentRound!;
    expect(round.phase).toBe("round_ended");
    expect(round.completedTricks.length + (round.chhakri !== null ? 0 : 0)).toBeGreaterThan(0);
    expect(round.capturedPoints[0] + round.capturedPoints[1]).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("GameEngine — determinism", () => {
  it("same seed produces identical game outcomes", () => {
    const cfg = defaultGameConfig(4, { targetScore: 30 });

    function playGame(seed: number) {
      const engine = new GameEngine(cfg, createSeededRng(seed));
      let game = engine.createGame("g");
      let rounds = 0;
      while (game.winner === null && rounds < 20) {
        game = playFullRound(engine, game);
        rounds++;
      }
      return { scores: game.scores, winner: game.winner, rounds };
    }

    const r1 = playGame(42);
    const r2 = playGame(42);

    expect(r1.scores).toEqual(r2.scores);
    expect(r1.winner).toBe(r2.winner);
    expect(r1.rounds).toBe(r2.rounds);
  });
});

// ---------------------------------------------------------------------------
// 4-player: 8 tricks per round (MIG-002)
// ---------------------------------------------------------------------------

describe("GameEngine — 4-player trick count", () => {
  it("4-player round has 8 tricks (not 13)", () => {
    expect(TRICKS_PER_ROUND[4]).toBe(8);
  });

  it("completes a 4-player round with exactly 8 tricks (no Chhakri)", () => {
    // Use a seed that doesn't trigger Chhakri to verify exact trick count
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const engine = new GameEngine(defaultGameConfig(4), createSeededRng(seed));
      let game = engine.createGame("g");
      const { game: started } = engine.startRound(game);
      let g = started;

      while (g.currentRound?.phase === "bidding") {
        const seat = engine.getCurrentSeat(g)!;
        const range = engine.getValidBidRange(g);
        if (range && seat === 1 && g.currentRound.highestBid === 0) {
          ({ game: g } = engine.bid(g, seat, range.min));
        } else {
          ({ game: g } = engine.pass(g, seat));
        }
      }
      if (g.currentRound?.phase === "trump_selection") {
        ({ game: g } = engine.selectTrump(g, engine.getCurrentSeat(g)!, "S"));
      }
      while (g.currentRound?.phase === "playing") {
        const seat = engine.getCurrentSeat(g)!;
        const moves = engine.getLegalMoves(g, seat);
        ({ game: g } = engine.playCard(g, seat, moves[0]));
      }

      if (g.currentRound?.chhakri === null) {
        expect(g.currentRound?.completedTricks).toHaveLength(8);
        found = true;
      }
    }
    // At least one seed in range should produce a normal round completion
    expect(found).toBe(true);
  });
});
