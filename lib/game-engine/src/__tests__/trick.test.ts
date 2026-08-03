import { describe, it, expect } from "vitest";
import { evaluateTrick, beats, countTrickPoints, countCapturedPoints } from "../trick.js";

const t = (seat: number, card: string) => ({ seat, card });

describe("beats — no trump", () => {
  it("higher led-suit card beats lower", () => {
    expect(beats("AS", "KS", "S", null)).toBe(true);
    expect(beats("KS", "AS", "S", null)).toBe(false);
  });
  it("led-suit beats off-suit", () => {
    expect(beats("2S", "AH", "S", null)).toBe(true);
    expect(beats("AH", "2S", "S", null)).toBe(false);
  });
  it("two off-suit, non-trump cards: neither beats", () => {
    expect(beats("AH", "KD", "S", null)).toBe(false);
    expect(beats("KD", "AH", "S", null)).toBe(false);
  });
  it("10 beats 9 of the same suit", () => {
    expect(beats("10S", "9S", "S", null)).toBe(true);
  });
  it("J beats 10 of the same suit", () => {
    expect(beats("JS", "10S", "S", null)).toBe(true);
  });
});

describe("beats — with trump", () => {
  it("trump beats higher led-suit card", () => {
    expect(beats("2H", "AS", "S", "H")).toBe(true); // lowest trump beats highest led
  });
  it("higher trump beats lower trump", () => {
    expect(beats("AH", "2H", "S", "H")).toBe(true);
    expect(beats("2H", "AH", "S", "H")).toBe(false);
  });
  it("non-trump, non-led card cannot beat", () => {
    expect(beats("AD", "9S", "S", "H")).toBe(false); // Diamonds neither trump nor led
  });
  it("led suit cannot beat trump", () => {
    expect(beats("AS", "3H", "S", "H")).toBe(false); // AS is led but H is trump
  });
});

describe("evaluateTrick", () => {
  it("highest card of led suit wins when no trump", () => {
    const trick = [t(0, "JS"), t(1, "AS"), t(2, "3S"), t(3, "KS")];
    const result = evaluateTrick(0, trick, null);
    expect(result.winnerSeat).toBe(1); // AS wins
    expect(result.winnerTeam).toBe(1); // seat 1 = team 1
  });
  it("trump beats higher led-suit card", () => {
    // Led: S, Trump: H
    const trick = [t(0, "AS"), t(1, "2H"), t(2, "KS"), t(3, "QS")]; // seat 1 plays lowest trump
    const result = evaluateTrick(0, trick, "H");
    expect(result.winnerSeat).toBe(1);
  });
  it("highest trump wins when multiple trump played", () => {
    const trick = [t(0, "AS"), t(1, "5H"), t(2, "KH"), t(3, "3H")]; // trump: H
    const result = evaluateTrick(0, trick, "H");
    expect(result.winnerSeat).toBe(2); // KH is highest trump
  });
  it("first card sets led suit", () => {
    const trick = [t(0, "5D"), t(1, "AD"), t(2, "KD"), t(3, "2D")];
    const result = evaluateTrick(0, trick, null);
    expect(result.ledSuit).toBe("D");
    expect(result.winnerSeat).toBe(1); // AD wins
  });
  it("sums trick points correctly", () => {
    // AS(4) + KH(3) + 10D(10) + 5C(5) = 22
    const trick = [t(0, "AS"), t(1, "KH"), t(2, "10D"), t(3, "5C")];
    const result = evaluateTrick(0, trick, "H");
    expect(result.points).toBe(22);
  });
  it("winnerTeam assignment: seat 0 → team 0, seat 1 → team 1", () => {
    const trick = [t(0, "AS"), t(1, "2S"), t(2, "3S"), t(3, "4S")];
    const result = evaluateTrick(0, trick, null);
    expect(result.winnerSeat).toBe(0);
    expect(result.winnerTeam).toBe(0);
  });
  it("throws on empty trick", () => {
    expect(() => evaluateTrick(0, [], null)).toThrow();
  });
  it("off-suit non-trump card cannot win", () => {
    // Led: S, no trump. Player 2 plays AD (off-suit). Should not win.
    const trick = [t(0, "5S"), t(1, "9S"), t(2, "AD"), t(3, "3S")];
    const result = evaluateTrick(0, trick, null);
    expect(result.winnerSeat).toBe(1); // 9S wins among Spades
  });
  it("stores trickIndex in result", () => {
    const trick = [t(0, "AS"), t(1, "KS"), t(2, "QS"), t(3, "JS")];
    const result = evaluateTrick(5, trick, null);
    expect(result.index).toBe(5);
  });
});

describe("countTrickPoints", () => {
  it("correctly sums point cards", () => {
    // A=4, K=3, 10=10, 5=5 → 22; blank cards = 0
    expect(countTrickPoints([
      { seat: 0, card: "AS" },
      { seat: 1, card: "KH" },
      { seat: 2, card: "10D" },
      { seat: 3, card: "5C" },
    ])).toBe(22);
  });
  it("returns 0 for all blank cards", () => {
    expect(countTrickPoints([
      { seat: 0, card: "2S" },
      { seat: 1, card: "3H" },
      { seat: 2, card: "4D" },
      { seat: 3, card: "6C" },
    ])).toBe(0);
  });
});

describe("countCapturedPoints", () => {
  const tricks = [
    { index: 0, cards: [], ledSuit: "S" as const, winnerSeat: 0, winnerTeam: 0 as const, points: 15 },
    { index: 1, cards: [], ledSuit: "H" as const, winnerSeat: 1, winnerTeam: 1 as const, points: 20 },
    { index: 2, cards: [], ledSuit: "D" as const, winnerSeat: 2, winnerTeam: 0 as const, points: 10 },
    { index: 3, cards: [], ledSuit: "C" as const, winnerSeat: 3, winnerTeam: 1 as const, points: 5 },
  ];

  it("team 0 captures 15 + 10 = 25", () => {
    expect(countCapturedPoints(tricks, 0)).toBe(25);
  });
  it("team 1 captures 20 + 5 = 25", () => {
    expect(countCapturedPoints(tricks, 1)).toBe(25);
  });
});
