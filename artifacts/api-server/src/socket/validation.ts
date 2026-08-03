/**
 * Socket.IO 7-step validation chain for Bundelkhandi Chhakri.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain"
 * Implements: The seven steps that every in-game socket action must pass
 * before it is applied to the game state.
 *
 * Steps:
 *   1. Identity      — authenticated user; enforced at handshake (MIG-015).
 *                      In handlers, identity is already in socket.data.userId.
 *   2. Match State   — game exists and is in an actionable phase.
 *   3. Turn          — it is this player's turn to act.
 *   4. Action        — the action type is valid for the current phase.
 *   5. Rule          — the action satisfies Rulebook constraints (bid value,
 *                      legal card, valid suit, etc.).
 *   6. Update        — apply the state transition (executed by the handler).
 *   7. Sync          — broadcast the new state (executed by the handler).
 *
 * Steps 6 and 7 are intentionally NOT implemented here; they are the
 * responsibility of each individual game handler after validation succeeds.
 * This module owns steps 2–5 exclusively.
 *
 * Usage in a handler:
 *   const chainResult = runValidationChain({ context, phase, seat, team, currentSeat });
 *   if (!chainResult.ok) return ack({ ok: false, error: chainResult.error });
 *   // Step 5 — rule check (action-specific):
 *   const ruleResult = validateBidRule(amount, state.highestBid);
 *   if (!ruleResult.ok) return ack({ ok: false, error: ruleResult.error });
 *   // Step 6: apply state transition
 *   // Step 7: broadcast
 */

import type { GamePhase } from "@workspace/game-engine";

// ---------------------------------------------------------------------------
// Core result type — discriminated union; avoids thrown exceptions.
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Game action types that require the validation chain.
// Fire-and-forget reactions (emoji_react) bypass this chain.
// ---------------------------------------------------------------------------

export type GameActionType =
  | "bid"
  | "pass"
  | "select_trump"
  | "play_card";

/**
 * The phases during which each action type is valid.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Action step"
 * Implements: exhaustive compile-time mapping of GamePhase → allowed actions.
 */
export const VALID_ACTIONS_BY_PHASE: Record<GamePhase, readonly GameActionType[]> = {
  dealing:                  [],
  // [MIG-024] Primary bid phase — only "bid" allowed; passing is prohibited
  primary_bid:              ["bid"],
  // [MIG-024] Primary trump selection — only "select_trump" allowed
  primary_trump_selection:  ["select_trump"],
  bidding:                  ["bid", "pass"],
  trump_selection:          ["select_trump"],
  playing:                  ["play_card"],
  trick_ended:              [],
  round_ended:              [],
  game_ended:               [],
};

// ---------------------------------------------------------------------------
// Validation context — carried through the chain.
// ---------------------------------------------------------------------------

/**
 * Minimal context from the socket and payload, constructed by the handler
 * after the JWT identity has already been verified (Step 1 / MIG-015).
 */
export interface ValidationContext {
  /** Verified user ID from the JWT (Step 1 already established). */
  userId: string;
  /** Display name from the JWT payload. */
  displayName: string;
  /** Game the action targets. */
  gameId: string;
  /** Action type the client is requesting. */
  actionType: GameActionType;
}

/**
 * Context extended after Step 2 (Match State) confirms the game and player.
 */
export interface MatchStateContext extends ValidationContext {
  /** Current game phase at the time of validation. */
  phase: GamePhase;
  /** Seat number (0–5) assigned to this player in this game. */
  seat: number;
  /** Team (0 or 1) this player belongs to. */
  team: 0 | 1;
}

/**
 * Context extended after Step 3 (Turn) confirms this player is the current actor.
 */
export interface TurnContext extends MatchStateContext {
  /** Confirmed: it is this seat's turn to act. */
  readonly isCurrentActor: true;
}

// ---------------------------------------------------------------------------
// Step 2 — Match State
// ---------------------------------------------------------------------------

/**
 * Validates that:
 *   a) The game is in a phase that accepts player actions.
 *   b) The userId is a registered player in this game (seat and team resolved).
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Match State step"
 *
 * @param ctx    Validation context from the handler.
 * @param phase  Current game phase (loaded from game state by handler).
 * @param seat   This player's seat number, or null if not a participant.
 * @param team   This player's team (0 or 1), or null if not a participant.
 */
export function validateMatchState(
  ctx: ValidationContext,
  phase: GamePhase,
  seat: number | null,
  team: (0 | 1) | null,
): ValidationResult<MatchStateContext> {
  if (phase === "game_ended") {
    return { ok: false, error: "GAME_ALREADY_ENDED" };
  }
  if (phase === "dealing") {
    return { ok: false, error: "GAME_DEALING_IN_PROGRESS" };
  }
  if (seat === null || team === null) {
    return { ok: false, error: "NOT_A_PLAYER" };
  }
  if (seat < 0 || seat > 5) {
    return { ok: false, error: "INVALID_SEAT" };
  }
  return {
    ok: true,
    value: { ...ctx, phase, seat, team },
  };
}

// ---------------------------------------------------------------------------
// Step 3 — Turn
// ---------------------------------------------------------------------------

/**
 * Validates that the requesting player is the current actor.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Turn step"
 *
 * @param ctx          Match-state context (from Step 2).
 * @param currentSeat  Seat that the game engine expects to act next.
 */
export function validateTurn(
  ctx: MatchStateContext,
  currentSeat: number,
): ValidationResult<TurnContext> {
  if (ctx.seat !== currentSeat) {
    return { ok: false, error: "NOT_YOUR_TURN" };
  }
  return {
    ok: true,
    value: { ...ctx, isCurrentActor: true as const },
  };
}

// ---------------------------------------------------------------------------
// Step 4 — Action
// ---------------------------------------------------------------------------

/**
 * Validates that the requested action type is permitted in the current phase.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Action step"
 * Implements: Each phase only accepts specific action types per the Rulebook.
 */
export function validateAction(
  ctx: TurnContext,
): ValidationResult<TurnContext> {
  const allowed = VALID_ACTIONS_BY_PHASE[ctx.phase];
  if (!(allowed as readonly string[]).includes(ctx.actionType)) {
    return {
      ok: false,
      error: `ACTION_NOT_ALLOWED_IN_PHASE:${ctx.phase}`,
    };
  }
  return { ok: true, value: ctx };
}

// ---------------------------------------------------------------------------
// Step 5 — Rule validators (one per action type)
// ---------------------------------------------------------------------------

/**
 * Validates a bid amount against the Rulebook bid constraints.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Rule step (bid)"
 * [MIG-004] [GAP-015] Valid bid values: {5, 6, 7, 8} only.
 *
 * @param amount     The bid amount the player is submitting.
 * @param highestBid Current highest bid in this round (0 if none yet placed).
 */
export function validateBidRule(
  amount: number,
  highestBid: number,
): ValidationResult<number> {
  const VALID = [5, 6, 7, 8] as const;
  if (!(VALID as readonly number[]).includes(amount)) {
    return {
      ok: false,
      error: `INVALID_BID_VALUE:${amount} — must be one of 5, 6, 7, 8`,
    };
  }
  if (amount <= highestBid) {
    return {
      ok: false,
      error: `BID_NOT_HIGHER:${amount} must exceed current high bid of ${highestBid}`,
    };
  }
  return { ok: true, value: amount };
}

/**
 * Validates the Primary Bid action.
 *
 * [MIG-024] [GAP-014] Rulebook Section: "Primary Bid"
 * Implements: "Mandatory value = 5; cannot be passed; cannot be any other value."
 *
 * @param amount       The bid amount submitted by the player.
 * @param primaryAmount The required primary bid amount (always PRIMARY_BID_AMOUNT = 5).
 */
export function validatePrimaryBidRule(
  amount: number,
  primaryAmount: number,
): ValidationResult<number> {
  if (amount !== primaryAmount) {
    return {
      ok: false,
      error: `PRIMARY_BID_MUST_BE_${primaryAmount}:got ${amount}`,
    };
  }
  return { ok: true, value: amount };
}

/**
 * Validates a trump suit selection.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Rule step (trump)"
 *
 * @param suit          The suit code ("S"|"H"|"D"|"C") or empty string for no-trump.
 * @param allowNoTrump  Whether the game config permits a no-trump declaration.
 */
export function validateTrumpRule(
  suit: string,
  allowNoTrump: boolean,
): ValidationResult<string> {
  const VALID_SUITS = ["S", "H", "D", "C"] as const;
  if (suit === "" || suit === "none") {
    if (!allowNoTrump) {
      return { ok: false, error: "NO_TRUMP_NOT_ALLOWED" };
    }
    return { ok: true, value: suit };
  }
  if (!(VALID_SUITS as readonly string[]).includes(suit)) {
    return { ok: false, error: `INVALID_TRUMP_SUIT:${suit}` };
  }
  return { ok: true, value: suit };
}

/**
 * Validates a card play against the pre-computed set of legal moves.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain — Rule step (card)"
 * The legal moves list is produced by the game engine's getLegalMovesZoned
 * (MIG-018) or getLegalMoves before zone-aware play is wired in.
 *
 * @param card       The card code the player wants to play.
 * @param legalMoves Legal moves for this seat at this moment.
 */
export function validateCardRule(
  card: string,
  legalMoves: readonly string[],
): ValidationResult<string> {
  if (legalMoves.length === 0) {
    return { ok: false, error: "NO_LEGAL_MOVES" };
  }
  if (!legalMoves.includes(card)) {
    return {
      ok: false,
      error: `CARD_NOT_LEGAL:${card}`,
    };
  }
  return { ok: true, value: card };
}

// ---------------------------------------------------------------------------
// Chain composer — runs Steps 2 through 4; Step 5 is action-specific.
// ---------------------------------------------------------------------------

export interface ChainInput {
  /** Context built from socket.data and the incoming payload. */
  context: ValidationContext;
  /** Current game phase, loaded by the handler from the game record. */
  phase: GamePhase;
  /** This player's seat in the game, or null if not a participant. */
  seat: number | null;
  /** This player's team, or null if not a participant. */
  team: (0 | 1) | null;
  /** The seat the game engine expects to act next. */
  currentSeat: number;
}

/**
 * Runs Steps 2–4 of the validation chain in sequence, short-circuiting
 * on the first failure. Returns a TurnContext on success so that the
 * handler can proceed to Step 5 (action-specific rule check).
 *
 * Steps 6 (Update) and 7 (Sync) are the handler's responsibility.
 *
 * [MIG-016] [GAP-038] Rulebook Section: "Validation Chain"
 */
export function runValidationChain(
  input: ChainInput,
): ValidationResult<TurnContext> {
  // Step 2 — Match State
  const matchResult = validateMatchState(
    input.context,
    input.phase,
    input.seat,
    input.team,
  );
  if (!matchResult.ok) return matchResult;

  // Step 3 — Turn
  const turnResult = validateTurn(matchResult.value, input.currentSeat);
  if (!turnResult.ok) return turnResult;

  // Step 4 — Action
  return validateAction(turnResult.value);
  // Step 5 is action-specific: caller invokes validateBidRule /
  // validateTrumpRule / validateCardRule on the returned TurnContext.
}
