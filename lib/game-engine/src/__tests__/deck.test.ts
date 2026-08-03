import { describe, it, expect } from "vitest";
import {
  generateDeck,
  shuffleDeck,
  dealCards,
  cardsOfSuit,
  removeCardFromHand,
  handContains,
} from "../deck.js";
import { createSeededRng } from "../prng.js";
import { getCardPoints, TOTAL_DECK_POINTS, DECK_TOTAL_POINTS } from "../constants.js";

describe("generateDeck", () => {
  // [MIG-002] [GAP-002] Rulebook: 4-player deck removes ranks 2–6 → 8 ranks × 4 suits = 32 cards
  it("4-player deck has 32 cards (ranks 7–A only)", () => {
    expect(generateDeck(4)).toHaveLength(32);
  });
  it("4-player deck contains no cards with ranks 2–6", () => {
    const deck = generateDeck(4);
    const removedRanks = ["2", "3", "4", "5", "6"];
    for (const rank of removedRanks) {
      expect(deck.every((c) => !c.startsWith(rank) || c.length !== rank.length + 1)).toBe(true);
    }
    // Simpler: none start with these rank prefixes at valid positions
    expect(deck.every((c) => !["2S","2H","2D","2C","3S","3H","3D","3C","4S","4H","4D","4C","5S","5H","5D","5C","6S","6H","6D","6C"].includes(c))).toBe(true);
  });
  it("6-player deck has 48 cards (no 2s)", () => {
    const deck = generateDeck(6);
    expect(deck).toHaveLength(48);
    expect(deck.every((c) => !c.startsWith("2"))).toBe(true);
  });
  it("no duplicate cards in 4-player deck", () => {
    const deck = generateDeck(4);
    expect(new Set(deck).size).toBe(32);
  });
  it("no duplicate cards in 6-player deck", () => {
    const deck = generateDeck(6);
    expect(new Set(deck).size).toBe(48);
  });
  // [MIG-002] 4-player deck excludes the 5 (worth 5 pts) → total = 80 pts
  it("4-player deck totals 80 points (5s excluded)", () => {
    const points = generateDeck(4).reduce((s, c) => s + getCardPoints(c), 0);
    expect(points).toBe(DECK_TOTAL_POINTS[4]); // 80
  });
  it("6-player deck also totals 100 points (2s are worth 0)", () => {
    const points = generateDeck(6).reduce((s, c) => s + getCardPoints(c), 0);
    expect(points).toBe(TOTAL_DECK_POINTS); // 100
  });
});

describe("shuffleDeck", () => {
  const rng = createSeededRng(42);

  it("returns a new array of the same length", () => {
    const deck = generateDeck(4);
    const shuffled = shuffleDeck(deck, rng);
    expect(shuffled).toHaveLength(deck.length);
  });
  it("does not mutate the original deck", () => {
    const deck = generateDeck(4);
    const original = [...deck];
    shuffleDeck(deck, rng);
    expect(deck).toEqual(original);
  });
  it("contains exactly the same cards after shuffling", () => {
    const deck = generateDeck(4);
    const shuffled = shuffleDeck(deck, rng);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });
  it("two shuffles with the same seed produce the same result", () => {
    const deck = generateDeck(4);
    const rng1 = createSeededRng(1234);
    const rng2 = createSeededRng(1234);
    expect(shuffleDeck(deck, rng1)).toEqual(shuffleDeck(deck, rng2));
  });
  it("two shuffles with different seeds produce different results", () => {
    const deck = generateDeck(4);
    const rng1 = createSeededRng(1);
    const rng2 = createSeededRng(2);
    // Astronomically unlikely to be equal
    expect(shuffleDeck(deck, rng1)).not.toEqual(shuffleDeck(deck, rng2));
  });
});

describe("dealCards — 4-player", () => {
  // [MIG-002] 4-player: 32 cards / 4 players = 8 cards each
  const rng = createSeededRng(99);

  it("deals 8 cards to each of 4 players", () => {
    const { hands } = dealCards(4, 0, rng);
    expect(Object.keys(hands)).toHaveLength(4);
    for (let seat = 0; seat < 4; seat++) {
      expect(hands[seat]).toHaveLength(8);
    }
  });
  it("no card appears in two hands", () => {
    const { hands } = dealCards(4, 0, rng);
    const all = Object.values(hands).flat();
    expect(new Set(all).size).toBe(32);
  });
  it("all 32 cards are distributed", () => {
    const { hands } = dealCards(4, 0, rng);
    expect(Object.values(hands).flat()).toHaveLength(32);
  });
  it("total points across all hands = 80", () => {
    const { hands } = dealCards(4, 0, rng);
    const total = Object.values(hands).flat().reduce((s, c) => s + getCardPoints(c), 0);
    expect(total).toBe(DECK_TOTAL_POINTS[4]); // 80
  });
  it("throws on invalid dealer seat", () => {
    expect(() => dealCards(4, 4)).toThrow();
    expect(() => dealCards(4, -1)).toThrow();
  });
});

describe("dealCards — 6-player", () => {
  const rng = createSeededRng(77);

  it("deals 8 cards to each of 6 players", () => {
    const { hands } = dealCards(6, 0, rng);
    expect(Object.keys(hands)).toHaveLength(6);
    for (let seat = 0; seat < 6; seat++) {
      expect(hands[seat]).toHaveLength(8);
    }
  });
  it("all 48 cards distributed, no duplicates", () => {
    const { hands } = dealCards(6, 0, rng);
    const all = Object.values(hands).flat();
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48);
  });
  it("total points = 100", () => {
    const { hands } = dealCards(6, 0, rng);
    const total = Object.values(hands).flat().reduce((s, c) => s + getCardPoints(c), 0);
    expect(total).toBe(TOTAL_DECK_POINTS); // 100
  });
});

describe("dealCards — clockwise order", () => {
  it("first card in shuffledDeck goes to seat (dealerSeat+1)%pc", () => {
    const rng = createSeededRng(555);
    const { hands, shuffledDeck } = dealCards(4, 2, rng);
    // Dealer is seat 2, so first recipient is seat 3
    expect(hands[3][0]).toBe(shuffledDeck[0]);
  });
});

describe("cardsOfSuit", () => {
  it("returns only cards matching the given suit", () => {
    const hand = ["AS", "KH", "QD", "JC", "10S"];
    expect(cardsOfSuit(hand, "S")).toEqual(["AS", "10S"]);
    expect(cardsOfSuit(hand, "H")).toEqual(["KH"]);
    expect(cardsOfSuit(hand, "D")).toEqual(["QD"]);
  });
  it("returns empty when void in suit", () => {
    expect(cardsOfSuit(["AS", "10S"], "H")).toEqual([]);
  });
});

describe("removeCardFromHand", () => {
  it("removes the card from the hand", () => {
    const hand = ["AS", "KH", "QD"];
    expect(removeCardFromHand(hand, "KH")).toEqual(["AS", "QD"]);
  });
  it("does not mutate original hand", () => {
    const hand = ["AS", "KH"];
    removeCardFromHand(hand, "AS");
    expect(hand).toEqual(["AS", "KH"]);
  });
  it("throws if card not in hand", () => {
    expect(() => removeCardFromHand(["AS"], "KH")).toThrow();
  });
});

describe("handContains", () => {
  it("returns true when card is present", () => {
    expect(handContains(["AS", "KH"], "AS")).toBe(true);
  });
  it("returns false when card is absent", () => {
    expect(handContains(["AS", "KH"], "QD")).toBe(false);
  });
});
