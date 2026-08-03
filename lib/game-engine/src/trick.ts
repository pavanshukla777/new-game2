// ============================================================================
// Bundelkhandi Chhakri — Trick Winner Calculation
// ============================================================================
//
// Winning rules:
//   • If one or more trump cards were played: the highest trump wins.
//   • If no trump was played: the highest card of the led suit wins.
//   • Cards of other suits that are neither led-suit nor trump cannot win.
//   • When noTrump is active, all suits are equal and only the led suit wins.
//
// Rank order (descending strength):
//   A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2
// ============================================================================

import type { CardCode, CompletedTrick, Suit, TeamId, TrickCard } from "./types.js";
import { getSuit, getRank, getRankValue, getCardPoints } from "./constants.js";
import { seatToTeam } from "./turn-order.js";

// ---------------------------------------------------------------------------
// Trick evaluation
// ---------------------------------------------------------------------------

/**
 * Determines the winner of a completed trick and tallies its points.
 *
 * @param trickIndex  0-based index of this trick within the round.
 * @param trick       All cards played in the trick (in play order).
 * @param trumpSuit   Active trump suit, or null (no trump / not yet selected).
 */
export function evaluateTrick(
  trickIndex: number,
  trick: TrickCard[],
  trumpSuit: Suit | null,
): CompletedTrick {
  if (trick.length === 0) {
    throw new Error("Cannot evaluate an empty trick.");
  }

  const ledSuit = getSuit(trick[0].card);
  let winnerIdx = 0;

  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[winnerIdx].card, ledSuit, trumpSuit)) {
      winnerIdx = i;
    }
  }

  const winnerSeat = trick[winnerIdx].seat;
  const winnerTeam: TeamId = seatToTeam(winnerSeat);
  const points = trick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);

  return {
    index: trickIndex,
    cards: [...trick],
    ledSuit,
    winnerSeat,
    winnerTeam,
    points,
  };
}

// ---------------------------------------------------------------------------
// Head-to-head card comparison
// ---------------------------------------------------------------------------

/**
 * Returns true if `challenger` beats `current` under the given led suit and trump.
 *
 * Cases (in priority order):
 *  1. Challenger is trump, current is not → challenger wins.
 *  2. Challenger is not trump, current is → current wins.
 *  3. Both are trump → higher rank wins.
 *  4. Neither is trump:
 *     a. Challenger is led suit, current is not → challenger wins.
 *     b. Challenger is not led suit, current is → current wins.
 *     c. Both are led suit → higher rank wins.
 *     d. Neither is led suit nor trump → challenger cannot win (return false).
 */
export function beats(
  challenger: CardCode,
  current: CardCode,
  ledSuit: Suit,
  trumpSuit: Suit | null,
): boolean {
  const chalSuit = getSuit(challenger);
  const curSuit = getSuit(current);

  const chalIsTrump = trumpSuit !== null && chalSuit === trumpSuit;
  const curIsTrump = trumpSuit !== null && curSuit === trumpSuit;

  // --- Trump priority ---
  if (chalIsTrump && !curIsTrump) return true;
  if (!chalIsTrump && curIsTrump) return false;

  // --- Both trump: higher rank wins ---
  if (chalIsTrump && curIsTrump) {
    return getRankValue(getRank(challenger)) > getRankValue(getRank(current));
  }

  // --- Neither is trump: led suit priority ---
  const chalIsLed = chalSuit === ledSuit;
  const curIsLed = curSuit === ledSuit;

  if (chalIsLed && !curIsLed) return true;
  if (!chalIsLed && curIsLed) return false;

  // --- Both led suit: higher rank wins ---
  if (chalIsLed && curIsLed) {
    return getRankValue(getRank(challenger)) > getRankValue(getRank(current));
  }

  // Neither is trump nor led suit → challenger cannot win
  return false;
}

// ---------------------------------------------------------------------------
// Trick point counting
// ---------------------------------------------------------------------------

/**
 * Sums the point values of all cards in a trick.
 */
export function countTrickPoints(trick: TrickCard[]): number {
  return trick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
}

/**
 * Sums the points captured by a team across all completed tricks.
 */
export function countCapturedPoints(
  completedTricks: CompletedTrick[],
  team: TeamId,
): number {
  return completedTricks
    .filter((t) => t.winnerTeam === team)
    .reduce((sum, t) => sum + t.points, 0);
}
