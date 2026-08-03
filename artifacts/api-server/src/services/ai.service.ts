/**
 * AiService — apply the AI's turn in an active game.
 *
 * [MIG-039] [GAP-044] AI move generation (service layer)
 * [MIG-043] [GAP-021] AI fires on turn-timer expiry
 * [MIG-045] [GAP-045] AI takes over after reconnect window expires
 *
 * applyAiTurn():
 *   1. Load the latest authoritative snapshot.
 *   2. Reconstruct RoundState via GameService.snapshotToRoundState.
 *   3. Pick an action via pickAiAction (engine-level).
 *   4. Apply the action through the same GameService methods that the human
 *      handlers use (applyBidAction, applyTrumpAction, applyPlayCardAction, …).
 *   5. Broadcast the result using game-broadcasts helpers + start the next
 *      turn timer so the AI chain continues automatically.
 *
 * This module deliberately mirrors the logic in game.handler.ts so the
 * AI behaves identically to a human player.  Future refactors can extract a
 * shared "apply-and-broadcast" helper; for Phase 3 the duplication is
 * intentional and safe.
 */

import { logger } from "../lib/logger.js";
import { GameService } from "./game.service.js";
import {
  startTurnTimer,
  cancelTurnTimer,
  getTurnTimerSeconds,
} from "./turn-timer.service.js";
import {
  broadcastGameState,
  findSocketForSeat,
} from "../socket/game-broadcasts.js";
import {
  pickAiAction,
  defaultGameConfig,
  PRIMARY_BID_AMOUNT,
} from "@workspace/game-engine";
import type { PlayerCount } from "@workspace/game-engine";
import type { AuthoritativeGameState } from "@workspace/db";
import type { GameNamespace } from "../socket/index.js";
import type { GameEvent, GameSummary } from "../socket/types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the AI's move for `seat` in `gameId`.
 *
 * Safe to call even if it is not currently that seat's turn — the phase /
 * current-seat check inside guards against stale timer callbacks.
 *
 * Exported for use from:
 *   - turn-timer.service (MIG-043: human timeout)
 *   - socket/index.ts   (MIG-045: reconnect timer expiry)
 */
export async function applyAiTurn(
  game: GameNamespace,
  gameId: string,
  seat: number,
): Promise<void> {
  logger.info({ gameId, seat }, "AI turn starting");

  try {
    const snapshotRow = await GameService.loadLatestSnapshotRow(gameId);
    if (!snapshotRow) {
      logger.warn({ gameId, seat }, "AI turn: no snapshot found — game may have ended");
      return;
    }

    const authState = snapshotRow.state;
    const playerCount = Object.keys(authState.seats).length as PlayerCount;

    // Guard: verify it is actually this seat's turn
    if (!isSeatsTurn(authState, seat, playerCount)) {
      logger.info(
        { gameId, seat, phase: authState.phase },
        "AI turn: not this seat's turn — skipping",
      );
      return;
    }

    // Reconstruct RoundState from snapshot
    const roundState = GameService.snapshotToRoundState(authState, playerCount);
    const config = { ...defaultGameConfig(playerCount), allowNoTrump: false };

    // Pick the AI action
    let action;
    try {
      action = pickAiAction(roundState, seat, playerCount, config);
    } catch (err) {
      logger.warn(
        { gameId, seat, phase: authState.phase, err },
        "AI action picker failed — skipping turn",
      );
      return;
    }

    logger.info({ gameId, seat, action: action.type }, "AI picked action");

    // Dispatch to the appropriate handler path
    if (action.type === "bid" || action.type === "pass") {
      await handleAiBid(game, gameId, seat, action, authState, snapshotRow, playerCount);
    } else if (action.type === "select_trump") {
      await handleAiTrump(game, gameId, seat, action.suit, authState, snapshotRow, playerCount);
    } else if (action.type === "play_card") {
      await handleAiPlayCard(game, gameId, seat, action.card, authState, snapshotRow, playerCount);
    }
  } catch (err) {
    logger.error({ gameId, seat, err }, "AI turn failed with unhandled error");
  }
}

// ---------------------------------------------------------------------------
// Guard: is it this seat's turn?
// ---------------------------------------------------------------------------

function isSeatsTurn(
  authState: AuthoritativeGameState,
  seat: number,
  playerCount: PlayerCount,
): boolean {
  const phase = authState.phase;

  if (phase === "primary_bid") {
    return authState.currentBidderSeat === seat;
  }
  if (phase === "bidding") {
    return authState.currentBidderSeat === seat;
  }
  if (phase === "primary_trump_selection" || phase === "trump_selection") {
    return authState.highestBidderSeat === seat;
  }
  if (phase === "playing") {
    if (authState.currentTrickLeaderSeat === null) return false;
    const currentSeat =
      (authState.currentTrickLeaderSeat + authState.currentTrick.length) %
      playerCount;
    return currentSeat === seat;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Bid / Pass
// ---------------------------------------------------------------------------

async function handleAiBid(
  game: GameNamespace,
  gameId: string,
  seat: number,
  action: { type: "bid"; amount: number } | { type: "pass" },
  authState: AuthoritativeGameState,
  snapshotRow: Awaited<ReturnType<typeof GameService.loadLatestSnapshotRow>>,
  playerCount: PlayerCount,
): Promise<void> {
  if (!snapshotRow) return;

  const isPrimaryBid = authState.phase === "primary_bid";
  let newAuthState: AuthoritativeGameState;
  let biddingStatus: string;

  if (isPrimaryBid) {
    const result = await GameService.applyPrimaryBidAction({
      gameId,
      seat,
      playerCount,
      snapshotRow,
    });
    newAuthState = result.newAuthState;
    biddingStatus = "primary_bid_done";
  } else {
    const bidAction =
      action.type === "pass"
        ? { type: "pass" as const }
        : { type: "bid" as const, amount: action.amount };

    const result = await GameService.applyBidAction({
      gameId,
      seat,
      action: bidAction,
      playerCount,
      snapshotRow,
    });
    newAuthState = result.newAuthState;
    biddingStatus = result.biddingStatus;
  }

  // Determine broadcast event
  let event: GameEvent;
  if (isPrimaryBid) {
    event = { type: "BID_PLACED", seat, amount: PRIMARY_BID_AMOUNT };
  } else if (biddingStatus === "won") {
    event = {
      type: "BID_WON",
      seat: newAuthState.highestBidderSeat!,
      bid: newAuthState.highestBid,
    };
  } else if (action.type === "pass") {
    event = { type: "PLAYER_PASSED", seat };
  } else {
    event = {
      type: "BID_PLACED",
      seat,
      amount: (action as { type: "bid"; amount: number }).amount,
    };
  }

  const ctx = await broadcastGameState(game, gameId, newAuthState, event);

  // Notify next actor + start turn timer
  if (isPrimaryBid && newAuthState.highestBidderSeat !== null) {
    const primarySeat = newAuthState.highestBidderSeat;
    const timerSecs = getTurnTimerSeconds(gameId, "primary_trump_selection");
    const s = findSocketForSeat(primarySeat, ctx);
    if (s) {
      const validActions = GameService.buildValidActions(newAuthState, primarySeat, playerCount);
      s.emit("game:your_turn", {
        phase: "primary_trump_selection",
        validActions,
        timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
      });
    }
    scheduleAiIfNeeded(game, gameId, primarySeat, newAuthState, timerSecs);
  } else if (biddingStatus === "ongoing" && newAuthState.currentBidderSeat !== null) {
    const nextSeat = newAuthState.currentBidderSeat;
    const timerSecs = getTurnTimerSeconds(gameId, "bidding");
    const s = findSocketForSeat(nextSeat, ctx);
    if (s) {
      const validActions = GameService.buildValidActions(newAuthState, nextSeat, playerCount);
      s.emit("game:your_turn", {
        phase: "bidding",
        validActions,
        timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
      });
    }
    scheduleAiIfNeeded(game, gameId, nextSeat, newAuthState, timerSecs);
  } else if (biddingStatus === "won" && newAuthState.highestBidderSeat !== null) {
    const winnerSeat = newAuthState.highestBidderSeat;
    if (newAuthState.phase === "trump_selection") {
      const timerSecs = getTurnTimerSeconds(gameId, "trump_selection");
      const s = findSocketForSeat(winnerSeat, ctx);
      if (s) {
        const validActions: import("../socket/types.js").ValidAction[] = [{ type: "select_trump" }];
        s.emit("game:your_turn", {
          phase: "trump_selection",
          validActions,
          timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
        });
      }
      scheduleAiIfNeeded(game, gameId, winnerSeat, newAuthState, timerSecs);
    }
    // If primary trump stood, playing phase; first trick leader handled by play path
  } else if (biddingStatus === "redeal") {
    try {
      const redealResult = await GameService.applyRedealAction({
        gameId,
        playerCount,
        snapshotRow,
      });
      const redealAuthState = redealResult.newAuthState;
      const redealCtx = await broadcastGameState(game, gameId, redealAuthState, { type: "CARDS_DEALT" });
      const firstSeat = redealAuthState.currentBidderSeat;
      if (firstSeat !== null) {
        const phase = (redealAuthState.phase === "primary_bid" ? "primary_bid" : "bidding") as
          | "primary_bid"
          | "bidding";
        const timerSecs = getTurnTimerSeconds(gameId, phase);
        const s = findSocketForSeat(firstSeat, redealCtx);
        if (s) {
          const validActions = GameService.buildValidActions(redealAuthState, firstSeat, playerCount);
          s.emit("game:your_turn", {
            phase,
            validActions,
            timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
          });
        }
        scheduleAiIfNeeded(game, gameId, firstSeat, redealAuthState, timerSecs);
      }
    } catch (err) {
      logger.error({ gameId, err }, "AI bid: redeal failed");
    }
  }
}

// ---------------------------------------------------------------------------
// Trump selection
// ---------------------------------------------------------------------------

async function handleAiTrump(
  game: GameNamespace,
  gameId: string,
  seat: number,
  suit: string,
  authState: AuthoritativeGameState,
  snapshotRow: Awaited<ReturnType<typeof GameService.loadLatestSnapshotRow>>,
  playerCount: PlayerCount,
): Promise<void> {
  if (!snapshotRow) return;

  const { newAuthState, resultPhase } = await GameService.applyTrumpAction({
    gameId,
    seat,
    suit: suit as "S" | "H" | "D" | "C" | null,
    playerCount,
    snapshotRow,
    allowNoTrump: false,
  });

  const ctx = await broadcastGameState(game, gameId, newAuthState, {
    type: "TRUMP_SELECTED",
    suit: suit ?? "none",
  });

  if (resultPhase === "bidding" && newAuthState.currentBidderSeat !== null) {
    const firstSeat = newAuthState.currentBidderSeat;
    const timerSecs = getTurnTimerSeconds(gameId, "bidding");
    const s = findSocketForSeat(firstSeat, ctx);
    if (s) {
      const validActions = GameService.buildValidActions(newAuthState, firstSeat, playerCount);
      s.emit("game:your_turn", {
        phase: "bidding",
        validActions,
        timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
      });
    }
    scheduleAiIfNeeded(game, gameId, firstSeat, newAuthState, timerSecs);
  } else if (resultPhase === "playing" && newAuthState.currentTrickLeaderSeat !== null) {
    const leadSeat = newAuthState.currentTrickLeaderSeat;
    const timerSecs = getTurnTimerSeconds(gameId, "playing");
    const s = findSocketForSeat(leadSeat, ctx);
    if (s) {
      const validActions = GameService.buildValidActions(newAuthState, leadSeat, playerCount);
      s.emit("game:your_turn", {
        phase: "playing",
        validActions,
        timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
      });
    }
    scheduleAiIfNeeded(game, gameId, leadSeat, newAuthState, timerSecs);
  }
}

// ---------------------------------------------------------------------------
// Play card
// ---------------------------------------------------------------------------

async function handleAiPlayCard(
  game: GameNamespace,
  gameId: string,
  seat: number,
  card: string,
  _authState: AuthoritativeGameState,
  snapshotRow: Awaited<ReturnType<typeof GameService.loadLatestSnapshotRow>>,
  playerCount: PlayerCount,
): Promise<void> {
  if (!snapshotRow) return;

  const result = await GameService.applyPlayCardAction({
    gameId,
    seat,
    card,
    playerCount,
    snapshotRow,
  });

  // 7a. CARD_PLAYED
  const ctx = await broadcastGameState(game, gameId, result.playCardAuthState, {
    type: "CARD_PLAYED",
    seat,
    card,
  });

  // 7b. TRICK_WON
  if (result.trickCompleted && result.trickWinner && !result.roundEnded) {
    await broadcastGameState(game, gameId, result.playCardAuthState, {
      type: "TRICK_WON",
      winningSeat: result.trickWinner.seat,
      points: result.trickWinner.points,
    });
  }

  // 7c. ROUND_ENDED
  if (result.roundEnded && result.roundEndAuthState && result.roundSummary) {
    await broadcastGameState(game, gameId, result.roundEndAuthState, {
      type: "ROUND_ENDED",
      summary: result.roundSummary,
    });
  }

  // 7d. GAME_ENDED or next round
  if (result.gameOver && result.roundEndAuthState) {
    const gameSummary: GameSummary = {
      gameId,
      winningTeam: result.winnerTeam!,
      team0FinalScore: result.roundEndAuthState.team0Score,
      team1FinalScore: result.roundEndAuthState.team1Score,
      totalRounds: result.roundEndAuthState.roundNumber,
    };
    const gameEndState: typeof result.roundEndAuthState = {
      ...result.roundEndAuthState,
      phase: "game_ended",
    };
    await broadcastGameState(game, gameId, gameEndState, {
      type: "GAME_ENDED",
      summary: gameSummary,
    });
    // Game over — cancel all timers
    cancelAllTimersForGame(gameId);
    return;
  }

  if (!result.gameOver && result.nextRoundAuthState) {
    const newCtx = await broadcastGameState(game, gameId, result.nextRoundAuthState, {
      type: "CARDS_DEALT",
    });
    const firstSeat = result.nextRoundAuthState.currentBidderSeat;
    if (firstSeat !== null) {
      const newPhase =
        result.nextRoundAuthState.phase === "primary_bid"
          ? ("primary_bid" as const)
          : ("bidding" as const);
      const timerSecs = getTurnTimerSeconds(gameId, newPhase);
      const s = findSocketForSeat(firstSeat, newCtx);
      if (s) {
        const validActions = GameService.buildValidActions(
          result.nextRoundAuthState,
          firstSeat,
          playerCount,
        );
        s.emit("game:your_turn", {
          phase: newPhase,
          validActions,
          timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
        });
      }
      scheduleAiIfNeeded(game, gameId, firstSeat, result.nextRoundAuthState, timerSecs);
    }
    return;
  }

  // Round still in progress — notify next card player
  if (!result.roundEnded) {
    const nextState = result.playCardAuthState;
    const nextSeat =
      nextState.currentTrickLeaderSeat !== null
        ? (nextState.currentTrickLeaderSeat + nextState.currentTrick.length) % playerCount
        : null;

    if (nextSeat !== null) {
      const timerSecs = getTurnTimerSeconds(gameId, "playing");
      const s = findSocketForSeat(nextSeat, ctx);
      if (s) {
        const validActions = GameService.buildValidActions(nextState, nextSeat, playerCount);
        s.emit("game:your_turn", {
          phase: "playing",
          validActions,
          timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
        });
      }
      scheduleAiIfNeeded(game, gameId, nextSeat, nextState, timerSecs);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Schedule an AI turn for `seat` if the seat is in AI_PLAYING state.
 * Human-controlled seats get a normal turn timer (AI fires on expiry via
 * startTurnTimer in the handler).  AI-controlled seats skip the timer and
 * act immediately (after a short delay to avoid tight synchronous loops).
 */
function scheduleAiIfNeeded(
  game: GameNamespace,
  gameId: string,
  seat: number,
  authState: AuthoritativeGameState,
  timerSecs: number,
): void {
  const seatState = authState.seats[seat];
  if (seatState?.connectionState === "AI_PLAYING" || seatState?.isAi === true) {
    // AI seat — bypass the timer and act on the next tick
    logger.debug({ gameId, seat }, "AI seat detected — scheduling immediate AI move");
    setTimeout(() => {
      applyAiTurn(game, gameId, seat).catch((err) => {
        logger.error({ gameId, seat, err }, "Scheduled AI turn failed");
      });
    }, 50); // 50 ms micro-delay to avoid recursive synchronous stack
  } else {
    // Human seat — start normal turn timer; AI fires if human doesn't act
    startTurnTimer(gameId, seat, timerSecs, () => {
      applyAiTurn(game, gameId, seat).catch((err) => {
        logger.error({ gameId, seat, err }, "Timer-triggered AI turn failed");
      });
    });
  }
}

/**
 * Cancel all timers (turn + reconnect) for a game.
 * Called when GAME_ENDED is broadcast.
 */
function cancelAllTimersForGame(gameId: string): void {
  // Import lazily to avoid circular deps at module init time
  Promise.all([
    import("./turn-timer.service.js").then(({ cancelAllTurnTimers }) =>
      cancelAllTurnTimers(gameId),
    ),
    import("./reconnect.service.js").then(({ cancelAllTimersForGame }) =>
      cancelAllTimersForGame(gameId),
    ),
  ]).catch((err) => {
    logger.warn({ gameId, err }, "cancelAllTimersForGame: cleanup error");
  });
}
