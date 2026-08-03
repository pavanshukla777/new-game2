/**
 * Validation chain unit tests — Vol 6 Part 3.
 *
 * Tests every exported function from socket/validation.ts in isolation.
 * No DB, no socket, no engine state — pure unit tests.
 *
 * Covers:
 *   - validateMatchState  (Step 2)
 *   - validateTurn        (Step 3)
 *   - validateAction      (Step 4)
 *   - validateBidRule     (Step 5 — bid)
 *   - validatePrimaryBidRule (Step 5 — primary bid)
 *   - validateTrumpRule   (Step 5 — trump)
 *   - validateCardRule    (Step 5 — card)
 *   - runValidationChain  (Steps 2–4 composed)
 *   - VALID_ACTIONS_BY_PHASE exhaustive mapping
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Server Validation"
 * [RULE-007] Identity → Match State → Turn Ownership → Action Legality →
 *            Rule Compliance → State Update → Client Sync
 */

import { describe, it, expect } from "vitest";
import {
  validateMatchState,
  validateTurn,
  validateAction,
  validateBidRule,
  validatePrimaryBidRule,
  validateTrumpRule,
  validateCardRule,
  runValidationChain,
  VALID_ACTIONS_BY_PHASE,
} from "../socket/validation.js";
import type { ValidationContext } from "../socket/validation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    userId: "user-a",
    displayName: "Player A",
    gameId: "game-1",
    actionType: "bid",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// VALID_ACTIONS_BY_PHASE mapping
// ---------------------------------------------------------------------------

describe("VALID_ACTIONS_BY_PHASE", () => {
  it("primary_bid allows only 'bid' (no pass)", () => {
    expect(VALID_ACTIONS_BY_PHASE["primary_bid"]).toContain("bid");
    expect(VALID_ACTIONS_BY_PHASE["primary_bid"]).not.toContain("pass");
    expect(VALID_ACTIONS_BY_PHASE["primary_bid"]).not.toContain("select_trump");
    expect(VALID_ACTIONS_BY_PHASE["primary_bid"]).not.toContain("play_card");
  });

  it("bidding allows 'bid' and 'pass'", () => {
    expect(VALID_ACTIONS_BY_PHASE["bidding"]).toContain("bid");
    expect(VALID_ACTIONS_BY_PHASE["bidding"]).toContain("pass");
    expect(VALID_ACTIONS_BY_PHASE["bidding"]).not.toContain("play_card");
  });

  it("primary_trump_selection allows only 'select_trump'", () => {
    expect(VALID_ACTIONS_BY_PHASE["primary_trump_selection"]).toEqual(["select_trump"]);
  });

  it("trump_selection allows only 'select_trump'", () => {
    expect(VALID_ACTIONS_BY_PHASE["trump_selection"]).toEqual(["select_trump"]);
  });

  it("playing allows only 'play_card'", () => {
    expect(VALID_ACTIONS_BY_PHASE["playing"]).toEqual(["play_card"]);
  });

  it("dealing, trick_ended, round_ended, game_ended allow no actions", () => {
    expect(VALID_ACTIONS_BY_PHASE["dealing"]).toHaveLength(0);
    expect(VALID_ACTIONS_BY_PHASE["trick_ended"]).toHaveLength(0);
    expect(VALID_ACTIONS_BY_PHASE["round_ended"]).toHaveLength(0);
    expect(VALID_ACTIONS_BY_PHASE["game_ended"]).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Step 2 — validateMatchState
// ---------------------------------------------------------------------------

describe("validateMatchState — accepts valid states", () => {
  it("returns ok for a player in bidding phase", () => {
    const result = validateMatchState(makeCtx(), "bidding", 1, 1);
    expect(result.ok).toBe(true);
  });

  it("returns ok for a player in primary_bid phase", () => {
    const result = validateMatchState(makeCtx(), "primary_bid", 0, 0);
    expect(result.ok).toBe(true);
  });

  it("returns ok for a player in trump_selection phase", () => {
    const result = validateMatchState(makeCtx({ actionType: "select_trump" }), "trump_selection", 2, 0);
    expect(result.ok).toBe(true);
  });

  it("returns ok for a player in playing phase", () => {
    const result = validateMatchState(makeCtx({ actionType: "play_card" }), "playing", 3, 1);
    expect(result.ok).toBe(true);
  });

  it("context fields are carried into the returned MatchStateContext", () => {
    const result = validateMatchState(makeCtx(), "bidding", 2, 1);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.userId).toBe("user-a");
    expect(result.value.gameId).toBe("game-1");
    expect(result.value.seat).toBe(2);
    expect(result.value.team).toBe(1);
    expect(result.value.phase).toBe("bidding");
  });
});

describe("validateMatchState — rejects invalid states", () => {
  it("rejects when phase is 'game_ended'", () => {
    const result = validateMatchState(makeCtx(), "game_ended", 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("GAME_ALREADY_ENDED");
  });

  it("rejects when phase is 'dealing'", () => {
    const result = validateMatchState(makeCtx(), "dealing", 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("GAME_DEALING_IN_PROGRESS");
  });

  it("rejects when seat is null (player not registered)", () => {
    const result = validateMatchState(makeCtx(), "bidding", null, null);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("NOT_A_PLAYER");
  });

  it("rejects when team is null even if seat is valid", () => {
    const result = validateMatchState(makeCtx(), "bidding", 1, null);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("NOT_A_PLAYER");
  });

  it("rejects when seat is out of range (> 5)", () => {
    const result = validateMatchState(makeCtx(), "bidding", 6, 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("INVALID_SEAT");
  });

  it("rejects when seat is negative", () => {
    const result = validateMatchState(makeCtx(), "bidding", -1, 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("INVALID_SEAT");
  });
});

// ---------------------------------------------------------------------------
// Step 3 — validateTurn
// ---------------------------------------------------------------------------

describe("validateTurn", () => {
  function makeMatchCtx(seat: number) {
    const r = validateMatchState(makeCtx(), "bidding", seat, seat % 2 as 0 | 1);
    if (!r.ok) throw new Error("Expected ok");
    return r.value;
  }

  it("returns ok when seat matches currentSeat", () => {
    const ctx = makeMatchCtx(2);
    const result = validateTurn(ctx, 2);
    expect(result.ok).toBe(true);
  });

  it("sets isCurrentActor to true on success", () => {
    const ctx = makeMatchCtx(1);
    const result = validateTurn(ctx, 1);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.isCurrentActor).toBe(true);
  });

  it("returns NOT_YOUR_TURN when seat doesn't match currentSeat", () => {
    const ctx = makeMatchCtx(1);
    const result = validateTurn(ctx, 2); // expected seat 2, not 1
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("NOT_YOUR_TURN");
  });

  it("returns NOT_YOUR_TURN for every wrong seat (0–5 except current)", () => {
    const ctx = makeMatchCtx(3);
    for (const seat of [0, 1, 2, 4, 5]) {
      const result = validateTurn(ctx, seat);
      expect(result.ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Step 4 — validateAction
// ---------------------------------------------------------------------------

describe("validateAction", () => {
  function makeTurnCtx(phase: Parameters<typeof validateMatchState>[1], actionType: Parameters<typeof makeCtx>[0]["actionType"]) {
    const matchResult = validateMatchState(makeCtx({ actionType }), phase, 1, 1);
    if (!matchResult.ok) throw new Error("Expected ok: " + JSON.stringify(matchResult));
    const turnResult = validateTurn(matchResult.value, 1);
    if (!turnResult.ok) throw new Error("Expected ok");
    return turnResult.value;
  }

  it("accepts 'bid' in primary_bid phase", () => {
    const ctx = makeTurnCtx("primary_bid", "bid");
    expect(validateAction(ctx).ok).toBe(true);
  });

  it("accepts 'bid' in bidding phase", () => {
    const ctx = makeTurnCtx("bidding", "bid");
    expect(validateAction(ctx).ok).toBe(true);
  });

  it("accepts 'pass' in bidding phase", () => {
    const ctx = makeTurnCtx("bidding", "pass");
    expect(validateAction(ctx).ok).toBe(true);
  });

  it("accepts 'select_trump' in primary_trump_selection phase", () => {
    const ctx = makeTurnCtx("primary_trump_selection", "select_trump");
    expect(validateAction(ctx).ok).toBe(true);
  });

  it("accepts 'select_trump' in trump_selection phase", () => {
    const ctx = makeTurnCtx("trump_selection", "select_trump");
    expect(validateAction(ctx).ok).toBe(true);
  });

  it("accepts 'play_card' in playing phase", () => {
    const ctx = makeTurnCtx("playing", "play_card");
    expect(validateAction(ctx).ok).toBe(true);
  });

  it("rejects 'pass' in primary_bid phase (no passing the primary bid)", () => {
    const ctx = makeTurnCtx("primary_bid", "pass");
    const result = validateAction(ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("primary_bid");
  });

  it("rejects 'bid' in trump_selection phase", () => {
    const ctx = makeTurnCtx("trump_selection", "bid");
    expect(validateAction(ctx).ok).toBe(false);
  });

  it("rejects 'play_card' in bidding phase", () => {
    const ctx = makeTurnCtx("bidding", "play_card");
    expect(validateAction(ctx).ok).toBe(false);
  });

  it("rejects 'select_trump' in playing phase", () => {
    const ctx = makeTurnCtx("playing", "select_trump");
    expect(validateAction(ctx).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Step 5 — validateBidRule
// ---------------------------------------------------------------------------

describe("validateBidRule — accepts valid bids", () => {
  it("accepts bid of 5 when no prior bids (highestBid=0)", () => {
    expect(validateBidRule(5, 0).ok).toBe(true);
  });

  it("accepts bid of 6 when highestBid=5", () => {
    expect(validateBidRule(6, 5).ok).toBe(true);
  });

  it("accepts bid of 7 when highestBid=6", () => {
    expect(validateBidRule(7, 6).ok).toBe(true);
  });

  it("accepts bid of 8 when highestBid=7", () => {
    expect(validateBidRule(8, 7).ok).toBe(true);
  });

  it("returns ok=true and value=amount on success", () => {
    const result = validateBidRule(7, 6);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value).toBe(7);
  });
});

describe("validateBidRule — rejects invalid bids", () => {
  it("rejects bid of 4 (below minimum of 5)", () => {
    const result = validateBidRule(4, 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("4");
  });

  it("rejects bid of 9 (above maximum of 8)", () => {
    expect(validateBidRule(9, 0).ok).toBe(false);
  });

  it("rejects bid of 0", () => {
    expect(validateBidRule(0, 0).ok).toBe(false);
  });

  it("rejects bid equal to currentHighestBid (must be strictly higher)", () => {
    const result = validateBidRule(6, 6);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("BID_NOT_HIGHER");
  });

  it("rejects bid below currentHighestBid", () => {
    expect(validateBidRule(5, 7).ok).toBe(false);
  });

  it("rejects bid of 8 when highestBid is already 8 (no room to raise)", () => {
    expect(validateBidRule(8, 8).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Step 5 — validatePrimaryBidRule
// ---------------------------------------------------------------------------

describe("validatePrimaryBidRule", () => {
  it("accepts exactly 5 (the mandatory primary bid amount)", () => {
    const result = validatePrimaryBidRule(5, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value).toBe(5);
  });

  it("rejects 6 (must be exactly 5)", () => {
    expect(validatePrimaryBidRule(6, 5).ok).toBe(false);
  });

  it("rejects 4 (must be exactly 5)", () => {
    expect(validatePrimaryBidRule(4, 5).ok).toBe(false);
  });

  it("rejects 0", () => {
    expect(validatePrimaryBidRule(0, 5).ok).toBe(false);
  });

  it("error message contains the required amount", () => {
    const result = validatePrimaryBidRule(7, 5);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("5");
  });
});

// ---------------------------------------------------------------------------
// Step 5 — validateTrumpRule
// ---------------------------------------------------------------------------

describe("validateTrumpRule", () => {
  it("accepts 'S' (Spades)", () => {
    expect(validateTrumpRule("S", false).ok).toBe(true);
  });

  it("accepts 'H' (Hearts)", () => {
    expect(validateTrumpRule("H", false).ok).toBe(true);
  });

  it("accepts 'D' (Diamonds)", () => {
    expect(validateTrumpRule("D", false).ok).toBe(true);
  });

  it("accepts 'C' (Clubs)", () => {
    expect(validateTrumpRule("C", false).ok).toBe(true);
  });

  it("rejects empty string when allowNoTrump=false", () => {
    const result = validateTrumpRule("", false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("NO_TRUMP_NOT_ALLOWED");
  });

  it("rejects 'none' string when allowNoTrump=false", () => {
    expect(validateTrumpRule("none", false).ok).toBe(false);
  });

  it("accepts empty string when allowNoTrump=true", () => {
    expect(validateTrumpRule("", true).ok).toBe(true);
  });

  it("rejects invalid suit 'X'", () => {
    const result = validateTrumpRule("X", false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("INVALID_TRUMP_SUIT");
  });

  it("rejects lowercase suit 's' (case-sensitive)", () => {
    expect(validateTrumpRule("s", false).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Step 5 — validateCardRule
// ---------------------------------------------------------------------------

describe("validateCardRule", () => {
  it("accepts a card that is in the legal moves list", () => {
    const result = validateCardRule("AH", ["AH", "KH", "QH"]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value).toBe("AH");
  });

  it("rejects a card not in the legal moves list", () => {
    const result = validateCardRule("7C", ["AH", "KH"]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("CARD_NOT_LEGAL");
  });

  it("rejects any card when legalMoves is empty", () => {
    const result = validateCardRule("AH", []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("NO_LEGAL_MOVES");
  });
});

// ---------------------------------------------------------------------------
// runValidationChain — Steps 2–4 composed
// ---------------------------------------------------------------------------

describe("runValidationChain — happy path", () => {
  it("succeeds for a valid bid action", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "bidding",
      seat: 2,
      team: 0,
      currentSeat: 2,
    });
    expect(result.ok).toBe(true);
  });

  it("succeeds for 'pass' in bidding phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "pass" }),
      phase: "bidding",
      seat: 1,
      team: 1,
      currentSeat: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("succeeds for 'bid' in primary_bid phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "primary_bid",
      seat: 1,
      team: 1,
      currentSeat: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("succeeds for 'select_trump' in trump_selection phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "select_trump" }),
      phase: "trump_selection",
      seat: 2,
      team: 0,
      currentSeat: 2,
    });
    expect(result.ok).toBe(true);
  });

  it("returns TurnContext with isCurrentActor=true on success", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "bidding",
      seat: 3,
      team: 1,
      currentSeat: 3,
    });
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.isCurrentActor).toBe(true);
    expect(result.value.seat).toBe(3);
  });
});

describe("runValidationChain — Step 2 failure (Match State)", () => {
  it("fails when phase is game_ended", () => {
    const result = runValidationChain({
      context: makeCtx(),
      phase: "game_ended",
      seat: 0,
      team: 0,
      currentSeat: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("GAME_ALREADY_ENDED");
  });

  it("fails when player is not registered (seat null)", () => {
    const result = runValidationChain({
      context: makeCtx(),
      phase: "bidding",
      seat: null,
      team: null,
      currentSeat: 0,
    });
    expect(result.ok).toBe(false);
  });
});

describe("runValidationChain — Step 3 failure (Turn)", () => {
  it("fails with NOT_YOUR_TURN when wrong seat tries to act", () => {
    // Seat 1 is acting but currentSeat is 2 (seat 2's turn)
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "bidding",
      seat: 1,
      team: 1,
      currentSeat: 2,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("NOT_YOUR_TURN");
  });

  it("fails for every seat except the current one in 4-player game", () => {
    for (const wrongSeat of [0, 2, 3]) {
      const result = runValidationChain({
        context: makeCtx({ actionType: "bid" }),
        phase: "bidding",
        seat: wrongSeat,
        team: (wrongSeat % 2) as 0 | 1,
        currentSeat: 1,
      });
      expect(result.ok).toBe(false);
    }
  });
});

describe("runValidationChain — Step 4 failure (Action)", () => {
  it("fails when 'pass' is attempted in primary_bid phase", () => {
    // primary_bid does not allow 'pass'
    const result = runValidationChain({
      context: makeCtx({ actionType: "pass" }),
      phase: "primary_bid",
      seat: 1,
      team: 1,
      currentSeat: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toContain("primary_bid");
  });

  it("fails when 'play_card' is attempted in bidding phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "play_card" }),
      phase: "bidding",
      seat: 2,
      team: 0,
      currentSeat: 2,
    });
    expect(result.ok).toBe(false);
  });

  it("fails when 'bid' is attempted in playing phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "playing",
      seat: 0,
      team: 0,
      currentSeat: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("fails when 'bid' is attempted in trump_selection phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "trump_selection",
      seat: 1,
      team: 1,
      currentSeat: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("chain short-circuits: Step 2 failure does not reach Step 3 or 4", () => {
    // Wrong phase AND wrong seat AND wrong action: error must be from Step 2
    const result = runValidationChain({
      context: makeCtx({ actionType: "play_card" }),
      phase: "game_ended",
      seat: 99, // also invalid
      team: 0,
      currentSeat: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should be false");
    expect(result.error).toBe("GAME_ALREADY_ENDED"); // Step 2 error, not Step 3/4
  });
});
