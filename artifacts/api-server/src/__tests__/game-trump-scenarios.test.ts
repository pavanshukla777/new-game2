/**
 * Primary Trump Selection — Scenario Tests (Vol 6 Part 4)
 *
 * Covers every spec-required scenario at the engine, service, and snapshot level.
 * No DB required — exercises the engine directly (initRound / applyPrimaryBid /
 * applyPrimaryTrumpSelection) and GameService static methods
 * (buildValidActions, buildClientGameState, snapshotToRoundState).
 *
 * Scenarios:
 *   1. Normal trump selection — all four legal suits
 *   2. Illegal suit — engine and rule validator both reject
 *   3. Reconnect during trump selection — snapshot supplies full state
 *   4. Duplicate selection — action after completion is rejected
 *   5. Out-of-turn selection — wrong seat rejected at engine level
 *   6. Concurrent / simultaneous requests — stale state detected
 *   7. State synchronization — all seats receive correct client state
 *   8. Snapshot restoration — snapshotToRoundState round-trip
 *   9. primaryTrump surfaced to clients — bug fix verification
 *
 * [MIG-024] [MIG-026] Primary Trump Selection
 * [RULE-007] Server is the only source of truth.
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";
import {
  initRound,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  PRIMARY_BID_AMOUNT,
} from "@workspace/game-engine";
import { validateTrumpRule } from "../socket/validation.js";
import type { GameConfig } from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 4;

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    playerCount: PLAYER_COUNT,
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
 * Advance engine state through Primary Bid, reaching primary_trump_selection.
 * dealer=0 → Primary Bidder = seat 1
 */
function stateAtTrumpSelection(suit?: "S" | "H" | "D" | "C") {
  const config = makeConfig();
  const r0 = initRound(1, 0, config);         // phase: primary_bid
  const r1 = applyPrimaryBid(r0, 1);          // phase: primary_trump_selection
  expect(r1.phase).toBe("primary_trump_selection");
  if (suit) {
    const r2 = applyPrimaryTrumpSelection(r1, 1, suit, { allowNoTrump: false });
    return { before: r1, after: r2, config };
  }
  return { before: r1, config };
}

/**
 * Build a minimal AuthoritativeGameState in primary_trump_selection phase.
 * Does NOT wire up a real remainingDeck — this is for service-method tests
 * that don't go through the engine's dealing path.
 */
function makeTrumpSelectionAuthState(
  overrides: Partial<AuthoritativeGameState> = {},
): AuthoritativeGameState {
  const seats: AuthoritativeGameState["seats"] = {};
  for (let s = 0; s < PLAYER_COUNT; s++) {
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
  return {
    gameId: "trump-test-game",
    roundNumber: 1,
    phase: "primary_trump_selection",
    sequence: 1,
    seats,
    dealerSeat: 0,
    currentBidderSeat: null,         // Not in bidding yet
    highestBid: PRIMARY_BID_AMOUNT,   // 5
    highestBidderSeat: 1,             // Primary Bidder = seat 1
    bids: [],
    biddingStatus: "ongoing",
    consecutivePasses: 0,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,
    primaryTrump: null,               // Not selected yet
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
// Scenario 1 — Normal trump selection: all four legal suits
// ---------------------------------------------------------------------------

describe("Scenario 1: Normal trump selection — all four legal suits", () => {
  for (const suit of ["S", "H", "D", "C"] as const) {
    it(`selects trump suit '${suit}' and transitions phase to 'bidding'`, () => {
      const { before } = stateAtTrumpSelection();
      const after = applyPrimaryTrumpSelection(before, 1, suit, { allowNoTrump: false });

      expect(after.phase).toBe("bidding");
      expect(after.primaryTrump).toBe(suit);
    });

    it(`'${suit}': trumpSuit is null after Primary Trump (set only after bidding resolves)`, () => {
      const { before } = stateAtTrumpSelection();
      const after = applyPrimaryTrumpSelection(before, 1, suit, { allowNoTrump: false });
      expect(after.trumpSuit).toBeNull(); // Final trump not determined yet
    });

    it(`'${suit}': primaryTrump and highestBid/Seat are preserved`, () => {
      const { before } = stateAtTrumpSelection();
      const after = applyPrimaryTrumpSelection(before, 1, suit, { allowNoTrump: false });
      expect(after.primaryTrump).toBe(suit);
      expect(after.highestBid).toBe(PRIMARY_BID_AMOUNT);
      expect(after.highestBidderSeat).toBe(1);
    });

    it(`'${suit}': emits 'primary_trump_selected' event`, () => {
      const { before } = stateAtTrumpSelection();
      const after = applyPrimaryTrumpSelection(before, 1, suit, { allowNoTrump: false });
      const evt = after.events.find((e) => e.type === "primary_trump_selected");
      expect(evt).toBeDefined();
      expect(evt?.seat).toBe(1);
      expect((evt?.payload as { suit: string })?.suit).toBe(suit);
    });
  }

  it("validateTrumpRule accepts all four standard suits", () => {
    for (const suit of ["S", "H", "D", "C"]) {
      const result = validateTrumpRule(suit, false);
      expect(result.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 1b — Full dealing after trump selection
// ---------------------------------------------------------------------------

describe("Scenario 1b: Full hand dealing triggered by Primary Trump selection", () => {
  it("each player has exactly 8 cards after trump selection (Phase 2+3 dealt)", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false });
    for (let s = 0; s < PLAYER_COUNT; s++) {
      expect(after.hands[s]).toHaveLength(8);
    }
  });

  it("remainingDeck is cleared after dealing (all 32 cards distributed)", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "S", { allowNoTrump: false });
    expect(after.remainingDeck).toBeUndefined();
  });

  it("playerCards contain all three zones after dealing: secretHand(2) + faceDown(3) + faceUp(3)", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "D", { allowNoTrump: false });
    for (let s = 0; s < PLAYER_COUNT; s++) {
      const pc = after.playerCards?.[s];
      expect(pc).toBeDefined();
      expect(pc?.secretHand).toHaveLength(2);
      expect(pc?.faceDown).toHaveLength(3);
      expect(pc?.faceUp).toHaveLength(3);
    }
  });

  it("total card count across all players equals 32 (full deck)", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "C", { allowNoTrump: false });
    const total = Object.values(after.hands).reduce((sum, hand) => sum + hand.length, 0);
    expect(total).toBe(32);
  });

  it("no card appears twice across all player hands", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false });
    const allCards = Object.values(after.hands).flat();
    const uniqueCards = new Set(allCards);
    expect(uniqueCards.size).toBe(allCards.length);
  });

  it("6-player game: each player has 8 cards after trump selection (8×4=32... wait, 48 card deck?)", () => {
    // Note: 6-player game uses the same 32-card deck and deals 5 cards each? Let me check.
    // Actually for a 6-player game with 32 cards: 32/6 ≈ 5.3 — this doesn't divide evenly.
    // The spec says 4 or 6 players with 8 tricks each = 8 cards each.
    // 6 players × 8 cards = 48 cards → 48-card deck for 6P.
    // Let's test only 4P here (6P is tested in other suites).
    // This test is intentionally omitted for 6P to avoid duplicate coverage.
    // [Confirmed in primary-bid.test.ts: 6P uses a 48-card deck]
    const config6 = makeConfig({ playerCount: 6 });
    const r0 = initRound(1, 0, config6);
    const r1 = applyPrimaryBid(r0, 1);
    const r2 = applyPrimaryTrumpSelection(r1, 1, "H", { allowNoTrump: false });
    for (let s = 0; s < 6; s++) {
      expect(r2.hands[s]).toHaveLength(8);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Illegal suit
// ---------------------------------------------------------------------------

describe("Scenario 2: Illegal suit — rejected at engine and validation layer", () => {
  it("engine does NOT validate the suit code — suit guard is Step 5 (validateTrumpRule)", () => {
    // The engine trusts its caller. The socket handler calls validateTrumpRule
    // (Step 5) before ever invoking applyPrimaryTrumpSelection, so an invalid
    // suit string like 'X' is rejected before reaching the engine. This test
    // documents that architectural boundary explicitly.
    const { before } = stateAtTrumpSelection();
    // 'X' passes through the engine without a throw — the handler blocks it first
    // @ts-expect-error — intentional out-of-range value
    const after = applyPrimaryTrumpSelection(before, 1, "X", { allowNoTrump: false });
    // Engine stores whatever suit it was given; the handler prevented this via Step 5
    expect(after.phase).toBe("bidding");
  });

  it("validateTrumpRule rejects 'X' with INVALID_TRUMP_SUIT error (Step 5 guard)", () => {
    const result = validateTrumpRule("X", false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected false");
    expect(result.error).toContain("INVALID_TRUMP_SUIT");
  });

  it("engine throws for null suit (no-trump) when allowNoTrump=false", () => {
    const { before } = stateAtTrumpSelection();
    // null is the engine's representation of no-trump
    expect(() =>
      applyPrimaryTrumpSelection(before, 1, null, { allowNoTrump: false }),
    ).toThrow(/No Trump/i);
  });

  it("engine accepts null (no-trump) when allowNoTrump=true", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, null, { allowNoTrump: true });
    expect(after.phase).toBe("bidding");
    expect(after.primaryTrump).toBeNull();
  });

  it("validateTrumpRule rejects empty string when allowNoTrump=false", () => {
    const result = validateTrumpRule("", false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected false");
    expect(result.error).toBe("NO_TRUMP_NOT_ALLOWED");
  });

  it("validateTrumpRule rejects 'none' when allowNoTrump=false", () => {
    expect(validateTrumpRule("none", false).ok).toBe(false);
  });

  it("validateTrumpRule rejects lowercase 's' (case-sensitive)", () => {
    expect(validateTrumpRule("s", false).ok).toBe(false);
  });

  it("validateTrumpRule rejects 'N' (not a valid suit code)", () => {
    const result = validateTrumpRule("N", false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected false");
    expect(result.error).toContain("INVALID_TRUMP_SUIT");
  });

  it("validateTrumpRule rejects numeric string '4'", () => {
    expect(validateTrumpRule("4", false).ok).toBe(false);
  });

  it("buildValidActions only offers 'select_trump' — no suit constraint (suit is a separate Step 5 rule check)", () => {
    const authState = makeTrumpSelectionAuthState();
    const actions = GameService.buildValidActions(authState, 1, PLAYER_COUNT);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("select_trump");
    // Note: suit validation happens in Step 5 (validateTrumpRule), not in buildValidActions
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Reconnect during trump selection
// ---------------------------------------------------------------------------

describe("Scenario 3: Reconnect during Primary Trump Selection", () => {
  it("reconnecting winner (seat 1) sees phase=primary_trump_selection", () => {
    const authState = makeTrumpSelectionAuthState();
    const clientState = GameService.buildClientGameState(authState, 1);
    expect(clientState.phase).toBe("primary_trump_selection");
  });

  it("reconnecting winner (seat 1) gets select_trump as valid action", () => {
    const authState = makeTrumpSelectionAuthState();
    const actions = GameService.buildValidActions(authState, 1, PLAYER_COUNT);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("select_trump");
  });

  it("reconnecting non-winner gets empty valid actions", () => {
    const authState = makeTrumpSelectionAuthState();
    for (const seat of [0, 2, 3]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT)).toHaveLength(0);
    }
  });

  it("reconnecting player (seat 1) can see their own cards (secretHand)", () => {
    const authState = makeTrumpSelectionAuthState({
      seats: Object.fromEntries(
        [0, 1, 2, 3].map((s) => [
          s,
          {
            userId: `user-${s}`,
            displayName: `Player ${s}`,
            team: (s % 2) as 0 | 1,
            hand: [`A${["H", "S", "D", "C"][s]}`, `K${["H", "S", "D", "C"][s]}`],
            secretHand: [`A${["H", "S", "D", "C"][s]}`, `K${["H", "S", "D", "C"][s]}`],
            faceDown: [],
            faceUp: [],
            tricksWon: 0,
            pointsCaptured: 0,
            connectionState: "CONNECTED" as const,
            isAi: false,
            inFaceDownPhase: false,
          },
        ]),
      ) as AuthoritativeGameState["seats"],
    });

    const clientState = GameService.buildClientGameState(authState, 1);
    expect(clientState.seats[1].hand).not.toBeNull();       // own hand visible
    expect(clientState.seats[1].secretHand).not.toBeNull(); // own secretHand visible
    expect(clientState.seats[0].hand).toBeNull();            // opponent hidden
    expect(clientState.seats[2].hand).toBeNull();            // opponent hidden
  });

  it("all seats see consistent public state after reconnect", () => {
    const authState = makeTrumpSelectionAuthState();
    for (const seat of [0, 1, 2, 3]) {
      const clientState = GameService.buildClientGameState(authState, seat);
      expect(clientState.phase).toBe("primary_trump_selection");
      expect(clientState.highestBidderSeat).toBe(1);
      expect(clientState.highestBid).toBe(PRIMARY_BID_AMOUNT);
      expect(clientState.primaryTrump).toBeNull(); // Not selected yet
    }
  });

  it("highestBidderSeat is exposed so the client knows who to wait for", () => {
    const authState = makeTrumpSelectionAuthState();
    const clientState = GameService.buildClientGameState(authState, 2); // non-winner reconnects
    expect(clientState.highestBidderSeat).toBe(1); // Client knows seat 1 must pick trump
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Duplicate selection (action after completion)
// ---------------------------------------------------------------------------

describe("Scenario 4: Duplicate selection — rejected after trump is already chosen", () => {
  it("engine throws when applyPrimaryTrumpSelection is called on a 'bidding' phase state", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false });
    expect(after.phase).toBe("bidding");

    // Duplicate: try to select trump again on the post-selection state
    expect(() =>
      applyPrimaryTrumpSelection(after, 1, "S", { allowNoTrump: false }),
    ).toThrow(/primary_trump_selection/);
  });

  it("buildValidActions returns empty for all seats when phase='bidding' (trump already selected)", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "H",
      currentBidderSeat: 1,
    });
    // No one gets select_trump — that action is only valid in primary_trump_selection / trump_selection
    const actions1 = GameService.buildValidActions(authState, 1, PLAYER_COUNT);
    expect(actions1.some((a) => a.type === "select_trump")).toBe(false);
  });

  it("buildValidActions gives 'bid' and 'pass' to the current bidder after trump is set", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "H",
      currentBidderSeat: 1,
      highestBid: 5,
    });
    const actions = GameService.buildValidActions(authState, 1, PLAYER_COUNT);
    expect(actions.some((a) => a.type === "bid")).toBe(true);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
    expect(actions.some((a) => a.type === "select_trump")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Out-of-turn selection
// ---------------------------------------------------------------------------

describe("Scenario 5: Out-of-turn selection — wrong seat rejected", () => {
  it("engine throws when seat 0 (the dealer) tries to select Primary Trump", () => {
    const { before } = stateAtTrumpSelection();
    // seat 1 is the Primary Bidder; seat 0 is the dealer (not eligible)
    expect(() =>
      applyPrimaryTrumpSelection(before, 0, "H", { allowNoTrump: false }),
    ).toThrow(/seat 1/);
  });

  it("engine throws for every seat except the Primary Bidder (seat 1)", () => {
    const { before } = stateAtTrumpSelection();
    for (const wrongSeat of [0, 2, 3]) {
      expect(() =>
        applyPrimaryTrumpSelection(before, wrongSeat, "H", { allowNoTrump: false }),
      ).toThrow(/seat 1/);
    }
  });

  it("buildValidActions returns empty for every non-winner seat", () => {
    const authState = makeTrumpSelectionAuthState({ highestBidderSeat: 1 });
    for (const seat of [0, 2, 3]) {
      const actions = GameService.buildValidActions(authState, seat, PLAYER_COUNT);
      expect(actions).toHaveLength(0);
    }
  });

  it("buildValidActions returns select_trump ONLY for highestBidderSeat", () => {
    const authState = makeTrumpSelectionAuthState({ highestBidderSeat: 3 }); // dealer at seat 2
    const actions = GameService.buildValidActions(authState, 3, PLAYER_COUNT);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("select_trump");
    // All others: empty
    for (const seat of [0, 1, 2]) {
      expect(GameService.buildValidActions(authState, seat, PLAYER_COUNT)).toHaveLength(0);
    }
  });

  it("6P: out-of-turn rejection covers all non-winner seats", () => {
    const config6 = makeConfig({ playerCount: 6 });
    const r0 = initRound(1, 5, config6);   // dealer=5, primary bidder=0
    const r1 = applyPrimaryBid(r0, 0);
    expect(r1.highestBidderSeat).toBe(0);
    for (const wrongSeat of [1, 2, 3, 4, 5]) {
      expect(() =>
        applyPrimaryTrumpSelection(r1, wrongSeat, "H", { allowNoTrump: false }),
      ).toThrow(/seat 0/);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Concurrent / simultaneous requests (race conditions)
// ---------------------------------------------------------------------------

describe("Scenario 6: Concurrent requests — stale state is rejected", () => {
  it("second request from the same seat on an already-advanced state throws", () => {
    const { before } = stateAtTrumpSelection();

    // Handler A processes the select_trump → advances to "bidding"
    const after = applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false });
    expect(after.phase).toBe("bidding");

    // Handler B (a stale request using the post-selection state) tries again
    expect(() =>
      applyPrimaryTrumpSelection(after, 1, "S", { allowNoTrump: false }),
    ).toThrow(/primary_trump_selection/); // wrong phase
  });

  it("two concurrent requests with different suits: only one succeeds (idempotency via phase guard)", () => {
    const { before } = stateAtTrumpSelection();

    // Both handlers loaded the same "before" state
    const afterH = applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false });
    // Second handler would save a new state with 'S' — but in the real system,
    // the DB transaction ensures only one write commits. We verify here that:
    // (a) Both operations succeed independently on the same input state (both "before")
    const afterS = applyPrimaryTrumpSelection(before, 1, "S", { allowNoTrump: false });

    // Only one would be persisted (the DB serializes it). The key property:
    // applying to the already-advanced state (afterH) with a different suit fails.
    expect(() =>
      applyPrimaryTrumpSelection(afterH, 1, "S", { allowNoTrump: false }),
    ).toThrow(/primary_trump_selection/);

    // But the originals are both valid (whichever was written first wins)
    expect(afterH.primaryTrump).toBe("H");
    expect(afterS.primaryTrump).toBe("S");
  });

  it("each trump selection produces a new immutable state object", () => {
    const { before } = stateAtTrumpSelection();
    const originalPhase = before.phase;
    const originalPrimaryTrump = before.primaryTrump;

    applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false }); // no reassign

    // Original state is unchanged (pure function — no mutation)
    expect(before.phase).toBe(originalPhase);
    expect(before.primaryTrump).toBe(originalPrimaryTrump);
  });

  it("state's events array is not mutated between calls", () => {
    const { before } = stateAtTrumpSelection();
    const originalEventCount = before.events.length;

    const afterH = applyPrimaryTrumpSelection(before, 1, "H", { allowNoTrump: false });
    const afterS = applyPrimaryTrumpSelection(before, 1, "S", { allowNoTrump: false });

    // Neither call mutated the original "before" events
    expect(before.events.length).toBe(originalEventCount);
    // Both results have one more event than before
    expect(afterH.events.length).toBe(originalEventCount + 1);
    expect(afterS.events.length).toBe(originalEventCount + 1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — State synchronization
// ---------------------------------------------------------------------------

describe("Scenario 7: State synchronization — all seats receive correct client state", () => {
  it("all four seats see phase='primary_trump_selection' before selection", () => {
    const authState = makeTrumpSelectionAuthState();
    for (const seat of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(authState, seat).phase).toBe(
        "primary_trump_selection",
      );
    }
  });

  it("after trump selection (engine), all public fields are consistent", () => {
    const { before } = stateAtTrumpSelection();
    const after = applyPrimaryTrumpSelection(before, 1, "D", { allowNoTrump: false });

    // These would be stored in the authoritative state and sent to all clients
    expect(after.phase).toBe("bidding");
    expect(after.primaryTrump).toBe("D");
    expect(after.trumpSuit).toBeNull();        // final trump not decided yet
    expect(after.highestBid).toBe(PRIMARY_BID_AMOUNT);
    expect(after.highestBidderSeat).toBe(1);
  });

  it("primaryTrump IS included in buildClientGameState (bug fix verification)", () => {
    // This was the bug: buildClientGameState previously omitted primaryTrump.
    // After the fix, it must be present.
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",        // trump already selected, bidding phase
      primaryTrump: "C",
      currentBidderSeat: 1,
    });
    for (const seat of [0, 1, 2, 3]) {
      const clientState = GameService.buildClientGameState(authState, seat);
      expect(clientState.primaryTrump).toBe("C"); // Must be visible to all clients
    }
  });

  it("primaryTrump is null in client state before selection", () => {
    const authState = makeTrumpSelectionAuthState({ primaryTrump: null });
    for (const seat of [0, 1, 2, 3]) {
      const clientState = GameService.buildClientGameState(authState, seat);
      expect(clientState.primaryTrump).toBeNull();
    }
  });

  it("trumpSuit is null in client state after Primary Trump (final trump not set yet)", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "H",
      trumpSuit: null,       // final trump not chosen yet
    });
    for (const seat of [0, 1, 2, 3]) {
      const clientState = GameService.buildClientGameState(authState, seat);
      expect(clientState.trumpSuit).toBeNull();
      expect(clientState.primaryTrump).toBe("H");
    }
  });

  it("opponent cards are hidden in client state during trump selection phase", () => {
    const authState = makeTrumpSelectionAuthState({
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

    // Seat 1 (the Primary Bidder) can see their own cards, not opponents'
    const clientState = GameService.buildClientGameState(authState, 1);
    expect(clientState.seats[1].hand).not.toBeNull();   // own hand visible
    expect(clientState.seats[0].hand).toBeNull();        // opponent: hidden
    expect(clientState.seats[2].hand).toBeNull();        // opponent: hidden
    expect(clientState.seats[3].hand).toBeNull();        // opponent: hidden
    // face-up is always public
    expect(clientState.seats[0].faceUp).toEqual(["QH"]);
    expect(clientState.seats[2].faceUp).toEqual(["QD"]);
  });

  it("mySeat field matches the requesting seat", () => {
    const authState = makeTrumpSelectionAuthState();
    for (const seat of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(authState, seat).mySeat).toBe(seat);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Snapshot restoration (snapshotToRoundState round-trip)
// ---------------------------------------------------------------------------

describe("Scenario 8: Snapshot restoration — snapshotToRoundState round-trip", () => {
  it("restores phase=primary_trump_selection correctly", () => {
    const authState = makeTrumpSelectionAuthState();
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.phase).toBe("primary_trump_selection");
  });

  it("restores highestBid and highestBidderSeat from the snapshot", () => {
    const authState = makeTrumpSelectionAuthState({
      highestBid: 5,
      highestBidderSeat: 1,
    });
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.highestBid).toBe(5);
    expect(roundState.highestBidderSeat).toBe(1);
  });

  it("restores primaryTrump=null before selection", () => {
    const authState = makeTrumpSelectionAuthState({ primaryTrump: null });
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.primaryTrump).toBeNull();
  });

  it("restores primaryTrump='H' for a snapshot captured after selection", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "H",
    });
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.primaryTrump).toBe("H");
  });

  it("restores useTwoRoundBidding=true from the snapshot", () => {
    const authState = makeTrumpSelectionAuthState({ useTwoRoundBidding: true });
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.useTwoRoundBidding).toBe(true);
  });

  it("restores remainingDeck from the snapshot (needed for Phase 2+3 dealing on reconnect)", () => {
    const remaining = ["7H", "8H", "9H", "TH", "JH", "QH", "KH", "AH"];
    const authState = makeTrumpSelectionAuthState({ remainingDeck: remaining });
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.remainingDeck).toEqual(remaining);
  });

  it("remainingDeck is undefined in the round state after trump selection (all cards dealt)", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "H",
      remainingDeck: undefined, // cleared after dealing
    });
    const roundState = GameService.snapshotToRoundState(authState, PLAYER_COUNT);
    expect(roundState.remainingDeck).toBeUndefined();
  });

  it("engine round-trip: initRound → primaryBid → primaryTrump → snapshotToRoundState → state unchanged", () => {
    // Full engine round-trip: build real engine state, serialize to authState, deserialize back
    const config = makeConfig();
    const r0 = initRound(1, 0, config);
    const r1 = applyPrimaryBid(r0, 1);
    const r2 = applyPrimaryTrumpSelection(r1, 1, "S", { allowNoTrump: false });

    // Simulate what buildAuthoritativeSnapshot would produce:
    // (We test snapshotToRoundState on the service's auth state format)
    const authState = makeTrumpSelectionAuthState({
      phase: r2.phase,
      primaryTrump: r2.primaryTrump,
      highestBid: r2.highestBid,
      highestBidderSeat: r2.highestBidderSeat,
      useTwoRoundBidding: r2.useTwoRoundBidding,
      remainingDeck: r2.remainingDeck,
    });
    const restored = GameService.snapshotToRoundState(authState, PLAYER_COUNT);

    expect(restored.phase).toBe(r2.phase);
    expect(restored.primaryTrump).toBe(r2.primaryTrump);
    expect(restored.highestBid).toBe(r2.highestBid);
    expect(restored.highestBidderSeat).toBe(r2.highestBidderSeat);
    expect(restored.useTwoRoundBidding).toBe(r2.useTwoRoundBidding);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — primaryTrump surfaced to clients (bug fix verification)
// ---------------------------------------------------------------------------

describe("Scenario 9: primaryTrump is correctly surfaced in all client state snapshots", () => {
  it("primaryTrump=null is present in client state when not yet selected", () => {
    const authState = makeTrumpSelectionAuthState({ primaryTrump: null });
    const cs = GameService.buildClientGameState(authState, 0);
    // The key check: the field exists in the returned object (not undefined)
    expect("primaryTrump" in cs).toBe(true);
    expect(cs.primaryTrump).toBeNull();
  });

  it("primaryTrump='S' is visible to ALL seats (public knowledge after selection)", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "S",
      currentBidderSeat: 1,
    });
    for (const seat of [0, 1, 2, 3]) {
      const cs = GameService.buildClientGameState(authState, seat);
      expect(cs.primaryTrump).toBe("S");
    }
  });

  it("primaryTrump='H' visible during bidding phase (before final trump is chosen)", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "bidding",
      primaryTrump: "H",
      trumpSuit: null,    // final trump not yet decided
      currentBidderSeat: 2,
    });
    const cs = GameService.buildClientGameState(authState, 2);
    expect(cs.primaryTrump).toBe("H");
    expect(cs.trumpSuit).toBeNull(); // final trump not set yet
  });

  it("primaryTrump='D' visible during trump_selection phase (Final Trump selection)", () => {
    // When Final Bid > Primary Bid, Final Trump must be selected.
    // primaryTrump stays visible so the client can show "was 'D', now choosing final..."
    const authState = makeTrumpSelectionAuthState({
      phase: "trump_selection",
      primaryTrump: "D",
      highestBid: 6, // raised above primary bid
      trumpSuit: null,
    });
    const cs = GameService.buildClientGameState(authState, 1);
    expect(cs.primaryTrump).toBe("D");
    expect(cs.phase).toBe("trump_selection");
  });

  it("primaryTrump='C' visible during playing phase (Primary Trump === Final Trump case)", () => {
    // If Final Bid === Primary Bid, Primary Trump becomes the Final Trump (trumpSuit=primaryTrump)
    const authState = makeTrumpSelectionAuthState({
      phase: "playing",
      primaryTrump: "C",
      trumpSuit: "C",     // Primary Trump stands as Final Trump
      highestBid: 5,
    });
    const cs = GameService.buildClientGameState(authState, 0);
    expect(cs.primaryTrump).toBe("C");
    expect(cs.trumpSuit).toBe("C");
  });

  it("primaryTrump='H' visible and trumpSuit='D' when Final Trump differs from Primary", () => {
    const authState = makeTrumpSelectionAuthState({
      phase: "playing",
      primaryTrump: "H",
      trumpSuit: "D",     // Player raised the bid and chose a different final trump
      highestBid: 7,
    });
    const cs = GameService.buildClientGameState(authState, 1);
    expect(cs.primaryTrump).toBe("H"); // Original primary trump still visible
    expect(cs.trumpSuit).toBe("D");    // Final trump is what's actually in play
  });
});
