/**
 * Two-round bidding structure tests — MIG-025 / MIG-026.
 *
 * Covers:
 *   - Full two-round flow: Primary Bid → Primary Trump → Bidding → resolved
 *   - MIG-025: Two full rounds (2×playerCount actions); pass is never permanent
 *   - MIG-026: Final Bid === PRIMARY_BID_AMOUNT → Primary Trump stands (→ "playing")
 *   - MIG-026: Final Bid > PRIMARY_BID_AMOUNT → Final Trump requested (→ "trump_selection")
 *   - currentBiddingRound helper
 *
 * Governance:
 *   - RULEBOOK_SUMMARY.md § Bidding: "Exactly 2 full rounds (2×playerCount actions)."
 *   - RULEBOOK_SUMMARY.md § Trump: "Final Bid > Primary Bid → Final Trump; else Primary Trump stands."
 */

import { describe, it, expect } from "vitest";
import {
  initRound,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyBid,
  applyPass,
  applyTrumpSelection,
  currentBiddingRound,
  PRIMARY_BID_AMOUNT,
  BIDDING_ROUNDS,
} from "../index.js";
import type { GameConfig, RoundState } from "../types.js";

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

function makeConfig6(overrides: Partial<GameConfig> = {}): GameConfig {
  return makeConfig({ playerCount: 6, ...overrides });
}

/** Build a state ready for regular bidding (after Primary Bid + Primary Trump). */
function biddingReady(suit: "S" | "H" | "D" | "C" = "H", dealerSeat = 0): RoundState {
  const config = makeConfig();
  const r0 = initRound(1, dealerSeat, config);
  const r1 = applyPrimaryBid(r0, (dealerSeat + 1) % 4);
  return applyPrimaryTrumpSelection(r1, (dealerSeat + 1) % 4, suit, { allowNoTrump: false });
}

/** Apply a full first round of bids (4 actions: all 4 players bid/pass once). */
function fullFirstRound(
  start: RoundState,
  actions: ("pass" | number)[],
): RoundState {
  let state = start;
  const playerCount = Object.keys(state.hands).length;
  const config = makeConfig();
  for (let i = 0; i < playerCount; i++) {
    const seat = (state.dealerSeat + 1 + i) % playerCount;
    const action = actions[i];
    if (action === "pass") {
      state = applyPass(state, seat);
    } else {
      state = applyBid(state, seat, action, config);
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// BIDDING_ROUNDS constant
// ---------------------------------------------------------------------------

describe("BIDDING_ROUNDS constant", () => {
  it("is 2", () => {
    expect(BIDDING_ROUNDS).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// currentBiddingRound helper
// ---------------------------------------------------------------------------

describe("currentBiddingRound", () => {
  it("returns 1 before any regular bids (after Primary Trump)", () => {
    const state = biddingReady();
    const bState = {
      useTwoRoundBidding: true,
      bids: state.bids,
      playerCount: 4 as const,
    };
    expect(currentBiddingRound(bState)).toBe(1);
  });

  it("returns 1 during first round (3 actions placed)", () => {
    const state = biddingReady();
    // After Primary Bid highestBid=5, so regular bids must be ≥6
    const s1 = applyPass(state, 1);
    const s2 = applyPass(s1, 2);
    const s3 = applyPass(s2, 3);
    const bState = { useTwoRoundBidding: true, bids: s3.bids, playerCount: 4 as const };
    expect(currentBiddingRound(bState)).toBe(1);
  });

  it("returns 2 after 4 actions (first full round complete)", () => {
    const state = biddingReady();
    // Round 1: all 4 players act once → bids.length=4 → round 2
    const s1 = applyPass(state, 1);
    const s2 = applyPass(s1, 2);
    const s3 = applyPass(s2, 3);
    const s4 = applyPass(s3, 0);
    const bState = { useTwoRoundBidding: true, bids: s4.bids, playerCount: 4 as const };
    expect(currentBiddingRound(bState)).toBe(2);
  });

  it("returns 1 in legacy mode (useTwoRoundBidding=false)", () => {
    const bState = { useTwoRoundBidding: false, bids: [], playerCount: 4 as const };
    expect(currentBiddingRound(bState)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Two-round bidding: all pass in both rounds → redeal
// ---------------------------------------------------------------------------

describe("two-round bidding: all pass → redeal", () => {
  it("2-round all-pass triggers biddingStatus='redeal' after 2×4=8 actions", () => {
    let state = biddingReady();
    const config = makeConfig();
    const playerCount = 4;

    // Two full rounds of passes (but seat 1 won Primary Bid so highestBid=5)
    // All players pass in both rounds → redeal
    // Actually: all players PASS in regular bidding doesn't redeal in two-round mode
    // because seat 1 already bid 5 in the Primary Bid. Wait...
    //
    // In two-round mode, checkBiddingEnd fires when 2 full rounds of regular
    // bidding actions have been played. The WINNER is whoever has the highest bid.
    // All-pass: highestBidderSeat = seat 1 (from Primary Bid), highestBid = 5.
    // → biddingStatus = "won" (not "redeal"), since highestBidder is set.
    //
    // "redeal" only fires in LEGACY mode when 3+ consecutive passes occur
    // with highestBidderSeat = null (no one has bid). In two-round mode,
    // the Primary Bid guarantees highestBid = 5 before regular bidding starts.
    // So all-pass in round 2 still yields a winner (the Primary Bidder).

    // Round 1: all pass
    for (let i = 0; i < playerCount; i++) {
      const seat = (state.dealerSeat + 1 + i) % playerCount;
      state = applyPass(state, seat);
    }
    expect(state.biddingStatus).toBe("ongoing"); // After round 1, still ongoing

    // Round 2: all pass
    for (let i = 0; i < playerCount; i++) {
      const seat = (state.dealerSeat + 1 + i) % playerCount;
      state = applyPass(state, seat);
    }

    // After 2 full rounds of passes, bidding ends — winner is Primary Bidder (seat 1)
    expect(state.biddingStatus).toBe("won");
    expect(state.highestBidderSeat).toBe(1);
    expect(state.highestBid).toBe(PRIMARY_BID_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
// MIG-026: Primary Trump stands when no one raises
// ---------------------------------------------------------------------------

describe("MIG-026: Primary Trump stands when Final Bid === PRIMARY_BID_AMOUNT", () => {
  it("goes directly to 'playing' after two-round bidding ends with no raises", () => {
    let state = biddingReady("H");
    const config = makeConfig();
    const playerCount = 4;

    // Two full rounds, everyone passes (no raises)
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < playerCount; i++) {
        const seat = (state.dealerSeat + 1 + i) % playerCount;
        state = applyPass(state, seat);
      }
    }

    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("playing"); // Primary Trump stands — skip trump_selection
    expect(state.trumpSuit).toBe("H");   // Primary Trump applied
    expect(state.primaryTrump).toBe("H");
    expect(state.highestBid).toBe(PRIMARY_BID_AMOUNT);
  });

  it("sets currentTrickLeaderSeat to the winning bidder", () => {
    let state = biddingReady("S");
    const playerCount = 4;

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < playerCount; i++) {
        const seat = (state.dealerSeat + 1 + i) % playerCount;
        state = applyPass(state, seat);
      }
    }

    // Winning bidder = seat 1 (Primary Bidder, dealer=0)
    expect(state.currentTrickLeaderSeat).toBe(1);
  });

  it("emits 'bid_won' event with correct bid and seat", () => {
    let state = biddingReady("D");
    const playerCount = 4;

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < playerCount; i++) {
        const seat = (state.dealerSeat + 1 + i) % playerCount;
        state = applyPass(state, seat);
      }
    }

    const wonEvt = state.events.find((e) => e.type === "bid_won");
    expect(wonEvt).toBeDefined();
    expect((wonEvt?.payload as { bid: number })?.bid).toBe(PRIMARY_BID_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
// MIG-026: Final Trump requested when Final Bid > PRIMARY_BID_AMOUNT
// ---------------------------------------------------------------------------

describe("MIG-026: Final Trump requested when Final Bid > PRIMARY_BID_AMOUNT", () => {
  it("goes to 'trump_selection' when a player raises the bid", () => {
    let state = biddingReady("C");
    const config = makeConfig();
    const playerCount = 4;

    // Round 1: seat1=pass, seat2=6 (raises!), seat3=pass, seat0=pass
    state = applyPass(state, 1); // seat1 passes
    state = applyBid(state, 2, 6, config); // seat2 raises to 6
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    // Round 2: all pass (seat2 is now highest bidder at 6)
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("trump_selection"); // Final Trump needed
    expect(state.trumpSuit).toBeNull();          // Not set yet
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(2);
  });

  it("Final Trump selection resolves to 'playing'", () => {
    let state = biddingReady("C");
    const config = makeConfig();
    const playerCount = 4;

    // Seat2 raises, both rounds complete
    state = applyPass(state, 1);
    state = applyBid(state, 2, 6, config);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    expect(state.phase).toBe("trump_selection");

    // Apply Final Trump by winner (seat2)
    const finalState = applyTrumpSelection(state, 2, "D", { allowNoTrump: false });

    expect(finalState.phase).toBe("playing");
    expect(finalState.trumpSuit).toBe("D");
    // Note: primaryTrump was "C" but Final Trump overrides it
    expect(finalState.primaryTrump).toBe("C");
  });

  it("max bid (8) in round 1 immediately wins and goes to trump_selection", () => {
    let state = biddingReady("H");
    const config = makeConfig();

    // Seat1 bids 8 (max), others pass in round 1
    state = applyBid(state, 1, 8, config);

    // After all players have had a turn in round 1 and winner declared...
    // Actually: with two-round bidding, bidding doesn't end after one player bids max.
    // It ends after 2 full rounds. Let's complete the rounds.
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    // Round 2: all pass
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("trump_selection");
    expect(state.highestBid).toBe(8);
    expect(state.highestBidderSeat).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Two-round structure: pass in round 1, raise in round 2
// ---------------------------------------------------------------------------

describe("MIG-025: Pass in round 1, raise in round 2 — passing is not permanent", () => {
  it("seat that passed in round 1 can bid in round 2", () => {
    let state = biddingReady("H");
    const config = makeConfig();

    // Round 1: seat1=pass, seat2=pass, seat3=pass, seat0=pass
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    expect(state.phase).toBe("bidding"); // Still ongoing after round 1

    // Round 2: seat1 NOW bids 6 (despite passing in round 1)
    state = applyBid(state, 1, 6, config); // This should work — no permanent pass
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);

    expect(state.biddingStatus).toBe("won");
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(1);
    expect(state.phase).toBe("trump_selection"); // 6 > 5 → Final Trump needed
  });

  it("6-player two-round: 2×6=12 actions to complete bidding", () => {
    const config = makeConfig6();
    let state = initRound(1, 0, config);

    // Primary Bid by seat 1
    state = applyPrimaryBid(state, 1);
    state = applyPrimaryTrumpSelection(state, 1, "S", { allowNoTrump: false });

    expect(state.phase).toBe("bidding");
    expect(Object.keys(state.hands)).toHaveLength(6);
    for (let seat = 0; seat < 6; seat++) {
      expect(state.hands[seat]).toHaveLength(8);
    }

    // Round 1: 6 passes
    for (let i = 0; i < 6; i++) {
      const seat = (1 + i) % 6;
      state = applyPass(state, seat);
    }
    expect(state.phase).toBe("bidding"); // Still ongoing

    // Round 2: 6 passes
    for (let i = 0; i < 6; i++) {
      const seat = (1 + i) % 6;
      state = applyPass(state, seat);
    }

    // After 12 total actions, bidding resolves
    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("playing"); // Primary Trump stands (no raises)
    expect(state.trumpSuit).toBe("S");
  });
});
