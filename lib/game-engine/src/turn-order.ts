// ============================================================================
// Bundelkhandi Chhakri — Turn Order and Team Assignment
// ============================================================================
//
// Seating:
//   4-player:  Seats 0 (North), 1 (East), 2 (South), 3 (West)
//              Teams: {0, 2} = Team 0  |  {1, 3} = Team 1
//
//   6-player:  Seats 0–5, every-other seat is a team
//              Teams: {0, 2, 4} = Team 0  |  {1, 3, 5} = Team 1
//
// Play order is always clockwise: 0 → 1 → 2 → … → (playerCount-1) → 0.
// ============================================================================

import type { TeamId, PlayerCount } from "./types.js";

// ---------------------------------------------------------------------------
// Team assignment
// ---------------------------------------------------------------------------

/**
 * Returns the TeamId for the given seat.
 *
 * Even seats (0, 2, 4) → Team 0.
 * Odd seats  (1, 3, 5) → Team 1.
 *
 * This holds for both 4-player and 6-player configurations.
 */
export function seatToTeam(seat: number): TeamId {
  return (seat % 2) as TeamId;
}

/**
 * Returns all seat numbers for the given team.
 */
export function teamSeats(team: TeamId, playerCount: PlayerCount): number[] {
  const seats: number[] = [];
  for (let s = 0; s < playerCount; s++) {
    if (seatToTeam(s) === team) seats.push(s);
  }
  return seats;
}

/**
 * Returns the opposing team.
 */
export function opposingTeam(team: TeamId): TeamId {
  return (1 - team) as TeamId;
}

// ---------------------------------------------------------------------------
// Turn progression
// ---------------------------------------------------------------------------

/**
 * Returns the next seat in clockwise order.
 */
export function nextSeat(seat: number, playerCount: PlayerCount): number {
  return (seat + 1) % playerCount;
}

/**
 * Returns the previous seat in clockwise order.
 */
export function prevSeat(seat: number, playerCount: PlayerCount): number {
  return (seat - 1 + playerCount) % playerCount;
}

/**
 * Returns all seats in clockwise order starting from `startSeat`.
 */
export function seatsInOrder(
  startSeat: number,
  playerCount: PlayerCount,
): number[] {
  const order: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    order.push((startSeat + i) % playerCount);
  }
  return order;
}

/**
 * Returns the seat index within the current trick whose turn it is to play.
 * The first player in the trick is the trick leader; subsequent players
 * follow clockwise.
 *
 * @param leaderSeat  The seat that leads the current trick.
 * @param trickLength Number of cards already played in this trick.
 * @param playerCount
 */
export function currentTrickSeat(
  leaderSeat: number,
  trickLength: number,
  playerCount: PlayerCount,
): number {
  return (leaderSeat + trickLength) % playerCount;
}

/**
 * Returns the seat of the dealer for the next round.
 * The deal rotates clockwise after each round.
 */
export function nextDealerSeat(
  currentDealerSeat: number,
  playerCount: PlayerCount,
): number {
  return nextSeat(currentDealerSeat, playerCount);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the seat number is valid for the given player count.
 */
export function isValidSeat(seat: number, playerCount: PlayerCount): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < playerCount;
}

/**
 * Returns the next dealer seat using the Rulebook trailing-team rule.
 *
 * [MIG-030] [GAP-034] Rulebook Section: "Series Engine — dealer rotation"
 * Implements: "Team currently behind in series score becomes Dealer Team for
 * next round."
 *
 * Algorithm:
 *   1. Determine which team is trailing (lower score).
 *   2. Return the first seat clockwise from currentDealerSeat that belongs
 *      to the trailing team.
 *   3. If scores are tied, fall back to normal clockwise rotation.
 *
 * @param currentDealerSeat  Dealer seat from the round just finished.
 * @param scores             Updated cumulative series scores [team0, team1].
 * @param playerCount        4 or 6.
 */
export function trailingTeamDealerSeat(
  currentDealerSeat: number,
  scores: [number, number],
  playerCount: PlayerCount,
): number {
  let trailingTeam: TeamId | null = null;
  if (scores[0] < scores[1]) trailingTeam = 0;
  else if (scores[1] < scores[0]) trailingTeam = 1;

  if (trailingTeam === null) {
    // Scores are tied — fall back to normal clockwise rotation
    return nextSeat(currentDealerSeat, playerCount);
  }

  // Find the first seat clockwise from currentDealerSeat that belongs to the
  // trailing team.
  for (let i = 1; i <= playerCount; i++) {
    const candidate = (currentDealerSeat + i) % playerCount;
    if (seatToTeam(candidate) === trailingTeam) return candidate;
  }

  // Should be unreachable (every playerCount has seats on every team)
  return nextSeat(currentDealerSeat, playerCount);
}
