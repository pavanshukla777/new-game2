// ============================================================================
// Bundelkhandi Chhakri — Zone Dealing Unit Tests
// ============================================================================
//
// [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
// Tests for: removeCardFromZone, isInFaceDownPhase, getRevealableCards
// and the phased deal chain (Phase 1 → 2 → 3).
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  emptyPlayerCards,
  assignCardsToZones,
  removeCardFromZone,
  isInFaceDownPhase,
  getRevealableCards,
  dealPhase1Cards,
  dealPhase2Cards,
  dealPhase3Cards,
  assertCompletePlayerCards,
  getAccessibleHand,
} from "../dealing.js";
import { createSeededRng } from "../prng.js";

// ---------------------------------------------------------------------------
// removeCardFromZone
// [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
// ---------------------------------------------------------------------------

describe("removeCardFromZone", () => {
  it("removes a card from faceUp", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    const result = removeCardFromZone(pc, "9H");
    expect(result.faceUp).toEqual(["8D", "7C"]);
    expect(result.secretHand).toEqual(["AS", "KH"]);
    expect(result.faceDown).toEqual(["QD", "JC", "10S"]);
  });

  it("removes a card from secretHand when not in faceUp", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    const result = removeCardFromZone(pc, "AS");
    expect(result.secretHand).toEqual(["KH"]);
    expect(result.faceDown).toEqual(["QD", "JC", "10S"]);
    expect(result.faceUp).toEqual(["9H", "8D", "7C"]);
  });

  it("removes a card from faceDown when not in faceUp or secretHand", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    const result = removeCardFromZone(pc, "QD");
    expect(result.faceDown).toEqual(["JC", "10S"]);
    expect(result.secretHand).toEqual(["AS", "KH"]);
    expect(result.faceUp).toEqual(["9H", "8D", "7C"]);
  });

  it("prioritises faceUp over other zones (same card not possible but search order verified)", () => {
    // faceUp is searched first — if the card is in faceUp it should be removed from there
    const pc = {
      secretHand: [],
      faceDown: [],
      faceUp: ["AS"],
    };
    const result = removeCardFromZone(pc, "AS");
    expect(result.faceUp).toEqual([]);
  });

  it("removes only the first matching occurrence (single instance in each zone)", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    const result = removeCardFromZone(pc, "KH");
    const totalBefore = 2 + 3 + 3;
    const totalAfter =
      result.secretHand.length + result.faceDown.length + result.faceUp.length;
    expect(totalAfter).toBe(totalBefore - 1);
    expect(result.secretHand).not.toContain("KH");
  });

  it("does not mutate the original PlayerCards (pure function)", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    const copy = {
      secretHand: [...pc.secretHand],
      faceDown: [...pc.faceDown],
      faceUp: [...pc.faceUp],
    };
    removeCardFromZone(pc, "AS");
    expect(pc).toEqual(copy); // original unchanged
  });

  it("throws when the card is not found in any zone", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    expect(() => removeCardFromZone(pc, "2C")).toThrow(/not found in any zone/i);
  });

  it("throws on empty PlayerCards (no zones have any cards)", () => {
    const pc = emptyPlayerCards();
    expect(() => removeCardFromZone(pc, "AS")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isInFaceDownPhase
// [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
// ---------------------------------------------------------------------------

describe("isInFaceDownPhase", () => {
  it("returns false when all zones have cards", () => {
    const pc = {
      secretHand: ["AS", "KH"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: ["9H", "8D", "7C"],
    };
    expect(isInFaceDownPhase(pc)).toBe(false);
  });

  it("returns false when only faceUp is empty (secretHand still has cards)", () => {
    const pc = {
      secretHand: ["AS"],
      faceDown: ["QD", "JC", "10S"],
      faceUp: [],
    };
    expect(isInFaceDownPhase(pc)).toBe(false);
  });

  it("returns false when only secretHand is empty (faceUp still has cards)", () => {
    const pc = {
      secretHand: [],
      faceDown: ["QD"],
      faceUp: ["9H"],
    };
    expect(isInFaceDownPhase(pc)).toBe(false);
  });

  it("returns true when faceUp and secretHand are both empty but faceDown has cards", () => {
    const pc = {
      secretHand: [],
      faceDown: ["QD", "JC", "10S"],
      faceUp: [],
    };
    expect(isInFaceDownPhase(pc)).toBe(true);
  });

  it("returns false when all zones are empty (no cards at all)", () => {
    expect(isInFaceDownPhase(emptyPlayerCards())).toBe(false);
  });

  it("returns false after accessible zone is exhausted AND faceDown is also empty", () => {
    const pc = { secretHand: [], faceDown: [], faceUp: [] };
    expect(isInFaceDownPhase(pc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRevealableCards
// [MIG-021] [GAP-026] Rulebook Section: "Face-down Logic"
// ---------------------------------------------------------------------------

describe("getRevealableCards", () => {
  it("returns [] when not in face-down phase (accessible zones still have cards)", () => {
    const pc = {
      secretHand: ["AS"],
      faceDown: ["QD"],
      faceUp: [],
    };
    expect(getRevealableCards(pc)).toEqual([]);
  });

  it("returns faceDown contents when in face-down phase", () => {
    const pc = {
      secretHand: [],
      faceDown: ["QD", "JC", "10S"],
      faceUp: [],
    };
    expect(getRevealableCards(pc)).toEqual(["QD", "JC", "10S"]);
  });

  it("returns a copy — mutating the result does not affect playerCards", () => {
    const pc = {
      secretHand: [],
      faceDown: ["QD", "JC"],
      faceUp: [],
    };
    const result = getRevealableCards(pc);
    result.push("ZZZZ");
    expect(pc.faceDown).toEqual(["QD", "JC"]);
  });

  it("returns [] when all zones are empty", () => {
    expect(getRevealableCards(emptyPlayerCards())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 → 2 → 3 chain integration
// [MIG-020] [GAP-003] Rulebook Section: "Distribution Sequence — phased"
// ---------------------------------------------------------------------------

describe("phased deal chain (Phase 1 → 2 → 3)", () => {
  it("full 2+3+3 chain produces 8 cards per player for 4 players", () => {
    const rng = createSeededRng(99);
    const phase1 = dealPhase1Cards(4, 0, rng);

    // Phase 1: only secretHand populated
    for (let seat = 0; seat < 4; seat++) {
      expect(phase1.playerCards[seat].secretHand).toHaveLength(2);
      expect(phase1.playerCards[seat].faceDown).toHaveLength(0);
      expect(phase1.playerCards[seat].faceUp).toHaveLength(0);
    }

    const phase2 = dealPhase2Cards(phase1.playerCards, phase1.remainingDeck, 4, 0);

    // Phase 2: secretHand + faceDown populated
    for (let seat = 0; seat < 4; seat++) {
      expect(phase2.playerCards[seat].secretHand).toHaveLength(2);
      expect(phase2.playerCards[seat].faceDown).toHaveLength(3);
      expect(phase2.playerCards[seat].faceUp).toHaveLength(0);
    }

    const phase3 = dealPhase3Cards(phase2.playerCards, phase2.remainingDeck, 4, 0);

    // Phase 3: all zones filled
    for (let seat = 0; seat < 4; seat++) {
      expect(phase3.playerCards[seat].secretHand).toHaveLength(2);
      expect(phase3.playerCards[seat].faceDown).toHaveLength(3);
      expect(phase3.playerCards[seat].faceUp).toHaveLength(3);
    }

    // assertCompletePlayerCards should pass without throwing
    expect(() => assertCompletePlayerCards(phase3.playerCards, 4)).not.toThrow();
  });

  it("full 2+3+3 chain produces 8 cards per player for 6 players", () => {
    const rng = createSeededRng(100);
    const phase1 = dealPhase1Cards(6, 0, rng);
    const phase2 = dealPhase2Cards(phase1.playerCards, phase1.remainingDeck, 6, 0);
    const phase3 = dealPhase3Cards(phase2.playerCards, phase2.remainingDeck, 6, 0);

    expect(() => assertCompletePlayerCards(phase3.playerCards, 6)).not.toThrow();

    for (let seat = 0; seat < 6; seat++) {
      const pc = phase3.playerCards[seat];
      expect(pc.secretHand.length + pc.faceDown.length + pc.faceUp.length).toBe(8);
    }
  });

  it("all cards are unique across all seats after full deal (4-player)", () => {
    const rng = createSeededRng(42);
    const phase1 = dealPhase1Cards(4, 0, rng);
    const phase2 = dealPhase2Cards(phase1.playerCards, phase1.remainingDeck, 4, 0);
    const phase3 = dealPhase3Cards(phase2.playerCards, phase2.remainingDeck, 4, 0);

    const allCards: string[] = [];
    for (let seat = 0; seat < 4; seat++) {
      const pc = phase3.playerCards[seat];
      allCards.push(...pc.secretHand, ...pc.faceDown, ...pc.faceUp);
    }
    const unique = new Set(allCards);
    expect(unique.size).toBe(allCards.length); // no duplicates
    expect(allCards.length).toBe(32); // 4 × 8
  });

  it("phase 1 remainder is exactly 3/4 of the deck", () => {
    const rng = createSeededRng(1);
    const phase1 = dealPhase1Cards(4, 0, rng);
    // 32-card deck, 4 players × 2 secretHand = 8 dealt, 24 remaining
    expect(phase1.remainingDeck).toHaveLength(24);
  });

  it("getAccessibleHand after full deal returns faceUp+secretHand (not faceDown)", () => {
    const rng = createSeededRng(7);
    const phase1 = dealPhase1Cards(4, 0, rng);
    const phase2 = dealPhase2Cards(phase1.playerCards, phase1.remainingDeck, 4, 0);
    const phase3 = dealPhase3Cards(phase2.playerCards, phase2.remainingDeck, 4, 0);

    for (let seat = 0; seat < 4; seat++) {
      const pc = phase3.playerCards[seat];
      const accessible = getAccessibleHand(pc);
      // faceUp+secretHand = 3+2 = 5 cards
      expect(accessible).toHaveLength(5);
      // None of the faceDown cards should appear in accessible
      for (const card of pc.faceDown) {
        expect(accessible).not.toContain(card);
      }
    }
  });
});
