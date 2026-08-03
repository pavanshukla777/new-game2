// [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
// Tests updated: valid bid values are {5, 6, 7, 8} only; max bid = 8.
import { describe, it, expect } from "vitest";
import {
  initBiddingState,
  placeBid,
  passBid,
  getValidBidRange,
  isCurrentBidder,
} from "../bidding.js";

const cfg = { minBid: 5 };
const PC = 4;

describe("initBiddingState", () => {
  it("first bidder is seat to dealer's left", () => {
    expect(initBiddingState(0, 4).currentSeat).toBe(1);
    expect(initBiddingState(3, 4).currentSeat).toBe(0); // wraps around
    expect(initBiddingState(0, 6).currentSeat).toBe(1);
    expect(initBiddingState(5, 6).currentSeat).toBe(0);
  });
  it("status starts as 'ongoing'", () => {
    expect(initBiddingState(0, PC).status).toBe("ongoing");
  });
  it("no bids placed yet", () => {
    const s = initBiddingState(0, PC);
    expect(s.bids).toHaveLength(0);
    expect(s.highestBid).toBe(0);
    expect(s.highestBidderSeat).toBeNull();
  });
});

describe("placeBid", () => {
  // [MIG-004] Minimum valid bid = 5
  it("accepts a minimum bid of 5", () => {
    const s = initBiddingState(0, PC);
    const next = placeBid(s, 1, 5, cfg);
    expect(next.highestBid).toBe(5);
    expect(next.highestBidderSeat).toBe(1);
    expect(next.consecutivePasses).toBe(0);
  });
  it("rejects a bid below the minimum (bid 4)", () => {
    const s = initBiddingState(0, PC);
    expect(() => placeBid(s, 1, 4, cfg)).toThrow(/too low/i);
  });
  it("rejects a bid not higher than current highest", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 6, cfg);
    expect(() => placeBid(s, 2, 6, cfg)).toThrow(/too low/i);
    expect(() => placeBid(s, 2, 5, cfg)).toThrow(/too low/i);
  });
  it("accepts a bid of exactly current+1", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 6, cfg);
    const next = placeBid(s, 2, 7, cfg);
    expect(next.highestBid).toBe(7);
  });
  // [MIG-004] Maximum valid bid = 8
  it("rejects a bid above 8 (the maximum)", () => {
    const s = initBiddingState(0, PC);
    expect(() => placeBid(s, 1, 9, cfg)).toThrow(/maximum/i);
  });
  it("accepts a bid of 8 (maximum bid)", () => {
    const s = initBiddingState(0, PC);
    const next = placeBid(s, 1, 8, cfg);
    expect(next.highestBid).toBe(8);
  });
  it("advances turn to next seat", () => {
    const s = initBiddingState(0, PC);
    const next = placeBid(s, 1, 5, cfg);
    expect(next.currentSeat).toBe(2);
  });
  it("resets consecutive passes", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    expect(s.consecutivePasses).toBe(2);
    s = placeBid(s, 0, 6, cfg);
    expect(s.consecutivePasses).toBe(0);
  });
  it("throws when bidding is not ongoing", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0); // 3 consecutive passes → won
    expect(s.status).toBe("won");
    expect(() => placeBid(s, 1, 6, cfg)).toThrow(/finished/i);
  });
  it("throws when wrong seat tries to bid", () => {
    const s = initBiddingState(0, PC);
    expect(() => placeBid(s, 3, 5, cfg)).toThrow(/seat 1/i);
  });
  it("rejects non-integer bid", () => {
    const s = initBiddingState(0, PC);
    expect(() => placeBid(s, 1, 5.5, cfg)).toThrow(/whole number/i);
  });
});

describe("passBid", () => {
  it("advances turn", () => {
    const s = initBiddingState(0, PC);
    const next = passBid(s, 1);
    expect(next.currentSeat).toBe(2);
  });
  it("increments consecutivePasses", () => {
    let s = initBiddingState(0, PC);
    s = passBid(s, 1);
    expect(s.consecutivePasses).toBe(1);
    s = passBid(s, 2);
    expect(s.consecutivePasses).toBe(2);
  });
  it("bidding ends (won) after 3 consecutive passes with a bid", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("won");
    expect(s.highestBidderSeat).toBe(1);
    expect(s.highestBid).toBe(5);
  });
  it("status is 'redeal' when all 4 players pass", () => {
    let s = initBiddingState(0, PC);
    s = passBid(s, 1);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(s.status).toBe("redeal");
  });
  it("status is 'redeal' when all 6 players pass (6-player)", () => {
    let s = initBiddingState(0, 6);
    for (let seat = 1; seat <= 6; seat++) {
      s = passBid(s, seat % 6);
    }
    expect(s.status).toBe("redeal");
  });
  it("3 passes without any bid does NOT end bidding prematurely (4-player)", () => {
    // In a 4-player game, 3 passes without a bid means the 4th player has not
    // yet acted. The game should reach 4 total passes for a redeal.
    let s = initBiddingState(0, PC);
    s = passBid(s, 1);
    s = passBid(s, 2);
    s = passBid(s, 3);
    expect(s.status).toBe("ongoing"); // 4th player still to act
    s = passBid(s, 0);
    expect(s.status).toBe("redeal");
  });
});

describe("getValidBidRange", () => {
  // [MIG-004] Range is within {5..8}
  it("returns 5–8 when no bids placed", () => {
    const s = initBiddingState(0, PC);
    expect(getValidBidRange(s, cfg)).toEqual({ min: 5, max: 8 });
  });
  it("min = highestBid + 1 after a bid", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 6, cfg);
    expect(getValidBidRange(s, cfg)).toEqual({ min: 7, max: 8 });
  });
  it("returns null when bidding is finished", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 5, cfg);
    s = passBid(s, 2);
    s = passBid(s, 3);
    s = passBid(s, 0);
    expect(getValidBidRange(s, cfg)).toBeNull();
  });
  it("returns null when max bid (8) has been placed", () => {
    let s = initBiddingState(0, PC);
    s = placeBid(s, 1, 8, cfg);
    // Next would need bid 9 which exceeds MAX_BID
    expect(getValidBidRange(s, cfg)).toBeNull();
  });
});

describe("isCurrentBidder", () => {
  it("returns true for the current seat", () => {
    const s = initBiddingState(2, PC); // first bidder = seat 3
    expect(isCurrentBidder(s, 3)).toBe(true);
    expect(isCurrentBidder(s, 0)).toBe(false);
  });
});
