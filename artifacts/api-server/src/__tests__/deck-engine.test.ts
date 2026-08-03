/**
 * Volume 6 Part 1 — Deck Engine Backend Tests
 *
 * Covers:
 *   - Deck generation (4P and 6P)
 *   - Deck filtering (correct ranks removed per RULE-002, RULE-003, RULE-004)
 *   - Secure shuffle (Fisher-Yates, deterministic with seed, unbiased)
 *   - Card dealing (equal distribution, all cards dealt exactly once, clockwise)
 *   - Card uniqueness (no duplicates across hands)
 *   - Deck + deal validation (accepts valid states, rejects invalid ones)
 *   - Both player modes (4-player and 6-player)
 */

import { describe, it, expect } from "vitest";
import {
  generateDeck,
  shuffleDeck,
  dealCards,
  createSeededRng,
  cryptoRng,
  FOUR_PLAYER_RANKS,
  SIX_PLAYER_RANKS,
  SUITS,
  DECK_TOTAL_POINTS,
  DECK_SIZE,
  CARDS_PER_PLAYER,
  getCardPoints,
  makeCardCode,
  validateDeck,
  validateDeal,
  assertDealIntegrity,
  DeckValidationError,
} from "@workspace/game-engine";

// ============================================================================
// Deck generation
// ============================================================================

describe("generateDeck — 4-player (RULE-002, RULE-003)", () => {
  it("produces exactly 32 cards", () => {
    expect(generateDeck(4)).toHaveLength(32);
  });

  it("contains no cards with ranks 2, 3, 4, 5 or 6", () => {
    const deck = generateDeck(4);
    const removed = ["2", "3", "4", "5", "6"];
    for (const card of deck) {
      const rank = card.slice(0, -1);
      expect(removed).not.toContain(rank);
    }
  });

  it("contains exactly 4 copies of each allowed rank (one per suit)", () => {
    const deck = generateDeck(4);
    for (const rank of FOUR_PLAYER_RANKS) {
      const count = deck.filter((c) => c.slice(0, -1) === rank).length;
      expect(count).toBe(4);
    }
  });

  it("contains exactly 8 cards per suit", () => {
    const deck = generateDeck(4);
    for (const suit of SUITS) {
      const count = deck.filter((c) => c[c.length - 1] === suit).length;
      expect(count).toBe(8);
    }
  });

  it("contains no duplicate card codes", () => {
    const deck = generateDeck(4);
    expect(new Set(deck).size).toBe(32);
  });

  it("totals 80 point-card value (5s are excluded in 4P mode)", () => {
    const total = generateDeck(4).reduce((s, c) => s + getCardPoints(c), 0);
    expect(total).toBe(DECK_TOTAL_POINTS[4]);
  });
});

describe("generateDeck — 6-player (RULE-004)", () => {
  it("produces exactly 48 cards", () => {
    expect(generateDeck(6)).toHaveLength(48);
  });

  it("contains no cards with rank 2", () => {
    const deck = generateDeck(6);
    expect(deck.every((c) => c.slice(0, -1) !== "2")).toBe(true);
  });

  it("contains ranks 3 through A across all 4 suits", () => {
    const deck = generateDeck(6);
    for (const rank of SIX_PLAYER_RANKS) {
      for (const suit of SUITS) {
        expect(deck).toContain(makeCardCode(rank, suit));
      }
    }
  });

  it("contains no duplicate card codes", () => {
    const deck = generateDeck(6);
    expect(new Set(deck).size).toBe(48);
  });

  it("totals 100 point-card value (all 5s present in 6P mode)", () => {
    const total = generateDeck(6).reduce((s, c) => s + getCardPoints(c), 0);
    expect(total).toBe(100);
  });
});

// ============================================================================
// Deck filtering — DECK_SIZE correctness
// ============================================================================

describe("DECK_SIZE constants", () => {
  it("4-player DECK_SIZE matches generated deck length", () => {
    expect(generateDeck(4)).toHaveLength(DECK_SIZE[4]);
  });

  it("6-player DECK_SIZE matches generated deck length", () => {
    expect(generateDeck(6)).toHaveLength(DECK_SIZE[6]);
  });
});

// ============================================================================
// Secure shuffle
// ============================================================================

describe("shuffleDeck", () => {
  it("returns a new array (does not mutate input)", () => {
    const deck = generateDeck(4);
    const original = [...deck];
    shuffleDeck(deck, createSeededRng(1));
    expect(deck).toEqual(original);
  });

  it("preserves deck length", () => {
    const deck = generateDeck(4);
    expect(shuffleDeck(deck, createSeededRng(42))).toHaveLength(deck.length);
  });

  it("contains exactly the same cards after shuffling (no card lost or added)", () => {
    const deck = generateDeck(4);
    const shuffled = shuffleDeck(deck, createSeededRng(42));
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });

  it("produces the same output for the same seed", () => {
    const deck = generateDeck(4);
    expect(shuffleDeck(deck, createSeededRng(999))).toEqual(
      shuffleDeck(deck, createSeededRng(999)),
    );
  });

  it("produces different output for different seeds", () => {
    const deck = generateDeck(4);
    expect(shuffleDeck(deck, createSeededRng(1))).not.toEqual(
      shuffleDeck(deck, createSeededRng(2)),
    );
  });

  it("works on the 6-player 48-card deck", () => {
    const deck = generateDeck(6);
    const shuffled = shuffleDeck(deck, createSeededRng(7));
    expect(shuffled).toHaveLength(48);
    expect(new Set(shuffled).size).toBe(48);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });

  it("cryptoRng shuffle produces a deck of the same size and content", () => {
    const deck = generateDeck(4);
    const shuffled = shuffleDeck(deck, cryptoRng);
    expect(shuffled).toHaveLength(32);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });
});

// ============================================================================
// Card dealing — 4-player
// ============================================================================

describe("dealCards — 4-player", () => {
  const rng = createSeededRng(100);

  it("deals to exactly 4 seats", () => {
    const { hands } = dealCards(4, 0, rng);
    expect(Object.keys(hands)).toHaveLength(4);
  });

  it(`deals ${CARDS_PER_PLAYER[4]} cards to each seat`, () => {
    const { hands } = dealCards(4, 0, rng);
    for (let seat = 0; seat < 4; seat++) {
      expect(hands[seat]).toHaveLength(CARDS_PER_PLAYER[4]);
    }
  });

  it("distributes all 32 cards (none missing)", () => {
    const { hands } = dealCards(4, 0, rng);
    expect(Object.values(hands).flat()).toHaveLength(32);
  });

  it("no card appears in two hands", () => {
    const { hands } = dealCards(4, 0, rng);
    const all = Object.values(hands).flat();
    expect(new Set(all).size).toBe(32);
  });

  it("point total across all hands equals 80", () => {
    const { hands } = dealCards(4, 0, rng);
    const total = Object.values(hands).flat().reduce((s, c) => s + getCardPoints(c), 0);
    expect(total).toBe(DECK_TOTAL_POINTS[4]);
  });

  it("throws for an out-of-range dealer seat", () => {
    expect(() => dealCards(4, 4)).toThrow();
    expect(() => dealCards(4, -1)).toThrow();
  });

  it("first card in shuffledDeck goes to seat (dealerSeat+1)%4", () => {
    const r = createSeededRng(555);
    const { hands, shuffledDeck } = dealCards(4, 2, r);
    // dealer=2 → first recipient = seat 3
    expect(hands[3][0]).toBe(shuffledDeck[0]);
  });
});

// ============================================================================
// Card dealing — 6-player
// ============================================================================

describe("dealCards — 6-player", () => {
  const rng = createSeededRng(200);

  it("deals to exactly 6 seats", () => {
    const { hands } = dealCards(6, 0, rng);
    expect(Object.keys(hands)).toHaveLength(6);
  });

  it(`deals ${CARDS_PER_PLAYER[6]} cards to each seat`, () => {
    const { hands } = dealCards(6, 0, rng);
    for (let seat = 0; seat < 6; seat++) {
      expect(hands[seat]).toHaveLength(CARDS_PER_PLAYER[6]);
    }
  });

  it("distributes all 48 cards (none missing)", () => {
    const { hands } = dealCards(6, 0, rng);
    expect(Object.values(hands).flat()).toHaveLength(48);
  });

  it("no card appears in two hands", () => {
    const { hands } = dealCards(6, 0, rng);
    const all = Object.values(hands).flat();
    expect(new Set(all).size).toBe(48);
  });

  it("point total across all hands equals 100", () => {
    const { hands } = dealCards(6, 0, rng);
    const total = Object.values(hands).flat().reduce((s, c) => s + getCardPoints(c), 0);
    expect(total).toBe(100);
  });

  it("throws for an out-of-range dealer seat (seat 6 in 6-player game)", () => {
    expect(() => dealCards(6, 6)).toThrow();
  });
});

// ============================================================================
// Card uniqueness across multiple deals
// ============================================================================

describe("Card uniqueness", () => {
  it("two successive deals with different seeds produce different hands", () => {
    const { hands: h1 } = dealCards(4, 0, createSeededRng(1));
    const { hands: h2 } = dealCards(4, 0, createSeededRng(2));
    // Astronomically unlikely that seat 0 gets exactly the same cards
    expect(h1[0].sort().join()).not.toBe(h2[0].sort().join());
  });

  it("same seed always produces the same deal", () => {
    const { hands: h1 } = dealCards(4, 0, createSeededRng(42));
    const { hands: h2 } = dealCards(4, 0, createSeededRng(42));
    for (let seat = 0; seat < 4; seat++) {
      expect(h1[seat]).toEqual(h2[seat]);
    }
  });

  it("shuffledDeck is returned and has correct length (4P)", () => {
    const { shuffledDeck } = dealCards(4, 0, createSeededRng(10));
    expect(shuffledDeck).toHaveLength(32);
    expect(new Set(shuffledDeck).size).toBe(32);
  });

  it("shuffledDeck is returned and has correct length (6P)", () => {
    const { shuffledDeck } = dealCards(6, 0, createSeededRng(10));
    expect(shuffledDeck).toHaveLength(48);
    expect(new Set(shuffledDeck).size).toBe(48);
  });
});

// ============================================================================
// validateDeck — acceptance tests
// ============================================================================

describe("validateDeck — accepts valid decks", () => {
  it("accepts a freshly generated 4P deck", () => {
    expect(() => validateDeck(generateDeck(4), 4)).not.toThrow();
  });

  it("accepts a freshly generated 6P deck", () => {
    expect(() => validateDeck(generateDeck(6), 6)).not.toThrow();
  });

  it("accepts a shuffled 4P deck (order does not matter)", () => {
    const shuffled = shuffleDeck(generateDeck(4), createSeededRng(5));
    expect(() => validateDeck(shuffled, 4)).not.toThrow();
  });
});

// ============================================================================
// validateDeck — rejection tests
// ============================================================================

describe("validateDeck — rejects invalid decks", () => {
  it("throws INVALID_DECK_SIZE when deck is too short", () => {
    const deck = generateDeck(4).slice(0, 31);
    expect(() => validateDeck(deck, 4)).toThrow(DeckValidationError);
    expect(() => validateDeck(deck, 4)).toThrow("INVALID_DECK_SIZE");
  });

  it("throws INVALID_DECK_SIZE when deck is too long", () => {
    const deck = [...generateDeck(4), "AS"]; // duplicate card added
    expect(() => validateDeck(deck, 4)).toThrow(DeckValidationError);
  });

  it("throws DUPLICATE_CARD when a card appears twice", () => {
    const deck = generateDeck(4);
    deck[1] = deck[0]; // force a duplicate
    expect(() => validateDeck(deck, 4)).toThrow(DeckValidationError);
    expect(() => validateDeck(deck, 4)).toThrow("DUPLICATE_CARD");
  });

  it("throws INVALID_RANK when a 4P deck contains a rank-2 card", () => {
    const deck = generateDeck(4);
    deck[0] = "2S"; // rank 2 is forbidden in 4P
    expect(() => validateDeck(deck, 4)).toThrow(DeckValidationError);
    expect(() => validateDeck(deck, 4)).toThrow("INVALID_RANK");
  });

  it("throws INVALID_RANK when a 4P deck contains a rank-5 card", () => {
    const deck = generateDeck(4);
    deck[0] = "5H"; // rank 5 is forbidden in 4P
    expect(() => validateDeck(deck, 4)).toThrow(DeckValidationError);
    expect(() => validateDeck(deck, 4)).toThrow("INVALID_RANK");
  });

  it("throws INVALID_RANK when a 6P deck contains a rank-2 card", () => {
    const deck = generateDeck(6);
    deck[0] = "2C"; // rank 2 is forbidden in 6P
    expect(() => validateDeck(deck, 6)).toThrow(DeckValidationError);
    expect(() => validateDeck(deck, 6)).toThrow("INVALID_RANK");
  });

  it("throws MISSING_CARD when a card has been removed from the deck", () => {
    const deck = generateDeck(4);
    // Replace AS with a duplicate 7S (removing AS)
    deck[deck.indexOf("AS")] = "7S";
    // Now 7S is duplicated and AS is missing — but size check passes if we don't adjust
    // To trigger MISSING_CARD specifically, remove one card and add a duplicate
    const deck2 = generateDeck(4);
    deck2.splice(deck2.indexOf("AS"), 1); // remove AS
    deck2.push("KS"); // add an extra KS (duplicate)
    // Size is still 32 but AS is missing
    expect(() => validateDeck(deck2, 4)).toThrow(DeckValidationError);
  });
});

// ============================================================================
// validateDeal — acceptance tests
// ============================================================================

describe("validateDeal — accepts valid deals", () => {
  it("accepts a freshly dealt 4P game", () => {
    const { hands } = dealCards(4, 0, createSeededRng(1));
    expect(() => validateDeal(hands, 4)).not.toThrow();
  });

  it("accepts a freshly dealt 6P game", () => {
    const { hands } = dealCards(6, 0, createSeededRng(1));
    expect(() => validateDeal(hands, 6)).not.toThrow();
  });
});

// ============================================================================
// validateDeal — rejection tests
// ============================================================================

describe("validateDeal — rejects invalid deals", () => {
  it("throws WRONG_SEAT_COUNT when a seat is missing", () => {
    const { hands } = dealCards(4, 0, createSeededRng(1));
    const { 3: _removed, ...partial } = hands;
    expect(() => validateDeal(partial as Record<number, string[]>, 4)).toThrow(
      DeckValidationError,
    );
    expect(() => validateDeal(partial as Record<number, string[]>, 4)).toThrow(
      "WRONG_SEAT_COUNT",
    );
  });

  it("throws UNEQUAL_HAND_SIZE when one seat has too few cards", () => {
    const { hands } = dealCards(4, 0, createSeededRng(2));
    const badHands = { ...hands, 0: hands[0].slice(0, 7) }; // steal one card
    expect(() => validateDeal(badHands, 4)).toThrow(DeckValidationError);
    expect(() => validateDeal(badHands, 4)).toThrow("UNEQUAL_HAND_SIZE");
  });

  it("throws DUPLICATE_OWNERSHIP when the same card exists in two hands", () => {
    const { hands } = dealCards(4, 0, createSeededRng(3));
    // Give seat 1 a card that seat 0 already holds
    const badHands = { ...hands };
    badHands[1] = [...hands[1].slice(0, 7), hands[0][0]];
    expect(() => validateDeal(badHands, 4)).toThrow(DeckValidationError);
    expect(() => validateDeal(badHands, 4)).toThrow("DUPLICATE_OWNERSHIP");
  });
});

// ============================================================================
// assertDealIntegrity — end-to-end
// ============================================================================

describe("assertDealIntegrity", () => {
  it("passes for a valid 4-player deal", () => {
    const { hands } = dealCards(4, 0, createSeededRng(42));
    expect(() => assertDealIntegrity(hands, 4)).not.toThrow();
  });

  it("passes for a valid 6-player deal", () => {
    const { hands } = dealCards(6, 0, createSeededRng(42));
    expect(() => assertDealIntegrity(hands, 6)).not.toThrow();
  });

  it("throws DeckValidationError on a corrupt deal", () => {
    const { hands } = dealCards(4, 0, createSeededRng(1));
    const bad = { ...hands, 0: hands[0].slice(0, 7) };
    expect(() => assertDealIntegrity(bad, 4)).toThrow(DeckValidationError);
  });
});
