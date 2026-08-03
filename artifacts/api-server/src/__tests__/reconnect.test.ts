/**
 * ReconnectService unit tests — Part 9.
 *
 * Tests that do NOT require a live database. They exercise:
 *   - startReconnectTimer: starts a timer and fires the notify callback on expiry
 *   - cancelReconnectTimer: cancels an active timer (idempotent)
 *   - hasActiveReconnectTimer: reflects timer state correctly
 *   - cancelAllTimersForGame: clears all timers for a game
 *
 * [MIG-042] [GAP-041] Reconnect window timer management
 * [MIG-047] [GAP-047] Timer cancellation on player return
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  startReconnectTimer,
  cancelReconnectTimer,
  hasActiveReconnectTimer,
  cancelAllTimersForGame,
} from "../services/reconnect.service.js";

// ---------------------------------------------------------------------------
// Mock the DB module so startReconnectTimer does not need a real database
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  gamePlayersTable: {},
}));

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReconnectService — hasActiveReconnectTimer", () => {
  it("returns false when no timer has been started", () => {
    expect(hasActiveReconnectTimer("game-1", "user-x")).toBe(false);
  });

  it("returns true after a timer is started", () => {
    vi.useFakeTimers();
    startReconnectTimer("game-a", "user-a", 0, () => {}, 60);
    expect(hasActiveReconnectTimer("game-a", "user-a")).toBe(true);
    cancelReconnectTimer("game-a", "user-a");
  });

  it("returns false after the timer is cancelled", () => {
    vi.useFakeTimers();
    startReconnectTimer("game-b", "user-b", 1, () => {}, 60);
    cancelReconnectTimer("game-b", "user-b");
    expect(hasActiveReconnectTimer("game-b", "user-b")).toBe(false);
  });
});

describe("ReconnectService — cancelReconnectTimer (MIG-047)", () => {
  it("is idempotent: cancelling a non-existent timer does not throw", () => {
    expect(() => cancelReconnectTimer("game-none", "user-none")).not.toThrow();
  });

  it("prevents the notify callback from firing after cancel", () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    startReconnectTimer("game-c", "user-c", 2, notify, 10);
    cancelReconnectTimer("game-c", "user-c");
    vi.advanceTimersByTime(11_000);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("ReconnectService — startReconnectTimer fires notify on expiry (MIG-042)", () => {
  it("calls the notify callback with the correct seat after the window expires", () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    startReconnectTimer("game-d", "user-d", 3, notify, 10);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_001);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(3);
  });

  it("timer is removed from active map after expiry", () => {
    vi.useFakeTimers();
    startReconnectTimer("game-e", "user-e", 0, () => {}, 5);
    vi.advanceTimersByTime(6_000);
    expect(hasActiveReconnectTimer("game-e", "user-e")).toBe(false);
  });

  it("replacing an existing timer cancels the old one", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    startReconnectTimer("game-f", "user-f", 0, first, 10);
    // Replace with a second timer before the first fires
    startReconnectTimer("game-f", "user-f", 0, second, 20);
    vi.advanceTimersByTime(11_000);
    expect(first).not.toHaveBeenCalled(); // first was replaced
    expect(second).not.toHaveBeenCalled(); // second hasn't expired yet
    vi.advanceTimersByTime(10_000);
    expect(second).toHaveBeenCalledTimes(1); // second fires
  });
});

describe("ReconnectService — cancelAllTimersForGame", () => {
  it("cancels all timers for the specified game", () => {
    vi.useFakeTimers();
    const notifyA = vi.fn();
    const notifyB = vi.fn();
    startReconnectTimer("game-g", "user-g1", 0, notifyA, 10);
    startReconnectTimer("game-g", "user-g2", 1, notifyB, 10);
    cancelAllTimersForGame("game-g");
    vi.advanceTimersByTime(11_000);
    expect(notifyA).not.toHaveBeenCalled();
    expect(notifyB).not.toHaveBeenCalled();
    expect(hasActiveReconnectTimer("game-g", "user-g1")).toBe(false);
    expect(hasActiveReconnectTimer("game-g", "user-g2")).toBe(false);
  });

  it("does not cancel timers belonging to other games", () => {
    vi.useFakeTimers();
    const notifyOther = vi.fn();
    startReconnectTimer("game-h", "user-h", 0, notifyOther, 10);
    cancelAllTimersForGame("game-not-h");
    expect(hasActiveReconnectTimer("game-h", "user-h")).toBe(true);
    cancelReconnectTimer("game-h", "user-h"); // cleanup
  });

  it("is idempotent: cancelling timers for a game with no timers does not throw", () => {
    expect(() => cancelAllTimersForGame("game-empty")).not.toThrow();
  });
});
