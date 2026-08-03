// ============================================================================
// Bundelkhandi Chhakri — Deck Integrity Validator
// ============================================================================
//
// Pure validation functions that enforce the Official Rulebook deck invariants.
// Called by the game service after every deal to prevent corrupt game states.
//
// [RULE-002] 4-player: ranks 7–A × 4 suits = 32 cards (ranks 2–6 removed)
// [RULE-003] 4-player: remaining ranks = 7, 8, 9, 10, J, Q, K, A
// [RULE-004] 6-player: ranks 3–A × 4 suits = 48 cards (rank 2 removed)
// ============================================================================

import type { CardCode, PlayerCount } from "./types.js";
import {
  SUITS,
  FOUR_PLAYER_RANKS,
  SIX_PLAYER_RANKS,
  CARDS_PER_PLAYER,
  parseCard,
  makeCardCode,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Expected deck sizes
// ---------------------------------------------------------------------------

/**
 * Expected total card count after deck filtering, per player count.
 * [RULE-002] 4-player: 8 ranks × 4 suits = 32 cards.
 * [RULE-004] 6-player: 12 ranks × 4 suits = 48 cards.
 */
export const DECK_SIZE: Record<PlayerCount, number> = {
  4: 32,
  6: 48,
};

// ---------------------------------------------------------------------------
// Validation error
// ---------------------------------------------------------------------------

/** Thrown when a deck or deal fails an integrity check. */
export class DeckValidationError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "DeckValidationError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Deck validation
// ---------------------------------------------------------------------------

/**
 * Validates a filtered deck against the Official Rulebook for the given
 * player count.
 *
 * Checks (in order):
 *   1. Correct total card count (32 for 4P, 48 for 6P).
 *   2. No duplicate card codes.
 *   3. No invalid card codes (unknown rank or suit).
 *   4. No ranks that should have been removed (RULE-002 / RULE-004).
 *   5. All expected cards are present (no missing cards).
 *
 * Throws DeckValidationError on any violation.
 *
 * [RULE-002] [RULE-003] [RULE-004] Official Rulebook: "Deck Construction"
 */
export function validateDeck(deck: CardCode[], playerCount: PlayerCount): void {
  const allowedRanks = playerCount === 6 ? SIX_PLAYER_RANKS : FOUR_PLAYER_RANKS;
  const expectedSize = DECK_SIZE[playerCount];

  // 1. Correct deck size
  if (deck.length !== expectedSize) {
    throw new DeckValidationError(
      "INVALID_DECK_SIZE",
      `expected ${expectedSize} cards for ${playerCount}-player game, got ${deck.length}`,
    );
  }

  // 2. No duplicate card codes
  const seen = new Set<CardCode>();
  for (const card of deck) {
    if (seen.has(card)) {
      throw new DeckValidationError(
        "DUPLICATE_CARD",
        `"${card}" appears more than once in the deck`,
      );
    }
    seen.add(card);
  }

  // 3 + 4. No invalid card codes; no removed ranks
  for (const card of deck) {
    let parsed: { rank: string; suit: string };
    try {
      parsed = parseCard(card);
    } catch {
      throw new DeckValidationError(
        "INVALID_CARD_CODE",
        `"${card}" is not a valid card code`,
      );
    }

    if (!allowedRanks.includes(parsed.rank as (typeof allowedRanks)[number])) {
      throw new DeckValidationError(
        "INVALID_RANK",
        `"${card}" has rank "${parsed.rank}" which must be removed in ${playerCount}-player mode`,
      );
    }
  }

  // 5. All expected cards present (no missing cards)
  const deckSet = new Set(deck);
  for (const suit of SUITS) {
    for (const rank of allowedRanks) {
      const expected = makeCardCode(rank, suit);
      if (!deckSet.has(expected)) {
        throw new DeckValidationError(
          "MISSING_CARD",
          `"${expected}" is absent from the ${playerCount}-player deck`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Deal validation
// ---------------------------------------------------------------------------

/**
 * Validates a dealt hand distribution against all deal invariants.
 *
 * Checks (in order):
 *   1. Correct number of seats (equals playerCount).
 *   2. Equal hand size for every seat (CARDS_PER_PLAYER[playerCount]).
 *   3. No card appears in more than one hand (unique ownership).
 *   4. Total cards dealt equals the expected deck size for the player count.
 *   5. All dealt cards together form a valid deck (correct ranks, no missing
 *      cards — delegates to validateDeck).
 *
 * Throws DeckValidationError on any violation.
 *
 * [RULE-002] [RULE-004] Official Rulebook: "Card Distribution"
 */
export function validateDeal(
  hands: Record<number, CardCode[]>,
  playerCount: PlayerCount,
): void {
  const expectedHandSize = CARDS_PER_PLAYER[playerCount];
  const expectedTotal = DECK_SIZE[playerCount];
  const seats = Object.keys(hands).map(Number);

  // 1. Correct number of seats
  if (seats.length !== playerCount) {
    throw new DeckValidationError(
      "WRONG_SEAT_COUNT",
      `expected ${playerCount} seats, got ${seats.length}`,
    );
  }

  // 2. Equal hand sizes
  for (const seat of seats) {
    const hand = hands[seat];
    if (hand.length !== expectedHandSize) {
      throw new DeckValidationError(
        "UNEQUAL_HAND_SIZE",
        `seat ${seat} has ${hand.length} cards, expected ${expectedHandSize}`,
      );
    }
  }

  // 3. Unique ownership across all hands
  const globalSeen = new Set<CardCode>();
  for (const seat of seats) {
    for (const card of hands[seat]) {
      if (globalSeen.has(card)) {
        throw new DeckValidationError(
          "DUPLICATE_OWNERSHIP",
          `"${card}" appears in more than one hand`,
        );
      }
      globalSeen.add(card);
    }
  }

  // 4. Total card count
  if (globalSeen.size !== expectedTotal) {
    throw new DeckValidationError(
      "WRONG_TOTAL_CARDS",
      `expected ${expectedTotal} total cards across all hands, got ${globalSeen.size}`,
    );
  }

  // 5. Union of all hands must form a valid deck (correct ranks, no missing)
  validateDeck([...globalSeen], playerCount);
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Validates both deck composition and deal distribution in a single call.
 *
 * Reconstructs the dealt set from all hands and validates it as a complete
 * deck, then validates the distribution itself. Throws DeckValidationError
 * on any violation.
 *
 * Intended for use in GameService.initializeGame and after every redeal to
 * ensure the authoritative game state is never corrupt.
 */
export function assertDealIntegrity(
  hands: Record<number, CardCode[]>,
  playerCount: PlayerCount,
): void {
  validateDeal(hands, playerCount);
}
