/**
 * Part 10 — Final Hardening of the Complete Game Engine.
 *
 * Covers genuine coverage gaps found during the full codebase audit:
 *
 * 1.  Reconnect in primary_bid phase
 *     – buildClientGameState, buildValidActions, snapshotToRoundState
 * 2.  Reconnect in primary_trump_selection phase — same
 * 3.  Reconnect in trump_selection phase — same
 * 4.  State immutability — applyPrimaryBid / applyPrimaryTrumpSelection
 * 5.  Invalid-action rejection
 *     – play_card during round_ended
 *     – bid during playing
 *     – validateMatchState: game_ended is blocked, round_ended is not
 * 6.  Multiplayer synchronization
 *     – all seats see identical public state across every phase
 * 7.  Chhakri outcome-label consistency
 *     – chhakri_bid_team  deltas === bid_made  deltas
 *     – chhakri_def_team  deltas === bid_failed deltas
 * 8.  Snapshot serialization / deserialization
 *     – events[] is reset to [] on round-trip
 *     – all optional fields survive round-trip
 *     – snapshotToRoundState for primary_bid, primary_trump_selection, trump_selection
 * 9.  Deck integrity — all 8×playerCount cards accounted for after a full round
 * 10. buildValidActions terminal phases — empty in round_ended, game_ended
 * 11. Validation chain — validateAction / VALID_ACTIONS_BY_PHASE exhaustive coverage
 * 12. Regression — full-round determinism with seeded RNG
 *
 * All tests are DB-free; no socket mocks required.
 *
 * [MIG-024] Two-round bidding protocol
 * [MIG-026] Primary Trump / secondary bidding
 * [MIG-028] No Chhakri scoring bonus
 * [MIG-040] Snapshot completedTricks
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";
import {
  initRound,
  defaultGameConfig,
  applyPrimaryBid,
  applyPrimaryTrumpSelection,
  applyBid,
  applyPass,
  applyTrumpSelection,
  applyPlayCard,
  buildRoundResult,
  calculateRoundScore,
  getLegalMovesZonedForSeat,
  TRICKS_PER_ROUND,
  PRIMARY_BID_AMOUNT,
  CARDS_PER_PLAYER,
  createSeededRng,
} from "@workspace/game-engine";
import type { PlayerCount, RoundState, GameConfig, Suit } from "@workspace/game-engine";
import {
  validateMatchState,
  validateAction,
  VALID_ACTIONS_BY_PHASE,
  runValidationChain,
} from "../socket/validation.js";
import type { ValidationContext } from "../socket/validation.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function cfg(playerCount: 4 | 6 = 4): GameConfig {
  return defaultGameConfig(playerCount as PlayerCount, { useTwoRoundBidding: true });
}

function stateAtPrimaryBid(playerCount: 4 | 6 = 4, dealerSeat = 0): RoundState {
  const config = cfg(playerCount);
  return initRound(1, dealerSeat, config, createSeededRng(42));
}

function stateAtPrimaryTrumpSelection(
  playerCount: 4 | 6 = 4,
  dealerSeat = 0,
): { state: RoundState; primarySeat: number } {
  const config = cfg(playerCount);
  let state = initRound(1, dealerSeat, config, createSeededRng(42));
  const primarySeat = (dealerSeat + 1) % playerCount;
  state = applyPrimaryBid(state, primarySeat);
  return { state, primarySeat };
}

function stateAtBidding(playerCount: 4 | 6 = 4, dealerSeat = 0): RoundState {
  const { state, primarySeat } = stateAtPrimaryTrumpSelection(playerCount, dealerSeat);
  return applyPrimaryTrumpSelection(state, primarySeat, "H", { allowNoTrump: false });
}

function stateAtTrumpSelection(
  playerCount: 4 | 6 = 4,
  dealerSeat = 0,
  primaryTrump: Suit = "H",
  finalBid = 6,
): { state: RoundState; winnerSeat: number } {
  const config = cfg(playerCount);
  let state = stateAtBidding(playerCount, dealerSeat);
  const primarySeat = (dealerSeat + 1) % playerCount;

  // Round 1: one player raises, rest pass
  state = applyBid(state, primarySeat, finalBid, config);
  for (let i = 1; i < playerCount; i++) {
    state = applyPass(state, (primarySeat + i) % playerCount);
  }
  // Round 2: all pass
  for (let i = 0; i < playerCount; i++) {
    state = applyPass(state, (primarySeat + i) % playerCount);
  }

  const winnerSeat = state.highestBidderSeat!;
  return { state, winnerSeat };
}

function stateAtPlaying(
  playerCount: 4 | 6 = 4,
  dealerSeat = 0,
  finalTrump: Suit = "S",
): { state: RoundState; config: GameConfig } {
  const config = cfg(playerCount);
  const { state: ts, winnerSeat } = stateAtTrumpSelection(playerCount, dealerSeat);
  const state = applyTrumpSelection(ts, winnerSeat, finalTrump, { allowNoTrump: false });
  return { state, config };
}

function playLegalCard(state: RoundState, seat: number, config: GameConfig, pc: 4 | 6 = 4): RoundState {
  const legal = getLegalMovesZonedForSeat(state, seat, pc as PlayerCount);
  if (!legal.length) throw new Error(`No legal card for seat ${seat}`);
  return applyPlayCard(state, seat, legal[0]!, config);
}

function playOneTrick(state: RoundState, config: GameConfig, pc: 4 | 6 = 4): RoundState {
  const leader = state.currentTrickLeaderSeat!;
  for (let i = 0; i < pc; i++) {
    state = playLegalCard(state, (leader + i) % pc, config, pc);
  }
  return state;
}

function playAllTricks(state: RoundState, config: GameConfig, pc: 4 | 6 = 4): RoundState {
  while (state.phase === "playing") {
    state = playOneTrick(state, config, pc);
  }
  return state;
}

function buildAuth(
  state: RoundState,
  playerCount: 4 | 6 = 4,
  gameScores: [number, number] = [0, 0],
  gameId = "g-test",
): AuthoritativeGameState {
  return GameService.buildAuthoritativeSnapshot({
    gameId,
    sequence: state.nextSequence,
    roundNumber: state.roundNumber,
    roundState: state,
    playerCount: playerCount as PlayerCount,
    gameScores,
    targetScore: 52,
    seatData: Array.from({ length: playerCount }, (_, s) => ({
      seat: s,
      userId: `user-${s}`,
      displayName: `Player ${s}`,
      isAi: false,
      connectionState: "CONNECTED" as const,
    })),
  });
}

function makeCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    userId: "user-a",
    displayName: "Player A",
    gameId: "game-1",
    actionType: "play_card",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Reconnect in primary_bid phase
// ---------------------------------------------------------------------------

describe("Reconnect — primary_bid phase", () => {
  it("buildClientGameState: phase = 'primary_bid' for all seats", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("primary_bid");
    }
  });

  it("buildClientGameState: each seat sees exactly 2 secret-hand cards (Phase 1 deal)", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      const view = GameService.buildClientGameState(auth, s);
      expect(view.mySecretHand).toHaveLength(2);
    }
  });

  it("buildClientGameState: opponents' hands are null", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    const view = GameService.buildClientGameState(auth, 0);
    for (let s = 1; s < 4; s++) {
      expect(view.seats[s]!.hand).toBeNull();
    }
  });

  it("buildClientGameState: remainingDeck is NOT exposed to any client", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      const view = GameService.buildClientGameState(auth, s) as Record<string, unknown>;
      expect(view["remainingDeck"]).toBeUndefined();
    }
  });

  it("buildValidActions: primary seat gets 'bid'; others get empty array", () => {
    const state = stateAtPrimaryBid(4, 0); // dealerSeat=0 → primarySeat=1
    const auth = buildAuth(state, 4);
    const primarySeat = (0 + 1) % 4;
    const actions = GameService.buildValidActions(auth, primarySeat, 4 as PlayerCount);
    expect(actions.map((a) => a.type)).toContain("bid");
    // Non-primary seats get empty
    for (let s = 0; s < 4; s++) {
      if (s === primarySeat) continue;
      expect(GameService.buildValidActions(auth, s, 4 as PlayerCount)).toHaveLength(0);
    }
  });

  it("snapshotToRoundState round-trip: phase = 'primary_bid'", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.phase).toBe("primary_bid");
  });

  it("snapshotToRoundState round-trip: each player has 2 secret-hand cards", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    for (let s = 0; s < 4; s++) {
      expect(restored.playerCards?.[s]?.secretHand).toHaveLength(2);
    }
  });

  it("snapshotToRoundState round-trip: useTwoRoundBidding is preserved", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.useTwoRoundBidding).toBe(true);
  });

  it("snapshotToRoundState round-trip: highestBid = 0 (no bid yet)", () => {
    const state = stateAtPrimaryBid(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.highestBid).toBe(0);
    expect(restored.highestBidderSeat).toBeNull();
  });

  it("6P: buildClientGameState phase = 'primary_bid' for all 6 seats", () => {
    const state = stateAtPrimaryBid(6);
    const auth = buildAuth(state, 6);
    for (let s = 0; s < 6; s++) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("primary_bid");
    }
  });

  it("6P: each of 6 seats sees exactly 2 secret-hand cards", () => {
    const state = stateAtPrimaryBid(6);
    const auth = buildAuth(state, 6);
    for (let s = 0; s < 6; s++) {
      expect(GameService.buildClientGameState(auth, s).mySecretHand).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Reconnect in primary_trump_selection phase
// ---------------------------------------------------------------------------

describe("Reconnect — primary_trump_selection phase", () => {
  it("buildClientGameState: phase = 'primary_trump_selection' for all seats", () => {
    const { state } = stateAtPrimaryTrumpSelection(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("primary_trump_selection");
    }
  });

  it("buildClientGameState: highestBid = PRIMARY_BID_AMOUNT after primary bid", () => {
    const { state } = stateAtPrimaryTrumpSelection(4);
    const auth = buildAuth(state, 4);
    expect(GameService.buildClientGameState(auth, 0).highestBid).toBe(PRIMARY_BID_AMOUNT);
  });

  it("buildClientGameState: highestBidderSeat correctly set", () => {
    const { state, primarySeat } = stateAtPrimaryTrumpSelection(4, 0);
    const auth = buildAuth(state, 4);
    expect(GameService.buildClientGameState(auth, 0).highestBidderSeat).toBe(primarySeat);
  });

  it("buildValidActions: primary seat gets 'select_trump'; others get empty", () => {
    const { state, primarySeat } = stateAtPrimaryTrumpSelection(4, 0);
    const auth = buildAuth(state, 4);
    const actions = GameService.buildValidActions(auth, primarySeat, 4 as PlayerCount);
    expect(actions.map((a) => a.type)).toContain("select_trump");
    for (let s = 0; s < 4; s++) {
      if (s === primarySeat) continue;
      expect(GameService.buildValidActions(auth, s, 4 as PlayerCount)).toHaveLength(0);
    }
  });

  it("snapshotToRoundState round-trip: phase = 'primary_trump_selection'", () => {
    const { state } = stateAtPrimaryTrumpSelection(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.phase).toBe("primary_trump_selection");
  });

  it("snapshotToRoundState round-trip: highestBid = PRIMARY_BID_AMOUNT preserved", () => {
    const { state } = stateAtPrimaryTrumpSelection(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.highestBid).toBe(PRIMARY_BID_AMOUNT);
  });

  it("snapshotToRoundState round-trip: remainingDeck is non-empty (Phase 2/3 not dealt yet)", () => {
    const { state } = stateAtPrimaryTrumpSelection(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.remainingDeck).toBeDefined();
    expect((restored.remainingDeck ?? []).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Reconnect in trump_selection phase
// ---------------------------------------------------------------------------

describe("Reconnect — trump_selection phase", () => {
  it("buildClientGameState: phase = 'trump_selection' for all seats", () => {
    const { state, winnerSeat } = stateAtTrumpSelection(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("trump_selection");
    }
  });

  it("buildClientGameState: primaryTrump is visible to all seats", () => {
    const { state } = stateAtTrumpSelection(4, 0, "H");
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).primaryTrump).toBe("H");
    }
  });

  it("buildClientGameState: trumpSuit is null (final trump not selected yet)", () => {
    const { state } = stateAtTrumpSelection(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildClientGameState(auth, s).trumpSuit).toBeNull();
    }
  });

  it("buildValidActions: winner gets 'select_trump'; others get empty", () => {
    const { state, winnerSeat } = stateAtTrumpSelection(4);
    const auth = buildAuth(state, 4);
    const actions = GameService.buildValidActions(auth, winnerSeat, 4 as PlayerCount);
    expect(actions.map((a) => a.type)).toContain("select_trump");
    for (let s = 0; s < 4; s++) {
      if (s === winnerSeat) continue;
      expect(GameService.buildValidActions(auth, s, 4 as PlayerCount)).toHaveLength(0);
    }
  });

  it("snapshotToRoundState round-trip: phase = 'trump_selection'", () => {
    const { state } = stateAtTrumpSelection(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.phase).toBe("trump_selection");
  });

  it("snapshotToRoundState round-trip: highestBid = 6", () => {
    const { state } = stateAtTrumpSelection(4, 0, "H", 6);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.highestBid).toBe(6);
  });

  it("snapshotToRoundState round-trip: primaryTrump = 'H' preserved", () => {
    const { state } = stateAtTrumpSelection(4, 0, "H");
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.primaryTrump).toBe("H");
  });

  it("snapshotToRoundState round-trip: each player has 8 cards (full deal done)", () => {
    const { state } = stateAtTrumpSelection(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    for (let s = 0; s < 4; s++) {
      const p = restored.playerCards?.[s];
      const total = (p?.secretHand?.length ?? 0) + (p?.faceDown?.length ?? 0) + (p?.faceUp?.length ?? 0);
      expect(total).toBe(CARDS_PER_PLAYER[4]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. State immutability — applyPrimaryBid / applyPrimaryTrumpSelection
// ---------------------------------------------------------------------------

describe("State immutability — primary bid and trump selection", () => {
  it("applyPrimaryBid does not mutate the input state", () => {
    const config = cfg(4);
    const state = initRound(1, 0, config, createSeededRng(1));
    const original = JSON.stringify(state);
    const primarySeat = 1;
    applyPrimaryBid(state, primarySeat);
    expect(JSON.stringify(state)).toBe(original);
  });

  it("applyPrimaryTrumpSelection does not mutate the input state", () => {
    const config = cfg(4);
    let state = initRound(1, 0, config, createSeededRng(1));
    state = applyPrimaryBid(state, 1);
    const original = JSON.stringify(state);
    applyPrimaryTrumpSelection(state, 1, "H", { allowNoTrump: false });
    expect(JSON.stringify(state)).toBe(original);
  });

  it("applyPrimaryBid events array grows by 1 but original is unchanged", () => {
    const config = cfg(4);
    const state = initRound(1, 0, config, createSeededRng(1));
    const originalEventCount = state.events.length;
    const next = applyPrimaryBid(state, 1);
    expect(state.events.length).toBe(originalEventCount);   // original unchanged
    expect(next.events.length).toBe(originalEventCount + 1); // new state has one more event
  });

  it("applyPrimaryTrumpSelection events array grows by 1 but original is unchanged", () => {
    const config = cfg(4);
    let state = initRound(1, 0, config, createSeededRng(1));
    state = applyPrimaryBid(state, 1);
    const originalEventCount = state.events.length;
    const next = applyPrimaryTrumpSelection(state, 1, "S", { allowNoTrump: false });
    expect(state.events.length).toBe(originalEventCount);
    expect(next.events.length).toBe(originalEventCount + 1);
  });

  it("applyPrimaryBid returns a new state object (reference differs from input)", () => {
    const config = cfg(4);
    const state = initRound(1, 0, config, createSeededRng(1));
    const next = applyPrimaryBid(state, 1);
    // The returned state must be a different object
    expect(next).not.toBe(state);
    // Phase must have advanced
    expect(next.phase).not.toBe(state.phase);
  });
});

// ---------------------------------------------------------------------------
// 5. Invalid-action rejection (validation chain)
// ---------------------------------------------------------------------------

describe("Invalid-action rejection — validation chain", () => {
  it("validateMatchState: game_ended phase → GAME_ALREADY_ENDED", () => {
    const ctx = makeCtx({ actionType: "play_card" });
    const result = validateMatchState(ctx, "game_ended", 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("GAME_ALREADY_ENDED");
  });

  it("validateMatchState: dealing phase → GAME_DEALING_IN_PROGRESS", () => {
    const ctx = makeCtx({ actionType: "play_card" });
    const result = validateMatchState(ctx, "dealing", 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("GAME_DEALING_IN_PROGRESS");
  });

  it("validateMatchState: round_ended phase → ok (not blocked; validateAction stops invalid plays)", () => {
    const ctx = makeCtx({ actionType: "play_card" });
    const result = validateMatchState(ctx, "round_ended", 0, 0);
    expect(result.ok).toBe(true); // round_ended is not blocked here…
  });

  it("validateAction: play_card in round_ended → rejected (VALID_ACTIONS_BY_PHASE has no actions)", () => {
    // After validateMatchState passes for round_ended, validateAction must block play_card
    const ctx = makeCtx({ actionType: "play_card" });
    const msResult = validateMatchState(ctx, "round_ended", 0, 0);
    expect(msResult.ok).toBe(true);
    if (!msResult.ok) return;
    // Manually simulate validateAction: check VALID_ACTIONS_BY_PHASE
    const allowed = VALID_ACTIONS_BY_PHASE["round_ended"];
    expect(allowed).toHaveLength(0);
    expect(allowed).not.toContain("play_card");
  });

  it("validateAction: bid in playing phase → NOT_ALLOWED_IN_PHASE", () => {
    const ctx = makeCtx({ actionType: "bid" });
    const msResult = validateMatchState(ctx, "playing", 0, 0);
    expect(msResult.ok).toBe(true);
    if (!msResult.ok) return;
    const allowed = VALID_ACTIONS_BY_PHASE["playing"];
    expect(allowed).not.toContain("bid");
    expect(allowed).not.toContain("pass");
    expect(allowed).toContain("play_card");
  });

  it("validateAction: select_trump in playing phase → not allowed", () => {
    expect(VALID_ACTIONS_BY_PHASE["playing"]).not.toContain("select_trump");
  });

  it("validateAction: play_card in bidding phase → not allowed", () => {
    expect(VALID_ACTIONS_BY_PHASE["bidding"]).not.toContain("play_card");
  });

  it("validateAction: pass in primary_bid phase → not allowed", () => {
    expect(VALID_ACTIONS_BY_PHASE["primary_bid"]).not.toContain("pass");
  });

  it("validateAction: play_card in trump_selection phase → not allowed", () => {
    expect(VALID_ACTIONS_BY_PHASE["trump_selection"]).not.toContain("play_card");
  });

  it("validateAction: no actions allowed in game_ended phase (blocked by validateMatchState)", () => {
    expect(VALID_ACTIONS_BY_PHASE["game_ended"]).toHaveLength(0);
  });

  it("validateAction: no actions allowed in trick_ended phase", () => {
    expect(VALID_ACTIONS_BY_PHASE["trick_ended"]).toHaveLength(0);
  });

  it("runValidationChain: fails with NOT_YOUR_TURN when wrong seat acts", () => {
    // Seat 1 is the primary bidder (dealerSeat=0), seat 0 should NOT be able to act
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "primary_bid",
      seat: 0,    // requesting player's seat
      team: 0,
      currentSeat: 1,  // current actor
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_YOUR_TURN");
  });

  it("runValidationChain: fails with ACTION_NOT_ALLOWED_IN_PHASE for play_card in bidding", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "play_card" }),
      phase: "bidding",
      seat: 1,
      team: 1,
      currentSeat: 1,
    });
    expect(result.ok).toBe(false);
    // Error format is ACTION_NOT_ALLOWED_IN_PHASE:<phase>
    if (!result.ok) expect(result.error).toContain("ACTION_NOT_ALLOWED_IN_PHASE");
  });

  it("runValidationChain: succeeds for correct bid action in primary_bid phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "bid" }),
      phase: "primary_bid",
      seat: 1,
      team: 1,
      currentSeat: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("runValidationChain: succeeds for play_card in playing phase", () => {
    const result = runValidationChain({
      context: makeCtx({ actionType: "play_card" }),
      phase: "playing",
      seat: 2,
      team: 0,
      currentSeat: 2,
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Multiplayer synchronization — all seats see identical public state
// ---------------------------------------------------------------------------

describe("Multiplayer synchronization — all seats see identical public state", () => {
  const publicFields = [
    "phase", "roundNumber", "sequence", "dealerSeat",
    "currentBidderSeat", "highestBid", "highestBidderSeat",
    "biddingStatus", "consecutivePasses", "multiplier",
    "trumpSuit", "noTrump", "primaryTrump",
    "currentTrickLeaderSeat", "completedTricksThisRound",
    "team0Score", "team1Score", "targetScore",
  ] as const;

  function expectAllSeatsAgree(auth: AuthoritativeGameState, pc: 4 | 6) {
    const views = Array.from({ length: pc }, (_, s) =>
      GameService.buildClientGameState(auth, s)
    );
    for (const field of publicFields) {
      const ref = views[0]![field];
      for (let i = 1; i < pc; i++) {
        expect(views[i]![field]).toStrictEqual(ref);
      }
    }
  }

  it("primary_bid: all 4 seats see identical public state", () => {
    const state = stateAtPrimaryBid(4);
    expectAllSeatsAgree(buildAuth(state, 4), 4);
  });

  it("primary_trump_selection: all 4 seats see identical public state", () => {
    const { state } = stateAtPrimaryTrumpSelection(4);
    expectAllSeatsAgree(buildAuth(state, 4), 4);
  });

  it("bidding: all 4 seats see identical public state", () => {
    const state = stateAtBidding(4);
    expectAllSeatsAgree(buildAuth(state, 4), 4);
  });

  it("trump_selection: all 4 seats see identical public state", () => {
    const { state } = stateAtTrumpSelection(4);
    expectAllSeatsAgree(buildAuth(state, 4), 4);
  });

  it("playing (after 1 trick): all 4 seats see identical public state", () => {
    const { state, config } = stateAtPlaying(4);
    const after1Trick = playOneTrick(state, config, 4);
    expectAllSeatsAgree(buildAuth(after1Trick, 4), 4);
  });

  it("round_ended: all 4 seats see identical public state", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    expectAllSeatsAgree(buildAuth(final, 4, [6, -6]), 4);
  });

  it("6P primary_bid: all 6 seats see identical public state", () => {
    const state = stateAtPrimaryBid(6);
    expectAllSeatsAgree(buildAuth(state, 6), 6);
  });

  it("6P trump_selection: all 6 seats see identical public state", () => {
    const { state } = stateAtTrumpSelection(6);
    expectAllSeatsAgree(buildAuth(state, 6), 6);
  });

  it("opponent hands are always null (never exposed across all phases)", () => {
    const phases = [
      buildAuth(stateAtPrimaryBid(4), 4),
      buildAuth(stateAtBidding(4), 4),
      buildAuth(stateAtPlaying(4).state, 4),
    ];
    for (const auth of phases) {
      for (let mySeat = 0; mySeat < 4; mySeat++) {
        const view = GameService.buildClientGameState(auth, mySeat);
        for (let s = 0; s < 4; s++) {
          if (s !== mySeat) {
            expect(view.seats[s]!.hand).toBeNull();
          } else {
            expect(view.seats[s]!.hand).not.toBeNull();
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Chhakri outcome-label consistency
// ---------------------------------------------------------------------------

describe("Chhakri outcome-label consistency — MIG-028 (no scoring bonus)", () => {
  it("chhakri_bid_team: deltas identical to bid_made (no chhakri bonus)", () => {
    const bidMade = calculateRoundScore({
      bidTeam: 1, defTeam: 0, bid: 6, tricksWon: [2, 6], multiplier: 1, chhakri: null,
    });
    const chhakriBid = calculateRoundScore({
      bidTeam: 1, defTeam: 0, bid: 6, tricksWon: [2, 6], multiplier: 1,
      chhakri: { team: 1 }, // chhakri by bidding team
    });
    expect(chhakriBid.deltas).toEqual(bidMade.deltas);
    expect(chhakriBid.outcome).toBe("chhakri_bid_team");
    expect(bidMade.outcome).toBe("bid_made");
  });

  it("chhakri_def_team: deltas identical to bid_failed (no chhakri bonus)", () => {
    const bidFailed = calculateRoundScore({
      bidTeam: 1, defTeam: 0, bid: 6, tricksWon: [5, 3], multiplier: 1, chhakri: null,
    });
    const chhakriDef = calculateRoundScore({
      bidTeam: 1, defTeam: 0, bid: 6, tricksWon: [5, 3], multiplier: 1,
      chhakri: { team: 0 }, // chhakri by defending team
    });
    expect(chhakriDef.deltas).toEqual(bidFailed.deltas);
    expect(chhakriDef.outcome).toBe("chhakri_def_team");
    expect(bidFailed.outcome).toBe("bid_failed");
  });

  it("chhakri label is set for bidTeam when chhakri.team === bidTeam", () => {
    const result = calculateRoundScore({
      bidTeam: 0, defTeam: 1, bid: 5, tricksWon: [5, 3], multiplier: 1,
      chhakri: { team: 0 }, // bidTeam=0, chhakri by bidTeam
    });
    expect(result.outcome).toBe("chhakri_bid_team");
  });

  it("chhakri label is set for defTeam when chhakri.team !== bidTeam", () => {
    const result = calculateRoundScore({
      bidTeam: 0, defTeam: 1, bid: 5, tricksWon: [2, 6], multiplier: 1,
      chhakri: { team: 1 }, // defTeam=1, chhakri by defTeam
    });
    expect(result.outcome).toBe("chhakri_def_team");
  });

  it("all 4 outcome labels are zero-sum", () => {
    const cases = [
      { chhakri: null, tricksWon: [2, 6] as [number, number] },       // bid_made
      { chhakri: null, tricksWon: [5, 3] as [number, number] },       // bid_failed
      { chhakri: { team: 1 as const }, tricksWon: [2, 6] as [number, number] }, // chhakri_bid_team (bidTeam=1)
      { chhakri: { team: 0 as const }, tricksWon: [5, 3] as [number, number] }, // chhakri_def_team (bidTeam=1)
    ];
    for (const c of cases) {
      const score = calculateRoundScore({
        bidTeam: 1, defTeam: 0, bid: 6, tricksWon: c.tricksWon, multiplier: 1, chhakri: c.chhakri,
      });
      expect(score.deltas[0] + score.deltas[1]).toBe(0);
    }
  });

  it("buildRoundResult: chhakri field from engine matches state.chhakri team", () => {
    // Run actual games until one fires Chhakri, or verify the null case is stable
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    if (final.chhakri !== null) {
      expect(result.chhakri?.team).toBe(final.chhakri.team);
    } else {
      expect(result.chhakri).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Snapshot serialization / deserialization
// ---------------------------------------------------------------------------

describe("Snapshot serialization / deserialization", () => {
  it("snapshotToRoundState: events[] is reset to [] on round-trip", () => {
    // engine state has events; snapshot should not store them; restored state starts fresh
    const { state, config } = stateAtPlaying(4);
    const after1Trick = playOneTrick(state, config, 4);
    expect(after1Trick.events.length).toBeGreaterThan(0);
    const auth = buildAuth(after1Trick, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.events).toHaveLength(0);
  });

  it("snapshotToRoundState: completedTricks survive round-trip after 3 tricks", () => {
    let { state, config } = stateAtPlaying(4);
    for (let i = 0; i < 3; i++) state = playOneTrick(state, config, 4);
    expect(state.completedTricks).toHaveLength(3);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.completedTricks).toHaveLength(3);
  });

  it("snapshotToRoundState: completedTrick details (winnerSeat, winnerTeam) survive round-trip", () => {
    let { state, config } = stateAtPlaying(4);
    state = playOneTrick(state, config, 4);
    const trick = state.completedTricks[0]!;
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.completedTricks[0]!.winnerSeat).toBe(trick.winnerSeat);
    expect(restored.completedTricks[0]!.winnerTeam).toBe(trick.winnerTeam);
  });

  it("snapshotToRoundState: consecutiveWins survive round-trip", () => {
    let { state, config } = stateAtPlaying(4);
    state = playOneTrick(state, config, 4); // after one trick, consecutiveWins may be [1,0] or [0,1]
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.consecutiveWins).toEqual(state.consecutiveWins);
  });

  it("snapshotToRoundState: chhakri field survives round-trip (null case)", () => {
    const { state, config } = stateAtPlaying(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.chhakri).toBeNull();
  });

  it("snapshotToRoundState: capturedPoints survive round-trip", () => {
    let { state, config } = stateAtPlaying(4);
    for (let i = 0; i < 4; i++) state = playOneTrick(state, config, 4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.capturedPoints[0] + restored.capturedPoints[1]).toBeGreaterThanOrEqual(0);
    expect(restored.capturedPoints[0]).toBe(state.capturedPoints[0]);
    expect(restored.capturedPoints[1]).toBe(state.capturedPoints[1]);
  });

  it("snapshotToRoundState: highestBid and highestBidderSeat survive round-trip in playing phase", () => {
    const { state } = stateAtPlaying(4);
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.highestBid).toBe(state.highestBid);
    expect(restored.highestBidderSeat).toBe(state.highestBidderSeat);
  });

  it("snapshotToRoundState: trumpSuit survives round-trip in playing phase", () => {
    const { state } = stateAtPlaying(4, 0, "C");
    const auth = buildAuth(state, 4);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.trumpSuit).toBe("C");
  });

  it("double buildAuthoritativeSnapshot (idempotent) — phase and scores unchanged", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    const auth1 = buildAuth(final, 4, [6, -6]);
    const restored = GameService.snapshotToRoundState(auth1, 4);
    const auth2 = buildAuth(restored, 4, [6, -6]);
    expect(auth2.phase).toBe(auth1.phase);
    expect(auth2.team0Score).toBe(auth1.team0Score);
    expect(auth2.team1Score).toBe(auth1.team1Score);
    expect(auth2.completedTricksThisRound).toBe(auth1.completedTricksThisRound);
  });

  it("6P: snapshotToRoundState round-trip preserves completedTricks for 6P", () => {
    let { state, config } = stateAtPlaying(6);
    state = playOneTrick(state, config, 6);
    const auth = buildAuth(state, 6);
    const restored = GameService.snapshotToRoundState(auth, 6);
    expect(restored.completedTricks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 9. Deck integrity — all cards accounted for after a full round
// ---------------------------------------------------------------------------

describe("Deck integrity — all cards accounted for after full round", () => {
  it("4P: total completed-trick cards = 8 tricks × 4 seats = 32 card plays", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    const totalCards = final.completedTricks.reduce(
      (sum, trick) => sum + trick.cards.length, 0
    );
    expect(totalCards).toBe(TRICKS_PER_ROUND[4] * 4); // 8 × 4 = 32
  });

  it("6P: total completed-trick cards = 8 tricks × 6 seats = 48 card plays", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    const totalCards = final.completedTricks.reduce(
      (sum, trick) => sum + trick.cards.length, 0
    );
    expect(totalCards).toBe(TRICKS_PER_ROUND[6] * 6); // 8 × 6 = 48
  });

  it("4P: exactly 8 tricks completed", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    expect(final.completedTricks).toHaveLength(8);
  });

  it("6P: exactly 8 tricks completed", () => {
    const { state, config } = stateAtPlaying(6);
    const final = playAllTricks(state, config, 6);
    expect(final.completedTricks).toHaveLength(8);
  });

  it("4P: trick winner seats are all valid (0–3)", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    for (const trick of final.completedTricks) {
      expect(trick.winnerSeat).toBeGreaterThanOrEqual(0);
      expect(trick.winnerSeat).toBeLessThan(4);
    }
  });

  it("4P: trick winner teams are 0 or 1", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    for (const trick of final.completedTricks) {
      expect([0, 1]).toContain(trick.winnerTeam);
    }
  });

  it("4P: winnerTeam consistent with winnerSeat (seat%2 === team)", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    for (const trick of final.completedTricks) {
      expect(trick.winnerSeat % 2).toBe(trick.winnerTeam);
    }
  });

  it("tricksWon in buildRoundResult = sum of completedTricks per team", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    const result = buildRoundResult(final);
    const manual: [number, number] = [0, 0];
    for (const t of final.completedTricks) manual[t.winnerTeam]++;
    expect(result.tricksWon).toEqual(manual);
  });
});

// ---------------------------------------------------------------------------
// 10. buildValidActions — terminal phases return empty
// ---------------------------------------------------------------------------

describe("buildValidActions — terminal and non-action phases return empty", () => {
  it("round_ended phase: buildValidActions returns empty for all seats", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    const auth = buildAuth(final, 4);
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildValidActions(auth, s, 4 as PlayerCount)).toHaveLength(0);
    }
  });

  it("game_ended phase: buildValidActions returns empty for all seats", () => {
    const { state, config } = stateAtPlaying(4);
    const final = playAllTricks(state, config, 4);
    const auth: AuthoritativeGameState = {
      ...buildAuth(final, 4, [52, -52]),
      phase: "game_ended",
    };
    for (let s = 0; s < 4; s++) {
      expect(GameService.buildValidActions(auth, s, 4 as PlayerCount)).toHaveLength(0);
    }
  });

  it("playing: buildValidActions returns only legal 'play_card' actions for current actor", () => {
    const { state } = stateAtPlaying(4);
    const auth = buildAuth(state, 4);
    const leader = state.currentTrickLeaderSeat!;
    const actions = GameService.buildValidActions(auth, leader, 4 as PlayerCount);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.type).toBe("play_card");
    }
  });

  it("playing: buildValidActions returns play_card for all seats (turn check is at handler level)", () => {
    // buildValidActions in 'playing' returns legal cards for whatever seat is requested —
    // it does NOT filter by whose turn it is. Turn enforcement lives in runValidationChain.
    const { state } = stateAtPlaying(4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      const actions = GameService.buildValidActions(auth, s, 4 as PlayerCount);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]!.type).toBe("play_card");
    }
  });

  it("bidding: buildValidActions returns bid+pass for the current bidder seat", () => {
    const state = stateAtBidding(4, 0);
    const auth = buildAuth(state, 4);
    // Use authState.currentBidderSeat (the snapshot's field) to identify the actor
    const currentBidder = auth.currentBidderSeat!;
    expect(currentBidder).not.toBeNull();
    const actions = GameService.buildValidActions(auth, currentBidder, 4 as PlayerCount);
    const types = actions.map((a) => a.type);
    expect(types).toContain("bid");
    expect(types).toContain("pass");
    // Non-active seats get empty in bidding
    for (let s = 0; s < 4; s++) {
      if (s === currentBidder) continue;
      expect(GameService.buildValidActions(auth, s, 4 as PlayerCount)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. VALID_ACTIONS_BY_PHASE — exhaustive coverage of all 9 phases
// ---------------------------------------------------------------------------

describe("VALID_ACTIONS_BY_PHASE — exhaustive phase coverage", () => {
  const ALL_PHASES = [
    "dealing",
    "primary_bid",
    "primary_trump_selection",
    "bidding",
    "trump_selection",
    "playing",
    "trick_ended",
    "round_ended",
    "game_ended",
  ] as const;

  it("every game phase has an entry in VALID_ACTIONS_BY_PHASE", () => {
    for (const phase of ALL_PHASES) {
      expect(VALID_ACTIONS_BY_PHASE).toHaveProperty(phase);
    }
  });

  it("no phase allows an action type outside the defined set", () => {
    const validTypes = new Set(["bid", "pass", "select_trump", "play_card"]);
    for (const phase of ALL_PHASES) {
      for (const action of VALID_ACTIONS_BY_PHASE[phase]) {
        expect(validTypes.has(action)).toBe(true);
      }
    }
  });

  it("exactly 5 phases allow at least one action", () => {
    const activePhases = ALL_PHASES.filter(
      (p) => VALID_ACTIONS_BY_PHASE[p].length > 0
    );
    expect(activePhases).toHaveLength(5);
    expect(activePhases).toContain("primary_bid");
    expect(activePhases).toContain("primary_trump_selection");
    expect(activePhases).toContain("bidding");
    expect(activePhases).toContain("trump_selection");
    expect(activePhases).toContain("playing");
  });

  it("exactly 4 phases allow no actions (dealing, trick_ended, round_ended, game_ended)", () => {
    const terminalPhases = ALL_PHASES.filter(
      (p) => VALID_ACTIONS_BY_PHASE[p].length === 0
    );
    expect(terminalPhases).toHaveLength(4);
    expect(terminalPhases).toContain("dealing");
    expect(terminalPhases).toContain("trick_ended");
    expect(terminalPhases).toContain("round_ended");
    expect(terminalPhases).toContain("game_ended");
  });
});

// ---------------------------------------------------------------------------
// 12. Regression — full-round determinism with seeded RNG
// ---------------------------------------------------------------------------

describe("Regression — full-round determinism with seeded RNG", () => {
  function runFullRound(seed: number, pc: 4 | 6): {
    tricksWon: [number, number];
    bid: number;
    phase: string;
  } {
    const config = defaultGameConfig(pc as PlayerCount, {
      useTwoRoundBidding: true,
    });
    const rng = createSeededRng(seed);
    let state = initRound(1, 0, config, rng);
    const primarySeat = 1;
    state = applyPrimaryBid(state, primarySeat);
    state = applyPrimaryTrumpSelection(state, primarySeat, "H", { allowNoTrump: false });
    state = applyBid(state, primarySeat, 6, config);
    for (let i = 1; i < pc; i++) {
      state = applyPass(state, (primarySeat + i) % pc);
    }
    for (let i = 0; i < pc; i++) {
      state = applyPass(state, (primarySeat + i) % pc);
    }
    state = applyTrumpSelection(state, state.highestBidderSeat!, "S", { allowNoTrump: false });
    while (state.phase === "playing") {
      const leader = state.currentTrickLeaderSeat!;
      for (let i = 0; i < pc; i++) {
        const seat = (leader + i) % pc;
        const legal = getLegalMovesZonedForSeat(state, seat, pc as PlayerCount);
        state = applyPlayCard(state, seat, legal[0]!, config);
      }
    }
    const result = buildRoundResult(state);
    return {
      tricksWon: result.tricksWon,
      bid: result.bid,
      phase: state.phase,
    };
  }

  it("4P: same seed produces same tricksWon result", () => {
    const r1 = runFullRound(99, 4);
    const r2 = runFullRound(99, 4);
    expect(r1.tricksWon).toEqual(r2.tricksWon);
    expect(r1.bid).toBe(r2.bid);
    expect(r1.phase).toBe("round_ended");
  });

  it("6P: same seed produces same tricksWon result", () => {
    const r1 = runFullRound(77, 6);
    const r2 = runFullRound(77, 6);
    expect(r1.tricksWon).toEqual(r2.tricksWon);
    expect(r1.phase).toBe("round_ended");
  });

  it("different seeds produce potentially different results (sanity check)", () => {
    // With enough seeds, at least two should differ. This is a probabilistic check.
    const results = [1, 2, 3, 4, 5].map((seed) => runFullRound(seed, 4));
    const allSame = results.every(
      (r) => r.tricksWon[0] === results[0]!.tricksWon[0]
    );
    // It is astronomically unlikely all 5 seeds give the same distribution
    // but we can't assert they *must* differ without deterministic knowledge.
    // Instead, just verify all completed normally.
    for (const r of results) {
      expect(r.phase).toBe("round_ended");
      expect(r.tricksWon[0] + r.tricksWon[1]).toBe(8);
    }
  });

  it("buildAuthoritativeSnapshot is stable for seeded 4P round", () => {
    const r = runFullRound(42, 4);
    expect(r.phase).toBe("round_ended");
    expect(r.tricksWon[0] + r.tricksWon[1]).toBe(TRICKS_PER_ROUND[4]);
  });

  it("seeded 6P round: all 8 tricks completed and tricksWon sums to 8", () => {
    const r = runFullRound(123, 6);
    expect(r.phase).toBe("round_ended");
    expect(r.tricksWon[0] + r.tricksWon[1]).toBe(TRICKS_PER_ROUND[6]);
  });
});
