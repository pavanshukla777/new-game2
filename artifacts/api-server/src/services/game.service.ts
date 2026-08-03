/**
 * GameService — server-side game initialization and state management.
 *
 * Responsibilities:
 *   - Validate seat assignments and player readiness before game start
 *   - Create game/player/round rows in DB inside a transaction
 *   - Initialize the GameEngine and start the first round
 *   - Build AuthoritativeGameState snapshots (server view)
 *   - Build ClientGameState (hides opponent card data)
 *   - Apply bidding mutations (game:bid / game:pass)
 *   - Build ValidAction lists for game:your_turn notifications
 *
 * [NEW] Game Start Initialization, Seat Validation, Player Readiness Validation
 * [MIG-022] Bidding persistence, synchronization, and state reconstruction
 */

import { eq, and, desc } from "drizzle-orm";
import {
  db,
  gamesTable,
  gamePlayersTable,
  gameRoundsTable,
  gameStateSnapshotsTable,
  usersTable,
  roomPlayersTable,
} from "@workspace/db";
import type {
  AuthoritativeGameState,
  BiddingStatus,
  ClientGameState,
  SeatState,
  ConnectionState,
} from "@workspace/db";
import {
  GameEngine,
  defaultGameConfig,
  isValidSeat,
  seatToTeam,
  isInFaceDownPhase,
  emptyPlayerCards,
  applyBid,
  applyPass,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyTrumpSelection,
  initRound,
  PRIMARY_BID_AMOUNT,
  // [MIG-046] Trick-taking phase
  applyPlayCard,
  getLegalMovesZonedForSeat,
  // [MIG-040] Round-end scoring
  buildRoundResult,
  calculateRoundScore,
  applyRoundScore,
  checkPerfect8Victory,
  trailingTeamDealerSeat,
  // [V6-P1] Deck integrity validation
  assertDealIntegrity,
  DeckValidationError,
} from "@workspace/game-engine";
import type {
  RoundState,
  GameState,
  PlayerCount,
  PlayerCards,
  BidEntry as EngineBidEntry,
  Suit,
  TeamId,
  GameConfig,
  CompletedTrick,
  TrickCard,
} from "@workspace/game-engine";
import type { ValidAction, RoundSummary } from "../socket/types.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface GameInitPlayer {
  userId: string | null;
  seat: number;
  displayName: string;
  isAdmin: boolean;
  isAi?: boolean;
  aiDifficulty?: string;
}

export interface GameInitInput {
  roomId: string;
  players: GameInitPlayer[];
  playerCount: 4 | 6;
  targetScore: number;
  gameMode: string;
  /**
   * Dealer seat for the first round.
   * [V6-P2] Optional; defaults to seat 0. Must be a valid seat in [0, playerCount−1].
   * The Rulebook specifies dealer rotation for subsequent rounds (trailing-team rule)
   * but does not prescribe the first dealer — seat 0 is the implementation default.
   */
  firstDealerSeat?: number;
}

export interface GameInitResult {
  gameId: string;
  roundId: string;
  initialSnapshot: AuthoritativeGameState;
}

/**
 * Result of applying a play_card action.
 *
 * [MIG-040] [MIG-046] Rulebook Section: "Trick-taking and round end"
 * Implements: all state transitions triggered by a single card play are bundled
 * here so the handler can broadcast the exact sequence of socket events.
 */
export interface PlayCardResult {
  /** State immediately after the card was played (CARD_PLAYED broadcast). */
  playCardAuthState: AuthoritativeGameState;
  /** True when the played card completed a trick (4th/6th card in trick). */
  trickCompleted: boolean;
  /** Winner of the just-completed trick. null when trickCompleted=false. */
  trickWinner: { seat: number; team: 0 | 1; points: number } | null;
  /** True when all 8 tricks have been completed (round is over). */
  roundEnded: boolean;
  /** State with updated series scores. Only set when roundEnded=true. */
  roundEndAuthState: AuthoritativeGameState | null;
  /** Round summary for the ROUND_ENDED broadcast. null when roundEnded=false. */
  roundSummary: RoundSummary | null;
  /** True when the series has a winner (reached targetScore or Perfect 8/8). */
  gameOver: boolean;
  /** Winning team index. Only set when gameOver=true. */
  winnerTeam: 0 | 1 | null;
  /** State for the new round (CARDS_DEALT broadcast). null when gameOver=true. */
  nextRoundAuthState: AuthoritativeGameState | null;
  /** DB roundId for the new round. null when gameOver=true. */
  nextRoundId: string | null;
}

/** Internal snapshot row shape returned from DB queries. */
export interface SnapshotRow {
  state: AuthoritativeGameState;
  roundId: string | null;
  sequence: number;
}

// ---------------------------------------------------------------------------
// Drizzle db type alias
// ---------------------------------------------------------------------------

type DbInstance = typeof db;

// ---------------------------------------------------------------------------
// GameService
// ---------------------------------------------------------------------------

export class GameService {
  // =========================================================================
  // Validation helpers
  // =========================================================================

  /**
   * Validates that seat numbers form a complete, unique set for the given
   * player count (0 … playerCount−1) and that each is a valid seat.
   */
  static validateSeatAssignments(
    players: GameInitPlayer[],
    playerCount: PlayerCount,
  ): void {
    const seats = players.map((p) => p.seat).sort((a, b) => a - b);

    const unique = new Set(seats);
    if (unique.size !== seats.length) {
      throw new Error(`DUPLICATE_SEATS: seats must be unique but found ${seats.join(", ")}`);
    }

    for (const seat of seats) {
      if (!isValidSeat(seat, playerCount)) {
        throw new Error(
          `INVALID_SEAT: seat ${seat} is not valid for ${playerCount}-player game (valid: 0–${playerCount - 1})`,
        );
      }
    }

    for (let expected = 0; expected < playerCount; expected++) {
      if (!unique.has(expected)) {
        throw new Error(
          `MISSING_SEAT: seat ${expected} has no player assigned (playerCount=${playerCount})`,
        );
      }
    }
  }

  static validatePlayerCount(players: GameInitPlayer[], playerCount: PlayerCount): void {
    if (players.length !== playerCount) {
      throw new Error(
        `INSUFFICIENT_PLAYERS: need ${playerCount} players but got ${players.length}`,
      );
    }
  }

  /**
   * Validates that the alternating A-B seating rule is satisfied.
   *
   * [RULE-005] Official Rulebook: "Alternating A-B seating: seats 0,2(,4) = Team A;
   * seats 1,3(,5) = Team B. Both teams must have an equal number of players."
   *
   * Call AFTER validateSeatAssignments so seats are guaranteed to be 0..N-1.
   */
  static validateTeamMapping(
    players: GameInitPlayer[],
    playerCount: PlayerCount,
  ): void {
    const team0 = players.filter((p) => p.seat % 2 === 0);
    const team1 = players.filter((p) => p.seat % 2 === 1);
    const expectedPerTeam = playerCount / 2;

    if (team0.length !== expectedPerTeam || team1.length !== expectedPerTeam) {
      throw new Error(
        `UNBALANCED_TEAMS: Team 0 has ${team0.length} player(s), ` +
          `Team 1 has ${team1.length} player(s) — ` +
          `[RULE-005] requires ${expectedPerTeam} per team in a ${playerCount}-player game`,
      );
    }
  }

  /**
   * Validates that the dealer seat is a valid seat for the given player count.
   *
   * The Rulebook specifies the dealer rotation rule for subsequent rounds
   * (trailing-team rule) but does not mandate a specific first dealer.
   * This method enforces that the provided seat is at least in-range.
   */
  static validateDealer(dealerSeat: number, playerCount: PlayerCount): void {
    if (!isValidSeat(dealerSeat, playerCount)) {
      throw new Error(
        `INVALID_DEALER: seat ${dealerSeat} is not a valid dealer seat for ` +
          `${playerCount}-player game (valid: 0–${playerCount - 1})`,
      );
    }
  }

  /**
   * Validates the structural integrity of an initial game snapshot.
   *
   * Checks:
   *   1. sequence === 0 (first snapshot of the game).
   *   2. roundNumber === 1 (first round).
   *   3. phase is "primary_bid" (Official Rulebook two-round protocol) or "bidding" (legacy).
   *   4. game scores start at [0, 0].
   *   5. seat count matches playerCount.
   *   6. [RULE-005] every seat's team matches the alternating A-B rule.
   */
  static validateInitialSnapshot(
    snapshot: AuthoritativeGameState,
    playerCount: PlayerCount,
  ): void {
    if (snapshot.sequence !== 0) {
      throw new Error(
        `INVALID_INITIAL_SEQUENCE: expected 0, got ${snapshot.sequence}`,
      );
    }

    if (snapshot.roundNumber !== 1) {
      throw new Error(
        `INVALID_INITIAL_ROUND: expected round 1, got ${snapshot.roundNumber}`,
      );
    }

    if (snapshot.phase !== "primary_bid" && snapshot.phase !== "bidding") {
      throw new Error(
        `INVALID_INITIAL_PHASE: expected "primary_bid" or "bidding", ` +
          `got "${snapshot.phase}"`,
      );
    }

    if (snapshot.team0Score !== 0 || snapshot.team1Score !== 0) {
      throw new Error(
        `INVALID_INITIAL_SCORES: expected [0, 0], ` +
          `got [${snapshot.team0Score}, ${snapshot.team1Score}]`,
      );
    }

    const seatCount = Object.keys(snapshot.seats).length;
    if (seatCount !== playerCount) {
      throw new Error(
        `INVALID_SEAT_COUNT: expected ${playerCount} seats in snapshot, got ${seatCount}`,
      );
    }

    // [RULE-005] Alternating A-B seating must be honoured in every seat entry
    for (const [seatStr, seatState] of Object.entries(snapshot.seats)) {
      const seat = Number(seatStr);
      const expectedTeam = (seat % 2) as 0 | 1;
      if (seatState.team !== expectedTeam) {
        throw new Error(
          `INVALID_TEAM_ASSIGNMENT: seat ${seat} should be Team ${expectedTeam} ` +
            `per [RULE-005], got Team ${seatState.team}`,
        );
      }
    }
  }

  static buildTeamAssignments(
    players: GameInitPlayer[],
  ): Array<GameInitPlayer & { team: 0 | 1 }> {
    return players.map((p) => ({
      ...p,
      team: seatToTeam(p.seat) as 0 | 1,
    }));
  }

  // =========================================================================
  // Core initialization
  // =========================================================================

  /**
   * Creates a game session in the database, starts the first round, and
   * persists the initial deal snapshot. Runs inside a single DB transaction.
   */
  static async initializeGame(input: GameInitInput): Promise<GameInitResult> {
    const { roomId, players, playerCount, targetScore, gameMode } = input;
    const firstDealerSeat = input.firstDealerSeat ?? 0;

    // [V6-P2] Validate initialization inputs against Official Rulebook
    GameService.validatePlayerCount(players, playerCount as PlayerCount);
    GameService.validateSeatAssignments(players, playerCount as PlayerCount);
    GameService.validateTeamMapping(players, playerCount as PlayerCount); // [RULE-005]
    GameService.validateDealer(firstDealerSeat, playerCount as PlayerCount);

    const withTeams = GameService.buildTeamAssignments(players);

    // [V6-P2] Official Chhakri config:
    //   useTwoRoundBidding: true — Rulebook requires exactly 2 bidding rounds
    //   allowDobla: false       — Dobla/Redouble not in RULE-001..030
    const config = defaultGameConfig(playerCount as PlayerCount, {
      targetScore,
      useTwoRoundBidding: true,
      allowDobla: false,
    });
    const engine = new GameEngine(config);

    return await db.transaction(async (tx) => {
      // 1. Create game record
      const [game] = await tx
        .insert(gamesTable)
        .values({
          roomId,
          targetScore,
          gameMode,
          status: "active",
        })
        .returning({ id: gamesTable.id });

      const gameId = game.id;

      // 2. Initialize engine with the real gameId and configured dealer seat
      const finalEmptyGame = engine.createGame(gameId, firstDealerSeat);
      const { game: finalStartedGame } = engine.startRound(finalEmptyGame);
      const finalRoundState = finalStartedGame.currentRound!;

      // [V6-P1] Validate deck integrity — reject corrupt game state immediately
      try {
        assertDealIntegrity(finalRoundState.hands, playerCount as PlayerCount);
      } catch (err) {
        if (err instanceof DeckValidationError) {
          throw new Error(`DECK_VALIDATION_FAILED: ${err.message}`);
        }
        throw err;
      }

      // 3. Create game_player rows
      await tx.insert(gamePlayersTable).values(
        withTeams.map((p) => ({
          gameId,
          userId: p.userId,
          seat: p.seat,
          team: p.team,
          isAdmin: p.isAdmin,
          isAi: p.isAi ?? false,
          aiDifficulty: p.aiDifficulty ?? null,
          connectionState: "CONNECTED" as ConnectionState,
        })),
      );

      // 4. Create game_round row (round 1 stub)
      const [round] = await tx
        .insert(gameRoundsTable)
        .values({
          gameId,
          roundNumber: 1,
        })
        .returning({ id: gameRoundsTable.id });

      const roundId = round.id;

      // 5. Build authoritative snapshot
      const snapshot = GameService.buildAuthoritativeSnapshot({
        gameId,
        sequence: 0,
        roundNumber: 1,
        roundState: finalRoundState,
        playerCount: playerCount as PlayerCount,
        gameScores: [0, 0],
        targetScore,
        gameMode,
        seatData: withTeams.map((p) => ({
          seat: p.seat,
          userId: p.userId,
          displayName: p.displayName,
          isAi: p.isAi ?? false,
          aiDifficulty: p.aiDifficulty,
          connectionState: "CONNECTED" as ConnectionState,
        })),
      });

      // 6. Persist initial snapshot
      await tx.insert(gameStateSnapshotsTable).values({
        gameId,
        roundId,
        sequence: 0,
        eventType: "deal",
        state: snapshot as unknown as Record<string, unknown>,
      });

      logger.info({ gameId, roomId, playerCount }, "GameService: game initialized");

      return { gameId, roundId, initialSnapshot: snapshot };
    });
  }

  // =========================================================================
  // Bidding mutations
  // [MIG-022] Bid persistence and state reconstruction
  // =========================================================================

  /**
   * Applies a bid or pass action to the game state, saves a new snapshot,
   * and returns the updated AuthoritativeGameState.
   *
   * Throws on validation errors (NOT_BIDDING_PHASE, NOT_YOUR_TURN) so the
   * caller can ack with an appropriate error without duplicating validation.
   *
   * [MIG-022] Rulebook Section: "Bidding — bid persistence"
   */
  static async applyBidAction(params: {
    gameId: string;
    seat: number;
    action: { type: "bid"; amount: number } | { type: "pass" };
    playerCount: PlayerCount;
    snapshotRow: SnapshotRow;
  }): Promise<{
    newAuthState: AuthoritativeGameState;
    biddingStatus: BiddingStatus;
  }> {
    const { gameId, seat, action, playerCount, snapshotRow } = params;
    const authState = snapshotRow.state;

    // Reconstruct the engine RoundState from the snapshot
    const config = defaultGameConfig(playerCount, { targetScore: authState.targetScore });
    const roundState = GameService.snapshotToRoundState(authState, playerCount);

    // Apply action via the engine (throws on invalid bid value / wrong seat)
    const newRoundState =
      action.type === "bid"
        ? applyBid(roundState, seat, action.amount, config)
        : applyPass(roundState, seat);

    // Determine event type for the snapshot row
    const eventType = action.type === "bid" ? "bid" : "pass";
    const newSequence = authState.sequence + 1;

    // Build new authoritative snapshot
    const gameScores: [number, number] = [authState.team0Score, authState.team1Score];
    const seatData = Object.entries(authState.seats).map(([seatStr, seatState]) => ({
      seat: Number(seatStr),
      userId: seatState.userId,
      displayName: seatState.displayName,
      isAi: seatState.isAi,
      aiDifficulty: seatState.aiDifficulty,
      connectionState: seatState.connectionState,
    }));

    const newAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: newSequence,
      roundNumber: authState.roundNumber,
      roundState: newRoundState,
      playerCount,
      gameScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    // Persist to DB
    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: snapshotRow.roundId ?? undefined,
      sequence: newSequence,
      eventType,
      state: newAuthState as unknown as Record<string, unknown>,
    });

    logger.info(
      {
        gameId,
        seat,
        action: action.type,
        amount: action.type === "bid" ? action.amount : undefined,
        biddingStatus: newRoundState.biddingStatus,
      },
      "GameService: bid action applied",
    );

    return {
      newAuthState,
      biddingStatus: newRoundState.biddingStatus as BiddingStatus,
    };
  }

  /**
   * Reconstructs a full engine RoundState from an AuthoritativeGameState snapshot.
   *
   * This is the inverse of buildAuthoritativeSnapshot — it converts the JSONB
   * snapshot back into the engine's working type so mutations can be applied.
   *
   * Note: `completedTricks` details are not stored in AuthoritativeGameState
   * (only the count). For the bidding phase this is safe (no tricks played yet).
   * For the playing phase (Part 7), full trick details will need to be stored.
   *
   * [MIG-022] Rulebook Section: "Bidding — state reconstruction after reconnect"
   */
  static snapshotToRoundState(
    authState: AuthoritativeGameState,
    playerCount: PlayerCount,
  ): RoundState {
    // Reconstruct hands from seats
    const hands: Record<number, string[]> = {};
    for (let s = 0; s < playerCount; s++) {
      hands[s] = authState.seats[s]?.hand ?? [];
    }

    // Reconstruct playerCards
    let playerCards: Record<number, PlayerCards> | undefined;
    if (authState.playerCards) {
      playerCards = {};
      for (let s = 0; s < playerCount; s++) {
        const pc = authState.playerCards[s];
        if (pc) {
          playerCards[s] = {
            secretHand: [...pc.secretHand],
            faceDown: [...pc.faceDown],
            faceUp: [...pc.faceUp],
          };
        }
      }
    }

    // Convert bids from DB format → engine format
    // DB:     { seat, amount: number | "pass" }
    // Engine: { seat, action: "bid" | "pass", amount?: number }
    const bids: EngineBidEntry[] = (authState.bids ?? []).map((b) =>
      b.amount === "pass"
        ? { seat: b.seat, action: "pass" as const }
        : { seat: b.seat, action: "bid" as const, amount: b.amount as number },
    );

    return {
      roundNumber: authState.roundNumber,
      dealerSeat: authState.dealerSeat ?? 0,
      phase: authState.phase as RoundState["phase"],
      hands,
      playerCards,
      bids,
      consecutivePasses: authState.consecutivePasses ?? 0,
      highestBid: authState.highestBid,
      highestBidderSeat: authState.highestBidderSeat,
      biddingStatus: (authState.biddingStatus ?? "ongoing") as RoundState["biddingStatus"],
      multiplier: (authState.multiplier ?? 1) as 1 | 2 | 4,
      doubleSeat: authState.doubleSeat ?? null,
      redoubleSeat: authState.redoubleSeat ?? null,
      trumpSuit: authState.trumpSuit as Suit | null,
      noTrump: authState.noTrump ?? false,
      // [MIG-026] Primary Trump — null for legacy snapshots
      primaryTrump: (authState.primaryTrump ?? null) as Suit | null,
      // [MIG-025] Two-round flag — false for legacy snapshots
      useTwoRoundBidding: authState.useTwoRoundBidding ?? false,
      // [MIG-024] Remaining deck — only set during primary_bid / primary_trump_selection phases
      remainingDeck: authState.remainingDeck,
      currentTrickLeaderSeat: authState.currentTrickLeaderSeat,
      currentTrick: [...(authState.currentTrick ?? [])],
      // [MIG-040] Restore full trick details from snapshot (required for playing phase)
      completedTricks: (authState.completedTricks ?? []).map((ct) => ({
        index: ct.index,
        cards: ct.cards as TrickCard[],
        ledSuit: ct.ledSuit as Suit,
        winnerSeat: ct.winnerSeat,
        winnerTeam: ct.winnerTeam as TeamId,
        points: ct.points,
      })) as CompletedTrick[],
      consecutiveWins: (authState.consecutiveWins ?? [0, 0]) as [number, number],
      chhakri: authState.chhakri
        ? { team: authState.chhakri.team as TeamId, trickIndex: authState.chhakri.trickIndex }
        : null,
      capturedPoints: [
        authState.team0PointsThisRound ?? 0,
        authState.team1PointsThisRound ?? 0,
      ],
      // Events and sequence are not reconstructed — new events start fresh from sequence
      events: [],
      nextSequence: authState.sequence + 1,
      // [V6-P1] Preserve shuffled deck for replay/audit
      shuffledDeck: authState.shuffledDeck,
    };
  }

  /**
   * Builds the list of valid actions for a given seat in the current state.
   * Used to populate game:your_turn notifications.
   *
   * [MIG-022] Rulebook Section: "Bidding — valid actions per turn"
   */
  static buildValidActions(
    authState: AuthoritativeGameState,
    seat: number,
    playerCount: PlayerCount,
  ): ValidAction[] {
    const actions: ValidAction[] = [];

    if (authState.phase === "primary_bid" && authState.currentBidderSeat === seat) {
      // [MIG-024] Primary Bid: forced to exactly 5; no pass allowed
      actions.push({ type: "bid", minBid: PRIMARY_BID_AMOUNT, maxBid: PRIMARY_BID_AMOUNT });
    } else if (
      authState.phase === "primary_trump_selection" &&
      authState.highestBidderSeat === seat
    ) {
      // [MIG-024] Primary Trump selection: mandatory by same player as Primary Bid
      actions.push({ type: "select_trump" });
    } else if (authState.phase === "bidding" && authState.currentBidderSeat === seat) {
      // Regular bidding: valid values ∈ {highestBid+1 … 8} ∩ {5,6,7,8}
      const minBid = authState.highestBid > 0 ? authState.highestBid + 1 : 5;
      if (minBid <= 8) {
        actions.push({ type: "bid", minBid, maxBid: 8 });
      }
      // Pass is always available during regular bidding
      actions.push({ type: "pass" });
    } else if (
      authState.phase === "trump_selection" &&
      authState.highestBidderSeat === seat
    ) {
      // [MIG-026] Final Trump selection: only if Final Bid > Primary Bid
      actions.push({ type: "select_trump" });
    } else if (authState.phase === "playing") {
      // [MIG-046] Compute actual zone-aware legal moves for the seat
      const roundState = GameService.snapshotToRoundState(authState, playerCount);
      const legalCards = getLegalMovesZonedForSeat(roundState, seat, playerCount);
      actions.push({ type: "play_card", validCards: legalCards });
    }

    return actions;
  }

  // =========================================================================
  // [MIG-024] Primary Bid action
  // =========================================================================

  /**
   * Applies the mandatory Primary Bid (forced value = 5) to the game state,
   * saves a new snapshot, and returns the updated AuthoritativeGameState.
   *
   * [MIG-024] [GAP-014] Rulebook Section: "Primary Bid"
   */
  static async applyPrimaryBidAction(params: {
    gameId: string;
    seat: number;
    playerCount: PlayerCount;
    snapshotRow: SnapshotRow;
  }): Promise<{ newAuthState: AuthoritativeGameState }> {
    const { gameId, seat, playerCount, snapshotRow } = params;
    const authState = snapshotRow.state;

    const roundState = GameService.snapshotToRoundState(authState, playerCount);
    const newRoundState = applyPrimaryBid(roundState, seat);

    const newSequence = authState.sequence + 1;
    const gameScores: [number, number] = [authState.team0Score, authState.team1Score];
    const seatData = Object.entries(authState.seats).map(([seatStr, seatState]) => ({
      seat: Number(seatStr),
      userId: seatState.userId,
      displayName: seatState.displayName,
      isAi: seatState.isAi,
      aiDifficulty: seatState.aiDifficulty,
      connectionState: seatState.connectionState,
    }));

    const newAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: newSequence,
      roundNumber: authState.roundNumber,
      roundState: newRoundState,
      playerCount,
      gameScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: snapshotRow.roundId ?? undefined,
      sequence: newSequence,
      eventType: "primary_bid",
      state: newAuthState as unknown as Record<string, unknown>,
    });

    logger.info({ gameId, seat }, "GameService: primary bid applied");
    return { newAuthState };
  }

  // =========================================================================
  // [MIG-024] [MIG-026] Trump selection action (Primary and Final)
  // =========================================================================

  /**
   * Applies a trump selection action. Handles both phases:
   *   - "primary_trump_selection" → applyPrimaryTrumpSelection → "bidding"
   *   - "trump_selection"         → applyTrumpSelection         → "playing"
   *
   * [MIG-024] [GAP-014] Rulebook: Primary Trump immediately after Primary Bid.
   * [MIG-026] [GAP-019] Rulebook: Final Trump only if Final Bid > Primary Bid.
   */
  static async applyTrumpAction(params: {
    gameId: string;
    seat: number;
    suit: Suit | null;
    playerCount: PlayerCount;
    snapshotRow: SnapshotRow;
    allowNoTrump: boolean;
  }): Promise<{
    newAuthState: AuthoritativeGameState;
    resultPhase: string;
  }> {
    const { gameId, seat, suit, playerCount, snapshotRow, allowNoTrump } = params;
    const authState = snapshotRow.state;

    const roundState = GameService.snapshotToRoundState(authState, playerCount);

    let newRoundState: RoundState;
    let eventType: string;

    if (authState.phase === "primary_trump_selection") {
      newRoundState = applyPrimaryTrumpSelection(roundState, seat, suit, { allowNoTrump });
      eventType = "primary_trump_selected";
    } else {
      // "trump_selection" — Final Trump
      newRoundState = applyTrumpSelection(roundState, seat, suit, { allowNoTrump });
      eventType = "trump_selected";
    }

    const newSequence = authState.sequence + 1;
    const gameScores: [number, number] = [authState.team0Score, authState.team1Score];
    const seatData = Object.entries(authState.seats).map(([seatStr, seatState]) => ({
      seat: Number(seatStr),
      userId: seatState.userId,
      displayName: seatState.displayName,
      isAi: seatState.isAi,
      aiDifficulty: seatState.aiDifficulty,
      connectionState: seatState.connectionState,
    }));

    const newAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: newSequence,
      roundNumber: authState.roundNumber,
      roundState: newRoundState,
      playerCount,
      gameScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: snapshotRow.roundId ?? undefined,
      sequence: newSequence,
      eventType,
      state: newAuthState as unknown as Record<string, unknown>,
    });

    logger.info(
      { gameId, seat, suit, phase: authState.phase, resultPhase: newRoundState.phase },
      "GameService: trump selected",
    );
    return { newAuthState, resultPhase: newRoundState.phase };
  }

  // =========================================================================
  // Redeal action
  // =========================================================================

  /**
   * Re-initializes the round with the same dealer seat after all players pass
   * (redeal condition). Persists a new "deal" snapshot.
   *
   * Rulebook: "If all players pass without any bid, the result is REDEAL."
   */
  static async applyRedealAction(params: {
    gameId: string;
    playerCount: PlayerCount;
    snapshotRow: SnapshotRow;
  }): Promise<{ newAuthState: AuthoritativeGameState }> {
    const { gameId, playerCount, snapshotRow } = params;
    const authState = snapshotRow.state;

    const config = defaultGameConfig(playerCount as PlayerCount, {
      targetScore: authState.targetScore,
      useTwoRoundBidding: authState.useTwoRoundBidding ?? false,
    });

    // Re-initialize round with the same dealer seat, new cards
    const newRoundState = initRound(
      authState.roundNumber,
      authState.dealerSeat ?? 0,
      config,
    );

    const newSequence = authState.sequence + 1;
    const gameScores: [number, number] = [authState.team0Score, authState.team1Score];
    const seatData = Object.entries(authState.seats).map(([seatStr, seatState]) => ({
      seat: Number(seatStr),
      userId: seatState.userId,
      displayName: seatState.displayName,
      isAi: seatState.isAi,
      aiDifficulty: seatState.aiDifficulty,
      connectionState: seatState.connectionState,
    }));

    const newAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: newSequence,
      roundNumber: authState.roundNumber,
      roundState: newRoundState,
      playerCount,
      gameScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: snapshotRow.roundId ?? undefined,
      sequence: newSequence,
      eventType: "deal",
      state: newAuthState as unknown as Record<string, unknown>,
    });

    logger.info({ gameId, dealer: authState.dealerSeat }, "GameService: redeal applied");
    return { newAuthState };
  }

  // =========================================================================
  // [MIG-046] [MIG-040] Play-card action + round-end resolution
  // =========================================================================

  /**
   * Applies a play_card action to the game state.
   *
   * Handles the full lifecycle triggered by a single card play:
   *   1. apply applyPlayCard (engine mutation)
   *   2. persist play_card snapshot  [MIG-040]
   *   3. if round ended: score the round, persist round_ended snapshot
   *   4. if game over:   persist game_ended snapshot, update gamesTable
   *   5. if not game over: start next round, persist deal snapshot
   *
   * [MIG-046] [GAP-051] Rulebook Section: "Trick-taking — state broadcasts"
   * [MIG-040] [GAP-040] Rulebook Section: "Snapshots after every game event"
   */
  static async applyPlayCardAction(params: {
    gameId: string;
    seat: number;
    card: string;
    playerCount: PlayerCount;
    snapshotRow: SnapshotRow;
  }): Promise<PlayCardResult> {
    const { gameId, seat, card, playerCount, snapshotRow } = params;
    const authState = snapshotRow.state;

    // --- Step 1: Reconstruct engine state and apply the card ---
    const config = defaultGameConfig(playerCount, {
      targetScore: authState.targetScore,
      useTwoRoundBidding: authState.useTwoRoundBidding ?? false,
    });
    const roundState = GameService.snapshotToRoundState(authState, playerCount);
    const prevTrickCount = roundState.completedTricks.length;

    const newRoundState = applyPlayCard(roundState, seat, card, config);

    const trickCompleted = newRoundState.completedTricks.length > prevTrickCount;
    const roundEnded = newRoundState.phase === "round_ended";
    const gameScores: [number, number] = [authState.team0Score, authState.team1Score];
    const seatData = GameService.extractSeatData(authState);

    const lastTrick = trickCompleted
      ? newRoundState.completedTricks[newRoundState.completedTricks.length - 1]!
      : null;
    const trickWinner = lastTrick
      ? { seat: lastTrick.winnerSeat, team: lastTrick.winnerTeam as 0 | 1, points: lastTrick.points }
      : null;

    // --- Step 2: Build and persist play_card snapshot ---
    const playCardSequence = authState.sequence + 1;
    const playCardAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: playCardSequence,
      roundNumber: authState.roundNumber,
      roundState: newRoundState,
      playerCount,
      gameScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: snapshotRow.roundId ?? undefined,
      sequence: playCardSequence,
      eventType: "play_card",
      state: playCardAuthState as unknown as Record<string, unknown>,
    });

    if (!roundEnded) {
      return {
        playCardAuthState,
        trickCompleted,
        trickWinner,
        roundEnded: false,
        roundEndAuthState: null,
        roundSummary: null,
        gameOver: false,
        winnerTeam: null,
        nextRoundAuthState: null,
        nextRoundId: null,
      };
    }

    // --- Step 3: Round ended — calculate scores ---
    const roundResult = buildRoundResult(newRoundState);
    const roundScore = calculateRoundScore(roundResult);
    const perfect8 = checkPerfect8Victory(roundResult, playerCount);
    const gameScoreResult = applyRoundScore(gameScores, roundScore.deltas, config);
    const newScores = gameScoreResult.scores;
    const finalWinner: 0 | 1 | null = perfect8
      ? (roundResult.bidTeam as 0 | 1)
      : (gameScoreResult.winner as 0 | 1 | null);

    // Update game_rounds table with this round's results
    if (snapshotRow.roundId) {
      await db
        .update(gameRoundsTable)
        .set({
          bidderSeat: newRoundState.highestBidderSeat ?? null,
          winningBid: newRoundState.highestBid > 0 ? newRoundState.highestBid : null,
          trumpSuit: newRoundState.trumpSuit,
          biddingTeam: roundResult.bidTeam,
          biddingTeamPointsCaptured: newRoundState.capturedPoints[roundResult.bidTeam],
          defendingTeamPointsCaptured: newRoundState.capturedPoints[roundResult.defTeam],
          bidSucceeded: roundResult.tricksWon[roundResult.bidTeam] >= roundResult.bid,
          chhakriTeam: roundResult.chhakri?.team ?? null,
          team0ScoreDelta: roundScore.deltas[0],
          team1ScoreDelta: roundScore.deltas[1],
          team0CumulativeScore: newScores[0],
          team1CumulativeScore: newScores[1],
          completedAt: new Date(),
        })
        .where(eq(gameRoundsTable.id, snapshotRow.roundId));
    }

    // Build round summary for broadcast
    const roundSummary: RoundSummary = {
      roundNumber: authState.roundNumber,
      biddingTeam: roundResult.bidTeam,
      winningBid: roundResult.bid,
      trumpSuit: newRoundState.trumpSuit,
      team0Points: roundResult.tricksWon[0],
      team1Points: roundResult.tricksWon[1],
      bidSucceeded: roundResult.tricksWon[roundResult.bidTeam] >= roundResult.bid,
      chhakriTeam: roundResult.chhakri?.team ?? null,
      team0ScoreDelta: roundScore.deltas[0],
      team1ScoreDelta: roundScore.deltas[1],
      team0CumulativeScore: newScores[0],
      team1CumulativeScore: newScores[1],
    };

    // Build round_ended snapshot (phase=round_ended, updated scores)
    const roundEndSequence = playCardSequence + 1;
    const roundEndAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: roundEndSequence,
      roundNumber: authState.roundNumber,
      roundState: newRoundState, // phase=round_ended
      playerCount,
      gameScores: newScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: snapshotRow.roundId ?? undefined,
      sequence: roundEndSequence,
      eventType: "round_ended",
      state: roundEndAuthState as unknown as Record<string, unknown>,
    });

    // --- Step 4a: Game over ---
    if (finalWinner !== null) {
      await db
        .update(gamesTable)
        .set({
          status: "completed",
          winningTeam: finalWinner,
          team0FinalScore: newScores[0],
          team1FinalScore: newScores[1],
          endedAt: new Date(),
        })
        .where(eq(gamesTable.id, gameId));

      const gameEndSequence = roundEndSequence + 1;
      const gameEndAuthState: AuthoritativeGameState = {
        ...roundEndAuthState,
        phase: "game_ended",
        sequence: gameEndSequence,
      };

      await db.insert(gameStateSnapshotsTable).values({
        gameId,
        roundId: snapshotRow.roundId ?? undefined,
        sequence: gameEndSequence,
        eventType: "game_ended",
        state: gameEndAuthState as unknown as Record<string, unknown>,
      });

      logger.info(
        { gameId, winner: finalWinner, scores: newScores, perfect8 },
        "GameService: game ended",
      );

      return {
        playCardAuthState,
        trickCompleted: true,
        trickWinner,
        roundEnded: true,
        roundEndAuthState,
        roundSummary,
        gameOver: true,
        winnerTeam: finalWinner,
        nextRoundAuthState: null,
        nextRoundId: null,
      };
    }

    // --- Step 4b: Start next round ---
    const nextDealer = trailingTeamDealerSeat(
      newRoundState.dealerSeat,
      newScores,
      playerCount,
    );
    const newRoundNumber = authState.roundNumber + 1;
    const nextRoundEngineState = initRound(newRoundNumber, nextDealer, config);

    const [newRoundRow] = await db
      .insert(gameRoundsTable)
      .values({ gameId, roundNumber: newRoundNumber })
      .returning({ id: gameRoundsTable.id });

    const dealSequence = roundEndSequence + 1;
    const nextRoundAuthState = GameService.buildAuthoritativeSnapshot({
      gameId,
      sequence: dealSequence,
      roundNumber: newRoundNumber,
      roundState: nextRoundEngineState,
      playerCount,
      gameScores: newScores,
      targetScore: authState.targetScore,
      gameMode: authState.gameMode,
      seatData,
    });

    await db.insert(gameStateSnapshotsTable).values({
      gameId,
      roundId: newRoundRow.id,
      sequence: dealSequence,
      eventType: "deal",
      state: nextRoundAuthState as unknown as Record<string, unknown>,
    });

    logger.info(
      { gameId, newRoundNumber, nextDealer, scores: newScores },
      "GameService: new round started",
    );

    return {
      playCardAuthState,
      trickCompleted: true,
      trickWinner,
      roundEnded: true,
      roundEndAuthState,
      roundSummary,
      gameOver: false,
      winnerTeam: null,
      nextRoundAuthState,
      nextRoundId: newRoundRow.id,
    };
  }

  // =========================================================================
  // Snapshot builders
  // =========================================================================

  /**
   * Maps engine round state + player metadata to an AuthoritativeGameState.
   *
   * [NEW] Game Start Initialization — snapshot builder
   * [MIG-021] [GAP-026] Zone-aware zone fields in SeatState
   * [MIG-022] Bidding lifecycle fields added for state reconstruction
   */
  static buildAuthoritativeSnapshot(params: {
    gameId: string;
    sequence: number;
    roundNumber: number;
    roundState: RoundState;
    playerCount: PlayerCount;
    gameScores: [number, number];
    targetScore: number;
    /** [V6-P1] Game mode (e.g. "standard"). Propagated from the initial deal snapshot. */
    gameMode?: string;
    seatData: Array<{
      seat: number;
      userId: string | null;
      displayName: string;
      isAi: boolean;
      aiDifficulty?: string;
      connectionState: ConnectionState;
    }>;
  }): AuthoritativeGameState {
    const {
      gameId,
      sequence,
      roundNumber,
      roundState,
      playerCount,
      gameScores,
      targetScore,
      gameMode,
      seatData,
    } = params;

    // Count tricks won per seat
    const tricksBySeat: Record<number, number> = {};
    for (let s = 0; s < playerCount; s++) tricksBySeat[s] = 0;
    for (const trick of roundState.completedTricks) {
      tricksBySeat[trick.winnerSeat] = (tricksBySeat[trick.winnerSeat] ?? 0) + 1;
    }

    // Build seats record
    const seats: Record<number, SeatState> = {};
    for (const sd of seatData) {
      const pc = roundState.playerCards?.[sd.seat] ?? emptyPlayerCards();
      seats[sd.seat] = {
        userId: sd.userId,
        displayName: sd.displayName,
        team: seatToTeam(sd.seat) as 0 | 1,
        hand: roundState.hands[sd.seat] ?? [],
        tricksWon: tricksBySeat[sd.seat] ?? 0,
        pointsCaptured: 0,
        connectionState: sd.connectionState,
        isAi: sd.isAi,
        aiDifficulty: sd.aiDifficulty,
        // [MIG-021] Zone fields
        secretHand: pc.secretHand,
        faceDown: pc.faceDown,
        faceUp: pc.faceUp,
        inFaceDownPhase: isInFaceDownPhase(pc),
      };
    }

    // Derive currentBidderSeat for bidding phases
    // [MIG-024] Also compute for "primary_bid" (bids.length===0 → firstSeat)
    let currentBidderSeat: number | null = null;
    if (
      (roundState.phase === "bidding" || roundState.phase === "primary_bid") &&
      roundState.biddingStatus === "ongoing"
    ) {
      const firstSeat = (roundState.dealerSeat + 1) % playerCount;
      currentBidderSeat = (firstSeat + roundState.bids.length) % playerCount;
    }

    // Map engine BidEntry → DB BidEntry
    const bids = roundState.bids.map((b) => ({
      seat: b.seat,
      amount: b.action === "bid" ? (b.amount ?? 0) : ("pass" as const),
    }));

    // Build playerCards field for the authoritative snapshot
    const playerCards: Record<
      number,
      { secretHand: string[]; faceDown: string[]; faceUp: string[] }
    > = {};
    if (roundState.playerCards) {
      for (let s = 0; s < playerCount; s++) {
        const pc = roundState.playerCards[s] ?? emptyPlayerCards();
        playerCards[s] = {
          secretHand: pc.secretHand,
          faceDown: pc.faceDown,
          faceUp: pc.faceUp,
        };
      }
    }

    return {
      gameId,
      roundNumber,
      phase: roundState.phase as AuthoritativeGameState["phase"],
      sequence,
      seats,
      dealerSeat: roundState.dealerSeat,
      currentBidderSeat,
      highestBid: roundState.highestBid,
      highestBidderSeat: roundState.highestBidderSeat,
      bids,
      biddingStatus: roundState.biddingStatus as AuthoritativeGameState["biddingStatus"],
      consecutivePasses: roundState.consecutivePasses,
      multiplier: roundState.multiplier as 1 | 2 | 4,
      doubleSeat: roundState.doubleSeat,
      redoubleSeat: roundState.redoubleSeat,
      trumpSuit: roundState.trumpSuit as AuthoritativeGameState["trumpSuit"],
      noTrump: roundState.noTrump,
      // [MIG-026] Primary Trump fields
      primaryTrump: roundState.primaryTrump as AuthoritativeGameState["primaryTrump"],
      // [MIG-025] Two-round bidding flag
      useTwoRoundBidding: roundState.useTwoRoundBidding,
      // [MIG-024] Remaining deck for phased deal
      remainingDeck: roundState.remainingDeck,
      currentTrickLeaderSeat: roundState.currentTrickLeaderSeat,
      currentTrick: roundState.currentTrick,
      completedTricksThisRound: roundState.completedTricks.length,
      consecutiveTricks: null, // derived later when needed
      consecutiveWins: roundState.consecutiveWins,
      chhakri: roundState.chhakri,
      team0PointsThisRound: roundState.capturedPoints[0],
      team1PointsThisRound: roundState.capturedPoints[1],
      team0Score: gameScores[0],
      team1Score: gameScores[1],
      targetScore,
      playerCards: roundState.playerCards ? playerCards : undefined,
      // [V6-P1] Game mode and shuffled deck (for audit / replay)
      gameMode,
      shuffledDeck: roundState.shuffledDeck,
      // [MIG-040] Full trick details for playing-phase RoundState reconstruction
      completedTricks: roundState.completedTricks.map((ct) => ({
        index: ct.index,
        cards: ct.cards as Array<{ seat: number; card: string }>,
        ledSuit: ct.ledSuit as string,
        winnerSeat: ct.winnerSeat,
        winnerTeam: ct.winnerTeam as 0 | 1,
        points: ct.points,
      })),
    };
  }

  /**
   * Extracts seatData array from an AuthoritativeGameState (DRY helper).
   * Used by all apply*Action methods to build the next snapshot.
   */
  private static extractSeatData(authState: AuthoritativeGameState) {
    return Object.entries(authState.seats).map(([seatStr, seatState]) => ({
      seat: Number(seatStr),
      userId: seatState.userId,
      displayName: seatState.displayName,
      isAi: seatState.isAi,
      aiDifficulty: seatState.aiDifficulty,
      connectionState: seatState.connectionState,
    }));
  }

  /**
   * Derives a ClientGameState from an AuthoritativeGameState for a specific seat.
   *
   * Hiding rules (Rulebook — server authoritative):
   *   hand        — null for opponent seats
   *   secretHand  — null for opponent seats
   *   faceDownCount — card count visible to all (contents hidden from opponents)
   *   faceUp      — always visible to all players
   *
   * Bidding info (bids, currentBidderSeat, highestBid) is fully public.
   *
   * [NEW] Zone-aware hiding
   * [MIG-022] Bidding info is always public — no hiding needed
   */
  static buildClientGameState(
    authState: AuthoritativeGameState,
    requestingSeat: number,
  ): ClientGameState {
    const mySeatState = authState.seats[requestingSeat];

    const clientSeats: ClientGameState["seats"] = {};
    for (const [seatStr, seatState] of Object.entries(authState.seats)) {
      const seat = Number(seatStr);
      const isMine = seat === requestingSeat;
      clientSeats[seat] = {
        userId: seatState.userId,
        displayName: seatState.displayName,
        team: seatState.team,
        tricksWon: seatState.tricksWon,
        pointsCaptured: seatState.pointsCaptured,
        connectionState: seatState.connectionState,
        isAi: seatState.isAi,
        aiDifficulty: seatState.aiDifficulty,
        inFaceDownPhase: seatState.inFaceDownPhase,
        hand: isMine ? (seatState.hand ?? []) : null,
        secretHand: isMine ? (seatState.secretHand ?? []) : null,
        faceDownCount: (seatState.faceDown ?? []).length,
        faceUp: seatState.faceUp ?? [],
      };
    }

    return {
      gameId: authState.gameId,
      roundNumber: authState.roundNumber,
      phase: authState.phase,
      sequence: authState.sequence,
      dealerSeat: authState.dealerSeat,
      currentBidderSeat: authState.currentBidderSeat,
      highestBid: authState.highestBid,
      highestBidderSeat: authState.highestBidderSeat,
      bids: authState.bids,
      biddingStatus: authState.biddingStatus,
      consecutivePasses: authState.consecutivePasses,
      multiplier: authState.multiplier,
      doubleSeat: authState.doubleSeat,
      redoubleSeat: authState.redoubleSeat,
      trumpSuit: authState.trumpSuit,
      noTrump: authState.noTrump,
      // [MIG-026] Primary Trump must be sent to every client so the UI can display
      // "Primary Trump: ♥" during the regular bidding phase (MIG-024).
      primaryTrump: authState.primaryTrump,
      currentTrickLeaderSeat: authState.currentTrickLeaderSeat,
      currentTrick: authState.currentTrick,
      completedTricksThisRound: authState.completedTricksThisRound,
      consecutiveTricks: authState.consecutiveTricks,
      consecutiveWins: authState.consecutiveWins,
      chhakri: authState.chhakri,
      team0PointsThisRound: authState.team0PointsThisRound,
      team1PointsThisRound: authState.team1PointsThisRound,
      team0Score: authState.team0Score,
      team1Score: authState.team1Score,
      targetScore: authState.targetScore,
      seats: clientSeats,
      mySeat: requestingSeat,
      myHand: mySeatState?.hand ?? [],
      mySecretHand: mySeatState?.secretHand ?? [],
      myFaceDown: mySeatState?.faceDown ?? [],
      myFaceUp: mySeatState?.faceUp ?? [],
    };
  }

  // =========================================================================
  // DB helpers
  // =========================================================================

  /**
   * Loads the latest game_state_snapshots row for a given game, including
   * the roundId and sequence (needed for applyBidAction).
   * Returns null if no snapshot exists.
   *
   * [MIG-022] Used by bid handler to load state before applying action
   */
  static async loadLatestSnapshotRow(gameId: string): Promise<SnapshotRow | null> {
    const rows = await db
      .select({
        state: gameStateSnapshotsTable.state,
        roundId: gameStateSnapshotsTable.roundId,
        sequence: gameStateSnapshotsTable.sequence,
      })
      .from(gameStateSnapshotsTable)
      .where(eq(gameStateSnapshotsTable.gameId, gameId))
      .orderBy(desc(gameStateSnapshotsTable.sequence))
      .limit(1);

    if (rows.length === 0) return null;
    return {
      state: rows[0].state as unknown as AuthoritativeGameState,
      roundId: rows[0].roundId,
      sequence: rows[0].sequence,
    };
  }

  /**
   * Loads the latest game_state_snapshots state for a given game.
   * Returns null if no snapshot exists.
   */
  static async loadLatestSnapshot(gameId: string): Promise<AuthoritativeGameState | null> {
    const row = await GameService.loadLatestSnapshotRow(gameId);
    return row ? row.state : null;
  }

  /**
   * Returns the game_players row for a given (gameId, userId) pair.
   * Returns null if the user is not a player in that game.
   */
  static async findGamePlayer(
    gameId: string,
    userId: string,
  ): Promise<{ seat: number; connectionState: ConnectionState } | null> {
    const rows = await db
      .select({
        seat: gamePlayersTable.seat,
        connectionState: gamePlayersTable.connectionState,
      })
      .from(gamePlayersTable)
      .where(
        and(
          eq(gamePlayersTable.gameId, gameId),
          eq(gamePlayersTable.userId, userId),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0] as { seat: number; connectionState: ConnectionState };
  }

  /**
   * Find a game player by their seat number (not userId).
   * Used by the voice handler to route signaling to a specific peer.
   */
  static async findGamePlayerBySeat(
    gameId: string,
    seat: number,
  ): Promise<{ userId: string | null; seat: number; connectionState: ConnectionState } | null> {
    const rows = await db
      .select({
        userId: gamePlayersTable.userId,
        seat: gamePlayersTable.seat,
        connectionState: gamePlayersTable.connectionState,
      })
      .from(gamePlayersTable)
      .where(
        and(
          eq(gamePlayersTable.gameId, gameId),
          eq(gamePlayersTable.seat, seat),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0] as { userId: string | null; seat: number; connectionState: ConnectionState };
  }

  /** Returns the defaultGameConfig for a given player count. Exposed as a
   *  static helper so callers (e.g. ai.service.ts) avoid importing the engine
   *  directly for this single utility.
   */
  static defaultConfig(playerCount: PlayerCount, overrides?: { targetScore?: number }) {
    return defaultGameConfig(playerCount, overrides);
  }
}
