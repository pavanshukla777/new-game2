/**
 * Extended bidding tests — Part 6 additions.
 *
 * Covers gaps not addressed in bidding.test.ts:
 *   - Full multi-player bidding sequences (4-player and 6-player)
 *   - Bidding completion scenarios (highest bid wins via consecutive passes)
 *   - Early termination when max bid (8) is placed
 *   - Dealer=2, Dealer=3 turn order correctness
 *   - currentBidderSeat formula: (firstSeat + bids.length) % playerCount
 *   - bid=8 → remaining players still must pass before bidding ends
 *   - Raise then multi-pass re-sequence
 *   - 6-player all-pass redeal
 *   - getValidBidRange null when highestBid=8 (cannot raise)
 *   - isCurrentBidder during mid-sequence
 *
 * [MIG-022] Part 6 bidding infrastructure
 */

import { describe, it, expect } from "vitest";
import {
  initBiddingState,
  placeBid,
  passBid,
  getValidBidRange,
  isCurrentBidder,
} from "../bidding.js";

const cfg = { minBid: 5 };

// ---------------------------------------------------------------------------
// Turn order verification
// ---------------------------------------------------------------------------

describe("turn order after dealer rotation", () => {
  it("dealer=1 → first bidder is seat 2", () => {
    const s = initBiddingState(1, 4);
    expect(s.currentSeat).toBe(2);
  });

  it("dealer=2 → first bidder is seat 3", () => {
    const s = initBiddingState(2, 4);
    expect(s.currentSeat).toBe(3);
  });

  it("dealer=3 → first bidder is seat 0 (wraps)", () => {
    const s = initBiddingState(3, 4);
    expect(s.currentSeat).toBe(0);
  });

  it("dealer=4 (6-player) → first bidder is seat 5", () => {
    const s = initBiddingState(4, 6);
    expect(s.currentSeat).toBe(5);
  });

  it("dealer=5 (6-player) → first bidder is seat 0 (wraps)", () => {
    const s = initBiddingState(5, 6);
    expect(s.currentSeat).toBe(0);
  });

  it("turn advances correctly through full first round (4-player, dealer=0)", () => {
    let s = initBiddingState(0, 4);
    expect(s.currentSeat).toBe(1);   // bids.length=0 → firstSeat=1
    s = passBid(s, 1);
    expect(s.currentSeat).toBe(2);   // bids.length=1 → (1+1)%4=2
    s = passBid(s, 2);
    expect(s.currentSeat).toBe(3);   // bids.length=2 → (1+2)%4=3
    s = passBid(s, 3);
    expect(s.currentSeat).toBe(0);   // bids.length=3 → (1+3)%4=0
  });
});

// ---------------------------------------------------------------------------
// Complete bidding sequence tests (4-player)
// ---------------------------------------------------------------------------

describe("complete 4-player bidding sequences", () => {
  it("seat 1 bids 5, rest pass → bidding won at bid=5", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("won");
    expect(s.highestBid).toBe(5);
    expect(s.highestBidderSeat).toBe(1);
  });

  it("seat 1 bids 5, seat 3 raises to 7, rest pass → seat 3 wins", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = placeBid(s, 3, 7, cfg);
    s = passBid(s, 0);
    s = passBid(s, 1);
    s = passBid(s, 2);
    expect(s.status).toBe("won");
    expect(s.highestBid).toBe(7);
    expect(s.highestBidderSeat).toBe(3);
  });

  it("seat 1 bids 5, seat 0 raises to 6 (second round) → bidding still ongoing after 2 passes", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = placeBid(s, 0, 6, cfg); // dealer (seat 0) raises
    // Now need 3 consecutive passes for bidding to end
    expect(s.status).toBe("ongoing");
    s = passBid(s, 1);
    expect(s.status).toBe("ongoing");
    s = passBid(s, 2);
    expect(s.status).toBe("ongoing");
    s = passBid(s, 3);
    expect(s.status).toBe("won");
    expect(s.highestBid).toBe(6);
    expect(s.highestBidderSeat).toBe(0);
  });

  it("consecutive pass counter resets after a bid", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);          // 2 consecutive passes
    expect(s.consecutivePasses).toBe(2);
    s = placeBid(s, 0, 6, cfg); // raises → resets counter
    expect(s.consecutivePasses).toBe(0);
    s = passBid(s, 1);
    expect(s.consecutivePasses).toBe(1);
  });

  it("bid=8 — remaining players must still pass before bidding ends", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 8, cfg); // maximum bid placed
    // getValidBidRange should return null (no higher bid possible)
    expect(getValidBidRange(s, cfg)).toBeNull();
    // Bidding still ongoing — 3 consecutive passes required
    expect(s.status).toBe("ongoing");
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("won");
    expect(s.highestBid).toBe(8);
    expect(s.highestBidderSeat).toBe(1);
  });

  it("full contest — each player bids in escalating sequence", () => {
    // seat1 bids 5, seat2 bids 6, seat3 bids 7, seat0 bids 8
    // then 3 consecutive passes
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = placeBid(s, 2, 6, cfg);
    s = placeBid(s, 3, 7, cfg);
    s = placeBid(s, 0, 8, cfg);
    expect(s.status).toBe("ongoing");
    expect(getValidBidRange(s, cfg)).toBeNull(); // bid=8 leaves no room
    s = passBid(s, 1);
    s = passBid(s, 2);
    s = passBid(s, 3);
    expect(s.status).toBe("won");
    expect(s.highestBidderSeat).toBe(0);
    expect(s.highestBid).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Complete bidding sequence tests (6-player)
// ---------------------------------------------------------------------------

describe("6-player bidding sequences", () => {
  it("all-pass → redeal", () => {
    let s = initBiddingState(0, 6);
    for (let i = 1; i <= 6; i++) {
      s = passBid(s, i % 6);
    }
    expect(s.status).toBe("redeal");
    expect(s.highestBid).toBe(0);
    expect(s.highestBidderSeat).toBeNull();
  });

  it("seat 1 bids 6, then 3 consecutive passes → won with 3 passes (not requiring 6)", () => {
    // The PASSES_TO_END_BIDDING constant is 3, not playerCount
    let s = initBiddingState(0, 6);
    s = placeBid(s, 1, 6, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 4);
    expect(s.status).toBe("won");
    expect(s.highestBidderSeat).toBe(1);
  });

  it("consecutive passes reset after a second bid — 3 more passes needed to finish", () => {
    // seat1 bids 5, seat2 raises to 6 immediately (resets consecutivePasses=0)
    // then 3 consecutive passes → seat2 wins bid=6
    let s = initBiddingState(0, 6);
    s = placeBid(s, 1, 5, cfg);
    s = placeBid(s, 2, 6, cfg); // raises immediately — no passes between bids
    expect(s.status).toBe("ongoing");
    expect(s.consecutivePasses).toBe(0);
    s = passBid(s, 3);
    s = passBid(s, 4);
    expect(s.status).toBe("ongoing"); // only 2 consecutive passes
    s = passBid(s, 5);
    expect(s.status).toBe("won");
    expect(s.highestBidderSeat).toBe(2);
    expect(s.highestBid).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// isCurrentBidder correctness mid-sequence
// ---------------------------------------------------------------------------

describe("isCurrentBidder during mid-sequence", () => {
  it("correctly identifies current bidder after several bids and passes", () => {
    let s = initBiddingState(0, 4);
    // Initial: seat 1 is current
    expect(isCurrentBidder(s, 1)).toBe(true);
    expect(isCurrentBidder(s, 0)).toBe(false);

    s = placeBid(s, 1, 5, cfg);
    expect(isCurrentBidder(s, 2)).toBe(true);

    s = passBid(s, 2);
    expect(isCurrentBidder(s, 3)).toBe(true);

    s = placeBid(s, 3, 7, cfg);
    expect(isCurrentBidder(s, 0)).toBe(true);

    s = passBid(s, 0);
    expect(isCurrentBidder(s, 1)).toBe(true);
  });

  it("isCurrentBidder returns false for all seats when bidding is won", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("won");
    for (let seat = 0; seat < 4; seat++) {
      expect(isCurrentBidder(s, seat)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getValidBidRange edge cases
// ---------------------------------------------------------------------------

describe("getValidBidRange edge cases", () => {
  it("min is 5 when no bids placed", () => {
    const s = initBiddingState(0, 4);
    expect(getValidBidRange(s, cfg)).toEqual({ min: 5, max: 8 });
  });

  it("min is highestBid+1 after a bid is placed", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    expect(getValidBidRange(s, cfg)).toEqual({ min: 6, max: 8 });

    s = placeBid(s, 2, 7, cfg);
    expect(getValidBidRange(s, cfg)).toEqual({ min: 8, max: 8 });
  });

  it("returns null when highestBid=7 (only 8 left, still valid)", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 7, cfg);
    expect(getValidBidRange(s, cfg)).toEqual({ min: 8, max: 8 });
  });

  it("returns null when highestBid=8 (cannot raise above maximum)", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 8, cfg);
    expect(getValidBidRange(s, cfg)).toBeNull();
  });

  it("returns null after bidding is won", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("won");
    expect(getValidBidRange(s, cfg)).toBeNull();
  });

  it("returns null after all-pass redeal", () => {
    let s = initBiddingState(0, 4);
    s = passBid(s, 1);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("redeal");
    expect(getValidBidRange(s, cfg)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error conditions
// ---------------------------------------------------------------------------

describe("error conditions", () => {
  it("throws when acting after bidding is won", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("won");
    expect(() => placeBid(s, 1, 6, cfg)).toThrow(/finished/i);
    expect(() => passBid(s, 1)).toThrow(/finished/i);
  });

  it("throws when acting after all-pass redeal", () => {
    let s = initBiddingState(0, 4);
    s = passBid(s, 1);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("redeal");
    expect(() => placeBid(s, 1, 5, cfg)).toThrow(/finished/i);
    expect(() => passBid(s, 1)).toThrow(/finished/i);
  });

  it("throws when wrong seat tries to bid (out of turn)", () => {
    const s = initBiddingState(0, 4); // seat 1 should go first
    expect(() => placeBid(s, 0, 5, cfg)).toThrow(/seat 1/i);
    expect(() => placeBid(s, 2, 5, cfg)).toThrow(/seat 1/i);
  });

  it("throws when wrong seat tries to pass (out of turn)", () => {
    const s = initBiddingState(0, 4); // seat 1 should go first
    expect(() => passBid(s, 2)).toThrow(/seat 1/i);
  });

  it("throws on fractional bid amount", () => {
    const s = initBiddingState(0, 4);
    expect(() => placeBid(s, 1, 5.5, cfg)).toThrow(/whole number/i);
  });

  it("throws on bid value 4 (below minimum)", () => {
    const s = initBiddingState(0, 4);
    expect(() => placeBid(s, 1, 4, cfg)).toThrow(/too low/i);
  });

  it("throws on bid value 9 (above maximum)", () => {
    const s = initBiddingState(0, 4);
    expect(() => placeBid(s, 1, 9, cfg)).toThrow(/maximum/i);
  });

  it("throws on bid not higher than current highest", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 6, cfg);
    expect(() => placeBid(s, 2, 6, cfg)).toThrow(/too low/i);
    expect(() => placeBid(s, 2, 5, cfg)).toThrow(/too low/i);
  });
});

// ---------------------------------------------------------------------------
// Bid history tracking
// ---------------------------------------------------------------------------

describe("bid history tracking", () => {
  it("bids array records all actions in order", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = placeBid(s, 3, 7, cfg);
    s = passBid(s, 0);

    expect(s.bids).toHaveLength(4);
    expect(s.bids[0]).toMatchObject({ seat: 1, action: "bid", amount: 5 });
    expect(s.bids[1]).toMatchObject({ seat: 2, action: "pass" });
    expect(s.bids[2]).toMatchObject({ seat: 3, action: "bid", amount: 7 });
    expect(s.bids[3]).toMatchObject({ seat: 0, action: "pass" });
  });

  it("highestBid tracks the maximum bid placed", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    expect(s.highestBid).toBe(5);
    s = placeBid(s, 2, 6, cfg);
    expect(s.highestBid).toBe(6);
    s = placeBid(s, 3, 8, cfg);
    expect(s.highestBid).toBe(8);
  });

  it("highestBidderSeat updates on each raise", () => {
    let s = initBiddingState(0, 4);
    s = placeBid(s, 1, 5, cfg);
    expect(s.highestBidderSeat).toBe(1);
    s = passBid(s, 2);
    expect(s.highestBidderSeat).toBe(1); // unchanged after pass
    s = placeBid(s, 3, 8, cfg);
    expect(s.highestBidderSeat).toBe(3);
  });
});
