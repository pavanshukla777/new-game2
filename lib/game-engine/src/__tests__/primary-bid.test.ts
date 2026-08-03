/**
 * Primary Bid and Primary Trump tests — MIG-024 / MIG-026.
 *
 * Covers:
 *   - applyPrimaryBid: forced bid=5, phase transition, field invariants
 *   - applyPrimaryTrumpSelection: phase 2+3 dealt, trumpSuit set, phase transitions
 *   - MIG-026: Primary Trump stands when Final Bid === PRIMARY_BID_AMOUNT
 *   - MIG-026: Final Trump requested when Final Bid > PRIMARY_BID_AMOUNT
 *
 * Governance:
 *   - RULEBOOK_SUMMARY.md § Primary Bid: "Mandatory value = 5; cannot be passed."
 *   - RULEBOOK_SUMMARY.md § Primary Trump: "Selected immediately after Primary Bid; mandatory."
 *   - RULEBOOK_SUMMARY.md § Trump: "Final Bid > Primary Bid → Final Trump; else Primary Trump stands."
 */

import { describe, it, expect } from "vitest";
import {
  initRound,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyBid,
  applyPass,
  PRIMARY_BID_AMOUNT,
} from "../index.js";
import type { GameConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    playerCount: 4,
    targetScore: 52,
    allowNoTrump: false,
    allowDobla: true,
    minBid: 5,
    doobnaThreshold: 0,
    useTwoRoundBidding: true,
    ...overrides,
  };
}

/** Advance through Primary Bid + Primary Trump to reach regular "bidding" phase. */
function advanceToBidding(suit: "S" | "H" | "D" | "C" = "H") {
  const config = makeConfig();
  const round0 = initRound(1, 0, config);
  expect(round0.phase).toBe("primary_bid");

  // Primary Bid by seat 1 (dealerSeat=0, so firstSeat=1)
  const round1 = applyPrimaryBid(round0, 1);
  expect(round1.phase).toBe("primary_trump_selection");

  // Primary Trump by seat 1
  const round2 = applyPrimaryTrumpSelection(round1, 1, suit, { allowNoTrump: false });
  expect(round2.phase).toBe("bidding");

  return { round0, round1, round2, config };
}

// ---------------------------------------------------------------------------
// initRound — two-round mode
// ---------------------------------------------------------------------------

describe("initRound (useTwoRoundBidding=true)", () => {
  it("starts in 'primary_bid' phase", () => {
    const round = initRound(1, 0, makeConfig());
    expect(round.phase).toBe("primary_bid");
  });

  it("each player has exactly 2 cards (Phase 1 only)", () => {
    const round = initRound(1, 0, makeConfig());
    for (let seat = 0; seat < 4; seat++) {
      expect(round.hands[seat]).toHaveLength(2);
    }
  });

  it("sets remainingDeck (Phase 2+3 not yet dealt)", () => {
    const round = initRound(1, 0, makeConfig());
    expect(round.remainingDeck).toBeDefined();
    expect(round.remainingDeck).toHaveLength(24); // 32 - 4×2 = 24
  });

  it("bids[] is empty", () => {
    const round = initRound(1, 0, makeConfig());
    expect(round.bids).toHaveLength(0);
  });

  it("highestBid is 0, highestBidderSeat is null before Primary Bid", () => {
    const round = initRound(1, 0, makeConfig());
    expect(round.highestBid).toBe(0);
    expect(round.highestBidderSeat).toBeNull();
  });

  it("useTwoRoundBidding is set on the state", () => {
    const round = initRound(1, 0, makeConfig());
    expect(round.useTwoRoundBidding).toBe(true);
  });

  it("playerCards are populated with secretHand cards", () => {
    const round = initRound(1, 0, makeConfig());
    for (let seat = 0; seat < 4; seat++) {
      expect(round.playerCards?.[seat].secretHand).toHaveLength(2);
    }
  });

  it("legacy mode (useTwoRoundBidding=false) starts in 'bidding' with 8 cards", () => {
    const round = initRound(1, 0, makeConfig({ useTwoRoundBidding: false }));
    expect(round.phase).toBe("bidding");
    for (let seat = 0; seat < 4; seat++) {
      expect(round.hands[seat]).toHaveLength(8);
    }
    expect(round.remainingDeck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyPrimaryBid
// ---------------------------------------------------------------------------

describe("applyPrimaryBid", () => {
  it("transitions phase to 'primary_trump_selection'", () => {
    const round = initRound(1, 0, makeConfig());
    const result = applyPrimaryBid(round, 1);
    expect(result.phase).toBe("primary_trump_selection");
  });

  it("sets highestBid to PRIMARY_BID_AMOUNT (5)", () => {
    const round = initRound(1, 0, makeConfig());
    const result = applyPrimaryBid(round, 1);
    expect(result.highestBid).toBe(PRIMARY_BID_AMOUNT);
    expect(result.highestBid).toBe(5);
  });

  it("sets highestBidderSeat to the bidding seat", () => {
    const round = initRound(1, 0, makeConfig());
    const result = applyPrimaryBid(round, 1);
    expect(result.highestBidderSeat).toBe(1);
  });

  it("does NOT add to bids[] (Primary Bid is not a regular bid)", () => {
    const round = initRound(1, 0, makeConfig());
    const result = applyPrimaryBid(round, 1);
    expect(result.bids).toHaveLength(0);
  });

  it("appends a 'primary_bid' event", () => {
    const round = initRound(1, 0, makeConfig());
    const result = applyPrimaryBid(round, 1);
    const evt = result.events.find((e) => e.type === "primary_bid");
    expect(evt).toBeDefined();
    expect(evt?.seat).toBe(1);
    expect((evt?.payload as { amount: number })?.amount).toBe(PRIMARY_BID_AMOUNT);
  });

  it("throws if called from wrong phase", () => {
    const config = makeConfig({ useTwoRoundBidding: false });
    const round = initRound(1, 0, config);
    expect(() => applyPrimaryBid(round, 1)).toThrow(/primary_bid/);
  });

  it("throws if called by wrong seat (not dealerSeat+1)", () => {
    const round = initRound(1, 0, makeConfig());
    // firstSeat = 1 (dealer=0), so seat 2 should throw
    expect(() => applyPrimaryBid(round, 2)).toThrow(/seat 1/);
  });

  it("dealer at seat 3 (4 players) → firstSeat=0 must call Primary Bid", () => {
    const round = initRound(1, 3, makeConfig());
    const result = applyPrimaryBid(round, 0);
    expect(result.highestBidderSeat).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyPrimaryTrumpSelection
// ---------------------------------------------------------------------------

describe("applyPrimaryTrumpSelection", () => {
  it("transitions phase to 'bidding'", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "H", { allowNoTrump: false });
    expect(result.phase).toBe("bidding");
  });

  it("sets primaryTrump", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "S", { allowNoTrump: false });
    expect(result.primaryTrump).toBe("S");
  });

  it("does NOT set trumpSuit yet (that happens after bidding resolves)", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "H", { allowNoTrump: false });
    expect(result.trumpSuit).toBeNull();
  });

  it("deals all remaining cards — each player now has 8 cards", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "H", { allowNoTrump: false });
    for (let seat = 0; seat < 4; seat++) {
      expect(result.hands[seat]).toHaveLength(8);
    }
  });

  it("clears remainingDeck after Phase 2+3 dealt", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "H", { allowNoTrump: false });
    expect(result.remainingDeck).toBeUndefined();
  });

  it("playerCards have all three zones populated after Phase 2+3", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "D", { allowNoTrump: false });
    for (let seat = 0; seat < 4; seat++) {
      const pc = result.playerCards?.[seat];
      expect(pc?.secretHand).toHaveLength(2);
      expect(pc?.faceDown).toHaveLength(3);
      expect(pc?.faceUp).toHaveLength(3);
    }
  });

  it("highestBid and highestBidderSeat are preserved from Primary Bid", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "C", { allowNoTrump: false });
    expect(result.highestBid).toBe(PRIMARY_BID_AMOUNT);
    expect(result.highestBidderSeat).toBe(1);
  });

  it("bids[] remains empty after Primary Trump (regular bidding not yet started)", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "H", { allowNoTrump: false });
    expect(result.bids).toHaveLength(0);
  });

  it("appends a 'primary_trump_selected' event", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    const result = applyPrimaryTrumpSelection(afterBid, 1, "H", { allowNoTrump: false });
    const evt = result.events.find((e) => e.type === "primary_trump_selected");
    expect(evt).toBeDefined();
    expect(evt?.seat).toBe(1);
  });

  it("throws if called from wrong phase", () => {
    const config = makeConfig({ useTwoRoundBidding: false });
    const round = initRound(1, 0, config);
    expect(() => applyPrimaryTrumpSelection(round, 1, "H", { allowNoTrump: false })).toThrow(
      /primary_trump_selection/,
    );
  });

  it("throws if called by wrong seat", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    // seat 2 is not the Primary Bidder
    expect(() => applyPrimaryTrumpSelection(afterBid, 2, "H", { allowNoTrump: false })).toThrow(
      /seat 1/,
    );
  });

  it("throws if noTrump selected but not allowed", () => {
    const round = initRound(1, 0, makeConfig());
    const afterBid = applyPrimaryBid(round, 1);
    expect(() =>
      applyPrimaryTrumpSelection(afterBid, 1, null, { allowNoTrump: false }),
    ).toThrow(/No Trump/);
  });
});
