/**
 * AI move picker — Bundelkhandi Chhakri
 *
 * [MIG-039] [GAP-044] Rulebook Section: "AI Control — move generation"
 * Implements: deterministic, rule-compliant AI that always produces a valid
 * action.  Intended for Phase 3 AI takeover on timeout / disconnect; a more
 * strategic AI (look-ahead, heuristics) is deferred to Phase 4.
 *
 * Strategy (simple / defensive):
 *   primary_bid             → bid 5 (PRIMARY_BID_AMOUNT, mandatory)
 *   primary_trump_selection → pick first valid suit (Spades by default)
 *   bidding                 → bid DEFAULT_MIN_BID if nobody has bid yet;
 *                             otherwise pass (guarantees bidding always ends)
 *   trump_selection         → pick first valid suit (Spades by default)
 *   playing                 → pick the first zone-aware legal card
 */

import type { RoundState, PlayerCount, GameConfig, CardCode, Suit } from "./types.js";
import { getLegalMovesZonedForSeat } from "./round.js";
import { validTrumpChoices } from "./trump.js";
import { DEFAULT_MIN_BID, PRIMARY_BID_AMOUNT } from "./constants.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AiAction =
  | { type: "bid"; amount: number }
  | { type: "pass" }
  | { type: "select_trump"; suit: Suit }
  | { type: "play_card"; card: CardCode };

// ---------------------------------------------------------------------------
// Core picker
// ---------------------------------------------------------------------------

/**
 * Pick the AI's action for the current round phase.
 *
 * @param round       Current RoundState (fully reconstructed from snapshot).
 * @param seat        The seat number the AI is playing for.
 * @param playerCount 4 or 6.
 * @param config      GameConfig (allowNoTrump, etc.).
 * @returns           A valid AiAction for the current phase.
 * @throws            If the phase does not admit an AI action (e.g. round_ended).
 */
export function pickAiAction(
  round: RoundState,
  seat: number,
  playerCount: PlayerCount,
  config: GameConfig,
): AiAction {
  const phase = round.phase;

  // -------------------------------------------------------------------------
  // primary_bid — mandatory bid = 5
  // -------------------------------------------------------------------------
  if (phase === "primary_bid") {
    return { type: "bid", amount: PRIMARY_BID_AMOUNT };
  }

  // -------------------------------------------------------------------------
  // trump selection (primary or final) — pick first valid suit
  // -------------------------------------------------------------------------
  if (phase === "primary_trump_selection" || phase === "trump_selection") {
    const choices = validTrumpChoices(config);
    const firstSuit = (choices[0] ?? "S") as Suit;
    return { type: "select_trump", suit: firstSuit };
  }

  // -------------------------------------------------------------------------
  // bidding — bid minimum if no bid exists; otherwise pass
  // This guarantees bidding always terminates without a redeal loop.
  // -------------------------------------------------------------------------
  if (phase === "bidding") {
    if (round.highestBid === 0) {
      return { type: "bid", amount: DEFAULT_MIN_BID };
    }
    return { type: "pass" };
  }

  // -------------------------------------------------------------------------
  // playing — pick the first zone-aware legal card
  // -------------------------------------------------------------------------
  if (phase === "playing") {
    const legal = getLegalMovesZonedForSeat(round, seat, playerCount);
    if (legal.length === 0) {
      throw new Error(
        `AI seat ${seat}: no legal cards in playing phase — hand may be empty`,
      );
    }
    return { type: "play_card", card: legal[0]! };
  }

  throw new Error(`AI cannot act in phase "${phase}" (seat ${seat})`);
}
