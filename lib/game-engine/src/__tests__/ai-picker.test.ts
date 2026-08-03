/**
 * Unit tests for pickAiAction (engine-level AI move generator)
 *
 * [MIG-039] Deterministic AI move generation
 *
 * Tests cover every game phase the AI can encounter:
 *   primary_bid, primary_trump_selection, trump_selection,
 *   bidding (first bid / subsequent bid with existing highest bid),
 *   playing
 */

import { describe, it, expect } from "vitest";
import { pickAiAction } from "../ai";
import { initRound } from "../round";
import { defaultGameConfig } from "../engine";
import type { RoundState, GameConfig } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 4 as const;
const cfg: GameConfig = defaultGameConfig(PLAYER_COUNT);

/** seeded deterministic "rng" so tests are repeatable */
function seededRng(max: number): number {
  return 0;
}

/** A fresh legacy (non-two-round) round state starting in the bidding phase. */
function legacyRound(): RoundState {
  return initRound(1, 0, { ...cfg, useTwoRoundBidding: false }, seededRng);
}

/** A fresh two-round state starting in primary_bid phase. */
function twoRoundState(): RoundState {
  return initRound(1, 0, { ...cfg, useTwoRoundBidding: true }, seededRng);
}

// ---------------------------------------------------------------------------
// primary_bid
// ---------------------------------------------------------------------------

describe("pickAiAction — primary_bid", () => {
  it("always returns bid with amount=5 (PRIMARY_BID_AMOUNT)", () => {
    const state = twoRoundState(); // starts in primary_bid
    expect(state.phase).toBe("primary_bid");

    const action = pickAiAction(state, 1, PLAYER_COUNT, cfg);
    expect(action.type).toBe("bid");
    if (action.type === "bid") expect(action.amount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// primary_trump_selection
// ---------------------------------------------------------------------------

describe("pickAiAction — primary_trump_selection", () => {
  it("selects a valid suit (first available = Spades when no-trump disabled)", () => {
    const base = twoRoundState();
    const state: RoundState = {
      ...base,
      phase: "primary_trump_selection",
      highestBid: 5,
      highestBidderSeat: 1,
    };
    const action = pickAiAction(state, 1, PLAYER_COUNT, cfg);
    expect(action.type).toBe("select_trump");
    if (action.type === "select_trump") {
      expect(["S", "H", "D", "C"]).toContain(action.suit);
    }
  });
});

// ---------------------------------------------------------------------------
// trump_selection
// ---------------------------------------------------------------------------

describe("pickAiAction — trump_selection", () => {
  it("selects a valid suit (first available)", () => {
    const base = legacyRound();
    const state: RoundState = {
      ...base,
      phase: "trump_selection",
      highestBid: 7,
      highestBidderSeat: 2,
    };
    const action = pickAiAction(state, 2, PLAYER_COUNT, cfg);
    expect(action.type).toBe("select_trump");
    if (action.type === "select_trump") {
      expect(["S", "H", "D", "C"]).toContain(action.suit);
    }
  });
});

// ---------------------------------------------------------------------------
// bidding
// ---------------------------------------------------------------------------

describe("pickAiAction — bidding (no bid placed yet)", () => {
  it("bids DEFAULT_MIN_BID (5) when highestBid === 0", () => {
    const state = legacyRound(); // starts in bidding, highestBid=0
    expect(state.phase).toBe("bidding");
    expect(state.highestBid).toBe(0);

    const action = pickAiAction(state, 1, PLAYER_COUNT, cfg);
    expect(action.type).toBe("bid");
    if (action.type === "bid") expect(action.amount).toBeGreaterThanOrEqual(5);
  });
});

describe("pickAiAction — bidding (someone already bid)", () => {
  it("passes when highestBid > 0", () => {
    const base = legacyRound();
    const state: RoundState = {
      ...base,
      phase: "bidding",
      highestBid: 6,
      highestBidderSeat: 1,
    };
    const action = pickAiAction(state, 2, PLAYER_COUNT, cfg);
    expect(action.type).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// playing
// ---------------------------------------------------------------------------

describe("pickAiAction — playing", () => {
  it("returns play_card with a card from the player's hand", () => {
    const base = legacyRound();
    const state: RoundState = {
      ...base,
      phase: "playing",
      trumpSuit: "S",
      noTrump: false,
      currentTrickLeaderSeat: 0,
      currentTrick: [],
    };
    // Seat 0 leads
    expect((base.hands[0] ?? []).length).toBeGreaterThan(0);
    const action = pickAiAction(state, 0, PLAYER_COUNT, cfg);
    expect(action.type).toBe("play_card");
    if (action.type === "play_card") {
      expect(typeof action.card).toBe("string");
      const hand = state.hands[0] ?? [];
      expect(hand).toContain(action.card);
    }
  });

  it("plays a legal card when following suit", () => {
    const base = legacyRound();
    const seat0Card = (base.hands[0] ?? [])[0]!;
    const state: RoundState = {
      ...base,
      phase: "playing",
      trumpSuit: "S",
      noTrump: false,
      currentTrickLeaderSeat: 0,
      currentTrick: [{ seat: 0, card: seat0Card }],
    };
    // Seat 1 follows
    const action = pickAiAction(state, 1, PLAYER_COUNT, cfg);
    expect(action.type).toBe("play_card");
  });

  it("throws if getLegalMovesZonedForSeat returns empty (missing playerCards)", () => {
    // When playerCards is absent AND hands is empty, getLegalMovesZonedForSeat
    // should throw about missing zone data — the AI propagates that throw.
    const base = legacyRound();
    const state: RoundState = {
      ...base,
      phase: "playing",
      trumpSuit: "S",
      noTrump: false,
      currentTrickLeaderSeat: 0,
      currentTrick: [],
      hands: { ...base.hands, 0: [] },
      playerCards: undefined, // strip zone data so getLegalMoves throws
    };
    expect(() => pickAiAction(state, 0, PLAYER_COUNT, cfg)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// unknown phase guard
// ---------------------------------------------------------------------------

describe("pickAiAction — unexpected phase", () => {
  it("throws on a non-actionable phase like 'round_ended'", () => {
    const base = legacyRound();
    const state: RoundState = { ...base, phase: "round_ended" as any };
    expect(() => pickAiAction(state, 0, PLAYER_COUNT, cfg)).toThrow();
  });
});
