// ============================================================================
// Bundelkhandi Chhakri — Deck Generation, Shuffle, and Dealing
// ============================================================================

import type { CardCode, PlayerCount, RangeRng } from "./types.js";
import {
  SUITS,
  ALL_RANKS,
  FOUR_PLAYER_RANKS,
  SIX_PLAYER_RANKS,
  CARDS_PER_PLAYER,
  makeCardCode,
} from "./constants.js";
import { cryptoRng } from "./prng.js";

// ---------------------------------------------------------------------------
// Deck generation
// ---------------------------------------------------------------------------

/**
 * Generates an unshuffled, ordered deck for the given player count.
 *
 * [MIG-002] [GAP-002] Rulebook Section: "Deck Construction"
 * 4-player: 32 cards (ranks 7–A × 4 suits; ranks 2–6 removed).
 *           Total card-point value = 80 (5s are excluded).
 * 6-player: 48 cards (ranks 3–A × 4 suits; 2s removed).
 *           Total card-point value = 100 (2s are worth 0 points).
 */
export function generateDeck(playerCount: PlayerCount): CardCode[] {
  // [MIG-002] [GAP-002] Rulebook Section: "Deck Construction"
  // Implements: select rank set based on player count per Official Rulebook.
  const ranks = playerCount === 6 ? SIX_PLAYER_RANKS : FOUR_PLAYER_RANKS;
  const deck: CardCode[] = [];

  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push(makeCardCode(rank, suit));
    }
  }

  return deck;
}

// ---------------------------------------------------------------------------
// Shuffle — Fisher-Yates with injectable RNG
// ---------------------------------------------------------------------------

/**
 * Returns a new shuffled copy of the deck using the Fisher-Yates algorithm.
 *
 * @param deck   The ordered deck to shuffle.
 * @param rng    RNG function (default: cryptographically secure).
 *               Inject a seeded RNG for deterministic tests.
 */
export function shuffleDeck(deck: CardCode[], rng: RangeRng = cryptoRng): CardCode[] {
  const arr = [...deck]; // defensive copy — never mutate input

  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng(i + 1); // j ∈ [0, i]
    // Swap
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  return arr;
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

export interface DealResult {
  /** seat → cards dealt to that seat */
  hands: Record<number, CardCode[]>;
  /** The exact card order that was dealt (for replay). */
  shuffledDeck: CardCode[];
}

/**
 * Deals a shuffled deck to `playerCount` players, distributing cards
 * clockwise starting from the seat to the dealer's left.
 *
 * @param playerCount  Number of players (4 or 6).
 * @param dealerSeat   The dealer's seat number (0-indexed).
 * @param rng          Injected RNG (default: crypto).
 */
export function dealCards(
  playerCount: PlayerCount,
  dealerSeat: number,
  rng: RangeRng = cryptoRng,
): DealResult {
  validateSeat(dealerSeat, playerCount);

  const deck = generateDeck(playerCount);
  const shuffledDeck = shuffleDeck(deck, rng);
  const hands: Record<number, CardCode[]> = {};

  // Initialise empty hands
  for (let seat = 0; seat < playerCount; seat++) {
    hands[seat] = [];
  }

  // Deal clockwise from the seat to dealer's left
  const firstSeat = (dealerSeat + 1) % playerCount;
  let cardIndex = 0;

  const cardsEach = CARDS_PER_PLAYER[playerCount];

  // Round-robin deal: give one card at a time until all cards are distributed
  for (let round = 0; round < cardsEach; round++) {
    for (let offset = 0; offset < playerCount; offset++) {
      const seat = (firstSeat + offset) % playerCount;
      hands[seat].push(shuffledDeck[cardIndex]);
      cardIndex++;
    }
  }

  return { hands, shuffledDeck };
}

// ---------------------------------------------------------------------------
// Hand utilities
// ---------------------------------------------------------------------------

/**
 * Returns cards in a hand that match the given suit.
 */
export function cardsOfSuit(hand: CardCode[], suit: string): CardCode[] {
  return hand.filter((c) => c[c.length - 1] === suit);
}

/**
 * Removes a card from a hand, returning the new hand.
 * Throws if the card is not in the hand.
 */
export function removeCardFromHand(hand: CardCode[], card: CardCode): CardCode[] {
  const idx = hand.indexOf(card);
  if (idx === -1) {
    throw new Error(`Card "${card}" not found in hand [${hand.join(", ")}]`);
  }
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

/**
 * Returns true if the card exists in the hand.
 */
export function handContains(hand: CardCode[], card: CardCode): boolean {
  return hand.includes(card);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateSeat(seat: number, playerCount: PlayerCount): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= playerCount) {
    throw new RangeError(
      `Invalid seat ${seat} for ${playerCount}-player game (valid: 0–${playerCount - 1})`,
    );
  }
}
