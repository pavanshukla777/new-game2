// ============================================================================
// Bundelkhandi Chhakri — Zone-Aware Dealing Utilities
// ============================================================================
//
// [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
// Implements: zone-aware dealing utilities that produce PlayerCards records
// (secretHand / faceDown / faceUp) from a dealt deck.
//
// [MIG-020] [GAP-003] Rulebook Section: "Distribution Sequence — phased"
// Implements: three phased deal functions following the Rulebook sequence:
//   Phase 1 — 2 cards per player → secret_hand  (dealt at round start)
//   Phase 2 — 3 cards per player → face_down    (dealt after Primary Bid)
//   Phase 3 — 3 cards per player → face_up      (dealt immediately after Phase 2)
//
// The phase functions are pure — they do not modify RoundState directly.
// MIG-024 will wire Phase 2 and Phase 3 invocations to the bidding
// completion event. Phase 1 is wired in initRound (round.ts).
// ============================================================================

import type { CardCode, PlayerCards, PlayerCount, RangeRng } from "./types.js";
import { CARDS_PER_PLAYER } from "./constants.js";
import { generateDeck, shuffleDeck } from "./deck.js";
import { cryptoRng } from "./prng.js";

// ---------------------------------------------------------------------------
// Zone card counts (Rulebook — fixed per player)
// ---------------------------------------------------------------------------

/** [MIG-017] [GAP-001] Rulebook mandates 2 secret-hand cards per player. */
export const SECRET_HAND_COUNT = 2 as const;

/** [MIG-017] [GAP-001] Rulebook mandates 3 face-down cards per player. */
export const FACE_DOWN_COUNT = 3 as const;

/** [MIG-017] [GAP-001] Rulebook mandates 3 face-up cards per player. */
export const FACE_UP_COUNT = 3 as const;

// ---------------------------------------------------------------------------
// Zone structure utilities
// [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
// ---------------------------------------------------------------------------

/**
 * Returns a fresh empty PlayerCards structure with no cards in any zone.
 *
 * [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
 */
export function emptyPlayerCards(): PlayerCards {
  return { secretHand: [], faceDown: [], faceUp: [] };
}

/**
 * Assigns a flat 8-card hand into the three zones deterministically:
 *   indices 0–1 → secretHand
 *   indices 2–4 → faceDown
 *   indices 5–7 → faceUp
 *
 * Used by `buildZonedHands` to convert the hands produced by the existing
 * `dealCards` function into zone-structured form for `RoundState.playerCards`.
 *
 * [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
 * Implements: static zone assignment from a dealt hand (not the phased deal).
 */
export function assignCardsToZones(hand: CardCode[]): PlayerCards {
  const expected = SECRET_HAND_COUNT + FACE_DOWN_COUNT + FACE_UP_COUNT; // 8
  if (hand.length !== expected) {
    throw new RangeError(
      `assignCardsToZones: expected ${expected} cards, got ${hand.length}`,
    );
  }
  return {
    secretHand: hand.slice(0, SECRET_HAND_COUNT),
    faceDown:   hand.slice(SECRET_HAND_COUNT, SECRET_HAND_COUNT + FACE_DOWN_COUNT),
    faceUp:     hand.slice(SECRET_HAND_COUNT + FACE_DOWN_COUNT),
  };
}

/**
 * Converts a flat hands record (seat → CardCode[]) into zone-structured form.
 * Each seat's 8 cards are assigned to zones via `assignCardsToZones`.
 *
 * Called from `initRound` to populate `RoundState.playerCards`.
 *
 * [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
 */
export function buildZonedHands(
  hands: Record<number, CardCode[]>,
): Record<number, PlayerCards> {
  const result: Record<number, PlayerCards> = {};
  for (const key of Object.keys(hands)) {
    const seat = Number(key);
    result[seat] = assignCardsToZones(hands[seat]);
  }
  return result;
}

/**
 * Merges all three zones into a single flat card list.
 * Order: secretHand → faceDown → faceUp.
 *
 * Used by the zone-aware move validator (MIG-018) to derive the complete
 * set of cards a player holds, regardless of zone.
 *
 * [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
 */
export function flattenPlayerCards(cards: PlayerCards): CardCode[] {
  return [...cards.secretHand, ...cards.faceDown, ...cards.faceUp];
}

/**
 * Returns the accessible playing hand for a seat given its zone structure.
 * Accessible means the cards the player may legally consider playing from,
 * ignoring suit-following restrictions (those are applied by the move validator).
 *
 * Rule (MIG-018 / GAP-023):
 *   accessible = faceUp + secretHand
 *   If accessible is empty → accessible = faceDown
 *   (faceDown cards are the last resort, playable only when both other zones
 *    are exhausted.)
 *
 * [MIG-017] [GAP-001] Rulebook Section: "Card Zone Structure"
 * [MIG-018] [GAP-023] Rulebook Section: "Legal Move Validation — zone-aware"
 */
export function getAccessibleHand(cards: PlayerCards): CardCode[] {
  const primary = [...cards.faceUp, ...cards.secretHand];
  if (primary.length > 0) return primary;
  return [...cards.faceDown];
}

// ---------------------------------------------------------------------------
// Phased dealing functions
// [MIG-020] [GAP-003] Rulebook Section: "Distribution Sequence — phased"
// ---------------------------------------------------------------------------

export interface Phase1DealResult {
  /**
   * Per-seat PlayerCards with only secretHand populated (2 cards each).
   * faceDown and faceUp are empty until phases 2 and 3.
   */
  playerCards: Record<number, PlayerCards>;
  /**
   * Remaining deck cards after phase 1 has been dealt.
   * Pass to dealPhase2Cards when the Primary Bid resolves.
   */
  remainingDeck: CardCode[];
  /** Full shuffled deck (for event replay). */
  shuffledDeck: CardCode[];
}

export interface Phase2DealResult {
  /**
   * Per-seat PlayerCards with secretHand + faceDown populated.
   * faceUp is still empty until phase 3.
   */
  playerCards: Record<number, PlayerCards>;
  /**
   * Remaining deck cards after phase 2.
   * Pass immediately to dealPhase3Cards.
   */
  remainingDeck: CardCode[];
}

export interface Phase3DealResult {
  /** Per-seat PlayerCards with all three zones fully populated. */
  playerCards: Record<number, PlayerCards>;
}

/**
 * Phase 1: deals 2 secret-hand cards per player, clockwise from the seat
 * to the dealer's left. Generates and shuffles the deck internally.
 *
 * Call at round start. The caller must pause here for the Primary Bid
 * (MIG-024) before invoking Phase 2.
 *
 * [MIG-020] [GAP-003] Rulebook Section: "Distribution Sequence — phased"
 * Implements: "Deal 2 cards → secret_hand per player; pause for Primary Bid."
 *
 * @param playerCount  Number of players (4 or 6).
 * @param dealerSeat   Dealer's seat number.
 * @param rng          Injected RNG (default: cryptoRng for production).
 */
export function dealPhase1Cards(
  playerCount: PlayerCount,
  dealerSeat: number,
  rng: RangeRng = cryptoRng,
): Phase1DealResult {
  const deck = generateDeck(playerCount);
  const shuffledDeck = shuffleDeck(deck, rng);

  const playerCards: Record<number, PlayerCards> = {};
  for (let seat = 0; seat < playerCount; seat++) {
    playerCards[seat] = emptyPlayerCards();
  }

  const firstSeat = (dealerSeat + 1) % playerCount;
  let idx = 0;

  // Deal SECRET_HAND_COUNT cards per player, one at a time clockwise
  for (let round = 0; round < SECRET_HAND_COUNT; round++) {
    for (let offset = 0; offset < playerCount; offset++) {
      const seat = (firstSeat + offset) % playerCount;
      playerCards[seat].secretHand.push(shuffledDeck[idx]);
      idx++;
    }
  }

  return {
    playerCards,
    remainingDeck: shuffledDeck.slice(idx),
    shuffledDeck,
  };
}

/**
 * Phase 2: deals 3 face-down cards per player, continuing from where the
 * phase 1 shuffle left off (using `remainingDeck`).
 *
 * Call after the Primary Bid has been resolved (MIG-024).
 * Immediately follow with Phase 3 — no bidding pause between them.
 *
 * [MIG-020] [GAP-003] Rulebook Section: "Distribution Sequence — phased"
 * Implements: "Deal 3 cards → face_down per player after Primary Bid."
 *
 * @param playerCards   Per-seat cards from Phase 1 result.
 * @param remainingDeck Remaining deck from Phase 1 result.
 * @param playerCount   Number of players (4 or 6).
 * @param dealerSeat    Dealer's seat number.
 */
export function dealPhase2Cards(
  playerCards: Record<number, PlayerCards>,
  remainingDeck: CardCode[],
  playerCount: PlayerCount,
  dealerSeat: number,
): Phase2DealResult {
  // Deep-copy faceDown arrays to avoid mutating the input
  const updated: Record<number, PlayerCards> = {};
  for (let seat = 0; seat < playerCount; seat++) {
    updated[seat] = {
      secretHand: [...playerCards[seat].secretHand],
      faceDown:   [...playerCards[seat].faceDown],
      faceUp:     [...playerCards[seat].faceUp],
    };
  }

  const firstSeat = (dealerSeat + 1) % playerCount;
  let idx = 0;

  for (let round = 0; round < FACE_DOWN_COUNT; round++) {
    for (let offset = 0; offset < playerCount; offset++) {
      const seat = (firstSeat + offset) % playerCount;
      updated[seat].faceDown.push(remainingDeck[idx]);
      idx++;
    }
  }

  return {
    playerCards: updated,
    remainingDeck: remainingDeck.slice(idx),
  };
}

/**
 * Phase 3: deals 3 face-up cards per player. These cards are visible to all
 * players immediately upon being dealt.
 *
 * Call immediately after Phase 2 (no bidding pause between phases 2 and 3).
 *
 * [MIG-020] [GAP-003] Rulebook Section: "Distribution Sequence — phased"
 * Implements: "Deal 3 cards → face_up per player; visible to all."
 *
 * @param playerCards   Per-seat cards from Phase 2 result.
 * @param remainingDeck Remaining deck from Phase 2 result.
 * @param playerCount   Number of players (4 or 6).
 * @param dealerSeat    Dealer's seat number.
 */
export function dealPhase3Cards(
  playerCards: Record<number, PlayerCards>,
  remainingDeck: CardCode[],
  playerCount: PlayerCount,
  dealerSeat: number,
): Phase3DealResult {
  const updated: Record<number, PlayerCards> = {};
  for (let seat = 0; seat < playerCount; seat++) {
    updated[seat] = {
      secretHand: [...playerCards[seat].secretHand],
      faceDown:   [...playerCards[seat].faceDown],
      faceUp:     [...playerCards[seat].faceUp],
    };
  }

  const firstSeat = (dealerSeat + 1) % playerCount;
  let idx = 0;

  for (let round = 0; round < FACE_UP_COUNT; round++) {
    for (let offset = 0; offset < playerCount; offset++) {
      const seat = (firstSeat + offset) % playerCount;
      updated[seat].faceUp.push(remainingDeck[idx]);
      idx++;
    }
  }

  return { playerCards: updated };
}

/**
 * Validates that a fully-dealt Phase3DealResult has the correct card counts.
 * Useful in tests and assertions.
 *
 * [MIG-017] [GAP-001] Rulebook: 2 + 3 + 3 = 8 cards per player.
 */
export function assertCompletePlayerCards(
  playerCards: Record<number, PlayerCards>,
  playerCount: PlayerCount,
): void {
  const expected = CARDS_PER_PLAYER[playerCount];
  for (let seat = 0; seat < playerCount; seat++) {
    const cards = playerCards[seat];
    if (!cards) {
      throw new Error(`Missing PlayerCards for seat ${seat}`);
    }
    const total = cards.secretHand.length + cards.faceDown.length + cards.faceUp.length;
    if (total !== expected) {
      throw new Error(
        `Seat ${seat}: expected ${expected} total cards, got ${total} ` +
        `(secretHand=${cards.secretHand.length}, faceDown=${cards.faceDown.length}, faceUp=${cards.faceUp.length})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Zone mutation utilities
// [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
// ---------------------------------------------------------------------------

/**
 * Removes a card from whichever zone it currently occupies and returns the
 * updated PlayerCards (pure — does NOT mutate the input).
 *
 * Search order: faceUp → secretHand → faceDown.
 * faceUp is checked first because it is the most frequently played zone
 * during normal trick-play. faceDown is last because it is only accessible
 * after the other zones are exhausted.
 *
 * Throws if the card is not found in any zone.
 *
 * [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
 * Called from applyPlayCard to keep playerCards in sync with the flat hand.
 */
export function removeCardFromZone(
  playerCards: PlayerCards,
  card: CardCode,
): PlayerCards {
  // Try faceUp first
  if (playerCards.faceUp.includes(card)) {
    return {
      ...playerCards,
      faceUp: playerCards.faceUp.filter((c) => c !== card),
    };
  }
  // Try secretHand
  if (playerCards.secretHand.includes(card)) {
    return {
      ...playerCards,
      secretHand: playerCards.secretHand.filter((c) => c !== card),
    };
  }
  // Try faceDown (last resort — only accessible when other zones are empty)
  if (playerCards.faceDown.includes(card)) {
    return {
      ...playerCards,
      faceDown: playerCards.faceDown.filter((c) => c !== card),
    };
  }
  throw new Error(
    `removeCardFromZone: card "${card}" not found in any zone ` +
    `(faceUp=[${playerCards.faceUp.join(",")}] secretHand=[${playerCards.secretHand.join(",")}] faceDown=[${playerCards.faceDown.join(",")}])`,
  );
}

/**
 * Returns true when face-down cards have become the accessible zone.
 *
 * This is the condition under which the player MUST play from their faceDown
 * pile — both faceUp and secretHand are exhausted.
 *
 * [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
 */
export function isInFaceDownPhase(playerCards: PlayerCards): boolean {
  return (
    playerCards.faceUp.length === 0 &&
    playerCards.secretHand.length === 0 &&
    playerCards.faceDown.length > 0
  );
}

/**
 * Returns the face-down cards that just became revealable to all players.
 *
 * When a player transitions into the face-down phase (accessible hand becomes
 * empty), their faceDown cards are about to be played face-up for the first
 * time. This helper returns those cards so the server broadcast layer can
 * notify all clients.
 *
 * Returns the full faceDown array when in face-down phase; returns [] otherwise.
 *
 * [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
 */
export function getRevealableCards(playerCards: PlayerCards): CardCode[] {
  if (isInFaceDownPhase(playerCards)) {
    return [...playerCards.faceDown];
  }
  return [];
}
