/**
 * ReconnectService — in-memory reconnect window timer management.
 *
 * [MIG-042] [GAP-041] Rulebook Section: "Reconnection — reconnect window"
 * Implements: per-player countdown that fires after a socket disconnect.
 *   On expiry → connectionState transitions to AI_PLAYING, room is notified.
 *   On player return (game:join) → timer is cancelled (MIG-047).
 *
 * [MIG-010] [GAP-022] Rulebook Section: "Reconnection — connection state machine"
 * Implements: DISCONNECTED → RECONNECTING (timer start) → AI_PLAYING (expiry)
 *                                          → CONNECTED (player returns in time)
 *
 * Storage: plain in-memory Map. Timers survive for the process lifetime.
 * A full horizontal-scale solution would use Redis TTL keys; acceptable here
 * because Phase 3 targets single-process deployment.
 */

import { db, gamePlayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default reconnect window in seconds (60 s). Admin can override per-game. */
export const RECONNECT_WINDOW_SECONDS = 60;

// ---------------------------------------------------------------------------
// Per-game reconnect window overrides (MIG-038 admin-configurable)
// ---------------------------------------------------------------------------

/** gameId → reconnect window override in seconds. */
const gameWindowOverrides = new Map<string, number>();

/**
 * [MIG-035] Set a per-game reconnect window duration (admin-configurable).
 * Pass null to clear the override and fall back to RECONNECT_WINDOW_SECONDS.
 */
export function setReconnectWindowForGame(
  gameId: string,
  seconds: number | null,
): void {
  if (seconds === null) {
    gameWindowOverrides.delete(gameId);
  } else {
    gameWindowOverrides.set(gameId, seconds);
  }
}

/** Get the effective reconnect window for a game. */
export function getReconnectWindowSeconds(gameId: string): number {
  return gameWindowOverrides.get(gameId) ?? RECONNECT_WINDOW_SECONDS;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Key: `${gameId}:${userId}` → active timer handle. */
const activeTimers = new Map<string, NodeJS.Timeout>();

function timerKey(gameId: string, userId: string): string {
  return `${gameId}:${userId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * [MIG-042] Start a reconnect window for a player.
 *
 * Immediately transitions the player's connectionState from DISCONNECTED to
 * RECONNECTING in the DB, then schedules the AI_PLAYING transition for after
 * `windowSeconds`.
 *
 * Safe to call even if a timer is already running — the existing timer is
 * cancelled and replaced.
 *
 * @param gameId          Active game UUID.
 * @param userId          Disconnected player's user UUID.
 * @param seat            Seat number (for the timeout broadcast).
 * @param notifyFn        Callback to broadcast game:player_timeout when the
 *                        window expires. Passed as a closure so this module
 *                        avoids a hard dependency on the socket namespace.
 * @param windowSeconds   Reconnect window length (default 60 s).
 */
export function startReconnectTimer(
  gameId: string,
  userId: string,
  seat: number,
  notifyFn: (seat: number) => void,
  windowSeconds = RECONNECT_WINDOW_SECONDS,
): void {
  const key = timerKey(gameId, userId);

  // Cancel any existing timer before starting a new one (idempotent)
  cancelReconnectTimer(gameId, userId);

  // [MIG-010] Transition DISCONNECTED → RECONNECTING.
  //
  // The WHERE clause filters on connectionState = 'DISCONNECTED' so that if a
  // player reconnects and game:join updates them to CONNECTED before this
  // fire-and-forget write lands in the DB, the stale RECONNECTING write is
  // silently dropped (0 rows affected) rather than overwriting CONNECTED.
  db.update(gamePlayersTable)
    .set({ connectionState: "RECONNECTING" })
    .where(
      and(
        eq(gamePlayersTable.gameId, gameId),
        eq(gamePlayersTable.userId, userId),
        eq(gamePlayersTable.connectionState, "DISCONNECTED"),
      ),
    )
    .then(() => {
      logger.debug({ gameId, userId, seat, windowSeconds }, "Reconnect window started — state → RECONNECTING");
    })
    .catch((err) => {
      logger.error({ gameId, userId, err }, "Failed to transition player to RECONNECTING");
    });

  const handle = setTimeout(() => {
    activeTimers.delete(key);

    // [MIG-010] Notify the room immediately (synchronous) so the handler can
    // emit the socket event without waiting for the DB round-trip.
    logger.info({ gameId, userId, seat }, "Reconnect window expired — state → AI_PLAYING");
    notifyFn(seat);

    // Persist AI_PLAYING state to DB asynchronously (fire-and-forget).
    db.update(gamePlayersTable)
      .set({ connectionState: "AI_PLAYING" })
      .where(
        and(
          eq(gamePlayersTable.gameId, gameId),
          eq(gamePlayersTable.userId, userId),
        ),
      )
      .then(() => {
        logger.debug({ gameId, userId }, "connectionState persisted → AI_PLAYING");
      })
      .catch((err) => {
        logger.error({ gameId, userId, seat, err }, "Failed to persist AI_PLAYING state");
      });
  }, windowSeconds * 1000);

  activeTimers.set(key, handle);
}

/**
 * [MIG-047] Cancel a reconnect timer when the player successfully returns.
 * Idempotent — safe to call even when no timer is running.
 */
export function cancelReconnectTimer(gameId: string, userId: string): void {
  const key = timerKey(gameId, userId);
  const existing = activeTimers.get(key);
  if (existing !== undefined) {
    clearTimeout(existing);
    activeTimers.delete(key);
    logger.debug({ gameId, userId }, "Reconnect timer cancelled — player returned");
  }
}

/**
 * Returns true if a reconnect timer is currently active for this player.
 * Used in tests and for idempotency guards.
 */
export function hasActiveReconnectTimer(gameId: string, userId: string): boolean {
  return activeTimers.has(timerKey(gameId, userId));
}

/**
 * Cancel ALL timers for a game (e.g. when the game ends or is abandoned).
 * Does NOT update the DB — caller is responsible for state cleanup.
 */
export function cancelAllTimersForGame(gameId: string): void {
  for (const [key, handle] of activeTimers.entries()) {
    if (key.startsWith(`${gameId}:`)) {
      clearTimeout(handle);
      activeTimers.delete(key);
    }
  }
  logger.debug({ gameId }, "All reconnect timers cancelled for game");
}
