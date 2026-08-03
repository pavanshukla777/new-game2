// ============================================================================
// Bundelkhandi Chhakri — Trump Selection
// ============================================================================
//
// After the bid is won, the winning bidder selects the trump suit (Hukm).
// If the "No Trump" variant is enabled, they may also declare no trump.
// ============================================================================

import type { Suit, GameConfig } from "./types.js";
import { SUITS } from "./constants.js";

// ---------------------------------------------------------------------------
// Trump declaration
// ---------------------------------------------------------------------------

export type TrumpDeclaration =
  | { suit: Suit; noTrump: false }
  | { suit: null; noTrump: true };

/**
 * Validates and returns a trump declaration.
 *
 * @param seat          The declaring seat.
 * @param bidderSeat    The seat that won the bid (must match).
 * @param suit          The chosen suit, or null for "No Trump".
 * @param config        Game config (allowNoTrump flag).
 */
export function declareTrump(
  seat: number,
  bidderSeat: number,
  suit: Suit | null,
  config: Pick<GameConfig, "allowNoTrump">,
): TrumpDeclaration {
  if (seat !== bidderSeat) {
    throw new Error(
      `Only the winning bidder (seat ${bidderSeat}) may declare trump, not seat ${seat}.`,
    );
  }

  if (suit === null) {
    if (!config.allowNoTrump) {
      throw new Error(
        `"No Trump" is not enabled in the current game configuration.`,
      );
    }
    return { suit: null, noTrump: true };
  }

  if (!SUITS.includes(suit)) {
    throw new Error(`"${suit}" is not a valid trump suit. Valid: ${SUITS.join(", ")}.`);
  }

  return { suit, noTrump: false };
}

/**
 * Returns true if the card's suit is the trump suit.
 * Always false when noTrump is active.
 */
export function isTrump(card: string, trumpSuit: Suit | null): boolean {
  if (trumpSuit === null) return false;
  return card[card.length - 1] === trumpSuit;
}

/**
 * Returns all valid suit choices for trump declaration.
 * Includes a `null` (No Trump) option only when config allows it.
 */
export function validTrumpChoices(
  config: Pick<GameConfig, "allowNoTrump">,
): (Suit | null)[] {
  const choices: (Suit | null)[] = [...SUITS];
  if (config.allowNoTrump) choices.push(null);
  return choices;
}
