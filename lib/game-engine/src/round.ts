// ============================================================================
// Bundelkhandi Chhakri — Round State Machine
// ============================================================================
//
// A round proceeds through these phases (GamePhase):
//
// Legacy mode (useTwoRoundBidding = false):
//   dealing → bidding → trump_selection → playing → trick_ended →
//   (loop back to playing) → round_ended
//
// [MIG-024] [MIG-025] Two-round mode (useTwoRoundBidding = true):
//   dealing → primary_bid → primary_trump_selection →
//   bidding → (trump_selection if Final Bid > Primary Bid, else) →
//   playing → trick_ended → (loop) → round_ended
//
// This module owns the canonical round state and exposes pure functions to
// advance it. All mutations return a new RoundState object.
// ============================================================================

import type {
  CardCode,
  CompletedTrick,
  GameConfig,
  GameEvent,
  GamePhase,
  Multiplier,
  PlayerCount,
  RangeRng,
  RoundResult,
  RoundState,
  Suit,
  TeamId,
  TrickCard,
} from "./types.js";
import {
  CARDS_PER_PLAYER,
  CHHAKRI_THRESHOLD,
  TRICKS_PER_ROUND,
  PRIMARY_BID_AMOUNT,
} from "./constants.js";
import { dealCards } from "./deck.js";
import {
  buildZonedHands,
  removeCardFromZone,
  dealPhase1Cards,
  dealPhase2Cards,
  dealPhase3Cards,
} from "./dealing.js";
import type { BiddingState } from "./bidding.js";
import { initBiddingState, placeBid, passBid } from "./bidding.js";
import { seatToTeam } from "./turn-order.js";
import { evaluateTrick } from "./trick.js";
import { validateMove, getLegalMoves, getLegalMovesZoned, validateMoveZoned } from "./move-validator.js";
import { createEvent } from "./replay.js";
import { cryptoRng } from "./prng.js";

// ---------------------------------------------------------------------------
// Round initialisation
// ---------------------------------------------------------------------------

/**
 * Creates the initial round state and deals cards.
 *
 * Behaviour depends on GameConfig.useTwoRoundBidding:
 *
 * false (legacy, default):
 *   Deals all 8 cards at once. Phase starts at "bidding".
 *   Pass-elimination bidding applies.
 *
 * [MIG-024] [MIG-025] true (two-round Rulebook protocol):
 *   Deals only Phase 1 (2 secret-hand cards per player). Phase starts at
 *   "primary_bid" to enforce the forced bid=5 by the first Secret Hand
 *   recipient before Phases 2 and 3 are dealt.
 */
export function initRound(
  roundNumber: number,
  dealerSeat: number,
  config: GameConfig,
  rng: RangeRng = cryptoRng,
): RoundState {
  const useTwoRound = config.useTwoRoundBidding ?? false;

  if (useTwoRound) {
    // [MIG-024] Phase 1 only: 2 secret-hand cards per player
    const phase1 = dealPhase1Cards(config.playerCount, dealerSeat, rng);

    const dealEvent = createEvent(0, "deal", undefined, {
      shuffledDeck: phase1.shuffledDeck,
      dealerSeat,
    });

    // Flat hands contain only Phase 1 cards at this point
    const partialHands: Record<number, CardCode[]> = {};
    for (let seat = 0; seat < config.playerCount; seat++) {
      const pc = phase1.playerCards[seat];
      partialHands[seat] = [...(pc?.secretHand ?? [])];
    }

    return {
      roundNumber,
      dealerSeat,
      phase: "primary_bid" as GamePhase,
      hands: partialHands,
      playerCards: phase1.playerCards,
      remainingDeck: phase1.remainingDeck,
      shuffledDeck: phase1.shuffledDeck,
      bids: [],
      consecutivePasses: 0,
      highestBid: 0,
      highestBidderSeat: null,
      biddingStatus: "ongoing",
      useTwoRoundBidding: true,
      primaryTrump: null,
      multiplier: 1,
      doubleSeat: null,
      redoubleSeat: null,
      trumpSuit: null,
      noTrump: false,
      currentTrickLeaderSeat: null,
      currentTrick: [],
      completedTricks: [],
      consecutiveWins: [0, 0],
      chhakri: null,
      capturedPoints: [0, 0],
      events: [dealEvent],
      nextSequence: 1,
    };
  }

  // Legacy: deal all 8 cards at once, start in bidding phase
  const { hands, shuffledDeck } = dealCards(config.playerCount, dealerSeat, rng);

  const dealEvent = createEvent(0, "deal", undefined, {
    shuffledDeck,
    dealerSeat,
  });

  // [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
  const playerCards = buildZonedHands(hands);

  return {
    roundNumber,
    dealerSeat,
    phase: "bidding",
    hands,
    playerCards,
    remainingDeck: undefined,
    shuffledDeck,
    bids: [],
    consecutivePasses: 0,
    highestBid: 0,
    highestBidderSeat: null,
    biddingStatus: "ongoing",
    useTwoRoundBidding: false,
    primaryTrump: null,
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,
    noTrump: false,
    currentTrickLeaderSeat: null,
    currentTrick: [],
    completedTricks: [],
    consecutiveWins: [0, 0],
    chhakri: null,
    capturedPoints: [0, 0],
    events: [dealEvent],
    nextSequence: 1,
  };
}

// ---------------------------------------------------------------------------
// [MIG-024] Primary Bid phase
// ---------------------------------------------------------------------------

/**
 * Applies the mandatory Primary Bid (forced value = PRIMARY_BID_AMOUNT = 5).
 *
 * Only the first Secret Hand recipient (dealerSeat + 1) may call this.
 * The bid amount is NOT provided by the caller — it is always PRIMARY_BID_AMOUNT.
 * Passing is illegal in the Primary Bid phase.
 *
 * Transitions phase: "primary_bid" → "primary_trump_selection"
 *
 * [MIG-024] [GAP-014] Rulebook Section: "Primary Bid"
 * Implements: "Mandatory value = 5; cannot be passed; cannot be any other value."
 */
export function applyPrimaryBid(
  state: RoundState,
  seat: number,
): RoundState {
  assertPhase(state, "primary_bid");

  const playerCount = Object.keys(state.hands).length as PlayerCount;
  const expectedSeat = (state.dealerSeat + 1) % playerCount;

  if (seat !== expectedSeat) {
    throw new Error(
      `Only seat ${expectedSeat} may place the Primary Bid, not seat ${seat}.`,
    );
  }

  // Primary Bid is forced to PRIMARY_BID_AMOUNT — no choice
  const event = createEvent(state.nextSequence, "primary_bid", seat, {
    amount: PRIMARY_BID_AMOUNT,
    seat,
  });

  return appendEvent(
    {
      ...state,
      highestBid: PRIMARY_BID_AMOUNT,
      highestBidderSeat: seat,
      // bids[] intentionally NOT updated — Primary Bid is pre-round; regular bids start from []
      phase: "primary_trump_selection" as GamePhase,
    },
    event,
  );
}

/**
 * Applies the mandatory Primary Trump selection immediately after the Primary Bid.
 *
 * Only the Primary Bid holder may call this (same seat as Primary Bid).
 * After selection: deals Phase 2 (face-down) and Phase 3 (face-up) cards,
 * then transitions to the regular "bidding" phase.
 *
 * [MIG-024] [GAP-014] Rulebook Section: "Primary Trump"
 * Implements: "Selected immediately after Primary Bid; by same player; mandatory."
 * [MIG-020] [GAP-003] Implements: phased deal wiring — Phase 2 + 3 after Primary Bid.
 */
export function applyPrimaryTrumpSelection(
  state: RoundState,
  seat: number,
  suit: Suit | null,
  config: Pick<GameConfig, "allowNoTrump">,
): RoundState {
  assertPhase(state, "primary_trump_selection");

  const playerCount = Object.keys(state.hands).length as PlayerCount;
  const expectedSeat = state.highestBidderSeat; // set by applyPrimaryBid

  if (seat !== expectedSeat) {
    throw new Error(
      `Only seat ${expectedSeat} (the Primary Bidder) may select the Primary Trump.`,
    );
  }
  if (suit === null && !config.allowNoTrump) {
    throw new Error("No Trump is not enabled in this game configuration.");
  }
  if (!state.remainingDeck) {
    throw new Error(
      "applyPrimaryTrumpSelection: remainingDeck not set — was initRound called with useTwoRoundBidding=true?",
    );
  }
  if (!state.playerCards) {
    throw new Error(
      "applyPrimaryTrumpSelection: playerCards not set — was initRound called with useTwoRoundBidding=true?",
    );
  }

  // Deal Phase 2 (face-down) immediately followed by Phase 3 (face-up)
  const dealerSeat = state.dealerSeat;
  const phase2 = dealPhase2Cards(
    state.playerCards,
    state.remainingDeck,
    playerCount,
    dealerSeat,
  );
  const phase3 = dealPhase3Cards(
    phase2.playerCards,
    phase2.remainingDeck,
    playerCount,
    dealerSeat,
  );

  // Rebuild flat hands with all 8 cards
  const fullHands: Record<number, CardCode[]> = {};
  for (let s = 0; s < playerCount; s++) {
    const pc = phase3.playerCards[s];
    if (pc) {
      fullHands[s] = [...pc.secretHand, ...pc.faceDown, ...pc.faceUp];
    }
  }

  const event = createEvent(state.nextSequence, "primary_trump_selected", seat, {
    suit,
    seat,
  });

  return appendEvent(
    {
      ...state,
      primaryTrump: suit,
      hands: fullHands,
      playerCards: phase3.playerCards,
      remainingDeck: undefined, // All cards now dealt
      phase: "bidding" as GamePhase,
      // highestBid and highestBidderSeat remain set from applyPrimaryBid
      // Regular bidding begins from bids: [] but with highestBid = PRIMARY_BID_AMOUNT
    },
    event,
  );
}

// ---------------------------------------------------------------------------
// Dobla / Char-Guna (Double / Redouble)
// ---------------------------------------------------------------------------

/**
 * A player calls "Double" (Dobla) before bidding starts.
 * May only be called once and only during the bidding phase.
 */
export function callDouble(
  state: RoundState,
  seat: number,
  config: Pick<GameConfig, "allowDobla">,
): RoundState {
  if (!config.allowDobla) throw new Error("Dobla (Double) is not enabled.");
  if (state.phase !== "bidding") throw new Error("Double can only be called during the bidding phase.");
  if (state.doubleSeat !== null) throw new Error("Double has already been called.");
  if (state.bids.length > 0) throw new Error("Double must be called before any bids are placed.");

  const event = createEvent(state.nextSequence, "double", seat, { seat });
  return appendEvent({ ...state, doubleSeat: seat, multiplier: 2 }, event);
}

/**
 * A player calls "Redouble" (Char-Guna) in response to a Double.
 * May only be called after a Double has been declared.
 */
export function callRedouble(
  state: RoundState,
  seat: number,
  config: Pick<GameConfig, "allowDobla">,
): RoundState {
  if (!config.allowDobla) throw new Error("Char-Guna (Redouble) is not enabled.");
  if (state.phase !== "bidding") throw new Error("Redouble can only be called during the bidding phase.");
  if (state.doubleSeat === null) throw new Error("Cannot Redouble without a prior Double.");
  if (state.redoubleSeat !== null) throw new Error("Redouble has already been called.");
  if (state.bids.length > 0) throw new Error("Redouble must be called before any bids are placed.");

  const event = createEvent(state.nextSequence, "redouble", seat, { seat });
  return appendEvent(
    { ...state, redoubleSeat: seat, multiplier: 4 as Multiplier },
    event,
  );
}

// ---------------------------------------------------------------------------
// Bidding phase
// ---------------------------------------------------------------------------

/**
 * Places a bid on behalf of a seat.
 *
 * After two-round bidding completes (MIG-025), applies MIG-026 logic:
 * - If highestBid > PRIMARY_BID_AMOUNT and primaryTrump was set → "trump_selection"
 * - If highestBid === PRIMARY_BID_AMOUNT and primaryTrump was set → "playing" with primaryTrump
 * - Legacy (primaryTrump === null) → "trump_selection" always
 */
export function applyBid(
  state: RoundState,
  seat: number,
  amount: number,
  config: Pick<GameConfig, "minBid">,
): RoundState {
  assertPhase(state, "bidding");

  const biddingState = reconstructBiddingState(state);
  const updated = placeBid(biddingState, seat, amount, config);

  const event = createEvent(state.nextSequence, "bid", seat, { amount });

  let next = appendEvent(
    {
      ...state,
      bids: updated.bids,
      consecutivePasses: updated.consecutivePasses,
      highestBid: updated.highestBid,
      highestBidderSeat: updated.highestBidderSeat,
      biddingStatus: updated.status,
    },
    event,
  );

  if (updated.status === "won") {
    next = applyBiddingWon(next, updated);
  } else if (updated.status === "redeal") {
    const redealEvent = createEvent(next.nextSequence, "redeal", undefined, {});
    next = appendEvent(next, redealEvent);
  }

  return next;
}

/**
 * Records a pass on behalf of a seat.
 */
export function applyPass(
  state: RoundState,
  seat: number,
): RoundState {
  assertPhase(state, "bidding");

  const biddingState = reconstructBiddingState(state);
  const updated = passBid(biddingState, seat);

  const event = createEvent(state.nextSequence, "pass", seat, {});

  let next = appendEvent(
    {
      ...state,
      bids: updated.bids,
      consecutivePasses: updated.consecutivePasses,
      highestBid: updated.highestBid,
      highestBidderSeat: updated.highestBidderSeat,
      biddingStatus: updated.status,
    },
    event,
  );

  if (updated.status === "won") {
    next = applyBiddingWon(next, updated);
  } else if (updated.status === "redeal") {
    const redealEvent = createEvent(next.nextSequence, "redeal", undefined, {});
    next = appendEvent(next, redealEvent);
  }

  return next;
}

/**
 * Applies the bidding-won transition, handling MIG-026 Primary vs Final Trump.
 *
 * [MIG-026] [GAP-019] Rulebook Section: "Trump — Primary vs Final"
 * Implements:
 *   If Final Bid > Primary Bid → request Final Trump (phase = "trump_selection")
 *   If Final Bid === Primary Bid → Primary Trump stands (phase = "playing")
 * Legacy (primaryTrump === null) → "trump_selection" always (unchanged behaviour)
 */
function applyBiddingWon(
  state: RoundState,
  biddingState: BiddingState,
): RoundState {
  const wonEvent = createEvent(
    state.nextSequence,
    "bid_won",
    biddingState.highestBidderSeat ?? undefined,
    {
      bid: biddingState.highestBid,
      seat: biddingState.highestBidderSeat,
    },
  );

  // [MIG-026] If a Primary Trump was selected and no one raised the bid,
  // the Primary Trump stands — skip Final Trump selection and go to playing.
  if (
    state.primaryTrump !== null &&
    biddingState.highestBid === PRIMARY_BID_AMOUNT
  ) {
    return appendEvent(
      {
        ...state,
        phase: "playing" as GamePhase,
        trumpSuit: state.primaryTrump,
        noTrump: false,
        currentTrickLeaderSeat: biddingState.highestBidderSeat,
      },
      wonEvent,
    );
  }

  // Final Trump selection needed (legacy or final bid > primary bid)
  return appendEvent(
    { ...state, phase: "trump_selection" as GamePhase },
    wonEvent,
  );
}

// ---------------------------------------------------------------------------
// Trump selection
// ---------------------------------------------------------------------------

/**
 * The winning bidder declares the trump suit (or no-trump).
 * Used for Final Trump selection (trump_selection phase) only.
 * For Primary Trump, use applyPrimaryTrumpSelection.
 *
 * [MIG-026] [GAP-019] This handles the FINAL Trump after regular 2-round bidding
 * when the Final Bid exceeded the Primary Bid.
 */
export function applyTrumpSelection(
  state: RoundState,
  seat: number,
  suit: Suit | null,
  config: Pick<GameConfig, "allowNoTrump">,
): RoundState {
  assertPhase(state, "trump_selection");

  if (state.highestBidderSeat !== seat) {
    throw new Error(
      `Only seat ${state.highestBidderSeat} (the winning bidder) may declare trump.`,
    );
  }
  if (suit === null && !config.allowNoTrump) {
    throw new Error("No Trump is not enabled in this game configuration.");
  }

  const event = createEvent(state.nextSequence, "trump_selected", seat, {
    suit,
    noTrump: suit === null,
  });

  // Bidder leads the first trick
  return appendEvent(
    {
      ...state,
      trumpSuit: suit,
      noTrump: suit === null,
      phase: "playing" as GamePhase,
      currentTrickLeaderSeat: seat,
    },
    event,
  );
}

// ---------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------

/**
 * Plays a card from a seat's hand.
 * Validates legality, appends to the current trick, and evaluates if complete.
 */
export function applyPlayCard(
  state: RoundState,
  seat: number,
  card: CardCode,
  config: GameConfig,
): RoundState {
  assertPhase(state, "playing");

  // Validate it's this seat's turn
  const expectedSeat = currentSeatForTrick(state, config.playerCount);
  if (expectedSeat !== seat) {
    throw new Error(
      `It is seat ${expectedSeat}'s turn to play, not seat ${seat}.`,
    );
  }

  // Validate the move is legal
  // [MIG-023] [GAP-024] Use zone-aware validation when playerCards is populated.
  if (state.playerCards?.[seat]) {
    const zr = validateMoveZoned(card, state.playerCards[seat], state.currentTrick);
    if (!zr.valid) throw new Error(zr.reason);
  } else {
    const fr = validateMove(card, state.hands[seat], state.currentTrick);
    if (!fr.valid) throw new Error(fr.reason);
  }

  // Remove card from flat hand
  const newHand = state.hands[seat].filter((c) => c !== card);
  const newHands = { ...state.hands, [seat]: newHand };

  // [MIG-021] [GAP-026] Keep playerCards in sync — remove from the correct zone.
  const newPlayerCards = state.playerCards
    ? { ...state.playerCards, [seat]: removeCardFromZone(state.playerCards[seat], card) }
    : state.playerCards;

  const newTrick: TrickCard[] = [...state.currentTrick, { seat, card }];

  const playEvent = createEvent(state.nextSequence, "play_card", seat, { card });
  let next = appendEvent(
    { ...state, hands: newHands, playerCards: newPlayerCards, currentTrick: newTrick },
    playEvent,
  );

  // Trick complete when all players have played
  if (newTrick.length === config.playerCount) {
    next = completeTrick(next, config);
  }

  return next;
}

// ---------------------------------------------------------------------------
// Trick completion
// ---------------------------------------------------------------------------

function completeTrick(state: RoundState, config: GameConfig): RoundState {
  const result = evaluateTrick(
    state.completedTricks.length,
    state.currentTrick,
    state.trumpSuit,
  );

  const newCompletedTricks: CompletedTrick[] = [
    ...state.completedTricks,
    result,
  ];

  // Update captured points
  const newCaptured: [number, number] = [
    state.capturedPoints[0] + (result.winnerTeam === 0 ? result.points : 0),
    state.capturedPoints[1] + (result.winnerTeam === 1 ? result.points : 0),
  ];

  // Update consecutive wins tracker
  const winTeam = result.winnerTeam;
  const loseTeam = (1 - winTeam) as TeamId;
  const newConsecutive: [number, number] = [...state.consecutiveWins] as [number, number];
  newConsecutive[winTeam] = state.consecutiveWins[winTeam] + 1;
  newConsecutive[loseTeam] = 0;

  const trickEvent = createEvent(
    state.nextSequence,
    "trick_ended",
    result.winnerSeat,
    {
      trickIndex: result.index,
      winnerSeat: result.winnerSeat,
      winnerTeam: result.winnerTeam,
      points: result.points,
      cards: result.cards,
    },
  );

  let next = appendEvent(
    {
      ...state,
      completedTricks: newCompletedTricks,
      currentTrick: [],
      capturedPoints: newCaptured,
      consecutiveWins: newConsecutive,
      phase: "trick_ended" as GamePhase,
    },
    trickEvent,
  );

  // --- Chhakri check ---
  // [MIG-027] [GAP-027] Rulebook Section: "Trick Resolution — no early end"
  // Chhakri event is recorded when a team wins 6 consecutive tricks, but the
  // round is NOT ended early. Play always continues to exactly 8 tricks.
  if (newConsecutive[winTeam] >= CHHAKRI_THRESHOLD && state.chhakri === null) {
    const chhakri = { team: winTeam, trickIndex: result.index };
    const chhakEvent = createEvent(next.nextSequence, "chhakri", result.winnerSeat, {
      team: winTeam,
      trickIndex: result.index,
      consecutiveWins: newConsecutive[winTeam],
    });
    next = appendEvent({ ...next, chhakri }, chhakEvent);
    // Round continues — no early termination.
  }

  // --- Round complete? ---
  const totalTricks = TRICKS_PER_ROUND[config.playerCount];
  if (newCompletedTricks.length >= totalTricks) {
    return endRound(next, config);
  }

  // Continue: winner of trick leads next
  return {
    ...next,
    currentTrickLeaderSeat: result.winnerSeat,
    phase: "playing" as GamePhase,
  };
}

// ---------------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------------

function endRound(state: RoundState, config: GameConfig): RoundState {
  const roundEndEvent = createEvent(
    state.nextSequence,
    "round_ended",
    undefined,
    {
      capturedPoints: state.capturedPoints,
      chhakri: state.chhakri,
      highestBid: state.highestBid,
      highestBidderSeat: state.highestBidderSeat,
      multiplier: state.multiplier,
    },
  );

  return appendEvent(
    { ...state, phase: "round_ended" as GamePhase },
    roundEndEvent,
  );
}

// ---------------------------------------------------------------------------
// Derived getters
// ---------------------------------------------------------------------------

/**
 * Returns the seat that should play next in the current trick.
 */
export function currentSeatForTrick(
  state: RoundState,
  playerCount: PlayerCount,
): number {
  if (state.currentTrickLeaderSeat === null) {
    throw new Error("No trick leader set — trump has not been declared yet.");
  }
  return (
    (state.currentTrickLeaderSeat + state.currentTrick.length) % playerCount
  );
}

/**
 * Builds a RoundResult summary suitable for calculateRoundScore.
 *
 * [MIG-003] [GAP-029] Rulebook Section: "Scoring — trick count model"
 * Implements: RoundResult now carries tricksWon (per-team trick count)
 *   instead of capturedPoints (card-point accumulation).
 */
export function buildRoundResult(state: RoundState): RoundResult {
  if (state.highestBidderSeat === null) {
    throw new Error("Round ended without a winning bidder — redeal required.");
  }

  const bidTeam = seatToTeam(state.highestBidderSeat);
  const defTeam = (1 - bidTeam) as TeamId;

  // [MIG-003] Count tricks won per team from completed trick records
  const tricksWon: [number, number] = [0, 0];
  for (const trick of state.completedTricks) {
    tricksWon[trick.winnerTeam]++;
  }

  return {
    bidTeam,
    defTeam,
    bid: state.highestBid,
    tricksWon,
    multiplier: state.multiplier,
    chhakri: state.chhakri !== null ? { team: state.chhakri.team } : null,
  };
}

/**
 * Returns the current legal moves for a seat.
 * Returns an empty array if it is not that seat's turn.
 *
 * [MIG-023] [GAP-024] Uses zone-aware move computation when playerCards is
 * populated (MIG-017 onwards). Falls back to flat-hand computation for
 * pre-zone test fixtures that do not carry playerCards.
 */
export function getLegalMovesForSeat(
  state: RoundState,
  seat: number,
  playerCount: PlayerCount,
): CardCode[] {
  if (state.phase !== "playing") return [];
  const expected = currentSeatForTrick(state, playerCount);
  if (expected !== seat) return [];
  // Zone-aware path (primary — MIG-023)
  if (state.playerCards?.[seat]) {
    return getLegalMovesZoned(state.playerCards[seat], state.currentTrick);
  }
  // Legacy flat-hand path (backward compat with pre-zone fixtures)
  return getLegalMoves(state.hands[seat] ?? [], state.currentTrick);
}

/**
 * Zone-aware legal moves — always uses playerCards; throws if not populated.
 *
 * Use this when you need a strict zone-aware result and know playerCards
 * is present (e.g. in socket handlers after MIG-017 initRound).
 *
 * [MIG-023] [GAP-024] Rulebook Section: "Legal Move Validation — zone-aware"
 */
export function getLegalMovesZonedForSeat(
  state: RoundState,
  seat: number,
  playerCount: PlayerCount,
): CardCode[] {
  if (state.phase !== "playing") return [];
  const expected = currentSeatForTrick(state, playerCount);
  if (expected !== seat) return [];
  const pc = state.playerCards?.[seat];
  if (!pc) {
    throw new Error(
      `getLegalMovesZonedForSeat: playerCards not populated for seat ${seat}. ` +
      "Ensure initRound has been called (MIG-017).",
    );
  }
  return getLegalMovesZoned(pc, state.currentTrick);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function appendEvent(state: RoundState, event: GameEvent): RoundState {
  return {
    ...state,
    events: [...state.events, event],
    nextSequence: state.nextSequence + 1,
  };
}

function assertPhase(state: RoundState, expected: GamePhase): void {
  if (state.phase !== expected) {
    throw new Error(
      `Expected phase "${expected}" but current phase is "${state.phase}".`,
    );
  }
}

/**
 * Rebuilds a fully-hydrated BiddingState from the persisted fields in
 * RoundState. The critical part is computing `currentSeat` correctly:
 * the first bidder is (dealerSeat+1) % pc, and each bid/pass action
 * advances the seat by one, so current = (firstSeat + bids.length) % pc.
 *
 * Note: bids[] contains REGULAR bidding actions only (not the Primary Bid).
 * highestBid / highestBidderSeat carry the Primary Bid values as the floor
 * when useTwoRoundBidding = true.
 */
function reconstructBiddingState(state: RoundState): BiddingState {
  const playerCount = Object.keys(state.hands).length as PlayerCount;
  const firstSeat = (state.dealerSeat + 1) % playerCount;
  const currentSeat = (firstSeat + state.bids.length) % playerCount;

  return {
    playerCount,
    dealerSeat: state.dealerSeat,
    currentSeat,
    bids: [...state.bids],
    consecutivePasses: state.consecutivePasses,
    highestBid: state.highestBid,
    highestBidderSeat: state.highestBidderSeat,
    status: state.biddingStatus,
    useTwoRoundBidding: state.useTwoRoundBidding,
  };
}
