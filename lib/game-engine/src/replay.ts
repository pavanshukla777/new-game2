// ============================================================================
// Bundelkhandi Chhakri — Replay System
// ============================================================================
//
// Every state transition appends a GameEvent to RoundState.events.
// This module provides:
//   • createEvent()  — factory to build timestamped events
//   • replayRound()  — re-applies all recorded events to reconstruct any past state
//   • getEventsByType() — filter helpers for analysis / UI
// ============================================================================

import type {
  EventType,
  GameConfig,
  GameEvent,
  PlayerCount,
  RangeRng,
  RoundState,
} from "./types.js";
import { initRound } from "./round.js";

// ---------------------------------------------------------------------------
// Event factory
// ---------------------------------------------------------------------------

/**
 * Creates a new GameEvent.
 *
 * @param sequence  Monotonically increasing sequence within the round.
 * @param type      The event type.
 * @param seat      The seat that triggered the event (undefined for system events).
 * @param payload   Event-specific data (free-form object).
 * @param now       Timestamp override (default: Date.now()). Pass a fixed value in tests.
 */
export function createEvent(
  sequence: number,
  type: EventType,
  seat: number | undefined,
  payload: Record<string, unknown>,
  now: number = Date.now(),
): GameEvent {
  return { sequence, type, seat, payload, timestamp: now };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * Replays all events in a round back from the deal to reconstruct the round
 * state at any given sequence number.
 *
 * This is used for:
 *   • Reconnection — send the current state to a re-joining player
 *   • Spectator view — display the game history
 *   • Audit — verify that the recorded events produce the expected state
 *
 * @param events      The ordered event log from a completed or in-progress round.
 * @param config      The game configuration used to create the round.
 * @param upToSeq     If provided, replay only up to (and including) this sequence.
 *                    Defaults to replaying all events.
 * @param rng         The RNG used to re-deal cards. For faithful replay this
 *                    must be a seeded RNG seeded from the original shuffle seed,
 *                    or you must pass the shuffledDeck back into the deal event.
 */
export function replayEvents(
  events: GameEvent[],
  config: GameConfig,
  upToSeq?: number,
  rng?: RangeRng,
): RoundState | null {
  const dealEvent = events.find((e) => e.type === "deal");
  if (!dealEvent) return null;

  const { dealerSeat, roundNumber = 1 } = dealEvent.payload as {
    dealerSeat: number;
    roundNumber?: number;
    shuffledDeck: string[];
  };

  // Use the stored shuffled deck to faithfully replay the same deal
  const shuffledDeck = dealEvent.payload["shuffledDeck"] as string[] | undefined;

  // Reconstruct the round from the deal
  let state = rng
    ? initRound(roundNumber, dealerSeat, config, rng)
    : initRoundFromDeck(roundNumber, dealerSeat, config, shuffledDeck ?? []);

  const limit = upToSeq ?? Infinity;
  const toReplay = events.filter(
    (e) => e.sequence > 0 && e.sequence <= limit && e.type !== "deal",
  );

  for (const event of toReplay) {
    state = applyReplayEvent(state, event, config);
    if (state === null) break; // should not happen
  }

  return state;
}

/**
 * Filters events by type — useful for building history summaries.
 */
export function getEventsByType(
  events: GameEvent[],
  type: EventType,
): GameEvent[] {
  return events.filter((e) => e.type === type);
}

/**
 * Returns a human-readable summary of all events in the log.
 */
export function summariseEvents(events: GameEvent[]): string[] {
  return events.map((e) => {
    const who = e.seat !== undefined ? `Seat ${e.seat}` : "System";
    switch (e.type) {
      case "deal":
        return `[${e.sequence}] ${who}: Cards dealt`;
      case "bid":
        return `[${e.sequence}] ${who}: Bid ${(e.payload as { amount: number }).amount}`;
      case "pass":
        return `[${e.sequence}] ${who}: Pass`;
      case "bid_won":
        return `[${e.sequence}] ${who}: Won bid at ${(e.payload as { bid: number }).bid}`;
      case "double":
        return `[${e.sequence}] ${who}: Called Double (Dobla)`;
      case "redouble":
        return `[${e.sequence}] ${who}: Called Redouble (Char-Guna)`;
      case "trump_selected": {
        const p = e.payload as { suit: string | null; noTrump: boolean };
        return `[${e.sequence}] ${who}: Trump = ${p.noTrump ? "No Trump" : p.suit}`;
      }
      case "play_card":
        return `[${e.sequence}] ${who}: Played ${(e.payload as { card: string }).card}`;
      case "trick_ended":
        return `[${e.sequence}] ${who}: Won trick (${(e.payload as { points: number }).points} pts)`;
      case "chhakri":
        return `[${e.sequence}] Team ${(e.payload as { team: number }).team}: CHHAKRI!`;
      case "round_ended":
        return `[${e.sequence}] Round ended`;
      case "game_ended":
        return `[${e.sequence}] Game ended — winner: Team ${(e.payload as { winner: number }).winner}`;
      case "redeal":
        return `[${e.sequence}] Redeal (all players passed)`;
      default:
        return `[${e.sequence}] ${e.type}`;
    }
  });
}

// ---------------------------------------------------------------------------
// Internal replay helpers
// ---------------------------------------------------------------------------

/** Constructs a round from a known shuffled deck (no RNG needed). */
function initRoundFromDeck(
  roundNumber: number,
  dealerSeat: number,
  config: GameConfig,
  shuffledDeck: string[],
): RoundState {
  // Build hands by simulating the deal from the shuffled deck
  const playerCount = config.playerCount;
  const cardsEach = shuffledDeck.length / playerCount;
  const hands: Record<number, string[]> = {};
  for (let s = 0; s < playerCount; s++) hands[s] = [];

  const firstSeat = (dealerSeat + 1) % playerCount;
  let idx = 0;
  for (let round = 0; round < cardsEach; round++) {
    for (let offset = 0; offset < playerCount; offset++) {
      const seat = (firstSeat + offset) % playerCount;
      hands[seat].push(shuffledDeck[idx]);
      idx++;
    }
  }

  const { createEvent: ce } = { createEvent };
  const dealEvent = ce(0, "deal", undefined, { shuffledDeck, dealerSeat });

  return {
    roundNumber,
    dealerSeat,
    phase: "bidding",
    hands,
    bids: [],
    consecutivePasses: 0,
    highestBid: 0,
    highestBidderSeat: null,
    biddingStatus: "ongoing",
    multiplier: 1,
    doubleSeat: null,
    redoubleSeat: null,
    trumpSuit: null,
    noTrump: false,
    // [MIG-024] [MIG-026] New fields — replay uses legacy mode defaults
    primaryTrump: null,
    useTwoRoundBidding: false,
    remainingDeck: undefined,
    currentTrickLeaderSeat: null,
    currentTrick: [],
    completedTricks: [],
    consecutiveWins: [0, 0],
    chhakri: null,
    capturedPoints: [0, 0],
    events: [dealEvent],
    nextSequence: 1,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyReplayEvent(state: RoundState, event: GameEvent, config: GameConfig): RoundState {
  const { applyBid, applyPass, applyTrumpSelection, applyPlayCard, callDouble, callRedouble } =
    // lazy import to avoid circular dependency at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./round.js") as typeof import("./round.js");

  try {
    switch (event.type) {
      case "bid":
        return applyBid(state, event.seat!, (event.payload as { amount: number }).amount, config);
      case "pass":
        return applyPass(state, event.seat!);
      case "double":
        return callDouble(state, event.seat!, config);
      case "redouble":
        return callRedouble(state, event.seat!, config);
      case "trump_selected":
        return applyTrumpSelection(state, event.seat!, (event.payload as { suit: string | null }).suit as (import("./types.js").Suit | null), config);
      case "play_card":
        return applyPlayCard(state, event.seat!, (event.payload as { card: string }).card, config);
      default:
        // Computed/derived events (trick_ended, round_ended, etc.) are not re-applied
        return state;
    }
  } catch {
    // Skip invalid events during replay (shouldn't happen with valid data)
    return state;
  }
}
