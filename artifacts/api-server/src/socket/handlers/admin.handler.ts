/**
 * Admin socket event handlers — in-game admin controls.
 *
 * [MIG-035] [GAP-013] Rulebook Section: "Admin System — socket events"
 * Implements: game-time admin controls available to either team's Admin.
 *
 * Dual Admin model:
 *   - Each team has exactly one Admin (isAdmin=true on game_players row).
 *   - Both admins have equal authority over configuration.
 *   - Admin role auto-transfers when an admin disconnects (see disconnect handler
 *     in socket/index.ts and MIG-036 in room.handler.ts for lobby).
 *
 * Events handled:
 *   game:admin_set_timer        → set turn-timer duration for the game
 *   game:admin_set_reconnect    → set reconnect window duration
 *   game:admin_transfer         → hand admin role to a teammate
 *   game:admin_kick_player      → force a player to AI_PLAYING immediately
 */

import type { GameNamespace } from "../index.js";
import type { Socket } from "socket.io";
import type {
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types.js";
import { logger } from "../../lib/logger.js";
import { GameService } from "../../services/game.service.js";
import {
  setGameTimerDuration,
  cancelTurnTimer,
} from "../../services/turn-timer.service.js";
import {
  setReconnectWindowForGame,
  startReconnectTimer,
  cancelReconnectTimer,
  RECONNECT_WINDOW_SECONDS,
} from "../../services/reconnect.service.js";
import { applyAiTurn } from "../../services/ai.service.js";
import { db, gamePlayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { PlayerCount } from "@workspace/game-engine";

type GameSocket = Socket<
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ---------------------------------------------------------------------------
// Helper: verify caller is admin in this game
// ---------------------------------------------------------------------------

async function requireAdmin(
  gameId: string,
  userId: string,
): Promise<{ seat: number; team: number } | null> {
  const rows = await db
    .select({ seat: gamePlayersTable.seat, team: gamePlayersTable.team })
    .from(gamePlayersTable)
    .where(
      and(
        eq(gamePlayersTable.gameId, gameId),
        eq(gamePlayersTable.userId, userId),
        eq(gamePlayersTable.isAdmin, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerAdminHandlers(
  game: GameNamespace,
  socket: GameSocket,
): void {
  const userId = socket.data.userId;

  // -------------------------------------------------------------------------
  // game:admin_set_timer — set turn-timer duration for a game
  //
  // [MIG-038] Admin-configurable turn timer (Rulebook: "Reconnect Window —
  // Configurable timeout (set by Admin)").
  // -------------------------------------------------------------------------
  socket.on("game:admin_set_timer", async (payload, ack) => {
    const { gameId, seconds } = payload;
    logger.info({ userId, gameId, seconds }, "game:admin_set_timer");

    try {
      const admin = await requireAdmin(gameId, userId);
      if (!admin) {
        ack({ ok: false, error: "NOT_ADMIN" });
        return;
      }

      if (typeof seconds !== "number" || seconds < 5 || seconds > 300) {
        ack({ ok: false, error: "INVALID_VALUE" });
        return;
      }

      setGameTimerDuration(gameId, seconds);

      // Notify all players in the room about the config change
      game.to(`game:${gameId}`).emit("game:admin_config_changed", {
        turnTimerSeconds: seconds,
      });

      logger.info({ gameId, seconds, adminSeat: admin.seat }, "Turn timer updated by admin");
      ack({ ok: true });
    } catch (err) {
      logger.error({ userId, gameId, err }, "game:admin_set_timer error");
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // -------------------------------------------------------------------------
  // game:admin_set_reconnect — set reconnect window duration for a game
  // -------------------------------------------------------------------------
  socket.on("game:admin_set_reconnect", async (payload, ack) => {
    const { gameId, seconds } = payload;
    logger.info({ userId, gameId, seconds }, "game:admin_set_reconnect");

    try {
      const admin = await requireAdmin(gameId, userId);
      if (!admin) {
        ack({ ok: false, error: "NOT_ADMIN" });
        return;
      }

      if (typeof seconds !== "number" || seconds < 10 || seconds > 600) {
        ack({ ok: false, error: "INVALID_VALUE" });
        return;
      }

      setReconnectWindowForGame(gameId, seconds);

      game.to(`game:${gameId}`).emit("game:admin_config_changed", {
        reconnectWindowSeconds: seconds,
      });

      logger.info({ gameId, seconds, adminSeat: admin.seat }, "Reconnect window updated by admin");
      ack({ ok: true });
    } catch (err) {
      logger.error({ userId, gameId, err }, "game:admin_set_reconnect error");
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // -------------------------------------------------------------------------
  // game:admin_transfer — hand admin role to a teammate
  // -------------------------------------------------------------------------
  socket.on("game:admin_transfer", async (payload, ack) => {
    const { gameId, targetUserId } = payload;
    logger.info({ userId, gameId, targetUserId }, "game:admin_transfer");

    try {
      const admin = await requireAdmin(gameId, userId);
      if (!admin) {
        ack({ ok: false, error: "NOT_ADMIN" });
        return;
      }

      // Verify target is on the same team
      const targetRows = await db
        .select({ seat: gamePlayersTable.seat, team: gamePlayersTable.team })
        .from(gamePlayersTable)
        .where(
          and(
            eq(gamePlayersTable.gameId, gameId),
            eq(gamePlayersTable.userId, targetUserId),
          ),
        )
        .limit(1);

      const target = targetRows[0];
      if (!target) {
        ack({ ok: false, error: "PLAYER_NOT_FOUND" });
        return;
      }

      if (target.team !== admin.team) {
        ack({ ok: false, error: "DIFFERENT_TEAM" });
        return;
      }

      // Transfer admin in a transaction
      await db.transaction(async (tx) => {
        await tx
          .update(gamePlayersTable)
          .set({ isAdmin: false })
          .where(
            and(
              eq(gamePlayersTable.gameId, gameId),
              eq(gamePlayersTable.userId, userId),
            ),
          );
        await tx
          .update(gamePlayersTable)
          .set({ isAdmin: true })
          .where(
            and(
              eq(gamePlayersTable.gameId, gameId),
              eq(gamePlayersTable.userId, targetUserId),
            ),
          );
      });

      game.to(`game:${gameId}`).emit("game:admin_changed", {
        oldAdminSeat: admin.seat,
        newAdminSeat: target.seat,
        team: admin.team as 0 | 1,
      });

      logger.info(
        { gameId, from: admin.seat, to: target.seat, team: admin.team },
        "Admin role transferred",
      );
      ack({ ok: true });
    } catch (err) {
      logger.error({ userId, gameId, err }, "game:admin_transfer error");
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // -------------------------------------------------------------------------
  // game:admin_kick_player — force a player immediately into AI_PLAYING state
  // (cancels their reconnect window if running; AI takes over immediately)
  // -------------------------------------------------------------------------
  socket.on("game:admin_kick_player", async (payload, ack) => {
    const { gameId, targetUserId } = payload;
    logger.info({ userId, gameId, targetUserId }, "game:admin_kick_player");

    try {
      const admin = await requireAdmin(gameId, userId);
      if (!admin) {
        ack({ ok: false, error: "NOT_ADMIN" });
        return;
      }

      const targetRows = await db
        .select({
          seat: gamePlayersTable.seat,
          connectionState: gamePlayersTable.connectionState,
        })
        .from(gamePlayersTable)
        .where(
          and(
            eq(gamePlayersTable.gameId, gameId),
            eq(gamePlayersTable.userId, targetUserId),
          ),
        )
        .limit(1);

      const target = targetRows[0];
      if (!target) {
        ack({ ok: false, error: "PLAYER_NOT_FOUND" });
        return;
      }

      // Cancel any existing reconnect timer and move directly to AI_PLAYING
      cancelReconnectTimer(gameId, targetUserId);
      cancelTurnTimer(gameId, target.seat);

      await db
        .update(gamePlayersTable)
        .set({ connectionState: "AI_PLAYING" })
        .where(
          and(
            eq(gamePlayersTable.gameId, gameId),
            eq(gamePlayersTable.userId, targetUserId),
          ),
        );

      // Force-disconnect the target socket if still connected
      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();
      const targetSocket = roomSockets.find(
        (s) => s.data.userId === targetUserId,
      );
      if (targetSocket) {
        targetSocket.disconnect(true);
      }

      game.to(`game:${gameId}`).emit("game:player_disconnected", {
        seat: target.seat,
        displayName: targetUserId,
        reconnectWindowSeconds: 0,
      });

      // Trigger AI immediately if it is the kicked player's turn
      const snapshotRow = await GameService.loadLatestSnapshotRow(gameId);
      if (snapshotRow) {
        const authState = snapshotRow.state;
        const playerCount = Object.keys(authState.seats).length as PlayerCount;
        // applyAiTurn guards against "not your turn" internally
        applyAiTurn(game, gameId, target.seat).catch((err) => {
          logger.warn({ gameId, seat: target.seat, err }, "admin_kick AI turn failed");
        });
      }

      logger.info(
        { gameId, adminSeat: admin.seat, targetSeat: target.seat },
        "Admin kicked player — AI_PLAYING",
      );
      ack({ ok: true });
    } catch (err) {
      logger.error({ userId, gameId, err }, "game:admin_kick_player error");
      ack({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
}
