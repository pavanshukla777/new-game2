import { describe, it, expect } from "vitest";
import { declareTrump, isTrump, validTrumpChoices } from "../trump.js";

describe("declareTrump", () => {
  const bidderSeat = 2;

  it("accepts a valid suit from the bidder", () => {
    const result = declareTrump(bidderSeat, bidderSeat, "H", { allowNoTrump: false });
    expect(result).toEqual({ suit: "H", noTrump: false });
  });
  it("accepts all four suits", () => {
    for (const suit of ["S", "H", "D", "C"] as const) {
      const r = declareTrump(bidderSeat, bidderSeat, suit, { allowNoTrump: false });
      expect(r.suit).toBe(suit);
      expect(r.noTrump).toBe(false);
    }
  });
  it("throws when called by a non-bidder", () => {
    expect(() => declareTrump(1, bidderSeat, "S", { allowNoTrump: false })).toThrow(/seat 2/i);
  });
  it("throws on invalid suit string", () => {
    expect(() =>
      declareTrump(bidderSeat, bidderSeat, "X" as never, { allowNoTrump: false }),
    ).toThrow();
  });
  it("accepts null when allowNoTrump is true", () => {
    const result = declareTrump(bidderSeat, bidderSeat, null, { allowNoTrump: true });
    expect(result).toEqual({ suit: null, noTrump: true });
  });
  it("throws null when allowNoTrump is false", () => {
    expect(() =>
      declareTrump(bidderSeat, bidderSeat, null, { allowNoTrump: false }),
    ).toThrow(/not enabled/i);
  });
});

describe("isTrump", () => {
  it("returns true for a card of the trump suit", () => {
    expect(isTrump("AH", "H")).toBe(true);
    expect(isTrump("10S", "S")).toBe(true);
  });
  it("returns false for a non-trump card", () => {
    expect(isTrump("AH", "S")).toBe(false);
    expect(isTrump("KD", "H")).toBe(false);
  });
  it("returns false when trump is null (no trump)", () => {
    expect(isTrump("AH", null)).toBe(false);
    expect(isTrump("AS", null)).toBe(false);
  });
});

describe("validTrumpChoices", () => {
  it("returns 4 suits when allowNoTrump is false", () => {
    const choices = validTrumpChoices({ allowNoTrump: false });
    expect(choices).toHaveLength(4);
    expect(choices).not.toContain(null);
  });
  it("includes null when allowNoTrump is true", () => {
    const choices = validTrumpChoices({ allowNoTrump: true });
    expect(choices).toHaveLength(5);
    expect(choices).toContain(null);
  });
});
