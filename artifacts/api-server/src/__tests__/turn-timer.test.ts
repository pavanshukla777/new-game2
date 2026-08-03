/**
 * Unit tests for TurnTimerService
 *
 * [MIG-038] Turn Timer — per-seat countdown; expires → AI takes over
 *
 * Uses vi.useFakeTimers so the timer fires synchronously.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startTurnTimer,
  cancelTurnTimer,
  cancelAllTurnTimers,
  hasTurnTimer,
  setGameTimerDuration,
  getTurnTimerSeconds,
  DEFAULT_TURN_TIMER_SECONDS,
} from "../services/turn-timer.service";

// Re-import after every describe to get a fresh module state via explicit resetModules
// OR just clear timers and internal maps via our exported helpers.

describe("TurnTimerService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear any lingering timers from previous tests
    cancelAllTurnTimers("game-a");
    cancelAllTurnTimers("game-b");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // DEFAULT_TURN_TIMER_SECONDS
  // ---------------------------------------------------------------------------

  it("DEFAULT_TURN_TIMER_SECONDS has sane defaults for all phases", () => {
    expect(DEFAULT_TURN_TIMER_SECONDS["primary_bid"]).toBeGreaterThan(0);
    expect(DEFAULT_TURN_TIMER_SECONDS["primary_trump_selection"]).toBeGreaterThan(0);
    expect(DEFAULT_TURN_TIMER_SECONDS["bidding"]).toBeGreaterThan(0);
    expect(DEFAULT_TURN_TIMER_SECONDS["trump_selection"]).toBeGreaterThan(0);
    expect(DEFAULT_TURN_TIMER_SECONDS["playing"]).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // startTurnTimer / hasTurnTimer / cancel
  // ---------------------------------------------------------------------------

  it("hasTurnTimer returns false before any timer starts", () => {
    expect(hasTurnTimer("game-a", 0)).toBe(false);
  });

  it("hasTurnTimer returns true after startTurnTimer", () => {
    startTurnTimer("game-a", 0, 30, vi.fn());
    expect(hasTurnTimer("game-a", 0)).toBe(true);
  });

  it("onExpire fires after the duration", () => {
    const onExpire = vi.fn();
    startTurnTimer("game-a", 0, 30, onExpire);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(onExpire).toHaveBeenCalledWith(); // no arguments — caller already has seat in closure
  });

  it("hasTurnTimer returns false after expiry", () => {
    startTurnTimer("game-a", 0, 30, vi.fn());
    vi.advanceTimersByTime(30_000);
    expect(hasTurnTimer("game-a", 0)).toBe(false);
  });

  it("onExpire does NOT fire before the duration", () => {
    const onExpire = vi.fn();
    startTurnTimer("game-a", 0, 30, onExpire);
    vi.advanceTimersByTime(29_999);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("cancelTurnTimer prevents onExpire from firing", () => {
    const onExpire = vi.fn();
    startTurnTimer("game-a", 0, 30, onExpire);
    cancelTurnTimer("game-a", 0);
    vi.advanceTimersByTime(30_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("cancelTurnTimer sets hasTurnTimer to false", () => {
    startTurnTimer("game-a", 0, 30, vi.fn());
    cancelTurnTimer("game-a", 0);
    expect(hasTurnTimer("game-a", 0)).toBe(false);
  });

  it("cancelTurnTimer is a no-op when no timer exists", () => {
    expect(() => cancelTurnTimer("game-a", 99)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Multiple seats / games
  // ---------------------------------------------------------------------------

  it("timers for different seats are independent", () => {
    const fn0 = vi.fn();
    const fn1 = vi.fn();
    startTurnTimer("game-a", 0, 10, fn0);
    startTurnTimer("game-a", 1, 20, fn1);

    vi.advanceTimersByTime(10_000);
    expect(fn0).toHaveBeenCalledOnce();
    expect(fn1).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(fn1).toHaveBeenCalledOnce();
  });

  it("timers for different games are independent", () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    startTurnTimer("game-a", 0, 30, fnA);
    startTurnTimer("game-b", 0, 30, fnB);

    cancelTurnTimer("game-a", 0);
    vi.advanceTimersByTime(30_000);
    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).toHaveBeenCalledOnce();
  });

  it("starting a second timer for the same key replaces the first", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    startTurnTimer("game-a", 0, 30, fn1);
    startTurnTimer("game-a", 0, 30, fn2); // replaces fn1
    vi.advanceTimersByTime(30_000);
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // cancelAllTurnTimers
  // ---------------------------------------------------------------------------

  it("cancelAllTurnTimers cancels every seat for a game", () => {
    const fn0 = vi.fn();
    const fn1 = vi.fn();
    startTurnTimer("game-a", 0, 30, fn0);
    startTurnTimer("game-a", 1, 30, fn1);

    cancelAllTurnTimers("game-a");
    vi.advanceTimersByTime(30_000);
    expect(fn0).not.toHaveBeenCalled();
    expect(fn1).not.toHaveBeenCalled();
  });

  it("cancelAllTurnTimers does not affect other games", () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    startTurnTimer("game-a", 0, 30, fnA);
    startTurnTimer("game-b", 0, 30, fnB);

    cancelAllTurnTimers("game-a");
    vi.advanceTimersByTime(30_000);
    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Admin overrides via setGameTimerDuration / getTurnTimerSeconds
  // ---------------------------------------------------------------------------

  it("getTurnTimerSeconds returns default when no override set", () => {
    const phase = "bidding";
    expect(getTurnTimerSeconds("game-x", phase)).toBe(DEFAULT_TURN_TIMER_SECONDS[phase]);
  });

  it("setGameTimerDuration overrides duration for the game", () => {
    setGameTimerDuration("game-x", 99);
    const phases = [
      "primary_bid",
      "primary_trump_selection",
      "bidding",
      "trump_selection",
      "playing",
    ] as const;
    for (const phase of phases) {
      expect(getTurnTimerSeconds("game-x", phase)).toBe(99);
    }
    // Clean up
    setGameTimerDuration("game-x", null);
  });

  it("setGameTimerDuration with null clears the override", () => {
    setGameTimerDuration("game-y", 99);
    setGameTimerDuration("game-y", null);
    expect(getTurnTimerSeconds("game-y", "bidding")).toBe(DEFAULT_TURN_TIMER_SECONDS["bidding"]);
  });

  it("timer started after admin override uses the override duration", () => {
    setGameTimerDuration("game-z", 5);
    const onExpire = vi.fn();
    startTurnTimer("game-z", 0, getTurnTimerSeconds("game-z", "bidding"), onExpire);

    vi.advanceTimersByTime(4_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();

    setGameTimerDuration("game-z", null);
  });
});
