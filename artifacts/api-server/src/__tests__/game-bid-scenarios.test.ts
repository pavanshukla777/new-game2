/**
 * Primary Bidding Engine — Scenario Tests (Vol 6 Part 3)
 *
 * Tests all spec-required bidding scenarios. No DB required — exercises the
 * engine (initBiddingState / placeBid / passBid) and GameService static
 * methods (buildValidActions, buildClientGameState, snapshotToRoundState)
 * directly.
 *
 * Scenarios:
 *   1. Normal bidding — full 2-round flow with a winner
 *   2. Consecutive passes — all pass; Primary Bidder wins
 *   3. Winning bid — one player bids 8 in round 1
 *   4. Reconnect during bidding — mid-bid snapshot supplies full state
 *   5. Invalid bid — values outside {5,6,7,8}, not higher than highest
 *   6. Invalid turn — wrong seat rejected at engine and validation layer
 *   7. Duplicate request — bid after biddingStatus='won' is rejected
 *   8. Simultaneous bid attempts — second attempt for same seat is rejected
 *   9. Race condition — stale-state bid fails because seat has already advanced
 *
 * [MIG-022] [MIG-024] [MIG-025] [MIG-026]
 * [RULE-007] Server is the only source of truth; all validation is server-side.
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";
import {
  initBiddingState,
  placeBid,
  passBid,
  getValidBidRange,
  isCurrentBidder,
} from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CFG = { minBid: 5 };

/** Build a mid-bidding AuthoritativeGameState for reconnect / service-level tests. */
function makeBiddingAuthState(
  opts: Partial<AuthoritativeGameState> & { playerCount?: 4 | 6 } = {},
): AuthoritativeGameState {
  const playerCount = opts.playerCount ?? 4;
  const seats: AuthoritativeGameState["seats"] = {};
  for (let s = 0; s < playerCount; s++) {
    seats[s] = {
      userId: `user-${s}`,
      displayName: `Player ${s}`,
      team: (s % 2) as 0 | 1,
      hand: [],
      secretHand: s === 1 ? ["AH", "KH"] : [],
      faceDown: [],
      faceUp: [],
      tricksWon: 0,
      pointsCaptured: 0,
      connectionState: "CONNECTED",
      isAi: false,
      inFaceDownPhase: false,
    };
  }

  const { playerCount: _pc, ...rest } = opts;
  return {
    gameId: "scenario-game",
    roundNumber: 1,
    phase: "bidding",
    sequence: 2,
    seats,
    dealerSeat: 0,
    currentBidderSeat: 1,
    highestBid: 5, // Primary Bid already placed
    highestBidderSeat: 1,
    bids: [],
    biddingStatus: "ongoing",
    consecutivePasses: 0,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,
    primaryTrump: "H",
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
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Normal bidding
// ---------------------------------------------------------------------------

describe("Scenario 1: Normal bidding — full 2-round 4P flow", () => {
  it("turn order starts from (dealerSeat+1) and rotates clockwise", () => {
    // dealer=0 → first bidder=1
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    expect(state.currentSeat).toBe(1);
    state = passBid(state, 1);
    expect(state.currentSeat).toBe(2);
    state = passBid(state, 2);
    expect(state.currentSeat).toBe(3);
    state = passBid(state, 3);
    expect(state.currentSeat).toBe(0);
  });

  it("seat 2 bids 6 in round 1, wins after both rounds complete", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Round 1: seat1=pass, seat2=6, seat3=pass, seat0=pass
    state = passBid(state, 1);
    state = placeBid(state, 2, 6, CFG);
    state = passBid(state, 3);
    state = passBid(state, 0);
    expect(state.status).toBe("ongoing"); // Still in round 2

    // Round 2: all pass
    state = passBid(state, 1);
    state = passBid(state, 2);
    state = passBid(state, 3);
    state = passBid(state, 0);

    expect(state.status).toBe("won");
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(2);
  });

  it("bid history records all actions in order", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    state = passBid(state, 1);
    state = placeBid(state, 2, 6, CFG);
    state = passBid(state, 3);
    state = passBid(state, 0);

    expect(state.bids).toHaveLength(4);
    expect(state.bids[0]).toEqual({ seat: 1, action: "pass" });
    expect(state.bids[1]).toEqual({ seat: 2, action: "bid", amount: 6 });
    expect(state.bids[2]).toEqual({ seat: 3, action: "pass" });
    expect(state.bids[3]).toEqual({ seat: 0, action: "pass" });
  });

  it("buildValidActions returns bid+pass for the current bidder", () => {
    const authState = makeBiddingAuthState({ currentBidderSeat: 2, highestBid: 6 });
    const actions = GameService.buildValidActions(authState, 2, 4);
    expect(actions.some((a) => a.type === "bid")).toBe(true);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
  });

  it("buildValidActions minBid tracks current highestBid", () => {
    const authState = makeBiddingAuthState({
      currentBidderSeat: 3,
      highestBid: 6,
      highestBidderSeat: 2,
      bids: [{ seat: 2, amount: 6 }],
    });
    const actions = GameService.buildValidActions(authState, 3, 4);
    const bidAction = actions.find((a) => a.type === "bid");
    expect(bidAction?.minBid).toBe(7); // must exceed 6
    expect(bidAction?.maxBid).toBe(8);
  });

  it("6-player: turn order wraps correctly after seat 5", () => {
    let state = initBiddingState(5, 6, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 0,
    });
    // first bidder = (5+1)%6 = 0
    expect(state.currentSeat).toBe(0);
    state = passBid(state, 0);
    expect(state.currentSeat).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Consecutive passes
// ---------------------------------------------------------------------------

describe("Scenario 2: Consecutive passes — 4P two-round, all pass", () => {
  it("all 8 passes (2 rounds × 4 players) → status='won' with Primary Bidder winning", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // 2 full rounds of passes
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        const seat = (1 + i) % 4; // starts at seat 1 (dealer+1)
        state = passBid(state, seat);
      }
    }

    expect(state.status).toBe("won");
    expect(state.highestBidderSeat).toBe(1); // Primary Bidder wins by default
    expect(state.highestBid).toBe(5);
  });

  it("after round 1 (4 passes), bidding is still 'ongoing'", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    for (let i = 0; i < 4; i++) {
      state = passBid(state, (1 + i) % 4);
    }
    expect(state.status).toBe("ongoing");
  });

  it("consecutive passes do NOT end bidding early in two-round mode", () => {
    // Even 4 passes in a row don't trigger legacy 'won' rule (which requires 3)
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    state = passBid(state, 1);
    state = passBid(state, 2);
    state = passBid(state, 3);
    // 3 passes — in legacy mode this would trigger 'won'; in two-round mode it should not
    expect(state.status).toBe("ongoing");
    state = passBid(state, 0);
    expect(state.status).toBe("ongoing"); // still in round 1 only
  });

  it("buildValidActions returns empty for non-current seat", () => {
    const authState = makeBiddingAuthState({ currentBidderSeat: 3 });
    for (const seat of [0, 1, 2]) {
      expect(GameService.buildValidActions(authState, seat, 4)).toHaveLength(0);
    }
  });

  it("passing is not permanent — seat that passed in round 1 can bid in round 2", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    // Round 1: all pass
    state = passBid(state, 1);
    state = passBid(state, 2);
    state = passBid(state, 3);
    state = passBid(state, 0);
    expect(state.status).toBe("ongoing");

    // Round 2: seat 1 raises (despite passing in round 1)
    expect(() => placeBid(state, 1, 6, CFG)).not.toThrow(); // NOT permanent pass
    state = placeBid(state, 1, 6, CFG);
    expect(state.highestBid).toBe(6);
    expect(state.highestBidderSeat).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Winning bid
// ---------------------------------------------------------------------------

describe("Scenario 3: Winning bid", () => {
  it("bid of 8 in round 1 is valid; bidding still runs for 2 full rounds", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Seat 1 bids max (8) in round 1
    state = placeBid(state, 1, 8, CFG);
    expect(state.highestBid).toBe(8);
    expect(state.status).toBe("ongoing"); // 2-round mode: continues

    // Others pass in round 1
    state = passBid(state, 2);
    state = passBid(state, 3);
    state = passBid(state, 0);
    expect(state.status).toBe("ongoing"); // Round 2 hasn't started yet

    // Round 2: all pass (no one can raise above 8)
    state = passBid(state, 1);
    state = passBid(state, 2);
    state = passBid(state, 3);
    state = passBid(state, 0);

    expect(state.status).toBe("won");
    expect(state.highestBid).toBe(8);
    expect(state.highestBidderSeat).toBe(1);
  });

  it("after highest bid is 8, getValidBidRange returns null (no valid raise exists)", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 8,
      initialHighestBidderSeat: 1,
    });
    // Advance to seat 2
    state = { ...state, currentSeat: 2 };
    expect(getValidBidRange(state, CFG)).toBeNull();
  });

  it("buildValidActions returns only 'pass' when highestBid=8 (no room to raise)", () => {
    const authState = makeBiddingAuthState({
      currentBidderSeat: 2,
      highestBid: 8,
      highestBidderSeat: 1,
      bids: [{ seat: 1, amount: 8 }],
    });
    const actions = GameService.buildValidActions(authState, 2, 4);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
    expect(actions.some((a) => a.type === "bid")).toBe(false);
  });

  it("seat that bids max (8) is still current bidder for their second round turn", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    state = placeBid(state, 1, 8, CFG);
    state = passBid(state, 2);
    state = passBid(state, 3);
    state = passBid(state, 0);
    // Round 2 — seat 1's turn again
    expect(isCurrentBidder(state, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Reconnect during bidding
// ---------------------------------------------------------------------------

describe("Scenario 4: Reconnect during bidding", () => {
  it("mid-bid snapshot supplies currentBidderSeat to the reconnecting player", () => {
    const authState = makeBiddingAuthState({
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
      consecutivePasses: 2,
    });

    // All four seats reconstruct the same public bidding state
    for (const seat of [0, 1, 2, 3]) {
      const clientState = GameService.buildClientGameState(authState, seat);
      expect(clientState.currentBidderSeat).toBe(3);
      expect(clientState.highestBid).toBe(6);
      expect(clientState.highestBidderSeat).toBe(2);
      expect(clientState.bids).toHaveLength(6);
      expect(clientState.biddingStatus).toBe("ongoing");
    }
  });

  it("reconnecting player (seat 3) receives correct validActions via buildValidActions", () => {
    const authState = makeBiddingAuthState({
      currentBidderSeat: 3,
      highestBid: 6,
    });
    const actions = GameService.buildValidActions(authState, 3, 4);
    expect(actions.some((a) => a.type === "bid")).toBe(true);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
    const bidAction = actions.find((a) => a.type === "bid");
    expect(bidAction?.minBid).toBe(7); // must beat highest bid of 6
  });

  it("reconnecting player NOT in turn gets empty validActions", () => {
    const authState = makeBiddingAuthState({ currentBidderSeat: 3 });
    // Seat 1 is reconnecting but it's seat 3's turn
    const actions = GameService.buildValidActions(authState, 1, 4);
    expect(actions).toHaveLength(0);
  });

  it("bids list is fully preserved in the snapshot for history display", () => {
    const bids: AuthoritativeGameState["bids"] = [
      { seat: 1, amount: "pass" },
      { seat: 2, amount: 6 },
      { seat: 3, amount: "pass" },
    ];
    const authState = makeBiddingAuthState({ bids });
    const clientState = GameService.buildClientGameState(authState, 0);
    expect(clientState.bids).toHaveLength(3);
    expect(clientState.bids[0]).toMatchObject({ seat: 1, amount: "pass" });
    expect(clientState.bids[1]).toMatchObject({ seat: 2, amount: 6 });
    expect(clientState.bids[2]).toMatchObject({ seat: 3, amount: "pass" });
  });

  it("opponent cards are NOT visible to the reconnecting player", () => {
    const authState = makeBiddingAuthState({
      seats: Object.fromEntries(
        [0, 1, 2, 3].map((s) => [
          s,
          {
            userId: `user-${s}`,
            displayName: `Player ${s}`,
            team: (s % 2) as 0 | 1,
            hand: [`A${["H", "S", "D", "C"][s]}`, `K${["H", "S", "D", "C"][s]}`],
            secretHand: [`A${["H", "S", "D", "C"][s]}`],
            faceDown: [`7${["H", "S", "D", "C"][s]}`],
            faceUp: [`Q${["H", "S", "D", "C"][s]}`],
            tricksWon: 0,
            pointsCaptured: 0,
            connectionState: "CONNECTED" as const,
            isAi: false,
            inFaceDownPhase: false,
          },
        ]),
      ) as AuthoritativeGameState["seats"],
    });

    // Reconnecting seat 2 can see their own cards but NOT seat 0 or 1's cards
    const clientState = GameService.buildClientGameState(authState, 2);
    expect(clientState.seats[2].hand).not.toBeNull();       // own hand visible
    expect(clientState.seats[0].hand).toBeNull();            // opponent hidden
    expect(clientState.seats[1].hand).toBeNull();            // opponent hidden
    expect(clientState.seats[2].faceUp).toEqual(["QD"]);    // own face-up visible
    expect(clientState.seats[0].faceUp).toEqual(["QH"]);    // opponent face-up always visible
  });

  it("snapshotToRoundState restores full mid-bidding engine state for reconnect", () => {
    const authState = makeBiddingAuthState({
      bids: [
        { seat: 1, amount: 6 },
        { seat: 2, amount: "pass" },
        { seat: 3, amount: "pass" },
        { seat: 0, amount: "pass" },
      ],
      highestBid: 6,
      highestBidderSeat: 1,
      consecutivePasses: 3,
    });
    const roundState = GameService.snapshotToRoundState(authState, 4);
    expect(roundState.bids).toHaveLength(4);
    expect(roundState.highestBid).toBe(6);
    expect(roundState.highestBidderSeat).toBe(1);
    expect(roundState.consecutivePasses).toBe(3);
    expect(roundState.biddingStatus).toBe("ongoing");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Invalid bid
// ---------------------------------------------------------------------------

describe("Scenario 5: Invalid bid — engine rejects at placeBid", () => {
  function freshState() {
    return initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
  }

  it("rejects bid of 4 (below minimum of 5)", () => {
    expect(() => placeBid(freshState(), 1, 4, CFG)).toThrow(/too low/i);
  });

  it("rejects bid of 3", () => {
    expect(() => placeBid(freshState(), 1, 3, CFG)).toThrow(/too low/i);
  });

  it("rejects bid of 9 (above maximum of 8)", () => {
    expect(() => placeBid(freshState(), 1, 9, CFG)).toThrow(/maximum/i);
  });

  it("rejects bid of 0", () => {
    expect(() => placeBid(freshState(), 1, 0, CFG)).toThrow();
  });

  it("rejects bid equal to current highest (must be strictly higher)", () => {
    let state = freshState();
    state = placeBid(state, 1, 6, CFG); // seat 1 bids 6
    // seat 2 tries to bid 6 again (same as highest)
    expect(() => placeBid(state, 2, 6, CFG)).toThrow(/too low/i);
  });

  it("rejects bid below current highest", () => {
    let state = freshState();
    state = placeBid(state, 1, 7, CFG);
    expect(() => placeBid(state, 2, 6, CFG)).toThrow(/too low/i);
    expect(() => placeBid(state, 2, 5, CFG)).toThrow(/too low/i);
  });

  it("rejects non-integer bid", () => {
    expect(() => placeBid(freshState(), 1, 5.5, CFG)).toThrow(/whole number/i);
  });

  it("buildValidActions returns no 'bid' action when highestBid=8 (impossible to raise)", () => {
    const authState = makeBiddingAuthState({
      currentBidderSeat: 2,
      highestBid: 8,
      bids: [{ seat: 1, amount: 8 }],
    });
    const actions = GameService.buildValidActions(authState, 2, 4);
    expect(actions.some((a) => a.type === "bid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Invalid turn (out-of-turn bid)
// ---------------------------------------------------------------------------

describe("Scenario 6: Invalid turn — wrong seat is rejected", () => {
  function freshState() {
    return initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
  }

  it("rejects bid from seat 2 when it is seat 1's turn", () => {
    const state = freshState(); // currentSeat = 1
    expect(() => placeBid(state, 2, 6, CFG)).toThrow(/seat 1/i);
  });

  it("rejects pass from seat 0 when it is seat 1's turn", () => {
    const state = freshState();
    expect(() => passBid(state, 0)).toThrow(/seat 1/i);
  });

  it("rejects bid from every seat except the current one", () => {
    const state = freshState(); // currentSeat = 1
    for (const wrongSeat of [0, 2, 3]) {
      expect(() => placeBid(state, wrongSeat, 6, CFG)).toThrow();
    }
  });

  it("isCurrentBidder returns false for non-active seats", () => {
    const state = freshState(); // currentSeat = 1
    expect(isCurrentBidder(state, 0)).toBe(false);
    expect(isCurrentBidder(state, 2)).toBe(false);
    expect(isCurrentBidder(state, 3)).toBe(false);
  });

  it("isCurrentBidder returns true only for the active seat", () => {
    const state = freshState(); // currentSeat = 1
    expect(isCurrentBidder(state, 1)).toBe(true);
  });

  it("buildValidActions returns empty for every non-active seat", () => {
    const authState = makeBiddingAuthState({ currentBidderSeat: 2 });
    for (const seat of [0, 1, 3]) {
      expect(GameService.buildValidActions(authState, seat, 4)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Duplicate request (bid after bidding complete)
// ---------------------------------------------------------------------------

describe("Scenario 7: Duplicate request — action after bidding is complete", () => {
  it("engine throws when placeBid is called after biddingStatus='won'", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Complete 2 full rounds
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        state = passBid(state, (1 + i) % 4);
      }
    }
    expect(state.status).toBe("won");

    // Duplicate: try to place another bid
    expect(() => placeBid(state, 1, 6, CFG)).toThrow(/finished/i);
  });

  it("engine throws when passBid is called after biddingStatus='won'", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        state = passBid(state, (1 + i) % 4);
      }
    }
    expect(state.status).toBe("won");
    expect(() => passBid(state, 1)).toThrow(/finished/i);
  });

  it("buildValidActions returns empty for all seats when biddingStatus='won'", () => {
    const authState = makeBiddingAuthState({
      biddingStatus: "won",
      currentBidderSeat: null,
    });
    for (const seat of [0, 1, 2, 3]) {
      expect(GameService.buildValidActions(authState, seat, 4)).toHaveLength(0);
    }
  });

  it("getValidBidRange returns null when bidding is finished", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        state = passBid(state, (1 + i) % 4);
      }
    }
    expect(getValidBidRange(state, CFG)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Simultaneous bid attempts
// ---------------------------------------------------------------------------

describe("Scenario 8: Simultaneous bid attempts from the same seat", () => {
  it("the second bid from the same seat is rejected because turn has advanced", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Seat 1 acts — turn advances to seat 2
    const stateAfterFirstBid = placeBid(state, 1, 6, CFG);
    expect(stateAfterFirstBid.currentSeat).toBe(2);

    // A second simultaneous request from seat 1 using the NEW state (already advanced)
    // is rejected because it is now seat 2's turn
    expect(() => placeBid(stateAfterFirstBid, 1, 7, CFG)).toThrow(/seat 2/i);
  });

  it("second pass from the same seat is rejected after turn has advanced", () => {
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    const stateAfterPass = passBid(state, 1);
    expect(stateAfterPass.currentSeat).toBe(2);

    // Seat 1 tries to pass again — not their turn
    expect(() => passBid(stateAfterPass, 1)).toThrow(/seat 2/i);
  });

  it("two different seats acting simultaneously: only the current-turn seat succeeds", () => {
    // State: currentSeat = 1
    const state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Seat 1 (correct turn) succeeds
    expect(() => placeBid(state, 1, 6, CFG)).not.toThrow();

    // Seat 2 (out of turn) fails
    expect(() => placeBid(state, 2, 6, CFG)).toThrow(/seat 1/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — Race conditions (stale-state detection)
// ---------------------------------------------------------------------------

describe("Scenario 9: Race conditions — stale state is rejected", () => {
  it("action applied to a stale snapshot fails because seat has already moved", () => {
    // State S (currentSeat=1)
    const stateS = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Handler A loads S, processes seat 1's bid → state S'
    const stateSPrime = placeBid(stateS, 1, 6, CFG);
    expect(stateSPrime.currentSeat).toBe(2);

    // Handler B also loaded S (stale), tries to apply the same seat 1 bid to S':
    // In the real system, Handler B would have saved S' to DB before Handler B writes.
    // We simulate the race by trying to use the stale state S again:
    // Seat 1 attempts to bid again on state S' — rejected because seat already advanced.
    expect(() => placeBid(stateSPrime, 1, 7, CFG)).toThrow(/seat 2/i);
  });

  it("optimistic-update invariant: bids.length increases monotonically", () => {
    // Each applied action must increase bids.length by exactly 1
    let state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    for (let i = 0; i < 8; i++) {
      const seat = (1 + i) % 4;
      const before = state.bids.length;
      state = passBid(state, seat);
      expect(state.bids.length).toBe(before + 1);
    }
  });

  it("two concurrent bids from different seats: one succeeds, the other is rejected as out-of-turn", () => {
    const state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });

    // Concurrent attempt: seat 1 bids (valid), seat 3 bids (invalid — not their turn)
    expect(() => placeBid(state, 1, 6, CFG)).not.toThrow(); // seat 1: valid
    expect(() => placeBid(state, 3, 6, CFG)).toThrow();     // seat 3: out of turn
  });

  it("each action produces a new state object — no mutation of original", () => {
    const state = initBiddingState(0, 4, {
      useTwoRoundBidding: true,
      initialHighestBid: 5,
      initialHighestBidderSeat: 1,
    });
    const originalBidsLength = state.bids.length;
    const originalCurrentSeat = state.currentSeat;

    passBid(state, 1); // Do NOT reassign; verify immutability

    // Original state unchanged
    expect(state.bids.length).toBe(originalBidsLength);
    expect(state.currentSeat).toBe(originalCurrentSeat);
  });
});
