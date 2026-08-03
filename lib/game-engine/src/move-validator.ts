// ============================================================================
// Bundelkhandi Chhakri — Legal Move Validation
// ============================================================================
//
// Following rules (Chhakri):
//   • A player leads any card when starting a trick (no restrictions).
//   • When following: must play a card of the led suit if they hold one.
//   • If void in the led suit, any card is legal (including trump).
//
// The server calls getLegalMoves before applying a play_card action to
// ensure the move is valid.
// ============================================================================

import type { CardCode, PlayerCards, TrickCard } from "./types.js";
import { getSuit } from "./constants.js";
import { cardsOfSuit } from "./deck.js";
import { getAccessibleHand } from "./dealing.js";

// ---------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------

/**
 * Returns the subset of `hand` that constitutes legal plays.
 *
 * @param hand        The player's current hand.
 * @param trickSoFar  Cards already played in the current trick (may be empty).
 * @returns           Array of legal card codes (never empty if hand is non-empty).
 */
export function getLegalMoves(
  hand: CardCode[],
  trickSoFar: TrickCard[],
): CardCode[] {
  if (hand.length === 0) return [];

  // Leading the trick — any card is legal
  if (trickSoFar.length === 0) return [...hand];

  // Following — must follow suit if possible
  const ledSuit = getSuit(trickSoFar[0].card);
  const suitCards = cardsOfSuit(hand, ledSuit);

  if (suitCards.length > 0) {
    // Must play a card of the led suit
    return suitCards;
  }

  // Void in led suit — any card is legal
  return [...hand];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type MoveValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates whether `card` is a legal play.
 *
 * @param card        The card the player wants to play.
 * @param hand        The player's current hand.
 * @param trickSoFar  Cards already played this trick.
 */
export function validateMove(
  card: CardCode,
  hand: CardCode[],
  trickSoFar: TrickCard[],
): MoveValidationResult {
  if (!hand.includes(card)) {
    return {
      valid: false,
      reason: `Card "${card}" is not in the player's hand.`,
    };
  }

  const legal = getLegalMoves(hand, trickSoFar);

  if (!legal.includes(card)) {
    const ledSuit = trickSoFar.length > 0 ? getSuit(trickSoFar[0].card) : null;
    return {
      valid: false,
      reason:
        ledSuit !== null
          ? `Must follow suit "${ledSuit}". Legal cards: ${legal.join(", ")}.`
          : `No legal moves available.`,
    };
  }

  return { valid: true };
}

/**
 * Returns the led suit of the current trick, or null if no cards played yet.
 */
export function getLedSuit(trickSoFar: TrickCard[]): string | null {
  return trickSoFar.length > 0 ? getSuit(trickSoFar[0].card) : null;
}

// ---------------------------------------------------------------------------
// Zone-aware legal move validation
// [MIG-018] [GAP-023] Rulebook Section: "Legal Move Validation — zone-aware"
//
// Zone restriction (Rulebook):
//   accessible = faceUp + secretHand
//   If accessible is empty → accessible = faceDown
//   (face_down cards are the last resort; they cannot be played until both
//    face_up and secret_hand are exhausted.)
//
// Suit-following rules are applied identically to the flat-hand case, but
// only against the accessible zone subset.
// ---------------------------------------------------------------------------

/**
 * Returns the subset of the accessible zone hand that constitutes legal plays,
 * applying the Rulebook zone restriction before suit-following rules.
 *
 * Zone priority (strict order):
 *   1. faceUp + secretHand (primary accessible hand)
 *   2. faceDown only when the primary accessible hand is empty
 *
 * [MIG-018] [GAP-023] Rulebook Section: "Legal Move Validation — zone-aware"
 *
 * @param playerCards  The player's current zone-structured hand.
 * @param trickSoFar   Cards already played in the current trick.
 * @returns            Array of legal card codes (never empty if hand is non-empty).
 */
export function getLegalMovesZoned(
  playerCards: PlayerCards,
  trickSoFar: TrickCard[],
): CardCode[] {
  // [MIG-018] [GAP-023] Derive accessible hand respecting zone priority
  const accessible = getAccessibleHand(playerCards);
  if (accessible.length === 0) return [];
  return getLegalMoves(accessible, trickSoFar);
}

/**
 * Validates whether `card` is a legal play given the player's zone-structured hand.
 *
 * Combines zone accessibility (MIG-018) with suit-following validation.
 *
 * [MIG-018] [GAP-023] Rulebook Section: "Legal Move Validation — zone-aware"
 *
 * @param card        The card the player wants to play.
 * @param playerCards The player's zone-structured hand.
 * @param trickSoFar  Cards already played this trick.
 */
export function validateMoveZoned(
  card: CardCode,
  playerCards: PlayerCards,
  trickSoFar: TrickCard[],
): MoveValidationResult {
  // Verify the player actually holds this card (across all zones)
  const allCards = [
    ...playerCards.secretHand,
    ...playerCards.faceDown,
    ...playerCards.faceUp,
  ];
  if (!allCards.includes(card)) {
    return {
      valid: false,
      reason: `Card "${card}" is not in the player's possession.`,
    };
  }

  const legal = getLegalMovesZoned(playerCards, trickSoFar);
  if (!legal.includes(card)) {
    const ledSuit = trickSoFar.length > 0 ? getSuit(trickSoFar[0].card) : null;
    return {
      valid: false,
      reason:
        ledSuit !== null
          ? `Must follow suit "${ledSuit}" from accessible zones. Legal cards: ${legal.join(", ")}.`
          : `No legal moves available.`,
    };
  }

  return { valid: true };
}
