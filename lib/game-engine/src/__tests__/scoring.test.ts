// [MIG-003] [GAP-029] Rulebook Section: "Scoring — trick count model"
// [MIG-012] [GAP-030] Rulebook Section: "Scoring — zero-sum formula"
// Scoring uses trick count (tricksWon) vs bid — NOT card-point accumulation.
// Valid bid values: {5, 6, 7, 8} (trick-count targets).
//
// Official Rulebook formula (zero-sum):
//   Bid made:   bidTeam = +Bid;       defTeam = −Bid         (TeamA + TeamB = 0)
//   Bid failed: bidTeam = −(2 × Bid); defTeam = +(2 × Bid)  (TeamA + TeamB = 0)
//   No multipliers. No Chhakri bonus.
import { describe, it, expect } from "vitest";
import { calculateRoundScore, applyRoundScore, tallyPoints, tricksNeeded, pointsNeeded } from "../scoring.js";

// [MIG-003] Base result: bid 6 tricks, team 0 won 7 tricks (bid made)
const baseResult = {
  bidTeam: 0 as const,
  defTeam: 1 as const,
  bid: 6,
  tricksWon: [7, 1] as [number, number],  // team 0 won 7/8, team 1 won 1/8
  multiplier: 1 as const,
  chhakri: null,
};

describe("calculateRoundScore — bid made", () => {
  it("bidding team earns +bid, defending team earns −bid (zero-sum)", () => {
    // [MIG-012] bid=6, made → bidUnitScore=6; deltas=[+6, −6]
    const score = calculateRoundScore(baseResult);
    expect(score.deltas[0]).toBe(6);   // bid team: +bid
    expect(score.deltas[1]).toBe(-6);  // def team: −bid (zero-sum)
    expect(score.outcome).toBe("bid_made");
  });
  it("exact bid (tricksWon === bid) still counts as made", () => {
    // team 0 won exactly 6 = bid of 6
    const score = calculateRoundScore({ ...baseResult, tricksWon: [6, 2] });
    expect(score.deltas[0]).toBe(6);
    expect(score.deltas[1]).toBe(-6); // zero-sum
    expect(score.outcome).toBe("bid_made");
  });
});

describe("calculateRoundScore — bid failed", () => {
  it("bidding team loses −(2×bid), defending team earns +(2×bid) — zero-sum", () => {
    // [RULE] bid=6, failed → bidTeam=−(2×6)=−12; defTeam=+(2×6)=+12; net=0
    const result = { ...baseResult, bid: 6, tricksWon: [4, 4] as [number, number] };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(-12); // bid team: −(2×bid)
    expect(score.deltas[1]).toBe(12);  // def team: +(2×bid)
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
    expect(score.outcome).toBe("bid_failed");
  });
  it("bid failed when bidder wins 0 tricks — zero-sum", () => {
    // [RULE] bid=5, failed → bidTeam=−(2×5)=−10; defTeam=+(2×5)=+10; net=0
    const result = { ...baseResult, bid: 5, tricksWon: [0, 8] as [number, number] };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(-10); // bid team: −(2×5)
    expect(score.deltas[1]).toBe(10);  // def team: +(2×5)
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
    expect(score.outcome).toBe("bid_failed");
  });
});

describe("calculateRoundScore — all valid bids, success and failure [RULE]", () => {
  // [RULE] Valid bid values: {5, 6, 7, 8}. Formula: no multipliers.
  // Bid success: bidTeam = +Bid, defTeam = −Bid         (TeamA + TeamB = 0)
  // Bid failure: bidTeam = −(2×Bid), defTeam = +(2×Bid) (TeamA + TeamB = 0)

  // --- Bid 5 ---
  it("bid 5 success: bidTeam +5, defTeam −5, sum = 0", () => {
    const r = { ...baseResult, bid: 5, tricksWon: [5, 3] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(5);
    expect(s.deltas[1]).toBe(-5);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_made");
  });
  it("bid 5 failure: bidTeam −10, defTeam +10, sum = 0", () => {
    const r = { ...baseResult, bid: 5, tricksWon: [4, 4] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(-10);
    expect(s.deltas[1]).toBe(10);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_failed");
  });

  // --- Bid 6 ---
  it("bid 6 success: bidTeam +6, defTeam −6, sum = 0", () => {
    const r = { ...baseResult, bid: 6, tricksWon: [6, 2] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(6);
    expect(s.deltas[1]).toBe(-6);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_made");
  });
  it("bid 6 failure: bidTeam −12, defTeam +12, sum = 0", () => {
    const r = { ...baseResult, bid: 6, tricksWon: [5, 3] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(-12);
    expect(s.deltas[1]).toBe(12);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_failed");
  });

  // --- Bid 7 ---
  it("bid 7 success: bidTeam +7, defTeam −7, sum = 0", () => {
    const r = { ...baseResult, bid: 7, tricksWon: [7, 1] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(7);
    expect(s.deltas[1]).toBe(-7);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_made");
  });
  it("bid 7 failure: bidTeam −14, defTeam +14, sum = 0", () => {
    const r = { ...baseResult, bid: 7, tricksWon: [6, 2] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(-14);
    expect(s.deltas[1]).toBe(14);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_failed");
  });

  // --- Bid 8 ---
  it("bid 8 success: bidTeam +8, defTeam −8, sum = 0", () => {
    const r = { ...baseResult, bid: 8, tricksWon: [8, 0] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(8);
    expect(s.deltas[1]).toBe(-8);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_made");
  });
  it("bid 8 failure: bidTeam −16, defTeam +16, sum = 0", () => {
    const r = { ...baseResult, bid: 8, tricksWon: [7, 1] as [number, number] };
    const s = calculateRoundScore(r);
    expect(s.deltas[0]).toBe(-16);
    expect(s.deltas[1]).toBe(16);
    expect(s.deltas[0] + s.deltas[1]).toBe(0);
    expect(s.outcome).toBe("bid_failed");
  });
});

describe("calculateRoundScore — Chhakri (MIG-028: no bonus)", () => {
  // [MIG-028] [GAP-031] Rulebook: "No Chhakri bonus or multiplier applies to scoring."
  // Chhakri is recorded as an event/label but does NOT affect the score formula.
  // bidUnitScore = bid × multiplier (chhakrBonus is always 1).

  it("Chhakri by bidding team (bid made): same score as no-Chhakri [+6, −6]", () => {
    const result = {
      ...baseResult,
      chhakri: { team: 0 as const },
    };
    const score = calculateRoundScore(result);
    // No chhakri bonus: bid=6 made → [+6, −6] (identical to non-Chhakri outcome)
    expect(score.deltas[0]).toBe(6);
    expect(score.deltas[1]).toBe(-6);
    expect(score.outcome).toBe("chhakri_bid_team");
  });

  it("Chhakri by defending team (bid failed): same penalty as no-Chhakri [−12, +12]", () => {
    const result = {
      bidTeam: 0 as const,
      defTeam: 1 as const,
      bid: 6,
      tricksWon: [3, 5] as [number, number],
      multiplier: 1 as const,
      chhakri: { team: 1 as const },
    };
    const score = calculateRoundScore(result);
    // [RULE] bid=6 failed → bidTeam=−(2×6)=−12, defTeam=+(2×6)=+12; zero-sum
    expect(score.deltas[0]).toBe(-12);
    expect(score.deltas[1]).toBe(12);
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
    expect(score.outcome).toBe("chhakri_def_team");
  });

  it("Chhakri present (bid made): score uses raw bid, no bonus [+6, −6]", () => {
    // [RULE] No Chhakri bonus, no multiplier: bid=6, made → [+6, −6]; zero-sum
    const result = { ...baseResult, chhakri: { team: 0 as const } };
    const score = calculateRoundScore(result);
    expect(score.deltas[0]).toBe(6);
    expect(score.deltas[1]).toBe(-6);
    expect(score.deltas[0] + score.deltas[1]).toBe(0); // zero-sum invariant
  });

  it("Chhakri present produces same deltas as identical result without Chhakri", () => {
    const withChhakri = calculateRoundScore({ ...baseResult, chhakri: { team: 0 as const } });
    const withoutChhakri = calculateRoundScore({ ...baseResult, chhakri: null });
    expect(withChhakri.deltas).toEqual(withoutChhakri.deltas);
  });
});

describe("applyRoundScore", () => {
  const cfg = { targetScore: 500, doobnaThreshold: -500 };

  it("adds deltas to existing scores", () => {
    const result = applyRoundScore([10, 5], [6, 2], cfg);
    expect(result.scores).toEqual([16, 7]);
    expect(result.winner).toBeNull();
    expect(result.doobna).toBeNull();
  });
  it("team 0 wins when reaching targetScore", () => {
    const result = applyRoundScore([495, 10], [6, 2], cfg);
    expect(result.scores[0]).toBe(501);
    expect(result.winner).toBe(0);
  });
  it("team 1 wins when reaching targetScore", () => {
    const result = applyRoundScore([10, 495], [2, 6], cfg);
    expect(result.scores[1]).toBe(501);
    expect(result.winner).toBe(1);
  });
  it("if both cross target in same round, higher score wins", () => {
    const result = applyRoundScore([498, 498], [6, 2], cfg);
    expect(result.winner).toBe(0); // 504 vs 500
  });
  it("Doobna: team drops below threshold → immediate loss", () => {
    const result = applyRoundScore([-490, 200], [-20, 5], cfg);
    expect(result.doobna).toBe(0);
    expect(result.winner).toBe(1);
  });
  it("Doobna threshold is exclusive (exactly at threshold is not Doobna)", () => {
    const result = applyRoundScore([-490, 200], [-9, 5], cfg);
    expect(result.doobna).toBeNull();
    expect(result.scores[0]).toBe(-499);
  });
});

describe("tallyPoints", () => {
  it("sums per team", () => {
    const result = tallyPoints([
      { team: 0, points: 30 },
      { team: 1, points: 15 },
      { team: 0, points: 20 },
      { team: 1, points: 35 },
    ]);
    expect(result).toEqual([50, 50]);
  });
});

describe("tricksNeeded", () => {
  it("bid - already won", () => {
    expect(tricksNeeded(6, 3)).toBe(3);
  });
  it("returns 0 when bid already met", () => {
    expect(tricksNeeded(5, 6)).toBe(0);
  });
});

describe("pointsNeeded (deprecated alias)", () => {
  it("delegates to tricksNeeded", () => {
    expect(pointsNeeded(6, 4)).toBe(2);
    expect(pointsNeeded(5, 7)).toBe(0);
  });
});
