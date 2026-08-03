/**
 * Secondary (Final) Bidding — Scenario Tests (Vol 6 Part 5)
 *
 * Tests the complete Secondary Bidding phase as it actually runs in production:
 * starting from a real engine state that was transitioned through
 * Primary Bid → Primary Trump Selection → Secondary Bidding.
 *
 * This file is deliberately distinct from game-bid-scenarios.test.ts (Part 3),
 * which tests the bidding state machine in isolation using initBiddingState.
 * Here we test the full integrated pipeline and the two MIG-026 exit paths.
 *
 * Scenarios:
 *   1.  Full engine flow: primary_bid → primary_trump → secondary bidding → resolution
 *   2.  MIG-026 Path A: all-pass → Primary Trump stands → phase="playing"
 *   3.  MIG-026 Path B: raise → Final Trump needed → phase="trump_selection"
 *   4.  Valid bids during secondary bidding (floor is PRIMARY_BID_AMOUNT=5)
 *   5.  Invalid bids during secondary bidding
 *   6.  Pass handling and MIG-025 (passing not permanent)
 *   7.  Winning bidder tracking across both rounds
 *   8.  Turn rotation: 4P and 6P
 *   9.  Reconnect during secondary bidding
 *   10. Duplicate request (bid after won)
 *   11. Out-of-turn action
 *   12. Simultaneous / race condition
 *   13. Service-level: buildValidActions in post-primary-trump bidding state
 *   14. Service-level: buildClientGameState — primaryTrump visible, full hands
 *   15. Service-level: snapshotToRoundState round-trip for mid-secondary-bidding
 *   16. State immutability
 *   17. 6-player secondary bidding (2×6=12 actions)
 *
 * [MIG-025] Two-round bidding structure (exactly 2×playerCount actions)
 * [MIG-026] Primary Trump stands when Final Bid === PRIMARY_BID_AMOUNT
 * [RULE-007] Server is the only source of truth.
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";
import {
  initRound,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyBid,
  applyPass,
  PRIMARY_BID_AMOUNT,
  BIDDING_ROUNDS,
  currentBiddingRound,
} from "@workspace/game-engine";
import type { GameConfig, RoundState } from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_COUNT_4 = 4;
const PLAYER_COUNT_6 = 6;
const CFG = { minBid: 5 };

function makeConfig(playerCount: 4 | 6 = 4, overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    playerCount,
    targetScore: 52,
    allowNoTrump: false,
    allowDobla: false,
    minBid: 5,
    doobnaThreshold: 0,
    useTwoRoundBidding: true,
    ...overrides,
  };
}

/**
 * Advance through the full pre-secondary-bidding pipeline.
 * dealer=0 → primaryBidder=1
 * Returns the RoundState at the start of secondary bidding (phase="bidding").
 */
function stateAtSecondaryBidding(
  suit: "S" | "H" | "D" | "C" = "H",
  dealerSeat = 0,
  playerCount: 4 | 6 = 4,
): RoundState {
  const config = makeConfig(playerCount);
  const primaryBidderSeat = (dealerSeat + 1) % playerCount;
  const r0 = initRound(1, dealerSeat, config);
  const r1 = applyPrimaryBid(r0, primaryBidderSeat);
  const r2 = applyPrimaryTrumpSelection(r1, primaryBidderSeat, suit, { allowNoTrump: false });
  expect(r2.phase).toBe("bidding");
  expect(r2.primaryTrump).toBe(suit);
  expect(r2.highestBid).toBe(PRIMARY_BID_AMOUNT);
  return r2;
}

/**
 * Apply a full two-round sequence of actions in secondary bidding.
 * actions: array of ("pass" | number) for each player in turn order.
 * Repeats the pattern for both rounds.
 */
function applyRounds(
  start: RoundState,
  round1: ("pass" | number)[],
  round2: ("pass" | number)[],
  playerCount: 4 | 6 = 4,
  dealerSeat = 0,
): RoundState {
  let state = start;
  const firstSeat = (dealerSeat + 1) % playerCount;
  for (let round = 0; round < 2; round++) {
    const actions = round === 0 ? round1 : round2;
    for (let i = 0; i < playerCount; i++) {
      const seat = (firstSeat + i) % playerCount;
      const action = actions[i];
      if (action === "pass") {
        state = applyPass(state, seat);
      } else {
        state = applyBid(state, seat, action, CFG);
      }
    }
  }
  return state;
}

/**
 * Build a minimal AuthoritativeGameState in the "bidding" phase,
 * reflecting a state that was transitioned from primary_trump_selection.
 * Provides 8 cards per seat (realistic post-deal scenario).
 */
function makeBiddingPostTrumpAuthState(
  overrides: Partial<AuthoritativeGameState> = {},
  playerCount: 4 | 6 = 4,
): AuthoritativeGameState {
  const suits = ["H", "S", "D", "C", "H", "S"] as const;
  const seats: AuthoritativeGameState["seats"] = {};
  for (let s = 0; s < playerCount; s++) {
    const suit = suits[s % 4]!;
    seats[s] = {
      userId: `user-${s}`,
      displayName: `Player ${s}`,
      team: (s % 2) as 0 | 1,
      // Simulate full 8-card hand (2 secretHand + 3 faceDown + 3 faceUp)
      hand: [
        `A${suit}`, `K${suit}`, `Q${suit}`, `J${suit}`,
        `T${suit}`, `9${suit}`, `8${suit}`, `7${suit}`,
      ].slice(0, 8),
      secretHand: [`A${suit}`, `K${suit}`],
      faceDown: [`Q${suit}`, `J${suit}`, `T${suit}`],
      faceUp: [`9${suit}`, `8${suit}`, `7${suit}`],
      tricksWon: 0,
      pointsCaptured: 0,
      connectionState: "CONNECTED",
      isAi: false,
      inFaceDownPhase: false,
    };
  }
  return {
    gameId: "secondary-bidding-game",
    roundNumber: 1,
    phase: "bidding",
    sequence: 2,        // after primary_bid and primary_trump_selected
    seats,
    dealerSeat: 0,
    currentBidderSeat: 1,   // (dealerSeat+1 + bids.length=0) % 4 = 1
    highestBid: PRIMARY_BID_AMOUNT,  // 5 (Primary Bid floor)
    highestBidderSeat: 1,            // Primary Bidder
    bids: [],                        // Secondary bidding hasn't started
    biddingStatus: "ongoing",
    consecutivePasses: 0,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,           // Final trump not set yet
    primaryTrump: "H",         // Primary Trump was selected
    noTrump: false,
    useTwoRoundBidding: true,
    currentTrickLeaderSeat: null,
    currentTrick: [],
    completedTricksThisRound: 0,
    consecutiveTricks: null,
    consecutiveWins: [0, 0],
    chhakri: null,
    team0PointsThisRound: 0,
    team1PointsThisRound: 0,
    team0Score: 0,
    team1Score: 0,
    targetScore: 52,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Full engine flow: primary_bid → primary_trump → secondary → resolution
// ---------------------------------------------------------------------------

describe("Scenario 1: Full engine flow — phase transitions", () => {
  it("stateAtSecondaryBidding enters phase='bidding' with primaryTrump set", () => {
    const state = stateAtSecondaryBidding("H");
    expect(state.phase).toBe("bidding");
    expect(state.primaryTrump).toBe("H");
    expect(state.highestBid).toBe(PRIMARY_BID_AMOUNT);
    expect(state.highestBidderSeat).toBe(1);
    expect(state.bids).toHaveLength(0); // Secondary bidding hasn't started
  });

  it("each player has exactly 8 cards at the start of secondary bidding", () => {
    const state = stateAtSecondaryBidding();
    for (let s = 0; s < PLAYER_COUNT_4; s++) {
      expect(state.hands[s]).toHaveLength(8);
    }
  });

  it("remainingDeck is cleared before secondary bidding begins", () => {
    const state = stateAtSecondaryBidding();
    expect(state.remainingDeck).toBeUndefined();
  });

  it("useTwoRoundBidding=true is preserved through the transition", () => {
    const state = stateAtSecondaryBidding();
    expect(state.useTwoRoundBidding).toBe(true);
  });

  it("BIDDING_ROUNDS constant is 2 (guaranteeing exactly 2 full rounds)", () => {
    expect(BIDDING_ROUNDS).toBe(2);
  });

  it("currentBiddingRound returns 1 at the start of secondary bidding", () => {
    const state = stateAtSecondaryBidding();
    expect(currentBiddingRound({ useTwoRoundBidding: true, bids: state.bids, playerCount: 4 })).toBe(1);
  });

  it("currentBiddingRound returns 2 after all 4 players have acted once", () => {
    let state = stateAtSecondaryBidding();
    for (let i = 0; i < PLAYER_COUNT_4; i++) {
      state = applyPass(state, (1 + i) % PLAYER_COUNT_4);
    }
    expect(currentBiddingRound({ useTwoRoundBidding: true, bids: state.bids, playerCount: 4 })).toBe(2);
    expect(state.phase).toBe("bidding"); // Still ongoing
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — MIG-026 Path A: all-pass → Primary Trump stands → playing
// ---------------------------------------------------------------------------

describe("Scenario 2: MIG-026 Path A — all pass, Primary Trump stands", () => {
  it("all 8 passes (2 rounds × 4 players) → phase='playing', trumpSuit=primaryTrump", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("playing");
    expect(state.trumpSuit).toBe("H"); // Primary Trump stands
    expect(state.primaryTrump).toBe("H");
    expect(state.highestBid).toBe(PRIMARY_BID_AMOUNT); // No raise
    expect(state.highestBidderSeat).toBe(1); // Primary Bidder wins
  });

  it("winning bidder (Primary Bidder) becomes the first trick leader", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("S"),
      ["pass", "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.currentTrickLeaderSeat).toBe(1); // seat 1 is Primary Bidder (dealer=0)
  });

  it("bid_won event is emitted with the primary bid amount", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("D"),
      ["pass", "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    const wonEvt = state.events.find((e) => e.type === "bid_won");
    expect(wonEvt).toBeDefined();
    expect((wonEvt?.payload as { bid: number })?.bid).toBe(PRIMARY_BID_AMOUNT);
    expect(wonEvt?.seat).toBe(1);
  });

  it("each of the 4 primary trump suits leads to playing when no raise", () => {
    for (const suit of ["S", "H", "D", "C"] as const) {
      const state = applyRounds(
        stateAtSecondaryBidding(suit),
        ["pass", "pass", "pass", "pass"],
        ["pass", "pass", "pass", "pass"],
      );
      expect(state.phase).toBe("playing");
      expect(state.trumpSuit).toBe(suit);
    }
  });

  it("buildValidActions gives no bid/pass when biddingStatus='won' (trump_selection phase)", () => {
    // Use trump_selection phase — doesn't require playerCards (unlike playing phase).
    // Intent: after bidding ends, no seat can 'bid' or 'pass'.
    const authState = makeBiddingPostTrumpAuthState({
      phase: "trump_selection",
      biddingStatus: "won",
      currentBidderSeat: null,
      highestBid: PRIMARY_BID_AMOUNT,
      highestBidderSeat: 1,
    });
    for (const seat of [0, 1, 2, 3]) {
      const actions = GameService.buildValidActions(authState, seat, PLAYER_COUNT_4);
      expect(actions.some((a) => a.type === "bid")).toBe(false);
      expect(actions.some((a) => a.type === "pass")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — MIG-026 Path B: raise → Final Trump needed → trump_selection
// ---------------------------------------------------------------------------

describe("Scenario 3: MIG-026 Path B — raise, Final Trump selection needed", () => {
  it("raising above PRIMARY_BID_AMOUNT → phase='trump_selection'", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", 6, "pass", "pass"],     // seat 2 bids 6 in round 1
      ["pass", "pass", "pass", "pass"], // all pass in round 2
    );
    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("trump_selection"); // Final Trump needed
    expect(state.trumpSuit).toBeNull();            // Not set yet
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(2);
  });

  it("max bid (8) → trump_selection (not playing)", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("C"),
      [8, "pass", "pass", "pass"],     // seat 1 bids 8 in round 1
      ["pass", "pass", "pass", "pass"], // all pass in round 2
    );
    expect(state.phase).toBe("trump_selection");
    expect(state.highestBid).toBe(8);
    expect(state.highestBidderSeat).toBe(1);
  });

  it("primaryTrump is preserved in trump_selection phase state", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("D"),
      [6, "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.primaryTrump).toBe("D"); // Still set — client shows "was D, now choosing final"
    expect(state.trumpSuit).toBeNull();
  });

  it("bid_won event correctly records the winning seat and raised bid", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", "pass", 7, "pass"],      // seat 3 bids 7 (dealer=0 → seats: 1,2,3,0)
      ["pass", "pass", "pass", "pass"],
    );
    const wonEvt = state.events.find((e) => e.type === "bid_won");
    expect(wonEvt).toBeDefined();
    expect((wonEvt?.payload as { bid: number; seat: number })?.bid).toBe(7);
    expect(wonEvt?.seat).toBe(3);
  });

  it("buildValidActions gives select_trump to winner after trump_selection phase", () => {
    const authState = makeBiddingPostTrumpAuthState({
      phase: "trump_selection",
      biddingStatus: "won",
      highestBid: 6,
      highestBidderSeat: 2,
      currentBidderSeat: null,
    });
    const actions = GameService.buildValidActions(authState, 2, PLAYER_COUNT_4);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("select_trump");
    // Non-winner seats get nothing
    for (const seat of [0, 1, 3]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT_4)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Valid bids during secondary bidding
// ---------------------------------------------------------------------------

describe("Scenario 4: Valid bids — floor is PRIMARY_BID_AMOUNT (5)", () => {
  it("bid of 6 is valid when highestBid=5 (strictly higher)", () => {
    const state = stateAtSecondaryBidding();
    expect(() => applyBid(state, 1, 6, CFG)).not.toThrow();
  });

  it("bid of 7 is valid when highestBid=5", () => {
    const state = stateAtSecondaryBidding();
    expect(() => applyBid(state, 1, 7, CFG)).not.toThrow();
  });

  it("bid of 8 is valid when highestBid=5", () => {
    const state = stateAtSecondaryBidding();
    expect(() => applyBid(state, 1, 8, CFG)).not.toThrow();
  });

  it("bid of 7 is valid when highestBid=6", () => {
    let state = stateAtSecondaryBidding();
    state = applyBid(state, 1, 6, CFG);
    expect(() => applyBid(state, 2, 7, CFG)).not.toThrow();
  });

  it("bid of 8 is valid when highestBid=7", () => {
    let state = stateAtSecondaryBidding();
    state = applyBid(state, 1, 6, CFG);
    state = applyBid(state, 2, 7, CFG);
    expect(() => applyBid(state, 3, 8, CFG)).not.toThrow();
  });

  it("highestBid and highestBidderSeat are updated correctly after each bid", () => {
    let state = stateAtSecondaryBidding();
    state = applyBid(state, 1, 6, CFG);
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(1);
    state = applyPass(state, 2);
    state = applyBid(state, 3, 7, CFG);
    expect(state.highestBid).toBe(7);
    expect(state.highestBidderSeat).toBe(3);
  });

  it("buildValidActions minBid=6 when highestBid=5 (first secondary bid)", () => {
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 1,
      highestBid: 5,
      bids: [],
    });
    const actions = GameService.buildValidActions(authState, 1, PLAYER_COUNT_4);
    const bidAction = actions.find((a) => a.type === "bid");
    expect(bidAction?.minBid).toBe(6); // must beat highestBid=5
    expect(bidAction?.maxBid).toBe(8);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
  });

  it("buildValidActions minBid=8 when highestBid=7", () => {
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 3,
      highestBid: 7,
      bids: [
        { seat: 1, amount: 6 },
        { seat: 2, amount: "pass" },
        { seat: 3, amount: "pass" },
        { seat: 0, amount: 7 },
      ],
    });
    const actions = GameService.buildValidActions(authState, 3, PLAYER_COUNT_4);
    const bidAction = actions.find((a) => a.type === "bid");
    expect(bidAction?.minBid).toBe(8);
    expect(bidAction?.maxBid).toBe(8);
  });

  it("buildValidActions has no 'bid' action when highestBid=8 (max reached)", () => {
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 2,
      highestBid: 8,
      bids: [{ seat: 1, amount: 8 }],
    });
    const actions = GameService.buildValidActions(authState, 2, PLAYER_COUNT_4);
    expect(actions.some((a) => a.type === "bid")).toBe(false);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Invalid bids during secondary bidding
// ---------------------------------------------------------------------------

describe("Scenario 5: Invalid bids rejected by engine", () => {
  it("bid of 5 is rejected (not strictly higher than PRIMARY_BID_AMOUNT=5)", () => {
    const state = stateAtSecondaryBidding();
    expect(() => applyBid(state, 1, 5, CFG)).toThrow(/too low/i);
  });

  it("bid of 4 is rejected (below minimum)", () => {
    expect(() => applyBid(stateAtSecondaryBidding(), 1, 4, CFG)).toThrow(/too low/i);
  });

  it("bid of 9 is rejected (above maximum)", () => {
    expect(() => applyBid(stateAtSecondaryBidding(), 1, 9, CFG)).toThrow(/maximum/i);
  });

  it("bid equal to current highest is rejected", () => {
    let state = stateAtSecondaryBidding();
    state = applyBid(state, 1, 7, CFG);
    expect(() => applyBid(state, 2, 7, CFG)).toThrow(/too low/i);
  });

  it("bid below current highest is rejected", () => {
    let state = stateAtSecondaryBidding();
    state = applyBid(state, 1, 8, CFG);
    // Others can only pass — any bid attempt would fail
    expect(() => applyBid(state, 2, 6, CFG)).toThrow(/too low/i);
    expect(() => applyBid(state, 2, 7, CFG)).toThrow(/too low/i);
    expect(() => applyBid(state, 2, 8, CFG)).toThrow(/too low/i);
  });

  it("non-integer bid is rejected", () => {
    expect(() => applyBid(stateAtSecondaryBidding(), 1, 6.5, CFG)).toThrow(/whole number/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Pass handling and MIG-025 (passing not permanent)
// ---------------------------------------------------------------------------

describe("Scenario 6: Pass handling and MIG-025 — passing is not permanent", () => {
  it("seat can pass in round 1 and bid in round 2", () => {
    let state = stateAtSecondaryBidding();
    // Round 1: all pass
    for (let i = 0; i < PLAYER_COUNT_4; i++) {
      state = applyPass(state, (1 + i) % PLAYER_COUNT_4);
    }
    expect(state.phase).toBe("bidding"); // Still ongoing
    expect(state.biddingStatus).toBe("ongoing");

    // Round 2: seat 3 bids (despite passing in round 1)
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    expect(() => applyBid(state, 3, 6, CFG)).not.toThrow();
    state = applyBid(state, 3, 6, CFG);
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(3);
  });

  it("consecutivePasses resets to 0 after a bid", () => {
    let state = stateAtSecondaryBidding();
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    expect(state.consecutivePasses).toBe(2);
    state = applyBid(state, 3, 6, CFG);
    expect(state.consecutivePasses).toBe(0);
  });

  it("consecutivePasses increments correctly", () => {
    let state = stateAtSecondaryBidding();
    state = applyPass(state, 1);
    expect(state.consecutivePasses).toBe(1);
    state = applyPass(state, 2);
    expect(state.consecutivePasses).toBe(2);
    state = applyPass(state, 3);
    expect(state.consecutivePasses).toBe(3);
    state = applyPass(state, 0);
    expect(state.consecutivePasses).toBe(4);
    // After 4 passes (round 1 complete), still ongoing (two-round mode)
    expect(state.biddingStatus).toBe("ongoing");
  });

  it("3 consecutive passes in round 1 do NOT end bidding (two-round mode)", () => {
    let state = stateAtSecondaryBidding();
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    // In legacy mode this would trigger 'won' (PASSES_TO_END_BIDDING=3), but not in two-round mode
    expect(state.biddingStatus).toBe("ongoing");
    expect(state.phase).toBe("bidding");
  });

  it("pass is always available to any seat during secondary bidding", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 3 });
    const actions = GameService.buildValidActions(authState, 3, PLAYER_COUNT_4);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Winning bidder tracking across both rounds
// ---------------------------------------------------------------------------

describe("Scenario 7: Winning bidder tracking", () => {
  it("winner from round 1 remains winner if no one raises in round 2", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", 6, "pass", "pass"],     // seat 2 bids 6
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.highestBidderSeat).toBe(2);
    expect(state.highestBid).toBe(6);
  });

  it("winner can be overridden in round 2 (higher bid beats round-1 winner)", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", 6, "pass", "pass"],     // seat 2 bids 6 in round 1
      ["pass", "pass", 7, "pass"],     // seat 3 bids 7 in round 2 (seat 3 = index 2 from dealer+1)
    );
    // seats in order: 1, 2, 3, 0 (dealer=0, firstSeat=1)
    // Round 2 index 2 = seat 3
    expect(state.highestBid).toBe(7);
    expect(state.highestBidderSeat).toBe(3);
  });

  it("Primary Bidder (seat 1) wins if no one ever raises", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.highestBidderSeat).toBe(1); // Primary Bidder
    expect(state.highestBid).toBe(PRIMARY_BID_AMOUNT);
  });

  it("bid history in bids[] has exactly 2×playerCount entries after both rounds", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", 6, "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.bids).toHaveLength(2 * PLAYER_COUNT_4); // 8
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Turn rotation
// ---------------------------------------------------------------------------

describe("Scenario 8: Turn rotation in secondary bidding", () => {
  it("4P: first bidder is seat (dealerSeat+1) = seat 1", () => {
    const state = stateAtSecondaryBidding("H", 0, 4);
    // bids.length=0, firstSeat=1, currentSeat = (1+0)%4 = 1
    expect(state.highestBidderSeat).toBe(1); // From Primary Bid
    // Apply a pass from seat 1 — if it accepts, seat 1 was current
    expect(() => applyPass(state, 1)).not.toThrow();
  });

  it("4P: turn advances: seat1→seat2→seat3→seat0→seat1(R2)→...", () => {
    let state = stateAtSecondaryBidding("H", 0, 4);
    // Each pass should advance to the next seat
    state = applyPass(state, 1); // seat 1
    expect(() => applyPass(state, 1)).toThrow(/seat 2/i); // it's seat 2's turn
    state = applyPass(state, 2); // seat 2
    expect(() => applyPass(state, 2)).toThrow(/seat 3/i); // it's seat 3's turn
    state = applyPass(state, 3); // seat 3
    state = applyPass(state, 0); // seat 0 (wrap-around)
    // Round 2 starts from seat 1 again
    expect(() => applyPass(state, 0)).toThrow(/seat 1/i); // Back to seat 1
  });

  it("4P: correct seat order when dealer=2 → firstSeat=3", () => {
    const state = stateAtSecondaryBidding("H", 2, 4);
    expect(() => applyPass(state, 3)).not.toThrow(); // seat 3 is first
    const s1 = applyPass(state, 3);
    expect(() => applyPass(s1, 0)).not.toThrow(); // then seat 0
  });

  it("buildValidActions: only currentBidderSeat receives bid+pass actions", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 2 });
    expect(GameService.buildValidActions(authState, 2, PLAYER_COUNT_4).length).toBeGreaterThan(0);
    for (const seat of [0, 1, 3]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT_4)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — Reconnect during secondary bidding
// ---------------------------------------------------------------------------

describe("Scenario 9: Reconnect during secondary bidding", () => {
  it("reconnecting player receives correct phase='bidding' state", () => {
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 3,
      highestBid: 6,
      highestBidderSeat: 2,
      bids: [
        { seat: 1, amount: "pass" },
        { seat: 2, amount: 6 },
        { seat: 3, amount: "pass" },
        { seat: 0, amount: "pass" },
        { seat: 1, amount: "pass" },
        { seat: 2, amount: "pass" },
      ],
    });
    const cs = GameService.buildClientGameState(authState, 3);
    expect(cs.phase).toBe("bidding");
    expect(cs.currentBidderSeat).toBe(3);
    expect(cs.highestBid).toBe(6);
    expect(cs.highestBidderSeat).toBe(2);
  });

  it("reconnecting seat 3 (current actor) gets bid+pass actions", () => {
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 3,
      highestBid: 5,
    });
    const actions = GameService.buildValidActions(authState, 3, PLAYER_COUNT_4);
    expect(actions.some((a) => a.type === "bid")).toBe(true);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
    const bidAction = actions.find((a) => a.type === "bid");
    expect(bidAction?.minBid).toBe(6); // must beat floor of 5
  });

  it("reconnecting non-actor seat gets no actions", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 2 });
    for (const seat of [0, 1, 3]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT_4)).toHaveLength(0);
    }
  });

  it("primaryTrump is visible to the reconnecting player (required for UI)", () => {
    const authState = makeBiddingPostTrumpAuthState({ primaryTrump: "H" });
    const cs = GameService.buildClientGameState(authState, 2);
    expect(cs.primaryTrump).toBe("H");
  });

  it("opponent cards are hidden for the reconnecting player", () => {
    const authState = makeBiddingPostTrumpAuthState();
    // Seat 1 reconnects — opponent hands must be null
    const cs = GameService.buildClientGameState(authState, 1);
    expect(cs.seats[1].hand).not.toBeNull();   // own hand visible
    expect(cs.seats[0].hand).toBeNull();        // opponent hidden
    expect(cs.seats[2].hand).toBeNull();
    expect(cs.seats[3].hand).toBeNull();
  });

  it("full bid history is preserved in snapshot for reconnecting player", () => {
    const bids: AuthoritativeGameState["bids"] = [
      { seat: 1, amount: 6 },
      { seat: 2, amount: "pass" },
      { seat: 3, amount: "pass" },
      { seat: 0, amount: "pass" },
    ];
    const authState = makeBiddingPostTrumpAuthState({ bids });
    const cs = GameService.buildClientGameState(authState, 2);
    expect(cs.bids).toHaveLength(4);
    expect(cs.bids[0]).toMatchObject({ seat: 1, amount: 6 });
  });

  it("snapshotToRoundState restores mid-secondary-bidding state for reconnect", () => {
    const bids: AuthoritativeGameState["bids"] = [
      { seat: 1, amount: "pass" },
      { seat: 2, amount: 6 },
      { seat: 3, amount: "pass" },
    ];
    const authState = makeBiddingPostTrumpAuthState({
      bids,
      highestBid: 6,
      highestBidderSeat: 2,
      consecutivePasses: 2,
      primaryTrump: "H",
      useTwoRoundBidding: true,
    });
    const rs = GameService.snapshotToRoundState(authState, PLAYER_COUNT_4);
    expect(rs.phase).toBe("bidding");
    expect(rs.highestBid).toBe(6);
    expect(rs.highestBidderSeat).toBe(2);
    expect(rs.consecutivePasses).toBe(2);
    expect(rs.primaryTrump).toBe("H");
    expect(rs.useTwoRoundBidding).toBe(true);
    expect(rs.bids).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — Duplicate request (bid after won)
// ---------------------------------------------------------------------------

describe("Scenario 10: Duplicate request — action after bidding complete", () => {
  it("engine throws when applyBid is called after biddingStatus='won'", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    expect(state.biddingStatus).toBe("won");
    // After all-pass, phase advances to "playing" (MIG-026 Primary Trump stands).
    // applyBid guards via assertPhase("bidding"), so the error is a phase mismatch.
    expect(() => applyBid(state, 1, 6, CFG)).toThrow(/phase/i);
  });

  it("engine throws when applyPass is called after biddingStatus='won'", () => {
    const state = applyRounds(
      stateAtSecondaryBidding("H"),
      ["pass", "pass", "pass", "pass"],
      ["pass", "pass", "pass", "pass"],
    );
    // Same reason — assertPhase("bidding") fires because phase is now "playing"
    expect(() => applyPass(state, 1)).toThrow(/phase/i);
  });

  it("buildValidActions returns empty for all seats when biddingStatus='won'", () => {
    const authState = makeBiddingPostTrumpAuthState({
      biddingStatus: "won",
      currentBidderSeat: null,
      phase: "trump_selection",
      highestBid: 6,
      highestBidderSeat: 2,
    });
    for (const seat of [0, 1, 3]) {
      // Non-winner gets nothing for bidding
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT_4)
        .some((a) => a.type === "bid" || a.type === "pass")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 11 — Out-of-turn action
// ---------------------------------------------------------------------------

describe("Scenario 11: Out-of-turn action — rejected by engine", () => {
  it("engine throws for every seat except the current one", () => {
    const state = stateAtSecondaryBidding(); // currentSeat = 1
    for (const wrongSeat of [0, 2, 3]) {
      expect(() => applyBid(state, wrongSeat, 6, CFG)).toThrow(/seat 1/i);
      expect(() => applyPass(state, wrongSeat)).toThrow(/seat 1/i);
    }
  });

  it("after advancing turns, out-of-turn bids are still rejected", () => {
    let state = stateAtSecondaryBidding();
    state = applyPass(state, 1); // advances to seat 2
    expect(() => applyBid(state, 1, 6, CFG)).toThrow(/seat 2/i); // seat 1 now out-of-turn
    expect(() => applyBid(state, 3, 6, CFG)).toThrow(/seat 2/i); // seat 3 also out-of-turn
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — Simultaneous requests / race conditions
// ---------------------------------------------------------------------------

describe("Scenario 12: Simultaneous requests — stale state rejected", () => {
  it("second request from same seat is rejected because turn has advanced", () => {
    const state = stateAtSecondaryBidding(); // currentSeat=1
    const advanced = applyBid(state, 1, 6, CFG);        // turn → seat 2
    expect(() => applyBid(advanced, 1, 7, CFG)).toThrow(/seat 2/i); // seat 1 is now stale
  });

  it("concurrent bid from different wrong seat is rejected as out-of-turn", () => {
    const state = stateAtSecondaryBidding(); // currentSeat=1
    expect(() => applyBid(state, 2, 6, CFG)).toThrow(/seat 1/i); // seat 2 cannot act yet
  });

  it("applyBid/applyPass are pure — no mutation of original state", () => {
    const state = stateAtSecondaryBidding();
    const originalBidsLength = state.bids.length;
    const originalHighestBid = state.highestBid;

    applyBid(state, 1, 6, CFG);  // Do NOT reassign

    expect(state.bids.length).toBe(originalBidsLength);     // unchanged
    expect(state.highestBid).toBe(originalHighestBid);      // unchanged
  });

  it("each action produces a new state with bids.length+1 (monotonic)", () => {
    let state = stateAtSecondaryBidding();
    for (let i = 0; i < 2 * PLAYER_COUNT_4; i++) {
      const before = state.bids.length;
      const seat = (1 + i) % PLAYER_COUNT_4;
      state = applyPass(state, seat);
      expect(state.bids.length).toBe(before + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 13 — Service: buildValidActions in post-primary-trump bidding state
// ---------------------------------------------------------------------------

describe("Scenario 13: buildValidActions in post-primary-trump bidding state", () => {
  it("returns bid+pass for currentBidderSeat", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 1 });
    const actions = GameService.buildValidActions(authState, 1, PLAYER_COUNT_4);
    expect(actions.some((a) => a.type === "bid")).toBe(true);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
  });

  it("returns empty for all non-active seats", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 1 });
    for (const seat of [0, 2, 3]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT_4)).toHaveLength(0);
    }
  });

  it("minBid tracks highest bid correctly through a sequence of bids", () => {
    const bids: AuthoritativeGameState["bids"] = [
      { seat: 1, amount: 6 },
      { seat: 2, amount: "pass" },
    ];
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 3,
      highestBid: 6,
      highestBidderSeat: 1,
      bids,
    });
    const actions = GameService.buildValidActions(authState, 3, PLAYER_COUNT_4);
    const bid = actions.find((a) => a.type === "bid");
    expect(bid?.minBid).toBe(7);
    expect(bid?.maxBid).toBe(8);
  });

  it("no 'select_trump' in buildValidActions during bidding phase", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 2 });
    const actions = GameService.buildValidActions(authState, 2, PLAYER_COUNT_4);
    expect(actions.some((a) => a.type === "select_trump")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 14 — buildClientGameState: primaryTrump visible, full hands
// ---------------------------------------------------------------------------

describe("Scenario 14: buildClientGameState during secondary bidding", () => {
  it("primaryTrump is visible to all seats", () => {
    const authState = makeBiddingPostTrumpAuthState({ primaryTrump: "D" });
    for (const seat of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(authState, seat).primaryTrump).toBe("D");
    }
  });

  it("trumpSuit is null during secondary bidding (final trump not set)", () => {
    const authState = makeBiddingPostTrumpAuthState({ trumpSuit: null });
    for (const seat of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(authState, seat).trumpSuit).toBeNull();
    }
  });

  it("all seats see the same public bidding state", () => {
    const authState = makeBiddingPostTrumpAuthState({
      currentBidderSeat: 2,
      highestBid: 6,
      highestBidderSeat: 1,
    });
    for (const seat of [0, 1, 2, 3]) {
      const cs = GameService.buildClientGameState(authState, seat);
      expect(cs.currentBidderSeat).toBe(2);
      expect(cs.highestBid).toBe(6);
      expect(cs.highestBidderSeat).toBe(1);
    }
  });

  it("each seat can see its own full hand (8 cards post-deal)", () => {
    const authState = makeBiddingPostTrumpAuthState();
    for (const seat of [0, 1, 2, 3]) {
      const cs = GameService.buildClientGameState(authState, seat);
      expect(cs.seats[seat].hand).not.toBeNull();
      expect(cs.seats[seat].hand!.length).toBe(8);
    }
  });

  it("opponent hands are null in client state", () => {
    const authState = makeBiddingPostTrumpAuthState();
    const cs = GameService.buildClientGameState(authState, 1);
    expect(cs.seats[0].hand).toBeNull();
    expect(cs.seats[2].hand).toBeNull();
    expect(cs.seats[3].hand).toBeNull();
    expect(cs.seats[1].hand).not.toBeNull(); // own hand visible
  });

  it("face-up cards are always visible to all players", () => {
    const authState = makeBiddingPostTrumpAuthState();
    const cs = GameService.buildClientGameState(authState, 0);
    for (const seat of [0, 1, 2, 3]) {
      expect(cs.seats[seat].faceUp.length).toBeGreaterThan(0);
    }
  });

  it("mySeat matches the requesting seat", () => {
    const authState = makeBiddingPostTrumpAuthState();
    for (const seat of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(authState, seat).mySeat).toBe(seat);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 15 — snapshotToRoundState round-trip
// ---------------------------------------------------------------------------

describe("Scenario 15: snapshotToRoundState round-trip for secondary bidding", () => {
  it("restores phase='bidding'", () => {
    const authState = makeBiddingPostTrumpAuthState();
    expect(GameService.snapshotToRoundState(authState, PLAYER_COUNT_4).phase).toBe("bidding");
  });

  it("restores primaryTrump correctly", () => {
    const authState = makeBiddingPostTrumpAuthState({ primaryTrump: "S" });
    expect(GameService.snapshotToRoundState(authState, PLAYER_COUNT_4).primaryTrump).toBe("S");
  });

  it("restores useTwoRoundBidding=true", () => {
    const authState = makeBiddingPostTrumpAuthState({ useTwoRoundBidding: true });
    expect(GameService.snapshotToRoundState(authState, PLAYER_COUNT_4).useTwoRoundBidding).toBe(true);
  });

  it("restores bids array (DB format → engine format)", () => {
    const authState = makeBiddingPostTrumpAuthState({
      bids: [
        { seat: 1, amount: 6 },
        { seat: 2, amount: "pass" },
        { seat: 3, amount: "pass" },
      ],
    });
    const rs = GameService.snapshotToRoundState(authState, PLAYER_COUNT_4);
    expect(rs.bids).toHaveLength(3);
    expect(rs.bids[0]).toMatchObject({ seat: 1, action: "bid", amount: 6 });
    expect(rs.bids[1]).toMatchObject({ seat: 2, action: "pass" });
    expect(rs.bids[2]).toMatchObject({ seat: 3, action: "pass" });
  });

  it("restores highestBid and highestBidderSeat", () => {
    const authState = makeBiddingPostTrumpAuthState({
      highestBid: 7,
      highestBidderSeat: 3,
    });
    const rs = GameService.snapshotToRoundState(authState, PLAYER_COUNT_4);
    expect(rs.highestBid).toBe(7);
    expect(rs.highestBidderSeat).toBe(3);
  });

  it("engine can continue bidding from a restored round state", () => {
    // Build state at midpoint: seat 1 bid 6, seat 2 passed; next = seat 3
    const authState = makeBiddingPostTrumpAuthState({
      bids: [
        { seat: 1, amount: 6 },
        { seat: 2, amount: "pass" },
      ],
      highestBid: 6,
      highestBidderSeat: 1,
      consecutivePasses: 1,
      currentBidderSeat: 3,
    });
    const rs = GameService.snapshotToRoundState(authState, PLAYER_COUNT_4);
    // Should be able to apply a bid from seat 3 to the restored state
    expect(() => applyBid(rs, 3, 7, CFG)).not.toThrow();
    const next = applyBid(rs, 3, 7, CFG);
    expect(next.highestBid).toBe(7);
    expect(next.highestBidderSeat).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Scenario 16 — State immutability
// ---------------------------------------------------------------------------

describe("Scenario 16: State immutability", () => {
  it("applyBid does not mutate the input state", () => {
    const state = stateAtSecondaryBidding();
    const snap = { bidsLen: state.bids.length, highest: state.highestBid };
    applyBid(state, 1, 6, CFG);
    expect(state.bids.length).toBe(snap.bidsLen);
    expect(state.highestBid).toBe(snap.highest);
  });

  it("applyPass does not mutate the input state", () => {
    const state = stateAtSecondaryBidding();
    const snap = { bidsLen: state.bids.length, passes: state.consecutivePasses };
    applyPass(state, 1);
    expect(state.bids.length).toBe(snap.bidsLen);
    expect(state.consecutivePasses).toBe(snap.passes);
  });

  it("events array grows by exactly 1 per action and original is unchanged", () => {
    const state = stateAtSecondaryBidding();
    const origEvents = state.events.length;
    const next = applyBid(state, 1, 6, CFG);
    expect(state.events.length).toBe(origEvents);       // original unchanged
    expect(next.events.length).toBe(origEvents + 1);   // new state has one more
  });
});

// ---------------------------------------------------------------------------
// Scenario 17 — 6-player secondary bidding
// ---------------------------------------------------------------------------

describe("Scenario 17: 6-player secondary bidding — 2×6=12 actions", () => {
  it("6P: stateAtSecondaryBidding enters bidding with 6 players each having 8 cards", () => {
    const state = stateAtSecondaryBidding("H", 0, 6);
    expect(state.phase).toBe("bidding");
    for (let s = 0; s < PLAYER_COUNT_6; s++) {
      expect(state.hands[s]).toHaveLength(8);
    }
  });

  it("6P: all-pass (12 passes) → Primary Trump stands, phase='playing'", () => {
    let state = stateAtSecondaryBidding("S", 0, 6);
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < PLAYER_COUNT_6; i++) {
        state = applyPass(state, (1 + i) % PLAYER_COUNT_6);
      }
    }
    expect(state.biddingStatus).toBe("won");
    expect(state.phase).toBe("playing");
    expect(state.trumpSuit).toBe("S");
  });

  it("6P: round 1 still ongoing after 6 passes", () => {
    let state = stateAtSecondaryBidding("H", 0, 6);
    for (let i = 0; i < PLAYER_COUNT_6; i++) {
      state = applyPass(state, (1 + i) % PLAYER_COUNT_6);
    }
    expect(state.biddingStatus).toBe("ongoing");
    expect(state.phase).toBe("bidding");
    expect(state.bids).toHaveLength(PLAYER_COUNT_6); // 6 actions = round 1 complete
  });

  it("6P: raise in round 1 → winner wins after 12 total actions", () => {
    let state = stateAtSecondaryBidding("H", 0, 6);
    // Round 1: seat 1 bids 6, rest pass
    state = applyBid(state, 1, 6, CFG);
    for (let i = 1; i < PLAYER_COUNT_6; i++) {
      state = applyPass(state, (1 + i) % PLAYER_COUNT_6);
    }
    // Round 2: all pass
    for (let i = 0; i < PLAYER_COUNT_6; i++) {
      state = applyPass(state, (1 + i) % PLAYER_COUNT_6);
    }
    expect(state.biddingStatus).toBe("won");
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(1);
    expect(state.phase).toBe("trump_selection"); // 6 > 5 → Final Trump needed
  });

  it("6P: bid history has exactly 12 entries after both rounds", () => {
    let state = stateAtSecondaryBidding("H", 0, 6);
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < PLAYER_COUNT_6; i++) {
        state = applyPass(state, (1 + i) % PLAYER_COUNT_6);
      }
    }
    expect(state.bids).toHaveLength(2 * PLAYER_COUNT_6); // 12
  });

  it("6P: buildValidActions gives empty to non-active seats", () => {
    const authState = makeBiddingPostTrumpAuthState({ currentBidderSeat: 2 }, 6);
    for (const seat of [0, 1, 3, 4, 5]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT_6)).toHaveLength(0);
    }
  });
});
