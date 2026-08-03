/**
 * TurnTimerService — per-seat turn countdown.
 *
 * [MIG-038] [GAP-020] Rulebook Section: "Turn Engine — turn timer"
 * Implements: configurable per-turn timer that fires when a player does not
 * act within the allowed window.  On expiry the registered callback is called
 * (typically kicking off AI move generation — MIG-043).
 *
 * Storage: in-memory Map<key, NodeJS.Timeout>.  Key = `${gameId}:${seat}`.
 * Same single-process assumption as ReconnectService.
 *
 * Admin override:
 *   Per-game turn timer durations are stored in `gameTimerOverrides`.
 *   Admins call setGameTimerDuration() to adjust mid-game.
 */

import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Default turn-window lengths (seconds)
// ---------------------------------------------------------------------------

/** Phase → default turn window in seconds. */
export const DEFAULT_TURN_TIMER_SECONDS: Record<string, number> = {
  primary_bid: 30,
  primary_trump_selection: 30,
  bidding: 30,
  trump_selection: 30,
  playing: 60,
};

// ---------------------------------------------------------------------------
// Admin-configurable per-game overrides
// ---------------------------------------------------------------------------

/** gameId → turn timer override in seconds (applies to all phases). */
const gameTimerOverrides = new Map<string, number>();

/**
 * [MIG-038] Set a per-game turn timer override (admin-configurable).
 * When set, this value is used for ALL phases in that game.
 * Pass null / undefined to clear the override and fall back to defaults.
 */
export function setGameTimerDuration(
  gameId: string,
  seconds: number | null,
): void {
  if (seconds === null) {
    gameTimerOverrides.delete(gameId);
    logger.info({ gameId }, "Turn timer override cleared — using defaults");
  } else {
    gameTimerOverrides.set(gameId, seconds);
    logger.info({ gameId, seconds }, "Turn timer override set");
  }
}

/** Get the effective timer duration for a game + phase. */
export function getTurnTimerSeconds(gameId: string, phase: string): number {
  return (
    gameTimerOverrides.get(gameId) ??
    DEFAULT_TURN_TIMER_SECONDS[phase] ??
    30
  );
}

// ---------------------------------------------------------------------------
// Active timer map
// ---------------------------------------------------------------------------

/** Key: `${gameId}:${seat}` → active timer handle. */
const activeTimers = new Map<string, NodeJS.Timeout>();

function timerKey(gameId: string, seat: number): string {
  return `${gameId}:${seat}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * [MIG-038] Start a turn timer for a player seat.
 *
 * Safe to call even if a timer is already running for this seat — the
 * existing timer is cancelled and replaced (idempotent).
 *
 * @param gameId        Active game UUID.
 * @param seat          Seat whose turn this is.
 * @param windowSeconds Timer duration in seconds.
 * @param onExpire      Callback fired when the window expires.  Called
 *                      synchronously inside the setTimeout callback so
 *                      vi.advanceTimersByTime() works in tests.
 */
export function startTurnTimer(
  gameId: string,
  seat: number,
  windowSeconds: number,
  onExpire: () => void,
): void {
  const key = timerKey(gameId, seat);

  // Cancel any existing timer before starting a new one
  cancelTurnTimer(gameId, seat);

  const handle = setTimeout(() => {
    activeTimers.delete(key);
    logger.info({ gameId, seat, windowSeconds }, "Turn timer expired");
    onExpire();
  }, windowSeconds * 1000);

  activeTimers.set(key, handle);
  logger.debug({ gameId, seat, windowSeconds }, "Turn timer started");
}

/**
 * Cancel the turn timer for a seat.  Idempotent — safe when no timer
 * is running.
 */
export function cancelTurnTimer(gameId: string, seat: number): void {
  const key = timerKey(gameId, seat);
  const existing = activeTimers.get(key);
  if (existing !== undefined) {
    clearTimeout(existing);
    activeTimers.delete(key);
    logger.debug({ gameId, seat }, "Turn timer cancelled");
  }
}

/** Returns true if a turn timer is currently active for this seat. */
export function hasTurnTimer(gameId: string, seat: number): boolean {
  return activeTimers.has(timerKey(gameId, seat));
}

/**
 * Cancel ALL turn timers for a game (e.g. on game end or abandon).
 * Does NOT modify DB state — caller is responsible.
 */
export function cancelAllTurnTimers(gameId: string): void {
  for (const [key, handle] of activeTimers.entries()) {
    if (key.startsWith(`${gameId}:`)) {
      clearTimeout(handle);
      activeTimers.delete(key);
    }
  }
  gameTimerOverrides.delete(gameId);
  logger.debug({ gameId }, "All turn timers cancelled for game");
}
