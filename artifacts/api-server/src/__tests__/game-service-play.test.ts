/**
 * GameService play-card unit tests — Part 9.
 *
 * Tests that do NOT require a live database. They exercise:
 *   - buildAuthoritativeSnapshot: completedTricks field is populated (MIG-040)
 *   - snapshotToRoundState: completedTricks are restored from snapshot
 *   - buildValidActions: playing phase returns actual legal moves (MIG-046)
 *   - PlayCardResult: interface shape validation
 *
 * [MIG-040] Snapshot writes after each game event
 * [MIG-046] Zone-aware legal moves in playing phase
 */

import { describe, it, expect } from "vitest";
import { GameService } from "../services/game.service.js";
import type { AuthoritativeGameState } from "@workspace/db";
import {
  initRound,
  defaultGameConfig,
  applyBid,
  applyPass,
  applyTrumpSelection,
  applyPlayCard,
  getLegalMovesZonedForSeat,
  TRICKS_PER_ROUND,
} from "@workspace/game-engine";
import type { PlayerCount, RoundState, GameConfig } from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Advance a RoundState (any bidding mode) from its initial phase all the way
 * to the "playing" phase.  Works with both useTwoRoundBidding=false (the
 * default) and useTwoRoundBidding=true.
 *
 * With the default config (useTwoRoundBidding=false) initRound starts in
 * "bidding" phase, so the first call is applyBid.  With two-round bidding the
 * round starts in "primary_bid" — in that case we dynamically import the
 * primary-bid helpers to avoid depending on them in the default path.
 */
async function advanceToPlaying(
  round: RoundState,
  config: GameConfig,
  playerCount: 4 | 6 = 4,
): Promise<RoundState> {
  // Handle primary_bid / primary_trump_selection if present
  if (round.phase === "primary_bid") {
    const { applyPrimaryBid, applyPrimaryTrumpSelection } = await import(
      "@workspace/game-engine"
    );
    const primarySeat = (round.dealerSeat + 1) % playerCount;
    round = applyPrimaryBid(round, primarySeat);
    round = applyPrimaryTrumpSelection(round, primarySeat, "H", {
      allowNoTrump: false,
    });
  }

  // Regular bidding phase — one bid then all others pass.
  // Current bidder = (dealerSeat + 1 + bids.length) % playerCount (mirrors engine).
  if (round.phase === "bidding") {
    const firstBidder = (round.dealerSeat + 1 + round.bids.length) % playerCount;
    round = applyBid(round, firstBidder, 5, config);
    for (let i = 1; i < playerCount; i++) {
      const s = (firstBidder + i) % playerCount;
      round = applyPass(round, s);
    }
  }

  // Trump selection
  if (round.phase === "trump_selection") {
    round = applyTrumpSelection(round, round.highestBidderSeat!, "H", {
      allowNoTrump: false,
    });
  }

  if (round.phase !== "playing") {
    throw new Error(`Failed to reach playing phase — stuck at "${round.phase}"`);
  }
  return round;
}

/**
 * Play a single legal card for `seat` in the current trick.
 * Uses getLegalMovesZonedForSeat to always pick a valid card.
 */
function playLegalCard(
  round: RoundState,
  seat: number,
  config: GameConfig,
  playerCount: 4 | 6 = 4,
): RoundState {
  const legal = getLegalMovesZonedForSeat(round, seat, playerCount as PlayerCount);
  const card = legal[0];
  if (!card) throw new Error(`No legal card for seat ${seat} in phase "${round.phase}"`);
  return applyPlayCard(round, seat, card, config);
}

/**
 * Play one complete trick using legal moves for every seat.
 * Returns the round state after the trick is complete.
 */
function playOneTrick(
  round: RoundState,
  config: GameConfig,
  playerCount: 4 | 6 = 4,
): RoundState {
  const leader = round.currentTrickLeaderSeat!;
  for (let i = 0; i < playerCount; i++) {
    const seat = (leader + i) % playerCount;
    round = playLegalCard(round, seat, config, playerCount);
  }
  return round;
}

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

function makeAuthState(
  opts: Partial<AuthoritativeGameState> & { playerCount?: 4 | 6 } = {},
): AuthoritativeGameState {
  const playerCount = opts.playerCount ?? 4;
  const defaults: AuthoritativeGameState = {
    gameId: "game-test-1",
    roundNumber: 1,
    phase: "playing",
    sequence: 5,
    seats: makeSeats(playerCount),
    dealerSeat: 0,
    currentBidderSeat: null,
    highestBid: 5,
    highestBidderSeat: 1,
    bids: [],
    biddingStatus: "won",
    consecutivePasses: 0,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: "H",
    noTrump: false,
    currentTrickLeaderSeat: 1,
    currentTrick: [],
    completedTricksThisRound: 0,
    completedTricks: [],
    consecutiveTricks: null,
    consecutiveWins: [0, 0],
    chhakri: null,
    team0PointsThisRound: 0,
    team1PointsThisRound: 0,
    team0Score: 0,
    team1Score: 0,
    targetScore: 52,
  };
  return { ...defaults, ...opts } as AuthoritativeGameState;
}

// ---------------------------------------------------------------------------
// Test: buildAuthoritativeSnapshot — completedTricks (MIG-040)
// ---------------------------------------------------------------------------

describe("buildAuthoritativeSnapshot — completedTricks (MIG-040)", () => {
  it("stores empty completedTricks when no tricks have been played", () => {
    const config = defaultGameConfig(4);
    const round = initRound(1, 0, config);
    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g1",
      sequence: 0,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });
    expect(authState.completedTricks).toBeDefined();
    expect(authState.completedTricks).toHaveLength(0);
  });

  it("stores completed trick details after a full trick is played", async () => {
    const config = defaultGameConfig(4);
    let round = await advanceToPlaying(initRound(1, 0, config), config);

    // Play one full trick using legal moves
    round = playOneTrick(round, config);

    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g2",
      sequence: 4,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    expect(authState.completedTricks).toBeDefined();
    for (const ct of authState.completedTricks ?? []) {
      expect(ct).toHaveProperty("index");
      expect(ct).toHaveProperty("cards");
      expect(ct).toHaveProperty("ledSuit");
      expect(ct).toHaveProperty("winnerSeat");
      expect(ct).toHaveProperty("winnerTeam");
      expect(ct).toHaveProperty("points");
    }
  });
});

// ---------------------------------------------------------------------------
// Test: snapshotToRoundState — completedTricks round-trip (MIG-040)
// ---------------------------------------------------------------------------

describe("snapshotToRoundState — completedTricks round-trip (MIG-040)", () => {
  it("returns empty completedTricks when authState has none", () => {
    const authState = makeAuthState({ completedTricks: undefined });
    const roundState = GameService.snapshotToRoundState(authState, 4);
    expect(roundState.completedTricks).toHaveLength(0);
  });

  it("round-trips completed trick data back to engine format", () => {
    const authState = makeAuthState({
      completedTricks: [
        {
          index: 0,
          cards: [
            { seat: 1, card: "AH" },
            { seat: 2, card: "KH" },
            { seat: 3, card: "QH" },
            { seat: 0, card: "JH" },
          ],
          ledSuit: "H",
          winnerSeat: 1,
          winnerTeam: 1,
          points: 15,
        },
      ],
      completedTricksThisRound: 1,
    });

    const roundState = GameService.snapshotToRoundState(authState, 4);
    expect(roundState.completedTricks).toHaveLength(1);
    const ct = roundState.completedTricks[0]!;
    expect(ct.index).toBe(0);
    expect(ct.winnerSeat).toBe(1);
    expect(ct.winnerTeam).toBe(1);
    expect(ct.points).toBe(15);
    expect(ct.ledSuit).toBe("H");
    expect(ct.cards).toHaveLength(4);
  });

  it("multiple completed tricks are all restored", () => {
    const authState = makeAuthState({
      completedTricks: [
        {
          index: 0,
          cards: [{ seat: 0, card: "AH" }, { seat: 1, card: "2H" }, { seat: 2, card: "3H" }, { seat: 3, card: "4H" }],
          ledSuit: "H",
          winnerSeat: 0,
          winnerTeam: 0,
          points: 11,
        },
        {
          index: 1,
          cards: [{ seat: 0, card: "AS" }, { seat: 1, card: "2S" }, { seat: 2, card: "3S" }, { seat: 3, card: "4S" }],
          ledSuit: "S",
          winnerSeat: 0,
          winnerTeam: 0,
          points: 11,
        },
      ],
      completedTricksThisRound: 2,
    });

    const roundState = GameService.snapshotToRoundState(authState, 4);
    expect(roundState.completedTricks).toHaveLength(2);
    expect(roundState.completedTricks[0]!.index).toBe(0);
    expect(roundState.completedTricks[1]!.index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test: buildValidActions — playing phase returns legal moves (MIG-046)
// ---------------------------------------------------------------------------

describe("buildValidActions — playing phase (MIG-046)", () => {
  it("returns play_card action in playing phase", async () => {
    const config = defaultGameConfig(4);
    const round = await advanceToPlaying(initRound(1, 0, config), config);

    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g3",
      sequence: 4,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    const leaderSeat = round.currentTrickLeaderSeat!;
    const actions = GameService.buildValidActions(authState, leaderSeat, 4);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("play_card");
    expect(actions[0]!.validCards).toBeDefined();
    expect(actions[0]!.validCards!.length).toBeGreaterThan(0);
  });

  it("non-leader seat in the same trick also gets legal moves", async () => {
    const config = defaultGameConfig(4);
    let round = await advanceToPlaying(initRound(1, 0, config), config);

    // Play the leader's card to advance to the second actor
    const leader = round.currentTrickLeaderSeat!;
    const leaderCard = round.hands[leader]![0]!;
    round = applyPlayCard(round, leader, leaderCard, config);

    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g4",
      sequence: 5,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    const nextSeat = (leader + 1) % 4;
    const actions = GameService.buildValidActions(authState, nextSeat, 4);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe("play_card");
    expect(actions[0]!.validCards!.length).toBeGreaterThan(0);
  });

  it("non-acting seat in playing phase gets empty actions", async () => {
    const config = defaultGameConfig(4);
    const round = await advanceToPlaying(initRound(1, 0, config), config);

    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g5",
      sequence: 4,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    const leader = round.currentTrickLeaderSeat!;
    const nonLeader = (leader + 2) % 4; // not the current actor

    const actions = GameService.buildValidActions(authState, nonLeader, 4);
    const playCard = actions.find((a) => a.type === "play_card");
    if (playCard) {
      expect(playCard.validCards).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: completedTricksThisRound consistency (MIG-040)
// ---------------------------------------------------------------------------

describe("completedTricksThisRound consistency (MIG-040)", () => {
  it("completedTricksThisRound matches completedTricks.length", async () => {
    const config = defaultGameConfig(4);
    let round = await advanceToPlaying(initRound(1, 0, config), config);

    // Play 2 full tricks using legal moves
    round = playOneTrick(round, config);
    round = playOneTrick(round, config);

    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g6",
      sequence: 10,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    expect(authState.completedTricksThisRound).toBe(authState.completedTricks?.length ?? 0);
  });

  it("total TRICKS_PER_ROUND tricks at round_ended", async () => {
    const config = defaultGameConfig(4);
    let round = await advanceToPlaying(initRound(1, 0, config), config);

    // Play all 8 tricks using legal moves
    while (round.phase === "playing") {
      round = playOneTrick(round, config);
    }

    expect(round.phase).toBe("round_ended");
    expect(round.completedTricks).toHaveLength(TRICKS_PER_ROUND[4]);

    const authState = GameService.buildAuthoritativeSnapshot({
      gameId: "g7",
      sequence: 32,
      roundNumber: 1,
      roundState: round,
      playerCount: 4,
      gameScores: [0, 0],
      targetScore: 52,
      seatData: [0, 1, 2, 3].map((s) => ({
        seat: s,
        userId: `u${s}`,
        displayName: `P${s}`,
        isAi: false,
        connectionState: "CONNECTED" as const,
      })),
    });

    expect(authState.completedTricks).toHaveLength(TRICKS_PER_ROUND[4]);
    expect(authState.completedTricksThisRound).toBe(TRICKS_PER_ROUND[4]);
  });
});
