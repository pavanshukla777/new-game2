// ============================================================================
// Bundelkhandi Chhakri — Bidding System
// ============================================================================
//
// [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
// Implements: Valid bid values are exactly {5, 6, 7, 8}.
//   • Bid represents a trick-count target (5–8 tricks out of 8 per round).
//   • Each new bid must be strictly higher than the current highest.
//   • Minimum opening bid = 5; maximum bid = 8.
//
// Legacy mode (useTwoRoundBidding = false):
//   • Bidding ends when 3 consecutive passes occur AND a bid has been made.
//   • If ALL players pass without any bid, the result is REDEAL.
//
// [MIG-025] [GAP-017] Two-round mode (useTwoRoundBidding = true):
//   • Bidding runs for exactly 2 full rounds (2 × playerCount actions).
//   • Passing is never permanent — a player may bid again in Round 2.
//   • Bidding ends after all players have acted exactly twice.
//   • If no bid was placed, result is REDEAL; otherwise WINNER is determined.
// ============================================================================

import type {
  BidEntry,
  BiddingStatus,
  GameConfig,
  PlayerCount,
} from "./types.js";
import {
  PASSES_TO_END_BIDDING,
  MAX_BID,
  VALID_BID_VALUES,
  BIDDING_ROUNDS,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Bidding state (immutable updates)
// ---------------------------------------------------------------------------

export interface BiddingState {
  playerCount: PlayerCount;
  dealerSeat: number;
  /** The seat whose turn it currently is. */
  currentSeat: number;
  bids: BidEntry[];
  consecutivePasses: number;
  highestBid: number;
  highestBidderSeat: number | null;
  status: BiddingStatus;
  /**
   * [MIG-025] [GAP-017] When true, bidding ends after exactly 2 full rounds
   * rather than after 3 consecutive passes.
   * When false (default): legacy pass-elimination model.
   */
  useTwoRoundBidding: boolean;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Creates a fresh bidding state for the start of a new round.
 * The first bidder is the seat to the dealer's left.
 *
 * @param dealerSeat  The dealer's seat number.
 * @param playerCount Number of players (4 or 6).
 * @param options     Optional overrides:
 *   - useTwoRoundBidding: enable two-round structure (MIG-025)
 *   - initialHighestBid: pre-seed highestBid (used when Primary Bid already placed)
 *   - initialHighestBidderSeat: pre-seed highestBidderSeat (same use)
 */
export function initBiddingState(
  dealerSeat: number,
  playerCount: PlayerCount,
  options: {
    useTwoRoundBidding?: boolean;
    initialHighestBid?: number;
    initialHighestBidderSeat?: number | null;
  } = {},
): BiddingState {
  const firstSeat = (dealerSeat + 1) % playerCount;
  return {
    playerCount,
    dealerSeat,
    currentSeat: firstSeat,
    bids: [],
    consecutivePasses: 0,
    highestBid: options.initialHighestBid ?? 0,
    highestBidderSeat: options.initialHighestBidderSeat ?? null,
    status: "ongoing",
    useTwoRoundBidding: options.useTwoRoundBidding ?? false,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Validates and applies a bid action.
 * Returns the updated BiddingState.
 * Throws a descriptive error on invalid actions (use for server-side validation).
 *
 * [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
 * Implements: bid must be in {5, 6, 7, 8} and strictly higher than current highest.
 */
export function placeBid(
  state: BiddingState,
  seat: number,
  amount: number,
  config: Pick<GameConfig, "minBid">,
): BiddingState {
  assertOngoing(state);
  assertCurrentSeat(state, seat);

  if (!Number.isInteger(amount)) {
    throw new Error(`Bid must be a whole number, got ${amount}.`);
  }

  // [MIG-004] Enforce Rulebook-valid bid values {5, 6, 7, 8}
  if (!VALID_BID_VALUES.has(amount)) {
    if (amount < 5) {
      throw new Error(
        `Bid ${amount} is too low. Valid bid values are 5, 6, 7, and 8.`,
      );
    }
    throw new Error(
      `Bid ${amount} exceeds maximum bid of ${MAX_BID}. Valid values are 5, 6, 7, 8.`,
    );
  }

  const minBid = state.highestBid > 0 ? state.highestBid + 1 : config.minBid;

  if (amount < minBid) {
    throw new Error(
      `Bid ${amount} is too low. Minimum bid is ${minBid}.`,
    );
  }

  const entry: BidEntry = { seat, action: "bid", amount };
  const updatedBids = [...state.bids, entry];
  const nextState: BiddingState = {
    ...state,
    bids: updatedBids,
    consecutivePasses: 0,
    highestBid: amount,
    highestBidderSeat: seat,
  };

  return checkBiddingEnd(advanceTurn(nextState));
}

/**
 * Validates and applies a pass action.
 * Returns the updated BiddingState.
 */
export function passBid(state: BiddingState, seat: number): BiddingState {
  assertOngoing(state);
  assertCurrentSeat(state, seat);

  const entry: BidEntry = { seat, action: "pass" };
  const updatedBids = [...state.bids, entry];
  const newConsecutivePasses = state.consecutivePasses + 1;

  const nextState: BiddingState = {
    ...state,
    bids: updatedBids,
    consecutivePasses: newConsecutivePasses,
  };

  return checkBiddingEnd(advanceTurn(nextState));
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Returns the valid bid range for the current bidder.
 * Returns null if bidding is not ongoing or no valid bids remain.
 *
 * [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
 * Implements: range is always within {5..8}.
 */
export function getValidBidRange(
  state: BiddingState,
  config: Pick<GameConfig, "minBid">,
): { min: number; max: number } | null {
  if (state.status !== "ongoing") return null;
  const min = state.highestBid > 0 ? state.highestBid + 1 : config.minBid;
  if (min > MAX_BID) return null; // no valid bids remain
  return { min, max: MAX_BID };
}

/**
 * Returns true if the given seat is allowed to bid right now.
 */
export function isCurrentBidder(state: BiddingState, seat: number): boolean {
  return state.status === "ongoing" && state.currentSeat === seat;
}

/**
 * [MIG-025] Returns the current bidding round number (1 or 2).
 * Only meaningful when useTwoRoundBidding = true.
 * Round 1: bids 0 to playerCount−1; Round 2: bids playerCount to 2×playerCount−1.
 */
export function currentBiddingRound(
  state: Pick<BiddingState, "useTwoRoundBidding" | "bids" | "playerCount">,
): 1 | 2 {
  return state.bids.length < state.playerCount ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function advanceTurn(state: BiddingState): BiddingState {
  const nextSeat = (state.currentSeat + 1) % state.playerCount;
  return { ...state, currentSeat: nextSeat };
}

/**
 * Checks whether bidding has ended after the latest action.
 *
 * Two modes (switched by useTwoRoundBidding):
 *
 * Legacy (false): pass-elimination
 *   - REDEAL: all playerCount players pass consecutively with no bid
 *   - WON: PASSES_TO_END_BIDDING (3) consecutive passes after at least one bid
 *
 * [MIG-025] Two-round (true):
 *   - Bidding ends after exactly 2 × playerCount total actions
 *   - REDEAL: no bid was ever placed
 *   - WON: at least one bid was placed (highestBidderSeat !== null)
 *   - Early termination: bid=MAX_BID still needs all actions to complete
 */
function checkBiddingEnd(state: BiddingState): BiddingState {
  const totalActions = state.bids.length;
  const consecutivePasses = state.consecutivePasses;

  if (state.useTwoRoundBidding) {
    // [MIG-025] Two-round structure: end only after 2 full rounds
    const totalActionsForTwoRounds = state.playerCount * BIDDING_ROUNDS;
    if (totalActions >= totalActionsForTwoRounds) {
      const status: BiddingStatus =
        state.highestBidderSeat !== null ? "won" : "redeal";
      return { ...state, status };
    }
    return state;
  }

  // Legacy pass-elimination
  const hasBid = state.highestBidderSeat !== null;

  // All players passed with no bids → redeal
  if (!hasBid && consecutivePasses >= state.playerCount) {
    return { ...state, status: "redeal" };
  }

  // 3 consecutive passes after at least one bid → bidding won
  if (hasBid && consecutivePasses >= PASSES_TO_END_BIDDING) {
    return { ...state, status: "won" };
  }

  return state;
}

function assertOngoing(state: BiddingState): void {
  if (state.status !== "ongoing") {
    throw new Error(
      `Bidding is already finished with status "${state.status}".`,
    );
  }
}

function assertCurrentSeat(state: BiddingState, seat: number): void {
  if (state.currentSeat !== seat) {
    throw new Error(
      `It is seat ${state.currentSeat}'s turn to bid, not seat ${seat}.`,
    );
  }
}
