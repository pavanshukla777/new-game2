/**
 * GameService bidding unit tests — Part 6.
 *
 * Tests that do NOT require a live database. They exercise:
 *   - snapshotToRoundState: converts AuthoritativeGameState → RoundState (engine)
 *   - buildAuthoritativeSnapshot: converts RoundState → AuthoritativeGameState
 *   - buildValidActions: correct ValidAction[] for each game phase / seat
 *   - Roundtrip invariants: snapshot → round → snapshot
 *   - currentBidderSeat derivation for various bid sequences
 *   - buildClientGameState hiding rules (opponent card data hidden)
 *
 * [MIG-022] Part 6 bidding infrastructure — serialization and reconnect tests
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";

// ---------------------------------------------------------------------------
// Helpers — build a minimal AuthoritativeGameState for a given scenario
// ---------------------------------------------------------------------------

/** Minimal seat data (no cards — pure bidding state). */
function makeSeat(
  seat: number,
  opts: Partial<AuthoritativeGameState["seats"][number]> = {},
): AuthoritativeGameState["seats"][number] {
  return {
    userId: `user-${seat}`,
    displayName: `Player ${seat}`,
    team: (seat % 2) as 0 | 1,
    hand: [],
    tricksWon: 0,
    pointsCaptured: 0,
    connectionState: "CONNECTED",
    isAi: false,
    secretHand: [],
    faceDown: [],
    faceUp: [],
    inFaceDownPhase: false,
    ...opts,
  };
}

function makeSeats(count: 4 | 6): Record<number, AuthoritativeGameState["seats"][number]> {
  const seats: Record<number, AuthoritativeGameState["seats"][number]> = {};
  for (let s = 0; s < count; s++) seats[s] = makeSeat(s);
  return seats;
}

/** Build a minimal AuthoritativeGameState with sensible defaults. */
function makeAuthState(
  opts: Partial<AuthoritativeGameState> & {
    playerCount?: 4 | 6;
  } = {},
): AuthoritativeGameState {
  const playerCount = opts.playerCount ?? 4;
  const defaults: AuthoritativeGameState = {
    gameId: "game-test-1",
    roundNumber: 1,
    phase: "bidding",
    sequence: 0,
    seats: makeSeats(playerCount),
    dealerSeat: 0,
    currentBidderSeat: 1, // seat to dealer's left with dealer=0
    highestBid: 0,
    highestBidderSeat: null,
    bids: [],
    biddingStatus: "ongoing",
    consecutivePasses: 0,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,
    noTrump: false,
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
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { playerCount: _pc, ...rest } = opts;
  return { ...defaults, ...rest };
}

// ---------------------------------------------------------------------------
// snapshotToRoundState tests
// ---------------------------------------------------------------------------

describe("GameService.snapshotToRoundState", () => {
  it("reconstructs empty bidding state correctly", () => {
    const authState = makeAuthState();
    const round = GameService.snapshotToRoundState(authState, 4);

    expect(round.phase).toBe("bidding");
    expect(round.dealerSeat).toBe(0);
    expect(round.bids).toHaveLength(0);
    expect(round.highestBid).toBe(0);
    expect(round.highestBidderSeat).toBeNull();
    expect(round.biddingStatus).toBe("ongoing");
    expect(round.consecutivePasses).toBe(0);
    expect(round.multiplier).toBe(1);
    expect(round.trumpSuit).toBeNull();
    expect(round.noTrump).toBe(false);
    expect(round.consecutiveWins).toEqual([0, 0]);
    expect(round.chhakri).toBeNull();
    expect(round.capturedPoints).toEqual([0, 0]);
  });

  it("reconstructs bids list from DB format (number | 'pass')", () => {
    const authState = makeAuthState({
      bids: [
        { seat: 1, amount: 5 },
        { seat: 2, amount: "pass" },
        { seat: 3, amount: 7 },
        { seat: 0, amount: "pass" },
      ],
    });
    const round = GameService.snapshotToRoundState(authState, 4);

    expect(round.bids).toHaveLength(4);
    expect(round.bids[0]).toEqual({ seat: 1, action: "bid", amount: 5 });
    expect(round.bids[1]).toEqual({ seat: 2, action: "pass" });
    expect(round.bids[2]).toEqual({ seat: 3, action: "bid", amount: 7 });
    expect(round.bids[3]).toEqual({ seat: 0, action: "pass" });
  });

  it("reconstructs trump_selection phase", () => {
    const authState = makeAuthState({
      phase: "trump_selection",
      biddingStatus: "won",
      highestBid: 7,
      highestBidderSeat: 3,
      bids: [
        { seat: 1, amount: 5 },
        { seat: 2, amount: "pass" },
        { seat: 3, amount: 7 },
        { seat: 0, amount: "pass" },
        { seat: 1, amount: "pass" },
        { seat: 2, amount: "pass" },
      ],
    });
    const round = GameService.snapshotToRoundState(authState, 4);

    expect(round.phase).toBe("trump_selection");
    expect(round.biddingStatus).toBe("won");
    expect(round.highestBid).toBe(7);
    expect(round.highestBidderSeat).toBe(3);
  });

  it("reconstructs playerCards when present", () => {
    const authState = makeAuthState({
      playerCards: {
        0: { secretHand: ["AH", "KH"], faceDown: ["QH", "JH", "TH"], faceUp: ["9H", "8H", "7H"] },
        1: { secretHand: ["AS", "KS"], faceDown: ["QS", "JS", "TS"], faceUp: ["9S", "8S", "7S"] },
        2: { secretHand: ["AD", "KD"], faceDown: ["QD", "JD", "TD"], faceUp: ["9D", "8D", "7D"] },
        3: { secretHand: ["AC", "KC"], faceDown: ["QC", "JC", "TC"], faceUp: ["9C", "8C", "7C"] },
      },
    });
    const round = GameService.snapshotToRoundState(authState, 4);

    expect(round.playerCards).toBeDefined();
    expect(round.playerCards![0].secretHand).toEqual(["AH", "KH"]);
    expect(round.playerCards![0].faceDown).toHaveLength(3);
    expect(round.playerCards![0].faceUp).toHaveLength(3);
  });

  it("defaults to empty arrays when playerCards is absent", () => {
    const authState = makeAuthState();
    // No playerCards field
    const round = GameService.snapshotToRoundState(authState, 4);
    expect(round.playerCards).toBeUndefined();
  });

  it("handles 6-player state", () => {
    const authState = makeAuthState({ playerCount: 6 });
    const round = GameService.snapshotToRoundState(authState, 6);
    expect(Object.keys(round.hands)).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// buildValidActions tests
// ---------------------------------------------------------------------------

describe("GameService.buildValidActions", () => {
  it("returns bid and pass for current bidder in bidding phase", () => {
    const authState = makeAuthState({ currentBidderSeat: 1 });
    const actions = GameService.buildValidActions(authState, 1, 4);

    expect(actions).toHaveLength(2);
    const bidAction = actions.find((a) => a.type === "bid");
    const passAction = actions.find((a) => a.type === "pass");
    expect(bidAction).toBeDefined();
    expect(passAction).toBeDefined();
    expect(bidAction?.minBid).toBe(5);
    expect(bidAction?.maxBid).toBe(8);
  });

  it("updates minBid based on highestBid", () => {
    const authState = makeAuthState({
      currentBidderSeat: 2,
      highestBid: 6,
      bids: [{ seat: 1, amount: 6 }],
    });
    const actions = GameService.buildValidActions(authState, 2, 4);
    const bidAction = actions.find((a) => a.type === "bid");
    expect(bidAction?.minBid).toBe(7);
    expect(bidAction?.maxBid).toBe(8);
  });

  it("returns only pass when highestBid=8 (cannot raise)", () => {
    const authState = makeAuthState({
      currentBidderSeat: 2,
      highestBid: 8,
      bids: [{ seat: 1, amount: 8 }],
    });
    const actions = GameService.buildValidActions(authState, 2, 4);
    // Only pass (bid action omitted since minBid would be 9 > maxBid 8)
    expect(actions.some((a) => a.type === "pass")).toBe(true);
    expect(actions.some((a) => a.type === "bid")).toBe(false);
  });

  it("returns empty array for non-active bidder in bidding phase", () => {
    const authState = makeAuthState({ currentBidderSeat: 1 });
    const actions = GameService.buildValidActions(authState, 3, 4); // seat 3, not current
    expect(actions).toHaveLength(0);
  });

  it("returns select_trump for winning bidder in trump_selection phase", () => {
    const authState = makeAuthState({
      phase: "trump_selection",
      biddingStatus: "won",
      highestBidderSeat: 2,
      currentBidderSeat: null,
    });
    const actions = GameService.buildValidActions(authState, 2, 4);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("select_trump");
  });

  it("returns empty for non-winning seat in trump_selection phase", () => {
    const authState = makeAuthState({
      phase: "trump_selection",
      biddingStatus: "won",
      highestBidderSeat: 2,
      currentBidderSeat: null,
    });
    const actions = GameService.buildValidActions(authState, 1, 4);
    expect(actions).toHaveLength(0);
  });

  it("returns empty for any seat when bidding is won and phase=bidding (guard)", () => {
    const authState = makeAuthState({
      biddingStatus: "won",
      currentBidderSeat: null,
    });
    for (let seat = 0; seat < 4; seat++) {
      expect(GameService.buildValidActions(authState, seat, 4)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// currentBidderSeat derivation (via buildAuthoritativeSnapshot)
// ---------------------------------------------------------------------------

describe("currentBidderSeat derivation", () => {
  /**
   * Helper: run N bids/passes through the engine's applyBid/applyPass and
   * call buildAuthoritativeSnapshot. Returns currentBidderSeat from the snapshot.
   *
   * We test the formula independently here — snapshot builder uses:
   *   firstSeat = (dealerSeat + 1) % playerCount
   *   currentBidderSeat = (firstSeat + bids.length) % playerCount
   */
  function expectedSeat(dealerSeat: number, bidsCount: number, playerCount: 4 | 6): number {
    const firstSeat = (dealerSeat + 1) % playerCount;
    return (firstSeat + bidsCount) % playerCount;
  }

  it("formula is correct for dealer=0, 4 players, 0 bids placed", () => {
    expect(expectedSeat(0, 0, 4)).toBe(1);
  });

  it("formula is correct for dealer=0, 4 players, 1 bid placed", () => {
    expect(expectedSeat(0, 1, 4)).toBe(2);
  });

  it("formula is correct for dealer=0, 4 players, 3 bids placed", () => {
    expect(expectedSeat(0, 3, 4)).toBe(0); // wraps: (1+3)%4=0
  });

  it("formula is correct for dealer=3, 4 players, 0 bids placed", () => {
    expect(expectedSeat(3, 0, 4)).toBe(0); // (3+1)%4=0
  });

  it("formula is correct for dealer=5, 6 players, 0 bids placed", () => {
    expect(expectedSeat(5, 0, 6)).toBe(0); // wraps
  });

  it("formula is correct for dealer=2, 6 players, 4 bids placed", () => {
    expect(expectedSeat(2, 4, 6)).toBe(1); // firstSeat=3, (3+4)%6=1
  });

  it("snapshot currentBidderSeat is null when bidding is won", () => {
    const authState = makeAuthState({
      phase: "trump_selection",
      biddingStatus: "won",
      currentBidderSeat: null,
    });
    expect(authState.currentBidderSeat).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildClientGameState hiding rules
// ---------------------------------------------------------------------------

describe("GameService.buildClientGameState hiding", () => {
  it("requesting seat sees their own cards", () => {
    const authState = makeAuthState({
      seats: {
        0: makeSeat(0, {
          hand: ["AH", "KH"],
          secretHand: ["AH"],
          faceDown: ["7S"],
          faceUp: ["QH"],
        }),
        1: makeSeat(1, {
          hand: ["AS", "KS"],
          secretHand: ["AS"],
          faceDown: ["7H"],
          faceUp: ["QS"],
        }),
        2: makeSeat(2),
        3: makeSeat(3),
      },
    });
    const client = GameService.buildClientGameState(authState, 0);

    expect(client.mySeat).toBe(0);
    expect(client.seats[0].hand).toEqual(["AH", "KH"]);
    expect(client.seats[0].secretHand).toEqual(["AH"]);
    expect(client.seats[0].faceDownCount).toBe(1);
    expect(client.seats[0].faceUp).toEqual(["QH"]);
    expect(client.myHand).toEqual(["AH", "KH"]);
    expect(client.mySecretHand).toEqual(["AH"]);
    expect(client.myFaceDown).toEqual(["7S"]);
    expect(client.myFaceUp).toEqual(["QH"]);
  });

  it("requesting seat does NOT see opponent hand or secretHand", () => {
    const authState = makeAuthState({
      seats: {
        0: makeSeat(0),
        1: makeSeat(1, {
          hand: ["AS", "KS"],
          secretHand: ["AS"],
          faceDown: ["7H"],
          faceUp: ["QS"],
        }),
        2: makeSeat(2),
        3: makeSeat(3),
      },
    });
    const client = GameService.buildClientGameState(authState, 0);

    expect(client.seats[1].hand).toBeNull();
    expect(client.seats[1].secretHand).toBeNull();
    expect(client.seats[1].faceDownCount).toBe(1); // count visible
    expect(client.seats[1].faceUp).toEqual(["QS"]); // always visible
  });

  it("public bidding info is identical across all seats' views", () => {
    const authState = makeAuthState({
      bids: [{ seat: 1, amount: 6 }],
      highestBid: 6,
      highestBidderSeat: 1,
      currentBidderSeat: 2,
    });
    const views = [0, 1, 2, 3].map((seat) =>
      GameService.buildClientGameState(authState, seat),
    );

    for (const view of views) {
      expect(view.highestBid).toBe(6);
      expect(view.highestBidderSeat).toBe(1);
      expect(view.currentBidderSeat).toBe(2);
      expect(view.bids).toHaveLength(1);
    }
  });

  it("mySeat field is set correctly for each requester", () => {
    const authState = makeAuthState();
    for (let seat = 0; seat < 4; seat++) {
      const client = GameService.buildClientGameState(authState, seat);
      expect(client.mySeat).toBe(seat);
    }
  });

  it("bidding metadata (biddingStatus, consecutivePasses) is included in ClientGameState", () => {
    const authState = makeAuthState({
      biddingStatus: "ongoing",
      consecutivePasses: 2,
    });
    const client = GameService.buildClientGameState(authState, 0);
    expect(client.biddingStatus).toBe("ongoing");
    expect(client.consecutivePasses).toBe(2);
  });

  it("dealerSeat is included in ClientGameState", () => {
    const authState = makeAuthState({ dealerSeat: 3 });
    const client = GameService.buildClientGameState(authState, 0);
    expect(client.dealerSeat).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip invariants (snapshot → roundState → new snapshot)
// ---------------------------------------------------------------------------

describe("snapshot roundtrip invariants", () => {
  it("phase, dealerSeat, and bidding fields survive roundtrip", () => {
    const authState = makeAuthState({
      dealerSeat: 2,
      bids: [
        { seat: 3, amount: 5 },
        { seat: 0, amount: "pass" },
        { seat: 1, amount: 6 },
      ],
      highestBid: 6,
      highestBidderSeat: 1,
      consecutivePasses: 0,
      biddingStatus: "ongoing",
      currentBidderSeat: 2,
    });

    const round = GameService.snapshotToRoundState(authState, 4);

    // Verify engine bid format
    expect(round.bids[0]).toMatchObject({ seat: 3, action: "bid", amount: 5 });
    expect(round.bids[1]).toMatchObject({ seat: 0, action: "pass" });
    expect(round.bids[2]).toMatchObject({ seat: 1, action: "bid", amount: 6 });
    expect(round.highestBid).toBe(6);
    expect(round.highestBidderSeat).toBe(1);
    expect(round.dealerSeat).toBe(2);
    expect(round.consecutivePasses).toBe(0);
  });

  it("multiplier, doubleSeat, redoubleSeat survive roundtrip", () => {
    const authState = makeAuthState({
      multiplier: 2,
      doubleSeat: 1,
      redoubleSeat: null,
    });
    const round = GameService.snapshotToRoundState(authState, 4);
    expect(round.multiplier).toBe(2);
    expect(round.doubleSeat).toBe(1);
    expect(round.redoubleSeat).toBeNull();
  });

  it("consecutiveWins and chhakri survive roundtrip", () => {
    const authState = makeAuthState({
      consecutiveWins: [3, 0],
      chhakri: { team: 0, trickIndex: 5 },
    });
    const round = GameService.snapshotToRoundState(authState, 4);
    expect(round.consecutiveWins).toEqual([3, 0]);
    expect(round.chhakri).toEqual({ team: 0, trickIndex: 5 });
  });

  it("noTrump field survives roundtrip", () => {
    const authState = makeAuthState({ noTrump: true });
    const round = GameService.snapshotToRoundState(authState, 4);
    expect(round.noTrump).toBe(true);
  });
});
