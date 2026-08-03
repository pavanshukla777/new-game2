// [MIG-002] [GAP-002] 4-player deck: 32 cards, 8 per player, 8 tricks per round.
// [MIG-003] [GAP-029] buildRoundResult now returns tricksWon (not capturedPoints).
// [MIG-004] [GAP-015] All bid values changed to {5, 6, 7, 8}.
// [MIG-021] [GAP-026] Zone-aware card tracking in applyPlayCard.
// [MIG-023] [GAP-024] Zone-aware getLegalMovesForSeat.
import { describe, it, expect } from "vitest";
import {
  initRound,
  applyBid,
  applyPass,
  applyTrumpSelection,
  applyPlayCard,
  callDouble,
  callRedouble,
  currentSeatForTrick,
  buildRoundResult,
  getLegalMovesForSeat,
} from "../round.js";
import { createSeededRng } from "../prng.js";
import { defaultGameConfig } from "../engine.js";
import { TRICKS_PER_ROUND, DECK_TOTAL_POINTS } from "../constants.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRound(seed = 42, overrides = {}) {
  const config = defaultGameConfig(4, overrides);
  const rng = createSeededRng(seed);
  return { state: initRound(1, 0, config, rng), config };
}

// Runs the bidding to completion with seat 1 bidding 5 (min) and others passing.
// [MIG-004] bid value changed from 55 → 5
function runBidding(state: ReturnType<typeof initRound>, config: ReturnType<typeof defaultGameConfig>) {
  let s = applyBid(state, 1, 5, config);
  s = applyPass(s, 2);
  s = applyPass(s, 3);
  s = applyPass(s, 0);
  return s;
}

// ---------------------------------------------------------------------------
// initRound
// ---------------------------------------------------------------------------

describe("initRound", () => {
  it("starts in bidding phase", () => {
    const { state } = makeRound();
    expect(state.phase).toBe("bidding");
  });
  // [MIG-002] 4-player deck: 8 cards per player
  it("deals 8 cards to each of 4 players", () => {
    const { state } = makeRound();
    for (let s = 0; s < 4; s++) expect(state.hands[s]).toHaveLength(8);
  });
  it("starts with a deal event", () => {
    const { state } = makeRound();
    expect(state.events[0].type).toBe("deal");
  });
  it("multiplier starts at 1", () => {
    const { state } = makeRound();
    expect(state.multiplier).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Double / Redouble
// ---------------------------------------------------------------------------

describe("callDouble", () => {
  it("sets multiplier to 2 and records a double event", () => {
    const { state, config } = makeRound();
    const next = callDouble(state, 2, config);
    expect(next.multiplier).toBe(2);
    expect(next.doubleSeat).toBe(2);
    expect(next.events.some((e) => e.type === "double")).toBe(true);
  });
  it("throws when Dobla is not enabled", () => {
    const { state, config } = makeRound(42, { allowDobla: false });
    expect(() => callDouble(state, 2, config)).toThrow(/not enabled/i);
  });
  it("throws when called after bidding has started", () => {
    const { state, config } = makeRound();
    const afterBid = applyBid(state, 1, 5, config);
    expect(() => callDouble(afterBid, 2, config)).toThrow(/before any bids/i);
  });
  it("throws when double already called", () => {
    const { state, config } = makeRound();
    const doubled = callDouble(state, 2, config);
    expect(() => callDouble(doubled, 3, config)).toThrow(/already been called/i);
  });
});

describe("callRedouble", () => {
  it("sets multiplier to 4 after double", () => {
    const { state, config } = makeRound();
    const doubled = callDouble(state, 2, config);
    const redoubled = callRedouble(doubled, 3, config);
    expect(redoubled.multiplier).toBe(4);
    expect(redoubled.redoubleSeat).toBe(3);
  });
  it("throws without prior double", () => {
    const { state, config } = makeRound();
    expect(() => callRedouble(state, 2, config)).toThrow(/without a prior double/i);
  });
});

// ---------------------------------------------------------------------------
// Bidding phase
// ---------------------------------------------------------------------------

describe("applyBid", () => {
  // [MIG-004] bid values changed to {5,6,7,8}
  it("updates highestBid and highestBidderSeat", () => {
    const { state, config } = makeRound();
    const next = applyBid(state, 1, 6, config);
    expect(next.highestBid).toBe(6);
    expect(next.highestBidderSeat).toBe(1);
  });
  it("transitions to trump_selection after winning bid", () => {
    const { state, config } = makeRound();
    let s = applyBid(state, 1, 5, config);
    s = applyPass(s, 2);
    s = applyPass(s, 3);
    s = applyPass(s, 0);
    expect(s.phase).toBe("trump_selection");
    expect(s.biddingStatus).toBe("won");
    expect(s.events.some((e) => e.type === "bid_won")).toBe(true);
  });
  it("throws wrong phase", () => {
    const { state, config } = makeRound();
    const afterBidding = runBidding(state, config);
    expect(() => applyBid(afterBidding, 1, 7, config)).toThrow(/phase/i);
  });
});

describe("applyPass", () => {
  it("records a pass event", () => {
    const { state } = makeRound();
    const next = applyPass(state, 1);
    expect(next.events.some((e) => e.type === "pass" && e.seat === 1)).toBe(true);
  });
  it("all-pass results in redeal event", () => {
    let { state } = makeRound();
    state = applyPass(state, 1);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    expect(state.biddingStatus).toBe("redeal");
    expect(state.events.some((e) => e.type === "redeal")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trump selection
// ---------------------------------------------------------------------------

describe("applyTrumpSelection", () => {
  it("sets trumpSuit and transitions to playing", () => {
    const { state, config } = makeRound();
    const afterBidding = runBidding(state, config);
    const next = applyTrumpSelection(afterBidding, 1, "H", config);
    expect(next.trumpSuit).toBe("H");
    expect(next.phase).toBe("playing");
    expect(next.currentTrickLeaderSeat).toBe(1); // bidder leads
  });
  it("records trump_selected event", () => {
    const { state, config } = makeRound();
    const afterBidding = runBidding(state, config);
    const next = applyTrumpSelection(afterBidding, 1, "S", config);
    expect(next.events.some((e) => e.type === "trump_selected")).toBe(true);
  });
  it("throws when wrong seat selects trump", () => {
    const { state, config } = makeRound();
    const afterBidding = runBidding(state, config);
    expect(() => applyTrumpSelection(afterBidding, 2, "S", config)).toThrow(/seat 1/i);
  });
  it("throws when not in trump_selection phase", () => {
    const { state, config } = makeRound();
    expect(() => applyTrumpSelection(state, 1, "S", config)).toThrow(/trump_selection/i);
  });
});

// ---------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------

describe("applyPlayCard", () => {
  function setupPlaying() {
    const config = defaultGameConfig(4);
    const rng = createSeededRng(1234);
    let state = initRound(1, 0, config, rng);
    // [MIG-004] bid changed from 55 → 5
    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "H", config);
    return { state, config };
  }

  it("removes card from player's hand", () => {
    const { state, config } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;
    const card = state.hands[leaderSeat][0];
    const next = applyPlayCard(state, leaderSeat, card, config);
    expect(next.hands[leaderSeat]).not.toContain(card);
    // [MIG-002] 4-player: 8 cards per hand; after playing 1 → 7 remain
    expect(next.hands[leaderSeat]).toHaveLength(7);
  });
  it("adds card to current trick", () => {
    const { state, config } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;
    const card = state.hands[leaderSeat][0];
    const next = applyPlayCard(state, leaderSeat, card, config);
    expect(next.currentTrick).toHaveLength(1);
    expect(next.currentTrick[0]).toEqual({ seat: leaderSeat, card });
  });
  it("throws when wrong seat plays", () => {
    const { state, config } = setupPlaying();
    const wrongSeat = (state.currentTrickLeaderSeat! + 1) % 4;
    const card = state.hands[wrongSeat][0];
    expect(() => applyPlayCard(state, wrongSeat, card, config)).toThrow(/seat/i);
  });
  it("throws when card not in hand", () => {
    const { state, config } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;
    expect(() => applyPlayCard(state, leaderSeat, "ZZZZ", config)).toThrow();
  });
  it("completes trick after 4 cards played", () => {
    const { state, config } = setupPlaying();
    let s = state;
    for (let i = 0; i < 4; i++) {
      const seat = currentSeatForTrick(s, 4);
      const legal = getLegalMovesForSeat(s, seat, 4);
      s = applyPlayCard(s, seat, legal[0], config);
    }
    expect(s.completedTricks).toHaveLength(1);
    expect(s.currentTrick).toHaveLength(0);
  });
  it("records play_card event", () => {
    const { state, config } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;
    const card = state.hands[leaderSeat][0];
    const next = applyPlayCard(state, leaderSeat, card, config);
    expect(next.events.some((e) => e.type === "play_card")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full round simulation
// ---------------------------------------------------------------------------

describe("full round simulation", () => {
  it("plays all 8 tricks and ends in round_ended (MIG-027: no early termination)", () => {
    // [MIG-027] No early round end — always 8 tricks whether or not Chhakri fires.
    const config = defaultGameConfig(4);
    const rng = createSeededRng(777);
    let state = initRound(1, 0, config, rng);

    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "H", config);

    while (state.phase === "playing") {
      const seat = currentSeatForTrick(state, 4);
      const legal = getLegalMovesForSeat(state, seat, 4);
      expect(legal.length).toBeGreaterThan(0);
      state = applyPlayCard(state, seat, legal[0], config);
    }

    expect(state.phase).toBe("round_ended");
    // [MIG-027] All 8 tricks ALWAYS played — regardless of Chhakri
    expect(state.completedTricks).toHaveLength(TRICKS_PER_ROUND[4]);
    // All card-points distributed
    expect(state.capturedPoints[0] + state.capturedPoints[1]).toBe(DECK_TOTAL_POINTS[4]);
  });

  it("captured points always sum to deck total (MIG-027: Chhakri no longer truncates)", () => {
    // [MIG-027] No early termination → all rounds play all 8 tricks →
    // total card-points always equal DECK_TOTAL_POINTS[4] = 80.
    for (let seed = 1; seed <= 10; seed++) {
      const config = defaultGameConfig(4);
      const rng = createSeededRng(seed);
      let state = initRound(1, 0, config, rng);
      state = applyBid(state, 1, 5, config);
      state = applyPass(state, 2);
      state = applyPass(state, 3);
      state = applyPass(state, 0);
      state = applyTrumpSelection(state, 1, "S", config);
      while (state.phase === "playing") {
        const seat = currentSeatForTrick(state, 4);
        const legal = getLegalMovesForSeat(state, seat, 4);
        state = applyPlayCard(state, seat, legal[0], config);
      }
      // [MIG-027] Always 80 points distributed, regardless of Chhakri
      expect(state.capturedPoints[0] + state.capturedPoints[1]).toBe(DECK_TOTAL_POINTS[4]);
    }
  });
});

// ---------------------------------------------------------------------------
// Chhakri rule
// ---------------------------------------------------------------------------

describe("Chhakri rule (MIG-027: no early termination)", () => {
  it("records Chhakri event but does NOT end round early — all 8 tricks must be played", () => {
    // [MIG-027] Chhakri fires (event recorded, state.chhakri set) when a team wins 6
    // consecutive tricks, but the round continues to all 8 tricks.
    const config = defaultGameConfig(4);
    const rng = createSeededRng(42);
    let state = initRound(1, 0, config, rng);
    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "S", config);

    // Play all tricks — do NOT stop on chhakri (round must continue)
    while (state.phase === "playing") {
      const seat = currentSeatForTrick(state, 4);
      const legal = getLegalMovesForSeat(state, seat, 4);
      state = applyPlayCard(state, seat, legal[0], config);
    }

    // Round must end after all 8 tricks regardless of Chhakri
    expect(state.phase).toBe("round_ended");
    expect(state.completedTricks).toHaveLength(TRICKS_PER_ROUND[4]);

    // If Chhakri did fire during this seed, verify the event was recorded
    if (state.chhakri !== null) {
      expect(state.events.some((e) => e.type === "chhakri")).toBe(true);
      // Chhakri trickIndex must be ≤ 5 (0-based: trick 5 = 6th consecutive)
      expect(state.chhakri.trickIndex).toBeLessThanOrEqual(5);
    }
  });

  it("Chhakri state continues in playing phase after the triggering trick", () => {
    // [MIG-027] After the 6th-consecutive-win trick: state.chhakri is set AND
    // phase transitions back to "playing" (not "round_ended") if tricks remain.
    const config = defaultGameConfig(4);
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createSeededRng(seed);
      let state = initRound(1, 0, config, rng);
      state = applyBid(state, 1, 5, config);
      state = applyPass(state, 2);
      state = applyPass(state, 3);
      state = applyPass(state, 0);
      state = applyTrumpSelection(state, 1, "H", config);

      while (state.phase === "playing") {
        const seat = currentSeatForTrick(state, 4);
        const legal = getLegalMovesForSeat(state, seat, 4);
        const prevTricks = state.completedTricks.length;
        state = applyPlayCard(state, seat, legal[0], config);
        const newTricks = state.completedTricks.length;

        // When a trick just completed and chhakri fired on that trick,
        // but we still have tricks remaining → phase must be "playing"
        if (newTricks > prevTricks && state.chhakri !== null && newTricks < 8) {
          expect(state.phase).toBe("playing");
        }
      }
      // Always ends after 8 tricks
      expect(state.completedTricks).toHaveLength(8);
    }
  });
});

// ---------------------------------------------------------------------------
// buildRoundResult
// ---------------------------------------------------------------------------

describe("buildRoundResult", () => {
  it("builds a correct RoundResult with tricksWon from round state", () => {
    const config = defaultGameConfig(4);
    const rng = createSeededRng(5);
    let state = initRound(1, 0, config, rng);
    // [MIG-004] bid 5
    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "S", config);
    while (state.phase === "playing") {
      const seat = currentSeatForTrick(state, 4);
      state = applyPlayCard(state, seat, getLegalMovesForSeat(state, seat, 4)[0], config);
    }
    const result = buildRoundResult(state);
    // [MIG-004] bid = 5 (minimum bid)
    expect(result.bid).toBe(5);
    expect(result.bidTeam).toBe(1); // seat 1 → team 1
    expect(result.defTeam).toBe(0);
    // [MIG-003] tricksWon replaces capturedPoints; total = 8 tricks per round
    // [MIG-027] No early termination → tricksWon always sums to 8
    const totalTricks = result.tricksWon[0] + result.tricksWon[1];
    expect(totalTricks).toBe(8);
    expect(result.multiplier).toBe(1);
  });
  it("tricksWon sums to total tricks played", () => {
    const config = defaultGameConfig(4);
    const rng = createSeededRng(77);
    let state = initRound(1, 0, config, rng);
    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "S", config);
    while (state.phase === "playing") {
      const seat = currentSeatForTrick(state, 4);
      state = applyPlayCard(state, seat, getLegalMovesForSeat(state, seat, 4)[0], config);
    }
    const result = buildRoundResult(state);
    expect(result.tricksWon[0] + result.tricksWon[1]).toBe(state.completedTricks.length);
  });
});

// ---------------------------------------------------------------------------
// MIG-021 / MIG-023 — Zone-aware card tracking
// [MIG-021] [GAP-026] applyPlayCard keeps playerCards in sync with flat hand.
// [MIG-023] [GAP-024] getLegalMovesForSeat uses zone-aware accessible zone.
// ---------------------------------------------------------------------------

describe("Zone-aware card tracking (MIG-021 / MIG-023)", () => {
  // Helper: advances to playing phase (seat 1 bids 5, all pass, trump=H)
  function setupPlaying(seed = 1234) {
    const config = defaultGameConfig(4);
    const rng = createSeededRng(seed);
    let state = initRound(1, 0, config, rng);
    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "H", config);
    return { state, config };
  }

  it("initRound populates playerCards with correct zone sizes", () => {
    const { state } = makeRound();
    expect(state.playerCards).toBeDefined();
    for (let s = 0; s < 4; s++) {
      const pc = state.playerCards![s];
      expect(pc).toBeDefined();
      expect(pc.secretHand).toHaveLength(2);
      expect(pc.faceDown).toHaveLength(3);
      expect(pc.faceUp).toHaveLength(3);
    }
  });

  it("playerCards contains the same cards as the flat hand for each seat", () => {
    const { state } = makeRound();
    for (let s = 0; s < 4; s++) {
      const pc = state.playerCards![s];
      const fromZones = [...pc.secretHand, ...pc.faceDown, ...pc.faceUp].sort();
      const fromHand = [...state.hands[s]].sort();
      expect(fromZones).toEqual(fromHand);
    }
  });

  it("applyPlayCard removes card from playerCards zone as well as flat hand", () => {
    const { state, config } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;
    const pcBefore = state.playerCards![leaderSeat];
    const totalBefore = pcBefore.secretHand.length + pcBefore.faceDown.length + pcBefore.faceUp.length;

    const legal = getLegalMovesForSeat(state, leaderSeat, 4);
    const card = legal[0];
    const next = applyPlayCard(state, leaderSeat, card, config);

    // Flat hand lost the card
    expect(next.hands[leaderSeat]).not.toContain(card);

    // playerCards also lost the card from its zone
    const pcAfter = next.playerCards![leaderSeat];
    const allZone = [...pcAfter.secretHand, ...pcAfter.faceDown, ...pcAfter.faceUp];
    expect(allZone).not.toContain(card);

    // Total zone count decreased by 1
    const totalAfter = pcAfter.secretHand.length + pcAfter.faceDown.length + pcAfter.faceUp.length;
    expect(totalAfter).toBe(totalBefore - 1);
  });

  it("flat hand and playerCards stay in sync after multiple plays", () => {
    const { state, config } = setupPlaying(9999);
    let s = state;
    // Play one full trick (4 cards)
    for (let i = 0; i < 4; i++) {
      const seat = currentSeatForTrick(s, 4);
      const legal = getLegalMovesForSeat(s, seat, 4);
      s = applyPlayCard(s, seat, legal[0], config);
    }
    // Verify each seat's zones match their flat hand
    for (let seat = 0; seat < 4; seat++) {
      const pc = s.playerCards![seat];
      const fromZones = [...pc.secretHand, ...pc.faceDown, ...pc.faceUp].sort();
      const fromHand = [...s.hands[seat]].sort();
      expect(fromZones).toEqual(fromHand);
    }
  });

  it("getLegalMovesForSeat returns only accessible zone cards (faceUp+secretHand)", () => {
    const { state } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;
    const pc = state.playerCards![leaderSeat];
    const accessible = [...pc.faceUp, ...pc.secretHand];

    const legal = getLegalMovesForSeat(state, leaderSeat, 4);

    // All legal moves must be in the accessible zone
    for (const card of legal) {
      expect(accessible).toContain(card);
    }
    // No faceDown cards should appear
    for (const card of legal) {
      expect(pc.faceDown).not.toContain(card);
    }
  });

  it("faceDown card becomes legal only when faceUp and secretHand are exhausted", () => {
    const { state, config } = setupPlaying();
    const leaderSeat = state.currentTrickLeaderSeat!;

    // Directly build a state where the leader's accessible zones are empty
    const onlyFaceDown = {
      secretHand: [] as string[],
      faceDown: [...state.playerCards![leaderSeat].faceDown],
      faceUp: [] as string[],
    };
    const manipulated = {
      ...state,
      playerCards: { ...state.playerCards!, [leaderSeat]: onlyFaceDown },
      // Sync the flat hand to just faceDown so validation passes
      hands: { ...state.hands, [leaderSeat]: [...onlyFaceDown.faceDown] },
    };

    const legal = getLegalMovesForSeat(manipulated, leaderSeat, 4);
    expect(legal.length).toBeGreaterThan(0);

    // All legal moves must come from faceDown
    for (const card of legal) {
      expect(onlyFaceDown.faceDown).toContain(card);
    }
  });

  it("full round simulation maintains zone consistency throughout (seed 1)", () => {
    const config = defaultGameConfig(4);
    const rng = createSeededRng(1);
    let state = initRound(1, 0, config, rng);
    state = applyBid(state, 1, 5, config);
    state = applyPass(state, 2);
    state = applyPass(state, 3);
    state = applyPass(state, 0);
    state = applyTrumpSelection(state, 1, "S", config);

    while (state.phase === "playing") {
      const seat = currentSeatForTrick(state, 4);
      const legal = getLegalMovesForSeat(state, seat, 4);
      expect(legal.length).toBeGreaterThan(0);
      state = applyPlayCard(state, seat, legal[0], config);

      // After each play: zones and flat hand must match for the active seat
      if (state.playerCards?.[seat]) {
        const pc = state.playerCards[seat];
        const fromZones = [...pc.secretHand, ...pc.faceDown, ...pc.faceUp].sort();
        const fromHand = [...state.hands[seat]].sort();
        expect(fromZones).toEqual(fromHand);
      }
    }

    expect(state.phase).toBe("round_ended");
  });
});
