// ============================================================================
// Bundelkhandi Chhakri — Score Calculation
// ============================================================================
//
// [MIG-003] [GAP-029] Rulebook Section: "Scoring — trick count model"
// Implements: bid success/failure determined by trick count vs bid value,
//   NOT by card-point accumulation.
//
// [MIG-012] [GAP-030] Rulebook Section: "Scoring — zero-sum formula"
// Implements: Official Rulebook zero-sum formula.
//
//   Bidding team MADE bid (tricksWon[bidTeam] >= bid):
//     • Bidding team  → +Bid
//     • Defending team → −Bid                    (zero-sum: net = 0)
//
//   Bidding team FAILED bid (tricksWon[bidTeam] < bid):
//     • Bidding team  → −(2 × Bid)
//     • Defending team → +(2 × Bid)              (zero-sum: net = 0)
//
//   No multipliers. No Chhakri bonus.
//   Team A score + Team B score = 0 at all times.
//
// Game scoring:
//   Cumulative team scores. First team to reach targetScore (+52) wins.
//   Doobna: if a team drops below doobnaThreshold they lose immediately.
// ============================================================================

import type {
  RoundResult,
  RoundScore,
  TeamId,
  GameConfig,
  PlayerCount,
} from "./types.js";
import { TRICKS_PER_ROUND, MAX_BID } from "./constants.js";

// ---------------------------------------------------------------------------
// Round scoring
// ---------------------------------------------------------------------------

/**
 * Calculates the score delta for each team after a round ends.
 *
 * [MIG-003] [GAP-029] Rulebook Section: "Scoring — trick count model"
 * Implements: bid success determined by trick count (result.tricksWon)
 *   compared against bid value (result.bid), not card-point comparison.
 *
 * @param result  Summary of the completed round.
 * @returns       RoundScore with [team0Delta, team1Delta] and a text outcome.
 */
export function calculateRoundScore(result: RoundResult): RoundScore {
  const { bidTeam, defTeam, bid, tricksWon, multiplier, chhakri } = result;

  // [MIG-003] Bid success = trick count meets or exceeds bid target
  const bidMet = tricksWon[bidTeam] >= bid;

  // [MIG-012] [GAP-030] Rulebook Section: "Scoring — zero-sum formula"
  // Official Rulebook formula — no multipliers, no Chhakri bonus:
  //   Bid made:   bidTeam = +Bid;       defTeam = −Bid         (zero-sum)
  //   Bid failed: bidTeam = −(2 × Bid); defTeam = +(2 × Bid)  (zero-sum)
  //
  // [MIG-028] [GAP-031] Rulebook Section: "Scoring — no Chhakri bonus"
  // Chhakri is recorded as an event/label for display/audit purposes only.
  // It does NOT affect the score formula.
  const bidUnitScore = bid; // [RULE] Raw bid value; no multiplier per Official Rulebook

  let bidTeamDelta: number;
  let defTeamDelta: number;

  if (bidMet) {
    bidTeamDelta = +bidUnitScore;         // [RULE] Bid success: +Bid (zero-sum)
    defTeamDelta = -bidUnitScore;         // [RULE] Bid success: −Bid (zero-sum)
  } else {
    bidTeamDelta = -(2 * bidUnitScore);   // [RULE] Bid failure: −(2×Bid) (zero-sum)
    defTeamDelta = 2 * bidUnitScore;      // [RULE] Bid failure: +(2×Bid) (zero-sum)
  }

  const deltas: [number, number] = [0, 0];
  deltas[bidTeam] = bidTeamDelta;
  deltas[defTeam] = defTeamDelta;

  // Determine outcome label
  let outcome: RoundScore["outcome"];
  if (chhakri !== null) {
    outcome =
      chhakri.team === bidTeam ? "chhakri_bid_team" : "chhakri_def_team";
  } else {
    outcome = bidMet ? "bid_made" : "bid_failed";
  }

  return { deltas, outcome };
}

// ---------------------------------------------------------------------------
// Game scoring
// ---------------------------------------------------------------------------

export interface GameScoreResult {
  scores: [number, number];
  winner: TeamId | null;
  /** True if a team triggered the Doobna (below-minimum-score) rule. */
  doobna: TeamId | null;
}

/**
 * Applies a round score delta to the running game scores and checks for
 * win/loss conditions.
 *
 * @param currentScores  Game scores before this round.
 * @param deltas         Score delta from calculateRoundScore.
 * @param config         Game configuration (targetScore, doobnaThreshold).
 */
export function applyRoundScore(
  currentScores: [number, number],
  deltas: [number, number],
  config: Pick<GameConfig, "targetScore" | "doobnaThreshold">,
): GameScoreResult {
  const newScores: [number, number] = [
    currentScores[0] + deltas[0],
    currentScores[1] + deltas[1],
  ];

  // --- Doobna check (instant loss) ---
  let doobna: TeamId | null = null;
  if (newScores[0] <= config.doobnaThreshold) doobna = 0;
  else if (newScores[1] <= config.doobnaThreshold) doobna = 1;

  if (doobna !== null) {
    const winner = (1 - doobna) as TeamId;
    return { scores: newScores, winner, doobna };
  }

  // --- Target score check ---
  const t0Reached = newScores[0] >= config.targetScore;
  const t1Reached = newScores[1] >= config.targetScore;

  let winner: TeamId | null = null;

  if (t0Reached && t1Reached) {
    // Both cross in the same round — higher score wins
    winner = newScores[0] >= newScores[1] ? 0 : 1;
  } else if (t0Reached) {
    winner = 0;
  } else if (t1Reached) {
    winner = 1;
  }

  return { scores: newScores, winner, doobna: null };
}

// ---------------------------------------------------------------------------
// Point-card counting (helper for UI and AI)
// ---------------------------------------------------------------------------

/**
 * Total point cards captured by each team from completed tricks.
 * Returns [team0Points, team1Points].
 * Note: This tallies card-point values for display/AI purposes.
 *   Bid success is determined by trick count (see calculateRoundScore).
 */
export function tallyPoints(
  completedTrickPoints: Array<{ team: TeamId; points: number }>,
): [number, number] {
  return completedTrickPoints.reduce<[number, number]>(
    (acc, { team, points }) => {
      acc[team] += points;
      return acc;
    },
    [0, 0],
  );
}

/**
 * Returns the minimum tricks still needed for the bidding team to make their bid.
 * Useful for AI and UI "tricks needed" display.
 */
export function tricksNeeded(bid: number, alreadyWon: number): number {
  return Math.max(0, bid - alreadyWon);
}

/**
 * @deprecated Use tricksNeeded(). Retained for backward compatibility.
 */
export function pointsNeeded(bid: number, alreadyCaptured: number): number {
  return tricksNeeded(bid, alreadyCaptured);
}

// ---------------------------------------------------------------------------
// Perfect 8/8 instant series victory
// ---------------------------------------------------------------------------

/**
 * Returns true when the conditions for an Instant Series Victory are met.
 *
 * [MIG-029] [GAP-033] Rulebook Section: "Series Engine — Perfect 8/8"
 * Implements: Bid=8 AND Bidding Team wins ALL tricks in the round →
 *   Instant Series Victory for the Bidding Team, regardless of current scores.
 *
 * @param result       Completed round result.
 * @param playerCount  4 or 6 (determines total tricks per round).
 */
export function checkPerfect8Victory(
  result: RoundResult,
  playerCount: PlayerCount,
): boolean {
  const totalTricks = TRICKS_PER_ROUND[playerCount];
  return result.bid === MAX_BID && result.tricksWon[result.bidTeam] === totalTricks;
}
