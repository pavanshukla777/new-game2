// ============================================================================
// Bundelkhandi Chhakri — Card Constants & Lookup Tables
// ============================================================================

import type { Rank, Suit, CardCode, PlayerCount } from "./types.js";

// ---------------------------------------------------------------------------
// Suits and ranks
// ---------------------------------------------------------------------------

export const SUITS: readonly Suit[] = ["S", "H", "D", "C"] as const;

/**
 * All 13 ranks in descending play order (Ace high).
 * Used for the full 52-card reference deck and rank validation.
 */
export const ALL_RANKS: readonly Rank[] = [
  "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2",
] as const;

/**
 * Ranks used in the 4-player deck (remove ranks 2–6).
 * [MIG-002] [GAP-002] Rulebook Section: "Deck Construction"
 * Implements: 4-player deck = 8 ranks × 4 suits = 32 cards.
 */
export const FOUR_PLAYER_RANKS: readonly Rank[] = [
  "A", "K", "Q", "J", "10", "9", "8", "7",
] as const;

/**
 * Ranks used in the 6-player deck (remove 2s only).
 * 12 ranks × 4 suits = 48 cards, 8 per player.
 */
export const SIX_PLAYER_RANKS: readonly Rank[] = [
  "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3",
] as const;

// ---------------------------------------------------------------------------
// Rank ordering — higher = stronger in trick-taking
// ---------------------------------------------------------------------------

const RANK_VALUE: Record<Rank, number> = {
  "2":  1,
  "3":  2,
  "4":  3,
  "5":  4,
  "6":  5,
  "7":  6,
  "8":  7,
  "9":  8,
  "10": 9,
  "J":  10,
  "Q":  11,
  "K":  12,
  "A":  13,
};

/** Returns the comparative rank value (higher wins). */
export function getRankValue(rank: Rank): number {
  return RANK_VALUE[rank];
}

// ---------------------------------------------------------------------------
// Point values (only some cards score)
// ---------------------------------------------------------------------------

const POINT_VALUES: Partial<Record<Rank, number>> = {
  "A":  4,
  "K":  3,
  "Q":  2,
  "J":  1,
  "10": 10,
  "5":  5,
};

/**
 * Point value of a rank.
 * A=4, K=3, Q=2, J=1, 10=10, 5=5.
 * All other ranks are worth 0.
 * Total across a full 6-player deck = 100.
 */
export function getPointValue(rank: Rank): number {
  return POINT_VALUES[rank] ?? 0;
}

// ---------------------------------------------------------------------------
// Card code parsing
// ---------------------------------------------------------------------------

/**
 * Parses a CardCode into its rank and suit components.
 * "AS"  → { rank: "A", suit: "S" }
 * "10H" → { rank: "10", suit: "H" }
 */
export function parseCard(code: CardCode): { rank: Rank; suit: Suit } {
  if (code.length < 2) throw new Error(`Invalid card code: "${code}"`);

  const suit = code[code.length - 1] as Suit;
  const rank = code.slice(0, -1) as Rank;

  if (!SUITS.includes(suit)) {
    throw new Error(`Invalid suit in card code: "${code}"`);
  }
  if (!ALL_RANKS.includes(rank)) {
    throw new Error(`Invalid rank in card code: "${code}"`);
  }

  return { rank, suit };
}

/** Returns the suit of a card code. */
export function getSuit(code: CardCode): Suit {
  return parseCard(code).suit;
}

/** Returns the rank of a card code. */
export function getRank(code: CardCode): Rank {
  return parseCard(code).rank;
}

/**
 * Returns the card-point value of a card code.
 *
 * [ISOLATED — NOT OFFICIAL CHHAKRI SCORING]
 * The Official Rulebook defines scoring by trick count, not card-point
 * accumulation. This function is retained only for:
 *   • Deck-composition verification (deck validator tests)
 *   • `CompletedTrick.points` tracking (display / AI hint purposes only)
 * Do NOT use this in any scoring formula.
 */
export function getCardPoints(code: CardCode): number {
  return getPointValue(getRank(code));
}

/** Builds a card code from rank + suit. */
export function makeCardCode(rank: Rank, suit: Suit): CardCode {
  return `${rank}${suit}`;
}

// ---------------------------------------------------------------------------
// Deck sizes
// [MIG-002] [GAP-002] Rulebook Section: "Deck Construction"
// 4-player: 8 cards/player (8 ranks × 4 suits = 32 cards ÷ 4 players = 8 each)
// ---------------------------------------------------------------------------

/** Number of cards dealt per player. */
export const CARDS_PER_PLAYER: Record<PlayerCount, number> = {
  4: 8,
  6: 8,
};

/** Number of tricks per round. */
export const TRICKS_PER_ROUND: Record<PlayerCount, number> = {
  4: 8,
  6: 8,
};

/**
 * How many consecutive tricks trigger the Chhakri event.
 * Always 6, regardless of player count.
 *
 * NOTE: Chhakri is tracked for display/audit only. Per Official Rulebook
 * [MIG-028]: "No Chhakri bonus or multiplier applies to scoring." This
 * threshold does NOT influence score calculation.
 */
export const CHHAKRI_THRESHOLD = 6;

/**
 * Total point value in the 6-player deck configuration (all point cards present).
 * (4 + 3 + 2 + 1 + 10 + 5) × 4 suits = 100.
 *
 * [ISOLATED — NOT OFFICIAL CHHAKRI SCORING]
 * The Official Rulebook defines scoring by trick count, not card-point accumulation.
 * This constant is retained only for deck-composition reference and legacy tests.
 * Do NOT use in scoring logic.
 *
 * @deprecated Prefer DECK_TOTAL_POINTS[playerCount]. Do not use in scoring.
 */
export const TOTAL_DECK_POINTS = 100;

/**
 * Total capturable card-point value per deck configuration.
 * [MIG-002] [GAP-002] Rulebook Section: "Deck Construction"
 * 4-player deck: ranks 7–A, 5s excluded → 80 points.
 * 6-player deck: ranks 3–A, 5s included → 100 points.
 *
 * [ISOLATED — NOT OFFICIAL CHHAKRI SCORING]
 * The Official Rulebook defines scoring by trick count, not card-point accumulation.
 * These values are used only for deck-composition verification in tests.
 * Do NOT use in scoring logic.
 */
export const DECK_TOTAL_POINTS: Record<PlayerCount, number> = {
  4: 80,   // 4-player deck: A(4)+K(3)+Q(2)+J(1)+10(10) × 4 suits = 80
  6: 100,  // 6-player deck: above + 5(5) × 4 suits = 100
};

/**
 * Series target score.
 * [MIG-013] [GAP-032] Rulebook Section: "Series Engine — +52 target"
 * Implements: the first team to reach +52 cumulative score wins the series.
 * The Rulebook defines a series end at exactly +52 (positive differential),
 * NOT a legacy 500-point accumulation target.
 */
export const SERIES_TARGET = 52;

/**
 * Default game target score (alias for SERIES_TARGET).
 * [MIG-013] [GAP-032] Updated from 500 to 52 per Rulebook.
 */
export const DEFAULT_TARGET_SCORE = SERIES_TARGET;

/**
 * Default minimum bid.
 * [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
 * Implements: valid bid values are {5, 6, 7, 8}; minimum opening bid = 5.
 */
export const DEFAULT_MIN_BID = 5;

/**
 * Maximum bid value.
 * [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
 * Implements: bid ceiling = 8 (representing 8 tricks).
 */
export const MAX_BID = 8;

/**
 * The complete set of valid bid values.
 * [MIG-004] [GAP-015] Rulebook Section: "Bidding — valid values"
 * Implements: only 5, 6, 7, 8 are legal bid amounts.
 */
export const VALID_BID_VALUES: ReadonlySet<number> = new Set([5, 6, 7, 8]);

/**
 * [LEGACY — NOT IN OFFICIAL RULEBOOK]
 * "Doobna" (instant-loss below this score) is not defined in RULE-001..030.
 * Retained for backward compatibility of existing snapshots and config structs.
 * Production games use the +52 target (SERIES_TARGET) and Perfect-8/8 as the
 * only two series-end conditions.
 */
export const DEFAULT_DOOBNA_THRESHOLD = -500;

/**
 * [LEGACY — NOT IN OFFICIAL RULEBOOK]
 * Consecutive passes needed to end bidding in the legacy pass-elimination model.
 * The Official Rulebook specifies exactly 2 bidding rounds (BIDDING_ROUNDS = 2),
 * not a pass-count elimination. This constant is kept only for backward
 * compatibility of legacy test fixtures that set useTwoRoundBidding=false.
 * New production code must use useTwoRoundBidding=true.
 */
export const PASSES_TO_END_BIDDING = 3;

/**
 * The mandatory value of the Primary Bid.
 * [MIG-024] [GAP-014] Rulebook Section: "Primary Bid"
 * The first Secret Hand recipient MUST bid exactly this value; cannot pass.
 */
export const PRIMARY_BID_AMOUNT = 5 as const;

/**
 * Number of complete bidding rounds in the two-round structure.
 * [MIG-025] [GAP-017] Rulebook Section: "Bidding — exactly 2 rounds"
 * Bidding ends after all players have acted exactly BIDDING_ROUNDS times.
 */
export const BIDDING_ROUNDS = 2 as const;

// ---------------------------------------------------------------------------
// Suit display names
// ---------------------------------------------------------------------------

export const SUIT_NAMES: Record<Suit, string> = {
  S: "Spades (हुकुम)",
  H: "Hearts (पान)",
  D: "Diamonds (ईंट)",
  C: "Clubs (चिड़ी)",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};
