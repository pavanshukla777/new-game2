// ============================================================================
// Bundelkhandi Chhakri — Game Engine (Orchestrator)
// ============================================================================
//
// The GameEngine class ties all modules together. It owns the GameState and
// exposes a clean, validated API for each player action.
//
// Design principles:
//   • Every action returns a new (GameState, events[]) pair — fully immutable.
//   • The engine does not mutate in place.
//   • Tests can inject a seeded RNG for fully deterministic games.
//   • The engine does NOT handle networking, storage, or auth — those live
//     in the server layer.
// ============================================================================

import type {
  CardCode,
  GameConfig,
  GameEvent,
  GameState,
  PlayerCount,
  RangeRng,
  RoundState,
  Suit,
  TeamId,
} from "./types.js";
import {
  DEFAULT_DOOBNA_THRESHOLD,
  DEFAULT_MIN_BID,
  DEFAULT_TARGET_SCORE,
  MAX_BID,
} from "./constants.js";
import { cryptoRng } from "./prng.js";
import {
  initRound,
  applyBid,
  applyPass,
  applyTrumpSelection,
  applyPlayCard,
  callDouble,
  callRedouble,
  buildRoundResult,
  getLegalMovesForSeat,
} from "./round.js";
import { calculateRoundScore, applyRoundScore, checkPerfect8Victory } from "./scoring.js";
import { nextDealerSeat, trailingTeamDealerSeat } from "./turn-order.js";
import { createEvent } from "./replay.js";

// ---------------------------------------------------------------------------
// Default config factory
// ---------------------------------------------------------------------------

export function defaultGameConfig(
  playerCount: PlayerCount = 4,
  overrides: Partial<GameConfig> = {},
): GameConfig {
  return {
    playerCount,
    targetScore: DEFAULT_TARGET_SCORE,
    allowNoTrump: false,
    allowDobla: true,
    minBid: DEFAULT_MIN_BID,
    doobnaThreshold: DEFAULT_DOOBNA_THRESHOLD,
    /**
     * [MIG-025] [GAP-017] Two-round bidding is OFF by default for backward
     * compatibility of existing test fixtures. Production callers must pass
     * { useTwoRoundBidding: true } in overrides to enable the Rulebook protocol.
     */
    useTwoRoundBidding: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GameEngine
// ---------------------------------------------------------------------------

export class GameEngine {
  private readonly config: GameConfig;
  private readonly rng: RangeRng;

  constructor(config: GameConfig, rng: RangeRng = cryptoRng) {
    this.config = config;
    this.rng = rng;
  }

  // -------------------------------------------------------------------------
  // Game lifecycle
  // -------------------------------------------------------------------------

  /** Creates the initial game state (no rounds started yet). */
  createGame(gameId: string, firstDealerSeat = 0): GameState {
    return {
      gameId,
      config: this.config,
      scores: [0, 0],
      roundNumber: 0,
      currentRound: null,
      nextDealerSeat: firstDealerSeat,
      winner: null,
    };
  }

  /**
   * Starts a new round. Deals cards and transitions to the bidding phase.
   * Throws if the game is already over or a round is in progress.
   */
  startRound(game: GameState): { game: GameState; round: RoundState } {
    if (game.winner !== null) {
      throw new Error("Game is already over.");
    }
    if (game.currentRound !== null && game.currentRound.phase !== "round_ended") {
      throw new Error("A round is already in progress.");
    }

    const round = initRound(
      game.roundNumber + 1,
      game.nextDealerSeat,
      this.config,
      this.rng,
    );

    const newGame: GameState = {
      ...game,
      roundNumber: game.roundNumber + 1,
      currentRound: round,
    };

    return { game: newGame, round };
  }

  // -------------------------------------------------------------------------
  // Double / Redouble
  // -------------------------------------------------------------------------

  double(game: GameState, seat: number): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);
    const newRound = callDouble(round, seat, this.config);
    return this.updatedGame(game, newRound);
  }

  redouble(game: GameState, seat: number): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);
    const newRound = callRedouble(round, seat, this.config);
    return this.updatedGame(game, newRound);
  }

  // -------------------------------------------------------------------------
  // Bidding
  // -------------------------------------------------------------------------

  bid(game: GameState, seat: number, amount: number): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);
    const newRound = applyBid(round, seat, amount, this.config);
    return this.updatedGame(game, newRound);
  }

  pass(game: GameState, seat: number): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);
    const newRound = applyPass(round, seat);
    return this.updatedGame(game, newRound);
  }

  // -------------------------------------------------------------------------
  // Trump selection
  // -------------------------------------------------------------------------

  selectTrump(
    game: GameState,
    seat: number,
    suit: Suit | null,
  ): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);
    const newRound = applyTrumpSelection(round, seat, suit, this.config);
    return this.updatedGame(game, newRound);
  }

  // -------------------------------------------------------------------------
  // Card play
  // -------------------------------------------------------------------------

  playCard(
    game: GameState,
    seat: number,
    card: CardCode,
  ): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);
    const newRound = applyPlayCard(round, seat, card, this.config);
    return this.updatedGame(game, newRound);
  }

  // -------------------------------------------------------------------------
  // Round end → score application
  // -------------------------------------------------------------------------

  /**
   * Finalises a completed round: calculates the score, updates game totals,
   * and checks for a game winner.
   *
   * Must be called by the server when `currentRound.phase === "round_ended"`.
   */
  finaliseRound(game: GameState): { game: GameState; events: GameEvent[] } {
    const round = this.requireRound(game);

    if (round.phase !== "round_ended") {
      throw new Error(
        `Round is not over yet (current phase: "${round.phase}").`,
      );
    }

    const result = buildRoundResult(round);
    const roundScore = calculateRoundScore(result);
    const gameScoreResult = applyRoundScore(
      game.scores,
      roundScore.deltas,
      this.config,
    );

    // [MIG-029] [GAP-033] Rulebook Section: "Series Engine — Perfect 8/8"
    // Bid=8 + Bidding Team wins all tricks → Instant Series Victory regardless
    // of current cumulative scores.
    const perfect8 = checkPerfect8Victory(result, this.config.playerCount);
    const finalWinner = perfect8 ? result.bidTeam : gameScoreResult.winner;

    // [MIG-030] [GAP-034] Rulebook Section: "Series Engine — dealer rotation"
    // The team currently behind in the series score becomes the Dealer Team
    // for the next round. Ties fall back to normal clockwise rotation.
    const nextDealer = trailingTeamDealerSeat(
      round.dealerSeat,
      gameScoreResult.scores,
      this.config.playerCount,
    );

    let newGame: GameState = {
      ...game,
      scores: gameScoreResult.scores,
      winner: finalWinner,
      nextDealerSeat: nextDealer,
      currentRound: null,
    };

    const newEvents: GameEvent[] = [];

    if (gameScoreResult.winner !== null) {
      const gameEndEvent = createEvent(0, "game_ended", undefined, {
        winner: gameScoreResult.winner,
        scores: gameScoreResult.scores,
        doobna: gameScoreResult.doobna,
        outcome: roundScore.outcome,
        roundDeltas: roundScore.deltas,
      });
      newEvents.push(gameEndEvent);
      newGame = { ...newGame };
    }

    return { game: newGame, events: newEvents };
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Returns the legal moves for a seat in the current round. */
  getLegalMoves(game: GameState, seat: number): CardCode[] {
    const round = game.currentRound;
    if (!round) return [];
    return getLegalMovesForSeat(round, seat, this.config.playerCount);
  }

  /**
   * Returns the current valid bid range, or null if not in bidding phase.
   * [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
   * Implements: bid ceiling is MAX_BID (8); returns null when no bids remain.
   */
  getValidBidRange(game: GameState): { min: number; max: number } | null {
    const round = game.currentRound;
    if (!round || round.phase !== "bidding") return null;
    const min = round.highestBid > 0 ? round.highestBid + 1 : this.config.minBid;
    if (min > MAX_BID) return null; // no valid bids remain
    return { min, max: MAX_BID };
  }

  /** Returns the seat that should act next (bid or play). */
  getCurrentSeat(game: GameState): number | null {
    const round = game.currentRound;
    if (!round) return null;

    switch (round.phase) {
      case "bidding": {
        // Reconstruct current bidder seat from bid history
        const totalActions = round.bids.length;
        const firstBidder = (round.dealerSeat + 1) % this.config.playerCount;
        return (firstBidder + totalActions) % this.config.playerCount;
      }
      case "trump_selection":
        return round.highestBidderSeat;
      case "playing": {
        if (round.currentTrickLeaderSeat === null) return null;
        return (
          (round.currentTrickLeaderSeat + round.currentTrick.length) %
          this.config.playerCount
        );
      }
      default:
        return null;
    }
  }

  /** Returns a snapshot of the current game scores. */
  getScores(game: GameState): { team0: number; team1: number; winner: TeamId | null } {
    return { team0: game.scores[0], team1: game.scores[1], winner: game.winner };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private requireRound(game: GameState): RoundState {
    if (!game.currentRound) {
      throw new Error("No round in progress. Call startRound() first.");
    }
    return game.currentRound;
  }

  private updatedGame(
    game: GameState,
    newRound: RoundState,
  ): { game: GameState; events: GameEvent[] } {
    // Diff to find newly appended events
    const prevLen = game.currentRound?.events.length ?? 0;
    const newEvents = newRound.events.slice(prevLen);
    return { game: { ...game, currentRound: newRound }, events: newEvents };
  }
}
