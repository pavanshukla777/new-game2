/**
 * Playing Phase Bootstrap tests — Part 7.
 *
 * Tests that do NOT require a live database. They exercise:
 *   - Engine transition: trump_selection → playing (Final Trump path)
 *   - Engine transition: bidding → playing (Primary Trump stands path)
 *   - currentSeatForTrick: turn-seat formula
 *   - buildAuthoritativeSnapshot: playing-phase fields
 *   - snapshotToRoundState: playing-phase round-trip
 *   - buildValidActions: leader gets play_card; non-leader gets empty
 *   - buildClientGameState: playing-phase field exposure & hiding rules
 *   - Reconnect: playing-phase state restoration via buildClientGameState
 *   - 4-player and 6-player variants
 *   - State immutability
 *   - Full pipeline integration (both bootstrap paths)
 *
 * Responsibilities from the Part 7 spec:
 *   1. Transition trump_selection → playing         ✓
 *   2. Initialize the first trick                   ✓
 *   3. Determine the correct trick leader           ✓
 *   4. Set currentTurnSeat                          ✓
 *   5. Build initial PlayingState                   ✓
 *   6. Emit the correct playing snapshot            ✓ (via buildClientGameState)
 *   7. game:your_turn for active player only        ✓ (via buildValidActions)
 *   8. Reconnect restores identical playing state   ✓
 *   9. Backward compatibility                       ✓ (snapshotToRoundState)
 *
 * [MIG-026] Primary vs. Final Trump bootstrap
 * [MIG-038] Playing phase game:your_turn notification
 * [MIG-046] Zone-aware legal moves in playing phase
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
  currentSeatForTrick,
  getLegalMovesZonedForSeat,
  CARDS_PER_PLAYER,
  PRIMARY_BID_AMOUNT,
} from "@workspace/game-engine";
import type { PlayerCount, RoundState, GameConfig, Suit } from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Config with two-round bidding enabled (production default). */
function cfg(playerCount: 4 | 6 = 4): GameConfig {
  return defaultGameConfig(playerCount as PlayerCount, { useTwoRoundBidding: true });
}

/**
 * Advance to primary_trump_selection phase, return the state ready for the
 * primary trump choice plus the primary-bidder seat.
 */
function stateAfterPrimaryBid(playerCount: 4 | 6 = 4): { state: RoundState; primarySeat: number } {
  const config = cfg(playerCount);
  let state = initRound(1, 0, config);
  const primarySeat = (state.dealerSeat + 1) % playerCount;
  state = applyPrimaryBid(state, primarySeat);
  return { state, primarySeat };
}

/**
 * Advance to regular bidding phase, with primaryTrump = "H" already set.
 * Returns the state after primary trump selection.
 */
function stateAfterPrimaryTrump(
  primaryTrumpSuit: Suit = "H",
  playerCount: 4 | 6 = 4,
): { state: RoundState; primarySeat: number } {
  const { state: afterBid, primarySeat } = stateAfterPrimaryBid(playerCount);
  const state = applyPrimaryTrumpSelection(afterBid, primarySeat, primaryTrumpSuit, {
    allowNoTrump: false,
  });
  return { state, primarySeat };
}

/**
 * Path A — Primary Trump stands.
 *
 * With useTwoRoundBidding=true, bidding ends after exactly 2×playerCount total
 * actions. Nobody bids in regular bidding — all players pass through both rounds.
 *
 * The RoundState already carries highestBid=5 (= PRIMARY_BID_AMOUNT) and
 * highestBidderSeat=primarySeat from applyPrimaryBid. reconstructBiddingState
 * seeds the BiddingState from these fields, so after 2×playerCount passes,
 * checkBiddingEnd fires "won" with biddingState.highestBid=5=PRIMARY_BID_AMOUNT
 * → applyBiddingWon detects "Primary Trump stands" and sets phase="playing"
 * directly.
 *
 * Action sequence (4P example):
 *   Round 1: pass(primarySeat), pass(+1), pass(+2), pass(+3)
 *   Round 2: pass(primarySeat), pass(+1), pass(+2), pass(+3)
 *   Total: 8 = 2 × 4 → bidding ends, highestBid=5=PRIMARY_BID_AMOUNT → playing
 */
function stateAtPlayingViaPrimaryTrumpStands(
  primaryTrumpSuit: Suit = "H",
  playerCount: 4 | 6 = 4,
): { state: RoundState; winnerSeat: number } {
  const { state: afterPrimaryTrump, primarySeat } = stateAfterPrimaryTrump(
    primaryTrumpSuit,
    playerCount,
  );

  // Two full rounds of all-passes (2 × playerCount actions).
  let state = afterPrimaryTrump;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < playerCount; i++) {
      state = applyPass(state, (primarySeat + i) % playerCount);
    }
  }

  if (state.phase !== "playing") {
    throw new Error(`Expected phase "playing" but got "${state.phase}"`);
  }
  return { state, winnerSeat: primarySeat };
}

/**
 * Path B — Final Trump selected.
 *
 * The primary bidder raises to 6 in round 1; all others pass. In round 2,
 * all seats pass. Since highestBid=6 > PRIMARY_BID_AMOUNT, Final Trump
 * selection is required.
 *
 * Action sequence (4P example):
 *   Round 1: bid(primarySeat, 6), pass(+1), pass(+2), pass(+3)
 *   Round 2: pass(primarySeat), pass(+1), pass(+2), pass(+3)
 *   Total: 8 = 2 × 4 → bidding ends, highestBid=6 > 5 → trump_selection
 */
function stateAtPlayingViaFinalTrump(
  primaryTrumpSuit: Suit = "H",
  finalTrumpSuit: Suit = "S",
  playerCount: 4 | 6 = 4,
): { state: RoundState; winnerSeat: number } {
  const { state: afterPrimaryTrump, primarySeat } = stateAfterPrimaryTrump(
    primaryTrumpSuit,
    playerCount,
  );

  // Round 1: primarySeat raises to 6; all others pass.
  let state = applyBid(afterPrimaryTrump, primarySeat, 6, cfg(playerCount));
  for (let i = 1; i < playerCount; i++) {
    state = applyPass(state, (primarySeat + i) % playerCount);
  }

  // Round 2: all seats pass (2 × playerCount total actions reached).
  for (let i = 0; i < playerCount; i++) {
    state = applyPass(state, (primarySeat + i) % playerCount);
  }

  if (state.phase !== "trump_selection") {
    throw new Error(`Expected "trump_selection" but got "${state.phase}"`);
  }

  const winnerSeat = state.highestBidderSeat!;
  state = applyTrumpSelection(state, winnerSeat, finalTrumpSuit, { allowNoTrump: false });
  return { state, winnerSeat };
}

/** Build an AuthoritativeGameState from a playing-phase RoundState. */
function buildAuth(
  state: RoundState,
  playerCount: 4 | 6 = 4,
  gameId = "g-bootstrap",
): AuthoritativeGameState {
  return GameService.buildAuthoritativeSnapshot({
    gameId,
    sequence: state.nextSequence,
    roundNumber: state.roundNumber,
    roundState: state,
    playerCount: playerCount as PlayerCount,
    gameScores: [0, 0],
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

// ---------------------------------------------------------------------------
// Scenario 1 — Engine bootstrap: Final Trump path
// ---------------------------------------------------------------------------

describe("Scenario 1 — Engine bootstrap: Final Trump selected → playing (4P)", () => {
  it("phase transitions to 'playing'", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    expect(state.phase).toBe("playing");
  });

  it("currentTrickLeaderSeat is the winning bidder", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("currentTrick is initialized empty", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    expect(state.currentTrick).toHaveLength(0);
  });

  it("trumpSuit is the selected Final Trump suit", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S");
    expect(state.trumpSuit).toBe("S");
  });

  it("primaryTrump is preserved through the transition", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S");
    expect(state.primaryTrump).toBe("H");
  });

  it("completedTricks is empty at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    expect(state.completedTricks).toHaveLength(0);
  });

  it("consecutiveWins is [0, 0] at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    expect(state.consecutiveWins).toEqual([0, 0]);
  });

  it("each of the four Final Trump suits produces correct trumpSuit", () => {
    const suits: Suit[] = ["S", "H", "D", "C"];
    for (const suit of suits) {
      const { state } = stateAtPlayingViaFinalTrump("H", suit);
      expect(state.trumpSuit).toBe(suit);
    }
  });

  it("noTrump is false after Final Trump selection", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    expect(state.noTrump).toBe(false);
  });

  it("chhakri is null at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    expect(state.chhakri).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Engine bootstrap: Primary Trump stands path
// ---------------------------------------------------------------------------

describe("Scenario 2 — Engine bootstrap: Primary Trump stands → playing (4P)", () => {
  it("phase transitions to 'playing'", () => {
    const { state } = stateAtPlayingViaPrimaryTrumpStands();
    expect(state.phase).toBe("playing");
  });

  it("currentTrickLeaderSeat is the winning bidder (primary bidder)", () => {
    const { state, winnerSeat } = stateAtPlayingViaPrimaryTrumpStands();
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("trumpSuit equals primaryTrump — no Final Trump was selected", () => {
    const { state } = stateAtPlayingViaPrimaryTrumpStands("D");
    expect(state.trumpSuit).toBe("D");
    expect(state.primaryTrump).toBe("D");
  });

  it("currentTrick is initialized empty", () => {
    const { state } = stateAtPlayingViaPrimaryTrumpStands();
    expect(state.currentTrick).toHaveLength(0);
  });

  it("completedTricks is empty at bootstrap", () => {
    const { state } = stateAtPlayingViaPrimaryTrumpStands();
    expect(state.completedTricks).toHaveLength(0);
  });

  it("highestBid equals PRIMARY_BID_AMOUNT (5) — no one raised", () => {
    const { state } = stateAtPlayingViaPrimaryTrumpStands();
    expect(state.highestBid).toBe(PRIMARY_BID_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — currentSeatForTrick: turn-seat calculation
// ---------------------------------------------------------------------------

describe("Scenario 3 — currentSeatForTrick: turn-seat formula", () => {
  it("returns the leader seat when trick is empty (first to play)", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    expect(currentSeatForTrick(state, 4)).toBe(winnerSeat);
  });

  it("currentSeatForTrick always equals currentTrickLeaderSeat at trick start (trick empty)", () => {
    // With an empty currentTrick, (leader + 0) % playerCount = leader
    const { state } = stateAtPlayingViaFinalTrump("H", "S", 4);
    expect(state.currentTrick).toHaveLength(0);
    expect(currentSeatForTrick(state, 4)).toBe(state.currentTrickLeaderSeat!);
  });

  it("wraps correctly for mod arithmetic (playerCount=4)", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S", 4);
    const leader = state.currentTrickLeaderSeat!;
    // currentSeat at trick start = leader
    expect(currentSeatForTrick(state, 4)).toBe(leader % 4);
  });

  it("throws when currentTrickLeaderSeat is null", () => {
    const config = cfg(4);
    const round = initRound(1, 0, config);
    // Initial state has currentTrickLeaderSeat: null
    expect(() => currentSeatForTrick(round, 4)).toThrow(
      "No trick leader set — trump has not been declared yet.",
    );
  });

  it("returns [] from getLegalMovesZonedForSeat for non-acting seat", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const leader = state.currentTrickLeaderSeat!;
    const nonActor = (leader + 2) % 4; // two ahead — not the next to play
    const moves = getLegalMovesZonedForSeat(state, nonActor, 4);
    expect(moves).toHaveLength(0);
  });

  it("leader seat has legal moves", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const leader = state.currentTrickLeaderSeat!;
    const moves = getLegalMovesZonedForSeat(state, leader, 4);
    expect(moves.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — buildAuthoritativeSnapshot: playing-phase fields
// ---------------------------------------------------------------------------

describe("Scenario 4 — buildAuthoritativeSnapshot: playing-phase fields", () => {
  it("phase field is 'playing'", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.phase).toBe("playing");
  });

  it("currentTrickLeaderSeat matches engine state", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("currentTrick is empty array at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.currentTrick).toHaveLength(0);
  });

  it("completedTricks is empty array at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.completedTricks).toHaveLength(0);
  });

  it("completedTricksThisRound is 0 at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.completedTricksThisRound).toBe(0);
  });

  it("trumpSuit reflects Final Trump selection", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "C");
    const auth = buildAuth(state);
    expect(auth.trumpSuit).toBe("C");
  });

  it("primaryTrump is preserved in snapshot", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "C");
    const auth = buildAuth(state);
    expect(auth.primaryTrump).toBe("H");
  });

  it("consecutiveWins is [0, 0] at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.consecutiveWins).toEqual([0, 0]);
  });

  it("chhakri is null at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.chhakri).toBeNull();
  });

  it("playerCards populated for all 4 seats", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.playerCards).toBeDefined();
    for (let s = 0; s < 4; s++) {
      expect(auth.playerCards![s]).toBeDefined();
      const pc = auth.playerCards![s]!;
      expect(pc.secretHand.length + pc.faceDown.length + pc.faceUp.length).toBe(
        CARDS_PER_PLAYER[4],
      );
    }
  });

  it("Primary Trump stands path: trumpSuit equals primaryTrump in snapshot", () => {
    const { state } = stateAtPlayingViaPrimaryTrumpStands("D");
    const auth = buildAuth(state);
    expect(auth.trumpSuit).toBe("D");
    expect(auth.primaryTrump).toBe("D");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — snapshotToRoundState: playing-phase round-trip
// ---------------------------------------------------------------------------

describe("Scenario 5 — snapshotToRoundState: playing-phase round-trip", () => {
  it("phase is restored to 'playing'", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.phase).toBe("playing");
  });

  it("currentTrickLeaderSeat is restored", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("currentTrick is restored as empty array", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.currentTrick).toHaveLength(0);
  });

  it("trumpSuit is restored", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "C");
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.trumpSuit).toBe("C");
  });

  it("primaryTrump is restored", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "C");
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.primaryTrump).toBe("H");
  });

  it("completedTricks is restored as empty array", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.completedTricks).toHaveLength(0);
  });

  it("playerCards are restored for all 4 seats (needed for legal-move computation)", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.playerCards).toBeDefined();
    for (let s = 0; s < 4; s++) {
      const pc = restored.playerCards![s];
      expect(pc).toBeDefined();
      expect(pc!.secretHand.length + pc!.faceDown.length + pc!.faceUp.length).toBe(
        CARDS_PER_PLAYER[4],
      );
    }
  });

  it("restored state allows getLegalMovesZonedForSeat to run without throwing", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(() => getLegalMovesZonedForSeat(restored, winnerSeat, 4)).not.toThrow();
    expect(getLegalMovesZonedForSeat(restored, winnerSeat, 4).length).toBeGreaterThan(0);
  });

  it("consecutiveWins is restored as [0, 0]", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.consecutiveWins).toEqual([0, 0]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — buildValidActions: first trick leader vs. non-leader
// ---------------------------------------------------------------------------

describe("Scenario 6 — buildValidActions: first trick leader gets play_card", () => {
  it("leader seat gets exactly one action: play_card", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const actions = GameService.buildValidActions(auth, winnerSeat, 4);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("play_card");
  });

  it("leader's play_card action has at least one valid card", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const actions = GameService.buildValidActions(auth, winnerSeat, 4);
    const pa = actions.find((a) => a.type === "play_card");
    expect(pa?.validCards?.length).toBeGreaterThan(0);
  });

  it("non-leader seats get empty or zero-card actions", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    for (const s of [0, 1, 2, 3].filter((x) => x !== winnerSeat)) {
      const actions = GameService.buildValidActions(auth, s, 4);
      const pa = actions.find((a) => a.type === "play_card");
      if (pa) {
        expect(pa.validCards ?? []).toHaveLength(0);
      } else {
        expect(actions).toHaveLength(0);
      }
    }
  });

  it("Primary Trump stands: leader also gets play_card with valid cards", () => {
    const { state, winnerSeat } = stateAtPlayingViaPrimaryTrumpStands();
    const auth = buildAuth(state);
    const actions = GameService.buildValidActions(auth, winnerSeat, 4);
    expect(actions[0]?.type).toBe("play_card");
    expect(actions[0]?.validCards?.length).toBeGreaterThan(0);
  });

  it("no action in playing phase is 'select_trump' or 'bid' or 'pass'", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const leaderActions = GameService.buildValidActions(auth, winnerSeat, 4);
    for (const a of leaderActions) {
      expect(a.type).not.toBe("select_trump");
      expect(a.type).not.toBe("bid");
      expect(a.type).not.toBe("pass");
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — buildClientGameState: playing-phase field exposure
// ---------------------------------------------------------------------------

describe("Scenario 7 — buildClientGameState: playing-phase field exposure", () => {
  it("phase is 'playing'", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.phase).toBe("playing");
  });

  it("currentTrickLeaderSeat is exposed", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("currentTrick is exposed as empty array", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.currentTrick).toHaveLength(0);
  });

  it("completedTricksThisRound is 0", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.completedTricksThisRound).toBe(0);
  });

  it("trumpSuit is exposed", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S");
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.trumpSuit).toBe("S");
  });

  it("primaryTrump is exposed", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S");
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.primaryTrump).toBe("H");
  });

  it("own hand is visible (myHand populated)", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    // myHand is the flat hand array — zone-aware: secretHand + faceDown + faceUp = 8
    expect(client.mySecretHand.length + client.myFaceDown.length + client.myFaceUp.length).toBe(
      CARDS_PER_PLAYER[4],
    );
  });

  it("opponent seat has hand=null (hidden)", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    for (const [seatStr, seatData] of Object.entries(client.seats)) {
      const seat = Number(seatStr);
      if (seat !== 0) {
        expect(seatData.hand).toBeNull();
        expect(seatData.secretHand).toBeNull();
      }
    }
  });

  it("mySeat is set correctly for each requesting seat", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    for (const s of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(auth, s).mySeat).toBe(s);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Reconnect: playing-phase state restoration
// ---------------------------------------------------------------------------

describe("Scenario 8 — Reconnect: playing-phase state restoration", () => {
  it("buildClientGameState returns phase='playing' for a reconnecting player", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    for (const s of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(auth, s).phase).toBe("playing");
    }
  });

  it("reconnecting leader gets correct currentTrickLeaderSeat in client state", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, winnerSeat);
    expect(client.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("buildValidActions for reconnecting leader returns play_card", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const actions = GameService.buildValidActions(auth, winnerSeat, 4);
    expect(actions.some((a) => a.type === "play_card")).toBe(true);
  });

  it("buildValidActions for reconnecting non-leader returns no play_card with cards", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const nonLeader = (winnerSeat + 2) % 4;
    const actions = GameService.buildValidActions(auth, nonLeader, 4);
    const pa = actions.find((a) => a.type === "play_card");
    if (pa) {
      expect(pa.validCards ?? []).toHaveLength(0);
    }
  });

  it("snapshotToRoundState after round-trip allows legal-move computation for reconnect", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    const moves = getLegalMovesZonedForSeat(restored, winnerSeat, 4);
    expect(moves.length).toBeGreaterThan(0);
  });

  it("each seat gets correct mySeat in their reconnect snapshot", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    for (const s of [0, 1, 2, 3]) {
      expect(GameService.buildClientGameState(auth, s).mySeat).toBe(s);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — 4P and 6P variants
// ---------------------------------------------------------------------------

describe("Scenario 9 — 4-player and 6-player variants", () => {
  it("4P: 32 cards — each seat has 8 cards", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S", 4);
    const auth = buildAuth(state, 4);
    for (let s = 0; s < 4; s++) {
      const pc = auth.playerCards![s]!;
      expect(pc.secretHand.length + pc.faceDown.length + pc.faceUp.length).toBe(8);
    }
  });

  it("6P: 48 cards — each seat has 8 cards", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S", 6);
    const auth = buildAuth(state, 6);
    for (let s = 0; s < 6; s++) {
      const pc = auth.playerCards![s]!;
      expect(pc.secretHand.length + pc.faceDown.length + pc.faceUp.length).toBe(8);
    }
  });

  it("6P: phase is 'playing' after Final Trump selection", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S", 6);
    expect(state.phase).toBe("playing");
  });

  it("6P: currentTrickLeaderSeat is the winning bidder", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump("H", "S", 6);
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("6P: buildValidActions returns play_card for leader only", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump("H", "S", 6);
    const auth = buildAuth(state, 6);
    const leaderActions = GameService.buildValidActions(auth, winnerSeat, 6);
    expect(leaderActions[0]?.type).toBe("play_card");
    expect(leaderActions[0]?.validCards?.length).toBeGreaterThan(0);

    for (const s of [0, 1, 2, 3, 4, 5].filter((x) => x !== winnerSeat)) {
      const a = GameService.buildValidActions(auth, s, 6);
      const pa = a.find((x) => x.type === "play_card");
      if (pa) expect(pa.validCards ?? []).toHaveLength(0);
    }
  });

  it("6P: snapshotToRoundState restores all 6 playerCards entries", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S", 6);
    const auth = buildAuth(state, 6);
    const restored = GameService.snapshotToRoundState(auth, 6);
    expect(restored.playerCards).toBeDefined();
    for (let s = 0; s < 6; s++) {
      expect(restored.playerCards![s]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — State immutability
// ---------------------------------------------------------------------------

describe("Scenario 10 — State immutability", () => {
  it("applyTrumpSelection does not mutate the input RoundState", () => {
    const { state: preSelection } = (() => {
      const { state: afterPrimaryTrump, primarySeat } = stateAfterPrimaryTrump("H");
      // Round 1: raise to 6, others pass
      let s = applyBid(afterPrimaryTrump, primarySeat, 6, cfg(4));
      for (let i = 1; i < 4; i++) s = applyPass(s, (primarySeat + i) % 4);
      // Round 2: all pass → bidding ends (2 × 4 = 8 total actions)
      for (let i = 0; i < 4; i++) s = applyPass(s, (primarySeat + i) % 4);
      return { state: s };
    })();

    const phaseBefore = preSelection.phase;
    const leaderBefore = preSelection.currentTrickLeaderSeat;
    const winner = preSelection.highestBidderSeat!;

    applyTrumpSelection(preSelection, winner, "D", { allowNoTrump: false });

    // Input state must be unchanged
    expect(preSelection.phase).toBe(phaseBefore);
    expect(preSelection.currentTrickLeaderSeat).toBe(leaderBefore);
  });

  it("result of applyTrumpSelection is a new object reference", () => {
    const { state: atTrumpSelection, winnerSeat } = (() => {
      const { state: afterPrimaryTrump, primarySeat } = stateAfterPrimaryTrump("H");
      // Round 1: raise to 6, others pass
      let s = applyBid(afterPrimaryTrump, primarySeat, 6, cfg(4));
      for (let i = 1; i < 4; i++) s = applyPass(s, (primarySeat + i) % 4);
      // Round 2: all pass → bidding ends
      for (let i = 0; i < 4; i++) s = applyPass(s, (primarySeat + i) % 4);
      return { state: s, winnerSeat: s.highestBidderSeat! };
    })();

    const result = applyTrumpSelection(atTrumpSelection, winnerSeat, "C", {
      allowNoTrump: false,
    });
    expect(result).not.toBe(atTrumpSelection);
  });

  it("buildAuthoritativeSnapshot from two identical RoundStates produces identical snapshots", () => {
    const { state } = stateAtPlayingViaFinalTrump("H", "S");
    const a1 = buildAuth(state, 4, "game-1");
    const a2 = buildAuth(state, 4, "game-1");
    expect(a1.phase).toBe(a2.phase);
    expect(a1.currentTrickLeaderSeat).toBe(a2.currentTrickLeaderSeat);
    expect(a1.trumpSuit).toBe(a2.trumpSuit);
    expect(a1.primaryTrump).toBe(a2.primaryTrump);
  });
});

// ---------------------------------------------------------------------------
// Scenario 11 — Full pipeline integration
// ---------------------------------------------------------------------------

describe("Scenario 11 — Full pipeline integration (both bootstrap paths)", () => {
  it("Path A: initRound → primaryBid → primaryTrump → all-pass → playing (4P)", () => {
    const { state, winnerSeat } = stateAtPlayingViaPrimaryTrumpStands("C", 4);
    expect(state.phase).toBe("playing");
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
    expect(state.trumpSuit).toBe("C");
    expect(state.currentTrick).toHaveLength(0);
  });

  it("Path B: initRound → primaryBid → primaryTrump → raise → trump_selection → playing (4P)", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump("H", "D", 4);
    expect(state.phase).toBe("playing");
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
    expect(state.trumpSuit).toBe("D");
    expect(state.primaryTrump).toBe("H");
    expect(state.currentTrick).toHaveLength(0);
  });

  it("Path A (6P): all players pass → playing with Primary Trump standing", () => {
    const { state, winnerSeat } = stateAtPlayingViaPrimaryTrumpStands("S", 6);
    expect(state.phase).toBe("playing");
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
    expect(state.trumpSuit).toBe("S");
  });

  it("Path B (6P): raised bid → Final Trump → playing", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump("H", "C", 6);
    expect(state.phase).toBe("playing");
    expect(state.currentTrickLeaderSeat).toBe(winnerSeat);
    expect(state.trumpSuit).toBe("C");
  });

  it("full snapshot round-trip: auth → snapshotToRoundState → buildValidActions matches engine", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump("H", "S", 4);
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);

    // Direct engine computation
    const engineMoves = getLegalMovesZonedForSeat(state, winnerSeat, 4);
    // Via restored state
    const restoredMoves = getLegalMovesZonedForSeat(restored, winnerSeat, 4);

    expect(restoredMoves.sort()).toEqual(engineMoves.sort());
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — Playing-phase initial field consistency
// ---------------------------------------------------------------------------

describe("Scenario 12 — Playing-phase initial field consistency", () => {
  it("team0PointsThisRound and team1PointsThisRound are 0 at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.team0PointsThisRound).toBe(0);
    expect(auth.team1PointsThisRound).toBe(0);
  });

  it("highestBidderSeat equals currentTrickLeaderSeat at bootstrap", () => {
    const { state, winnerSeat } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.highestBidderSeat).toBe(winnerSeat);
    expect(auth.currentTrickLeaderSeat).toBe(winnerSeat);
  });

  it("noTrump is false at bootstrap (allowNoTrump=false)", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.noTrump).toBe(false);
  });

  it("biddingStatus is 'won' at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.biddingStatus).toBe("won");
  });

  it("currentBidderSeat is null in playing phase", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.currentBidderSeat).toBeNull();
  });

  it("roundNumber is preserved through bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    expect(auth.roundNumber).toBe(1);
  });

  it("snapshotToRoundState: capturedPoints is [0, 0] at bootstrap", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const restored = GameService.snapshotToRoundState(auth, 4);
    expect(restored.capturedPoints).toEqual([0, 0]);
  });

  it("buildClientGameState: consecutiveWins exposed as [0, 0]", () => {
    const { state } = stateAtPlayingViaFinalTrump();
    const auth = buildAuth(state);
    const client = GameService.buildClientGameState(auth, 0);
    expect(client.consecutiveWins).toEqual([0, 0]);
  });
});
