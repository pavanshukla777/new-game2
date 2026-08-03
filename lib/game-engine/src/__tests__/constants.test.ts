import { describe, it, expect } from "vitest";
import {
  getRankValue,
  getPointValue,
  parseCard,
  getSuit,
  getRank,
  getCardPoints,
  makeCardCode,
  SUITS,
  ALL_RANKS,
  SIX_PLAYER_RANKS,
  TOTAL_DECK_POINTS,
  CHHAKRI_THRESHOLD,
} from "../constants.js";

describe("getRankValue", () => {
  it("Ace is the highest rank", () => {
    expect(getRankValue("A")).toBe(13);
  });
  it("2 is the lowest rank", () => {
    expect(getRankValue("2")).toBe(1);
  });
  it("ranks are in ascending order: 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A", () => {
    const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(getRankValue(order[i])).toBeLessThan(getRankValue(order[i + 1]));
    }
  });
});

describe("getPointValue", () => {
  it("Ace = 4", () => expect(getPointValue("A")).toBe(4));
  it("King = 3", () => expect(getPointValue("K")).toBe(3));
  it("Queen = 2", () => expect(getPointValue("Q")).toBe(2));
  it("Jack = 1", () => expect(getPointValue("J")).toBe(1));
  it("10 = 10", () => expect(getPointValue("10")).toBe(10));
  it("5 = 5", () => expect(getPointValue("5")).toBe(5));
  it("blank cards worth 0", () => {
    for (const r of ["2", "3", "4", "6", "7", "8", "9"] as const) {
      expect(getPointValue(r)).toBe(0);
    }
  });
  it("total deck points across 4 suits = 100", () => {
    const pointsPerSuit = (4 + 3 + 2 + 1 + 10 + 5);
    expect(pointsPerSuit * 4).toBe(TOTAL_DECK_POINTS);
    expect(TOTAL_DECK_POINTS).toBe(100);
  });
});

describe("parseCard", () => {
  it("parses single-character rank cards", () => {
    expect(parseCard("AS")).toEqual({ rank: "A", suit: "S" });
    expect(parseCard("KH")).toEqual({ rank: "K", suit: "H" });
    expect(parseCard("2C")).toEqual({ rank: "2", suit: "C" });
    expect(parseCard("5D")).toEqual({ rank: "5", suit: "D" });
  });
  it("parses two-character rank '10'", () => {
    expect(parseCard("10H")).toEqual({ rank: "10", suit: "H" });
    expect(parseCard("10S")).toEqual({ rank: "10", suit: "S" });
  });
  it("throws on invalid suit", () => {
    expect(() => parseCard("AX")).toThrow();
  });
  it("throws on invalid rank", () => {
    expect(() => parseCard("1S")).toThrow();
  });
  it("throws on empty string", () => {
    expect(() => parseCard("")).toThrow();
  });
});

describe("getSuit / getRank", () => {
  it("getSuit returns the last character", () => {
    expect(getSuit("AS")).toBe("S");
    expect(getSuit("10H")).toBe("H");
    expect(getSuit("3D")).toBe("D");
  });
  it("getRank returns everything but the last character", () => {
    expect(getRank("AS")).toBe("A");
    expect(getRank("10H")).toBe("10");
  });
});

describe("getCardPoints", () => {
  it("10H is worth 10 points", () => expect(getCardPoints("10H")).toBe(10));
  it("AS is worth 4 points", () => expect(getCardPoints("AS")).toBe(4));
  it("7D is worth 0 points", () => expect(getCardPoints("7D")).toBe(0));
});

describe("makeCardCode", () => {
  it("builds correct code for single-char rank", () => {
    expect(makeCardCode("A", "S")).toBe("AS");
    expect(makeCardCode("K", "H")).toBe("KH");
  });
  it("builds correct code for 10", () => {
    expect(makeCardCode("10", "D")).toBe("10D");
  });
});

describe("SUITS and ranks", () => {
  it("has exactly 4 suits", () => {
    expect(SUITS).toHaveLength(4);
    expect(new Set(SUITS).size).toBe(4);
  });
  it("ALL_RANKS has 13 entries", () => {
    expect(ALL_RANKS).toHaveLength(13);
  });
  it("SIX_PLAYER_RANKS has 12 entries (no 2s)", () => {
    expect(SIX_PLAYER_RANKS).toHaveLength(12);
    expect(SIX_PLAYER_RANKS).not.toContain("2");
  });
  it("CHHAKRI_THRESHOLD is 6", () => {
    expect(CHHAKRI_THRESHOLD).toBe(6);
  });
});
