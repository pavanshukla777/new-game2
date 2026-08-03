import { describe, it, expect } from "vitest";
import { getLegalMoves, validateMove, getLedSuit } from "../move-validator.js";

const trick = (cards: Array<{ seat: number; card: string }>) => cards;

describe("getLegalMoves — leading a trick", () => {
  it("all cards are legal when trick is empty", () => {
    const hand = ["AS", "KH", "QD", "JC", "10S"];
    expect(getLegalMoves(hand, [])).toEqual(hand);
  });
  it("returns empty array when hand is empty", () => {
    expect(getLegalMoves([], [])).toEqual([]);
  });
});

describe("getLegalMoves — following a trick", () => {
  it("must follow suit when holding led suit", () => {
    const hand = ["AS", "KH", "QD", "10S"];
    const trickSoFar = trick([{ seat: 0, card: "5S" }]);
    const legal = getLegalMoves(hand, trickSoFar);
    expect(legal).toContain("AS");
    expect(legal).toContain("10S");
    expect(legal).not.toContain("KH");
    expect(legal).not.toContain("QD");
  });
  it("may play any card when void in led suit", () => {
    const hand = ["KH", "QD", "JC"];
    const trickSoFar = trick([{ seat: 0, card: "5S" }]);
    const legal = getLegalMoves(hand, trickSoFar);
    expect(legal).toEqual(hand);
  });
  it("may play trump when void in led suit", () => {
    const hand = ["KH", "AS"]; // no Diamonds
    const trickSoFar = trick([{ seat: 0, card: "5D" }]);
    const legal = getLegalMoves(hand, trickSoFar);
    expect(legal).toContain("KH");
    expect(legal).toContain("AS");
  });
  it("cannot play trump instead of led suit when holding led suit", () => {
    const hand = ["AS", "AH"]; // has Spades and Hearts; led is Hearts
    const trickSoFar = trick([{ seat: 0, card: "5H" }]);
    const legal = getLegalMoves(hand, trickSoFar);
    expect(legal).toEqual(["AH"]); // must follow Hearts
    expect(legal).not.toContain("AS");
  });
  it("only led-suit cards are legal when holding multiple of that suit", () => {
    const hand = ["AS", "KS", "AH", "KD"];
    const trickSoFar = trick([{ seat: 0, card: "5S" }]);
    const legal = getLegalMoves(hand, trickSoFar);
    expect(legal).toEqual(["AS", "KS"]);
  });
});

describe("validateMove", () => {
  it("valid move returns { valid: true }", () => {
    const hand = ["AS", "KH"];
    const result = validateMove("AS", hand, []);
    expect(result.valid).toBe(true);
  });
  it("card not in hand is invalid", () => {
    const hand = ["AS", "KH"];
    const result = validateMove("QD", hand, []);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/not in/i);
  });
  it("off-suit play when holding led suit is invalid", () => {
    const hand = ["AS", "KH"];
    const trickSoFar = trick([{ seat: 0, card: "5S" }]); // led: Spades
    const result = validateMove("KH", hand, trickSoFar);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/follow suit/i);
  });
  it("off-suit play when void is valid", () => {
    const hand = ["KH"]; // no Spades
    const trickSoFar = trick([{ seat: 0, card: "5S" }]);
    const result = validateMove("KH", hand, trickSoFar);
    expect(result.valid).toBe(true);
  });
});

describe("getLedSuit", () => {
  it("returns null when trick is empty", () => {
    expect(getLedSuit([])).toBeNull();
  });
  it("returns the suit of the first card played", () => {
    expect(getLedSuit([{ seat: 0, card: "5H" }])).toBe("H");
    expect(getLedSuit([{ seat: 0, card: "10D" }])).toBe("D");
  });
});
