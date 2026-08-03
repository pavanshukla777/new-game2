/**
 * Game namespace event handlers — bidding, trump, card play.
 *
 * game:join         — implemented (Part 5).
 * game:bid          — implemented (Part 6), extended (Part 7):
 *                       handles "primary_bid" phase (forced bid=5, no pass).
 * game:select_trump — fully implemented (Part 7):
 *                       handles both "primary_trump_selection" and "trump_selection".
 * game:play_card    — stubbed (Part 8+).
 *
 * Server-authoritative: ALL game state transitions happen here.
 * Clients send intents; this handler validates and applies them.
 *
 * [NEW] Game Start Initialization (game:join path)
 * [MIG-022] Bidding socket foundation (game:bid)
 * [MIG-024] Primary Bid + Primary Trump (Part 7)
 * [MIG-026] Final Trump selection (Part 7)
 */

import type { GameNamespace } from "../index.js";
import type { Socket } from "socket.io";
import type {
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData,
  ValidAction,
  GameEvent,
  GameSummary,
} from "../types.js";
import { logger } from "../../lib/logger.js";
import { GameService } from "../../services/game.service.js";
import {
  runValidationChain,
  validateBidRule,
  validatePrimaryBidRule,
  validateTrumpRule,
  validateCardRule,
} from "../validation.js";
import { db, gamePlayersTable, gamesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { PlayerCount } from "@workspace/game-engine";
import { PRIMARY_BID_AMOUNT } from "@workspace/game-engine";
import { cancelReconnectTimer } from "../../services/reconnect.service.js";
import {
  startTurnTimer,
  cancelTurnTimer,
  getTurnTimerSeconds,
} from "../../services/turn-timer.service.js";
import { applyAiTurn } from "../../services/ai.service.js";

type GameSocket = Socket<
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ---------------------------------------------------------------------------
// Helper: is this seat the current actor?
// ---------------------------------------------------------------------------

function isSeatCurrentActor(
  authState: import("@workspace/db").AuthoritativeGameState,
  seat: number,
  playerCount: PlayerCount,
): boolean {
  const phase = authState.phase;
  if (phase === "primary_bid" || phase === "bidding") {
    return authState.currentBidderSeat === seat;
  }
  if (phase === "primary_trump_selection" || phase === "trump_selection") {
    return authState.highestBidderSeat === seat;
  }
  if (phase === "playing") {
    if (authState.currentTrickLeaderSeat === null) return false;
    return (
      (authState.currentTrickLeaderSeat + authState.currentTrick.length) %
        playerCount ===
      seat
    );
  }
  return false;
}

export function registerGameHandlers(
  game: GameNamespace,
  socket: GameSocket,
): void {
  const userId = socket.data.userId;

  // -------------------------------------------------------------------------
  // game:join — initial join or reconnect to a game room
  // -------------------------------------------------------------------------
  socket.on("game:join", async (payload, ack) => {
    const { gameId } = payload;
    logger.info({ userId, gameId }, "game:join");

    try {
      const player = await GameService.findGamePlayer(gameId, userId);
      if (!player) {
        ack({ ok: false, error: "NOT_A_PLAYER" });
        return;
      }

      const gameRows = await db
        .select({ id: gamesTable.id, status: gamesTable.status })
        .from(gamesTable)
        .where(eq(gamesTable.id, gameId))
        .limit(1);

      if (gameRows.length === 0 || gameRows[0].status === "abandoned") {
        ack({ ok: false, error: "GAME_NOT_FOUND" });
        return;
      }

      await socket.join(`game:${gameId}`);
      socket.data.currentGameId = gameId;
      socket.data.connectionState = "CONNECTED";

      const authState = await GameService.loadLatestSnapshot(gameId);
      if (!authState) {
        ack({ ok: false, error: "GAME_NOT_FOUND" });
        return;
      }

      const clientState = GameService.buildClientGameState(authState, player.seat);
      ack({ ok: true, state: clientState });

      if (
        player.connectionState === "RECONNECTING" ||
        player.connectionState === "DISCONNECTED" ||
        player.connectionState === "AI_PLAYING"  // [MIG-044] player returned during AI takeover
      ) {
        // [MIG-047] Cancel any pending reconnect timer — player is back
        cancelReconnectTimer(gameId, userId);

        // [MIG-044] Cancel any AI turn timer for this seat — human resumes control
        cancelTurnTimer(gameId, player.seat);

        await db
          .update(gamePlayersTable)
          .set({ connectionState: "CONNECTED" })
          .where(
            and(
              eq(gamePlayersTable.gameId, gameId),
              eq(gamePlayersTable.userId, userId),
            ),
          );

        game.to(`game:${gameId}`).emit("game:player_reconnected", {
          seat: player.seat,
        });

        // [MIG-038] If it is this player's turn right now, re-emit game:your_turn
        // and restart their turn timer so they don't miss the window.
        const playerCount = Object.keys(authState.seats).length as PlayerCount;
        const validActions = GameService.buildValidActions(authState, player.seat, playerCount);
        // Was: validActions.some(a => a.type !== "pass" || validActions.length > 0)
        // That expression always evaluates to `validActions.length > 0` because the
        // `|| validActions.length > 0` operand short-circuits every element to true.
        // Corrected to the actual intent: non-empty valid actions AND it is my turn.
        const isYourTurn = validActions.length > 0
          && isSeatCurrentActor(authState, player.seat, playerCount);

        if (isYourTurn) {
          const phase = authState.phase as
            | "bidding" | "primary_bid" | "primary_trump_selection" | "trump_selection" | "playing";
          const timerSecs = getTurnTimerSeconds(gameId, phase);
          socket.emit("game:your_turn", {
            phase,
            validActions,
            timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
          });
          startTurnTimer(gameId, player.seat, timerSecs, () => {
            applyAiTurn(game, gameId, player.seat).catch((e) =>
              logger.error({ gameId, seat: player.seat, e }, "AI turn on reconnect timeout failed"),
            );
          });
        }

        logger.info({ userId, gameId, seat: player.seat }, "game:join — player reconnected (MIG-047)");
      } else {
        logger.info({ userId, gameId, seat: player.seat }, "game:join — player joined");
      }

    } catch (err) {
      logger.error({ userId, gameId, err }, "game:join error");
      ack({ ok: false, error: "GAME_NOT_FOUND" });
    }
  });

  // -------------------------------------------------------------------------
  // game:bid — player submits a bid or passes
  //
  // Handles two phases:
  //   "primary_bid"  — forced bid=5, no pass allowed [MIG-024]
  //   "bidding"      — regular 2-round bidding [MIG-025]
  //
  // 7-Step Validation Chain:
  //   1. Identity    — JWT verified at handshake
  //   2. Match State — game exists, phase=primary_bid or bidding, player registered
  //   3. Turn        — currentBidderSeat === player.seat
  //   4. Action      — "bid" (or "pass" in bidding phase only)
  //   5. Rule        — primary: amount=5; regular: amount ∈ {5,6,7,8}, > highestBid
  //   6. Update      — apply engine mutation + snapshot persistence
  //   7. Sync        — per-player broadcast + game:your_turn
  // -------------------------------------------------------------------------
  socket.on("game:bid", async (payload, ack) => {
    const { gameId } = payload;
    const isPass = "pass" in payload && payload.pass === true;
    logger.info({ userId, gameId, isPass, payload }, "game:bid");

    try {
      // Step 2a: Verify this user is a player in the game
      const player = await GameService.findGamePlayer(gameId, userId);
      if (!player) {
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      // [MIG-038] Cancel the current player's turn timer — they acted in time
      cancelTurnTimer(gameId, player.seat);

      // Step 2b: Load latest snapshot
      const snapshotRow = await GameService.loadLatestSnapshotRow(gameId);
      if (!snapshotRow) {
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      const authState = snapshotRow.state;
      const playerCount = Object.keys(authState.seats).length as PlayerCount;
      const isPrimaryBidPhase = authState.phase === "primary_bid";

      // Steps 2–4: Run the validation chain
      const chainResult = runValidationChain({
        context: {
          userId,
          displayName: socket.data.displayName,
          gameId,
          actionType: isPass ? "pass" : "bid",
        },
        phase: authState.phase,
        seat: player.seat,
        team: (authState.seats[player.seat]?.team ?? null) as (0 | 1) | null,
        currentSeat: authState.currentBidderSeat ?? -1,
      });

      if (!chainResult.ok) {
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      // Step 5: Rule check
      if (isPrimaryBidPhase) {
        // [MIG-024] Primary Bid: must be exactly PRIMARY_BID_AMOUNT (5), no pass
        if (isPass) {
          ack({ ok: false, error: "PRIMARY_BID_CANNOT_PASS" });
          return;
        }
        const amount = (payload as { gameId: string; amount: number }).amount;
        const primaryRule = validatePrimaryBidRule(amount, PRIMARY_BID_AMOUNT);
        if (!primaryRule.ok) {
          logger.info({ userId, amount, error: primaryRule.error }, "game:bid primary bid rule failed");
          ack({ ok: false, error: "INVALID_BID" });
          return;
        }
      } else if (!isPass) {
        // Regular bidding: standard bid amount validation
        const amount = (payload as { gameId: string; amount: number }).amount;
        const ruleResult = validateBidRule(amount, authState.highestBid);
        if (!ruleResult.ok) {
          logger.info({ userId, amount, highestBid: authState.highestBid, error: ruleResult.error }, "game:bid rule validation failed");
          ack({ ok: false, error: "INVALID_BID" });
          return;
        }
      }

      // Step 6: Apply action
      let newAuthState;
      let biddingStatus;

      if (isPrimaryBidPhase) {
        // [MIG-024] Primary Bid: forced bid=5, transitions to primary_trump_selection
        const result = await GameService.applyPrimaryBidAction({
          gameId,
          seat: player.seat,
          playerCount,
          snapshotRow,
        });
        newAuthState = result.newAuthState;
        biddingStatus = "primary_bid_done" as const;
      } else {
        // Regular bid or pass
        const action = isPass
          ? { type: "pass" as const }
          : {
              type: "bid" as const,
              amount: (payload as { gameId: string; amount: number }).amount,
            };

        const result = await GameService.applyBidAction({
          gameId,
          seat: player.seat,
          action,
          playerCount,
          snapshotRow,
        });
        newAuthState = result.newAuthState;
        biddingStatus = result.biddingStatus;
      }

      // Ack success
      ack({ ok: true });

      // Step 7: Sync — build and broadcast per-player state updates
      let socketEvent: GameEvent;
      if (isPrimaryBidPhase) {
        socketEvent = { type: "BID_PLACED", seat: player.seat, amount: PRIMARY_BID_AMOUNT };
      } else if (biddingStatus === "won") {
        socketEvent = {
          type: "BID_WON",
          seat: newAuthState.highestBidderSeat!,
          bid: newAuthState.highestBid,
        };
      } else if (isPass) {
        socketEvent = { type: "PLAYER_PASSED", seat: player.seat };
      } else {
        socketEvent = {
          type: "BID_PLACED",
          seat: player.seat,
          amount: (payload as { gameId: string; amount: number }).amount,
        };
      }

      const allGamePlayers = await db
        .select({
          userId: gamePlayersTable.userId,
          seat: gamePlayersTable.seat,
        })
        .from(gamePlayersTable)
        .where(eq(gamePlayersTable.gameId, gameId));

      const seatByUserId = new Map(allGamePlayers.map((p) => [p.userId, p.seat]));
      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();

      for (const s of roomSockets) {
        const seatNum = seatByUserId.get(s.data.userId);
        if (seatNum === undefined) continue;
        const clientState = GameService.buildClientGameState(newAuthState, seatNum);
        s.emit("game:state_update", { state: clientState, event: socketEvent });
      }

      // Notify next actor
      if (isPrimaryBidPhase && newAuthState.highestBidderSeat !== null) {
        // [MIG-024] Primary Bid done — notify same seat for Primary Trump selection
        const primarySeat = newAuthState.highestBidderSeat;
        const primarySocket = roomSockets.find(
          (s) => seatByUserId.get(s.data.userId) === primarySeat,
        );
        if (primarySocket) {
          const validActions: ValidAction[] = [{ type: "select_trump" }];
          const timerSecs = getTurnTimerSeconds(gameId, "primary_trump_selection");
          primarySocket.emit("game:your_turn", {
            phase: "primary_trump_selection",
            validActions,
            timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
          });
          startTurnTimer(gameId, primarySeat, timerSecs, () => {
            applyAiTurn(game, gameId, primarySeat).catch((e) =>
              logger.error({ gameId, seat: primarySeat, e }, "AI turn failed"),
            );
          });
        }
        logger.info({ gameId, primarySeat }, "Primary Bid done — notified for Primary Trump selection");
      } else if (biddingStatus === "ongoing" && newAuthState.currentBidderSeat !== null) {
        const nextSeat = newAuthState.currentBidderSeat;
        const nextSocket = roomSockets.find(
          (s) => seatByUserId.get(s.data.userId) === nextSeat,
        );
        if (nextSocket) {
          const validActions = GameService.buildValidActions(newAuthState, nextSeat, playerCount);
          const timerSecs = getTurnTimerSeconds(gameId, "bidding");
          nextSocket.emit("game:your_turn", {
            phase: "bidding",
            validActions,
            timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
          });
          startTurnTimer(gameId, nextSeat, timerSecs, () => {
            applyAiTurn(game, gameId, nextSeat).catch((e) =>
              logger.error({ gameId, seat: nextSeat, e }, "AI turn failed"),
            );
          });
        }
      } else if (biddingStatus === "won" && newAuthState.highestBidderSeat !== null) {
        // [MIG-026] Bidding complete: check if Final Trump needed or Primary Trump stands
        const winnerSeat = newAuthState.highestBidderSeat;
        const resultPhase = newAuthState.phase; // "trump_selection" or "playing"

        if (resultPhase === "trump_selection") {
          // Final Bid > Primary Bid: Final Trump selection needed
          const winnerSocket = roomSockets.find(
            (s) => seatByUserId.get(s.data.userId) === winnerSeat,
          );
          if (winnerSocket) {
            const validActions: ValidAction[] = [{ type: "select_trump" }];
            const timerSecs = getTurnTimerSeconds(gameId, "trump_selection");
            winnerSocket.emit("game:your_turn", {
              phase: "trump_selection",
              validActions,
              timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
            });
            startTurnTimer(gameId, winnerSeat, timerSecs, () => {
              applyAiTurn(game, gameId, winnerSeat).catch((e) =>
                logger.error({ gameId, seat: winnerSeat, e }, "AI turn failed"),
              );
            });
          }
          logger.info({ gameId, winnerSeat, bid: newAuthState.highestBid }, "Bidding won — Final Trump needed");
        } else {
          // [MIG-038] Primary Trump stands — notify first trick leader
          const leadSeat = newAuthState.currentTrickLeaderSeat;
          if (leadSeat !== null) {
            const leadSocket = roomSockets.find(
              (s) => seatByUserId.get(s.data.userId) === leadSeat,
            );
            if (leadSocket) {
              const validActions = GameService.buildValidActions(newAuthState, leadSeat, playerCount);
              const timerSecs = getTurnTimerSeconds(gameId, "playing");
              leadSocket.emit("game:your_turn", {
                phase: "playing",
                validActions,
                timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
              });
              startTurnTimer(gameId, leadSeat, timerSecs, () => {
                applyAiTurn(game, gameId, leadSeat).catch((e) =>
                  logger.error({ gameId, seat: leadSeat, e }, "AI turn failed"),
                );
              });
            }
          }
          logger.info(
            { gameId, winnerSeat, bid: newAuthState.highestBid, trump: newAuthState.trumpSuit },
            "Bidding won — Primary Trump stands, going to playing",
          );
        }
      } else if (biddingStatus === "redeal") {
        // All players passed — redeal the round
        logger.info({ gameId }, "Bidding ended in redeal — re-dealing");
        try {
          const redealResult = await GameService.applyRedealAction({
            gameId,
            playerCount,
            snapshotRow,
          });
          const redealAuthState = redealResult.newAuthState;

          // Broadcast redeal to all players
          for (const s of roomSockets) {
            const seatNum = seatByUserId.get(s.data.userId);
            if (seatNum === undefined) continue;
            const clientState = GameService.buildClientGameState(redealAuthState, seatNum);
            s.emit("game:state_update", {
              state: clientState,
              event: { type: "CARDS_DEALT" },
            });
          }

          // Notify first actor for the new round
          const firstSeat = redealAuthState.currentBidderSeat;
          if (firstSeat !== null) {
            const firstSocket = roomSockets.find(
              (s) => seatByUserId.get(s.data.userId) === firstSeat,
            );
            if (firstSocket) {
              const validActions = GameService.buildValidActions(redealAuthState, firstSeat, playerCount);
              const redealPhase = (redealAuthState.phase === "primary_bid" ? "primary_bid" : "bidding") as "primary_bid" | "bidding";
              const timerSecs = getTurnTimerSeconds(gameId, redealPhase);
              firstSocket.emit("game:your_turn", {
                phase: redealPhase,
                validActions,
                timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
              });
              startTurnTimer(gameId, firstSeat, timerSecs, () => {
                applyAiTurn(game, gameId, firstSeat).catch((e) =>
                  logger.error({ gameId, seat: firstSeat, e }, "AI turn failed"),
                );
              });
            }
          }
        } catch (redealErr) {
          logger.error({ gameId, err: redealErr }, "Redeal failed");
        }
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ userId, gameId, err: errMsg }, "game:bid error");
      try {
        ack({ ok: false, error: "INVALID_BID" });
      } catch {
        // ack already called — ignore double-ack error
      }
    }
  });

  // -------------------------------------------------------------------------
  // game:select_trump — trump declaration (Primary Trump or Final Trump)
  //
  // Handles two phases:
  //   "primary_trump_selection" [MIG-024]: after Primary Bid; transitions to "bidding"
  //   "trump_selection"         [MIG-026]: after regular bidding won; transitions to "playing"
  //
  // 7-Step Validation Chain:
  //   1. Identity    — JWT verified at handshake
  //   2. Match State — game in primary_trump_selection or trump_selection phase
  //   3. Turn        — highestBidderSeat === player.seat
  //   4. Action      — "select_trump" is valid in both phases
  //   5. Rule        — validateTrumpRule: suit ∈ {S,H,D,C} or no-trump if allowed
  //   6. Update      — applyTrumpAction: engine mutation + snapshot persistence
  //   7. Sync        — per-player broadcast + game:your_turn to next actor
  // -------------------------------------------------------------------------
  socket.on("game:select_trump", async (payload, ack) => {
    const { gameId, suit } = payload;
    logger.info({ userId, gameId, suit }, "game:select_trump");

    try {
      // Step 2a: Verify this user is a player in the game
      const player = await GameService.findGamePlayer(gameId, userId);
      if (!player) {
        ack({ ok: false, error: "NOT_A_PLAYER" });
        return;
      }

      // [MIG-038] Cancel the current player's turn timer — they acted in time
      cancelTurnTimer(gameId, player.seat);

      // Step 2b: Load latest snapshot
      const snapshotRow = await GameService.loadLatestSnapshotRow(gameId);
      if (!snapshotRow) {
        ack({ ok: false, error: "GAME_NOT_FOUND" });
        return;
      }

      const authState = snapshotRow.state;
      const playerCount = Object.keys(authState.seats).length as PlayerCount;

      // Step 2–4: Run the validation chain
      // The current actor is highestBidderSeat (set by applyPrimaryBid or regular bidding)
      const chainResult = runValidationChain({
        context: {
          userId,
          displayName: socket.data.displayName,
          gameId,
          actionType: "select_trump",
        },
        phase: authState.phase,
        seat: player.seat,
        team: (authState.seats[player.seat]?.team ?? null) as (0 | 1) | null,
        currentSeat: authState.highestBidderSeat ?? -1,
      });

      if (!chainResult.ok) {
        logger.info({ userId, phase: authState.phase, error: chainResult.error }, "game:select_trump validation failed");
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      // Step 5: Validate the trump suit
      const suitValue = suit as string;
      const allowNoTrump = false; // TODO: read from game config stored in snapshot
      const trumpRule = validateTrumpRule(suitValue, allowNoTrump);
      if (!trumpRule.ok) {
        logger.info({ userId, suit, error: trumpRule.error }, "game:select_trump rule validation failed");
        ack({ ok: false, error: trumpRule.error });
        return;
      }

      // Step 6: Apply trump selection
      // suit is typed "S"|"H"|"D"|"C" in the payload; null only when allowNoTrump=true
      const suitArg = suit as "S" | "H" | "D" | "C" | null;
      const { newAuthState, resultPhase } = await GameService.applyTrumpAction({
        gameId,
        seat: player.seat,
        suit: suitArg,
        playerCount,
        snapshotRow,
        allowNoTrump,
      });

      // Ack success
      ack({ ok: true });

      // Step 7: Sync — broadcast to all players
      const socketEvent: GameEvent = { type: "TRUMP_SELECTED", suit: suit ?? "none" };

      const allGamePlayers = await db
        .select({
          userId: gamePlayersTable.userId,
          seat: gamePlayersTable.seat,
        })
        .from(gamePlayersTable)
        .where(eq(gamePlayersTable.gameId, gameId));

      const seatByUserId = new Map(allGamePlayers.map((p) => [p.userId, p.seat]));
      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();

      for (const s of roomSockets) {
        const seatNum = seatByUserId.get(s.data.userId);
        if (seatNum === undefined) continue;
        const clientState = GameService.buildClientGameState(newAuthState, seatNum);
        s.emit("game:state_update", { state: clientState, event: socketEvent });
      }

      // Notify the next actor based on the resulting phase
      if (resultPhase === "bidding") {
        // [MIG-024] Primary Trump done → regular bidding starts
        const firstBidSeat = newAuthState.currentBidderSeat;
        if (firstBidSeat !== null) {
          const firstSocket = roomSockets.find(
            (s) => seatByUserId.get(s.data.userId) === firstBidSeat,
          );
          if (firstSocket) {
            const validActions = GameService.buildValidActions(newAuthState, firstBidSeat, playerCount);
            const timerSecs = getTurnTimerSeconds(gameId, "bidding");
            firstSocket.emit("game:your_turn", {
              phase: "bidding",
              validActions,
              timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
            });
            startTurnTimer(gameId, firstBidSeat, timerSecs, () => {
              applyAiTurn(game, gameId, firstBidSeat).catch((e) =>
                logger.error({ gameId, seat: firstBidSeat, e }, "AI turn failed"),
              );
            });
          }
          logger.info({ gameId, firstBidSeat }, "Primary Trump selected — regular bidding begins");
        }
      } else if (resultPhase === "playing") {
        // [MIG-026] Final Trump selected → playing begins
        logger.info(
          { gameId, trump: newAuthState.trumpSuit, bidder: newAuthState.highestBidderSeat },
          "Trump selected — game transitions to playing",
        );
        const leadSeat = newAuthState.currentTrickLeaderSeat;
        if (leadSeat !== null) {
          const leadSocket = roomSockets.find(
            (s) => seatByUserId.get(s.data.userId) === leadSeat,
          );
          if (leadSocket) {
            const validActions = GameService.buildValidActions(newAuthState, leadSeat, playerCount);
            const timerSecs = getTurnTimerSeconds(gameId, "playing");
            leadSocket.emit("game:your_turn", {
              phase: "playing",
              validActions,
              timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
            });
            startTurnTimer(gameId, leadSeat, timerSecs, () => {
              applyAiTurn(game, gameId, leadSeat).catch((e) =>
                logger.error({ gameId, seat: leadSeat, e }, "AI turn failed"),
              );
            });
          }
        }
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ userId, gameId, err: errMsg }, "game:select_trump error");
      try {
        ack({ ok: false, error: "TRUMP_SELECTION_FAILED" });
      } catch {
        // ack already called — ignore double-ack error
      }
    }
  });

  // -------------------------------------------------------------------------
  // game:play_card — play a card to the current trick
  //
  // [MIG-046] [GAP-051] Full trick-taking, trick resolution, round end, game end.
  // [MIG-040] [GAP-040] Snapshot written after every card play event.
  //
  // 7-Step Validation Chain:
  //   1. Identity    — JWT at handshake
  //   2. Match State — game exists, phase=playing, player registered
  //   3. Turn        — currentTrickSeat === player.seat
  //   4. Action      — "play_card" is valid in phase "playing"
  //   5. Rule        — card is in the zone-aware legal-move list
  //   6. Update      — applyPlayCardAction (engine + snapshot persistence)
  //   7. Sync        — per-event broadcast (CARD_PLAYED / TRICK_WON / ROUND_ENDED / GAME_ENDED)
  // -------------------------------------------------------------------------
  socket.on("game:play_card", async (payload, ack) => {
    const { gameId, card } = payload;
    logger.info({ userId, gameId, card }, "game:play_card");

    try {
      // Step 2a: Verify this user is a player in the game
      const player = await GameService.findGamePlayer(gameId, userId);
      if (!player) {
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      // [MIG-038] Cancel this player's turn timer — they acted in time
      cancelTurnTimer(gameId, player.seat);

      // Step 2b: Load latest snapshot
      const snapshotRow = await GameService.loadLatestSnapshotRow(gameId);
      if (!snapshotRow) {
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      const authState = snapshotRow.state;
      const playerCount = Object.keys(authState.seats).length as PlayerCount;

      // Current seat in the playing phase:
      // (trickLeader + cardsPlayedSoFar) mod playerCount
      const currentTrickSeat =
        authState.currentTrickLeaderSeat !== null
          ? (authState.currentTrickLeaderSeat + authState.currentTrick.length) %
            playerCount
          : -1;

      // Steps 2–4: Run the validation chain
      const chainResult = runValidationChain({
        context: {
          userId,
          displayName: socket.data.displayName,
          gameId,
          actionType: "play_card",
        },
        phase: authState.phase,
        seat: player.seat,
        team: (authState.seats[player.seat]?.team ?? null) as (0 | 1) | null,
        currentSeat: currentTrickSeat,
      });

      if (!chainResult.ok) {
        ack({ ok: false, error: "NOT_YOUR_TURN" });
        return;
      }

      // Step 5: Validate the card against zone-aware legal moves
      const legalMoves = GameService.buildValidActions(authState, player.seat, playerCount)
        .find((a) => a.type === "play_card")
        ?.validCards ?? [];

      const cardResult = validateCardRule(card, legalMoves);
      if (!cardResult.ok) {
        logger.info({ userId, card, legalMoves, error: cardResult.error }, "game:play_card card not legal");
        ack({ ok: false, error: "INVALID_CARD" });
        return;
      }

      // Step 6: Apply action (engine + full lifecycle snapshot persistence)
      const result = await GameService.applyPlayCardAction({
        gameId,
        seat: player.seat,
        card,
        playerCount,
        snapshotRow,
      });

      // Ack success
      ack({ ok: true });

      // Step 7: Sync — fetch all sockets and build per-player views
      const allGamePlayers = await db
        .select({ userId: gamePlayersTable.userId, seat: gamePlayersTable.seat })
        .from(gamePlayersTable)
        .where(eq(gamePlayersTable.gameId, gameId));

      const seatByUserId = new Map(allGamePlayers.map((p) => [p.userId, p.seat]));
      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();

      // Helper: broadcast a state+event pair to all connected sockets in the room
      const broadcastAll = (
        authSnap: typeof result.playCardAuthState,
        event: GameEvent,
      ) => {
        for (const s of roomSockets) {
          const seatNum = seatByUserId.get(s.data.userId);
          if (seatNum === undefined) continue;
          const clientState = GameService.buildClientGameState(authSnap, seatNum);
          s.emit("game:state_update", { state: clientState, event });
        }
      };

      // 7a. CARD_PLAYED
      broadcastAll(result.playCardAuthState, {
        type: "CARD_PLAYED",
        seat: player.seat,
        card,
      });

      // 7b. TRICK_WON (only when trick completed and round not over yet,
      //     to keep the event distinct from ROUND_ENDED)
      if (result.trickCompleted && result.trickWinner && !result.roundEnded) {
        broadcastAll(result.playCardAuthState, {
          type: "TRICK_WON",
          winningSeat: result.trickWinner.seat,
          points: result.trickWinner.points,
        });
      }

      // 7c. ROUND_ENDED
      if (result.roundEnded && result.roundEndAuthState && result.roundSummary) {
        broadcastAll(result.roundEndAuthState, {
          type: "ROUND_ENDED",
          summary: result.roundSummary,
        });
      }

      // 7d. GAME_ENDED or CARDS_DEALT
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
        broadcastAll(gameEndState, { type: "GAME_ENDED", summary: gameSummary });

      } else if (!result.gameOver && result.nextRoundAuthState) {
        broadcastAll(result.nextRoundAuthState, { type: "CARDS_DEALT" });

        // Notify first actor of the new round
        const firstBidSeat = result.nextRoundAuthState.currentBidderSeat;
        if (firstBidSeat !== null) {
          const firstSocket = roomSockets.find(
            (s) => seatByUserId.get(s.data.userId) === firstBidSeat,
          );
          if (firstSocket) {
            const validActions = GameService.buildValidActions(
              result.nextRoundAuthState,
              firstBidSeat,
              playerCount,
            );
            const newPhase =
              result.nextRoundAuthState.phase === "primary_bid"
                ? ("primary_bid" as const)
                : ("bidding" as const);
            const timerSecs = getTurnTimerSeconds(gameId, newPhase);
            firstSocket.emit("game:your_turn", {
              phase: newPhase,
              validActions,
              timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
            });
            startTurnTimer(gameId, firstBidSeat, timerSecs, () => {
              applyAiTurn(game, gameId, firstBidSeat).catch((e) =>
                logger.error({ gameId, seat: firstBidSeat, e }, "AI turn failed"),
              );
            });
          }
        }

      } else if (!result.roundEnded) {
        // Round still in progress — notify the next card player
        const nextState = result.playCardAuthState;
        const nextSeat =
          nextState.currentTrickLeaderSeat !== null
            ? (nextState.currentTrickLeaderSeat + nextState.currentTrick.length) %
              playerCount
            : null;

        if (nextSeat !== null) {
          const nextSocket = roomSockets.find(
            (s) => seatByUserId.get(s.data.userId) === nextSeat,
          );
          if (nextSocket) {
            const validActions = GameService.buildValidActions(
              nextState,
              nextSeat,
              playerCount,
            );
            const timerSecs = getTurnTimerSeconds(gameId, "playing");
            nextSocket.emit("game:your_turn", {
              phase: "playing",
              validActions,
              timeoutAt: new Date(Date.now() + timerSecs * 1000).toISOString(),
            });
            startTurnTimer(gameId, nextSeat, timerSecs, () => {
              applyAiTurn(game, gameId, nextSeat).catch((e) =>
                logger.error({ gameId, seat: nextSeat, e }, "AI turn failed"),
              );
            });
          }
        }
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ userId, gameId, card: payload.card, err: errMsg }, "game:play_card error");
      try {
        ack({ ok: false, error: "INVALID_CARD" });
      } catch {
        // ack already called — ignore
      }
    }
  });

  // -------------------------------------------------------------------------
  // game:emoji_react — fire-and-forget emoji reaction
  // -------------------------------------------------------------------------
  socket.on("game:emoji_react", (payload) => {
    const currentGameId = socket.data.currentGameId;
    if (!currentGameId || currentGameId !== payload.gameId) return;

    GameService.findGamePlayer(payload.gameId, userId)
      .then((player) => {
        if (!player) return;
        game.to(`game:${payload.gameId}`).emit("game:emoji_reaction", {
          seat: player.seat,
          emoji: payload.emoji,
        });
      })
      .catch((err) => {
        logger.warn({ userId, err }, "game:emoji_react seat lookup failed");
      });
  });
}
