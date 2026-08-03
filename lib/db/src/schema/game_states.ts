import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { gamesTable } from "./games";
import { gameRoundsTable } from "./games";
import type { ConnectionState } from "./games";
// Note: ConnectionState is already exported from the barrel via games.ts.
// Do NOT re-export it here — duplicate barrel exports are silently dropped by TypeScript.

// ---------------------------------------------------------------------------
// game_state_snapshots
//
// Full authoritative game state stored as JSONB after every significant event.
// Used for:
//   1. Reconnection — send the latest snapshot to a rejoining player
//   2. Replay — playback the full game event-by-event
//   3. Audit / anti-cheat — every state transition is recorded
// ---------------------------------------------------------------------------

export const gameEventTypeEnum = [
  "deal",
  "bid",
  "pass",
  "bid_won",
  "primary_bid",           // [MIG-024]
  "primary_trump_selected",// [MIG-024]
  "trump_selected",
  "play_card",
  "trick_ended",
  "round_ended",
  "game_ended",
  "player_disconnected",
  "player_reconnected",
  "chhakri",
  "redeal",
] as const;

export const gameStateSnapshotsTable = pgTable(
  "game_state_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: uuid("game_id")
      .notNull()
      .references(() => gamesTable.id, { onDelete: "cascade" }),
    roundId: uuid("round_id").references(() => gameRoundsTable.id, {
      onDelete: "set null",
    }),

    // Monotonically increasing per game — used for ordering and replay
    sequence: bigint("sequence", { mode: "number" }).notNull(),

    // What triggered this snapshot
    eventType: text("event_type").notNull(),

    // Full authoritative game state at this moment.
    // Structure: see AuthoritativeGameState below.
    // Note: This stores the FULL state (all hands visible).
    // Client-facing state strips opponent hands before sending.
    state: jsonb("state").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("snapshots_game_sequence_unique").on(t.gameId, t.sequence),
    index("snapshots_game_id_idx").on(t.gameId),
  ],
);

export const insertGameStateSnapshotSchema = createInsertSchema(
  gameStateSnapshotsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertGameStateSnapshot = z.infer<
  typeof insertGameStateSnapshotSchema
>;
export type GameStateSnapshot = typeof gameStateSnapshotsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Type definitions for the JSONB `state` field
// These are TypeScript types only — not Drizzle columns.
// They live here to keep the state shape co-located with the DB type.
// ---------------------------------------------------------------------------

export type CardCode = string; // e.g. "AS" "KH" "10D" "2C"

export type GamePhase =
  | "dealing"
  | "primary_bid"             // [MIG-024] Forced bid=5 by first Secret Hand recipient
  | "primary_trump_selection" // [MIG-024] Mandatory Primary Trump by same player
  | "bidding"
  | "trump_selection"
  | "playing"
  | "trick_ended"
  | "round_ended"
  | "game_ended";

export type Suit = "S" | "H" | "D" | "C";

// ConnectionState is exported from the barrel via games.ts (export * from "./games").
// Do not re-export it here — a duplicate star-export is silently dropped by TypeScript.

export interface SeatState {
  userId: string | null;         // null = AI
  displayName: string;
  team: 0 | 1;
  hand: CardCode[];              // flat hand — all cards (server view only)
  tricksWon: number;
  pointsCaptured: number;

  // [MIG-010] [GAP-022] Rulebook Section: "Reconnection"
  connectionState: ConnectionState;

  isAi: boolean;
  aiDifficulty?: string;

  // [MIG-021] [GAP-026] Zone-aware card fields (parallel to flat `hand`)
  // secretHand — visible only to the owner (2 cards initially)
  // faceDown   — face-down; contents hidden from opponents (3 cards initially)
  // faceUp     — visible to all players at all times (3 cards initially)
  // inFaceDownPhase — true when faceUp+secretHand are exhausted and faceDown is the accessible zone
  secretHand?: CardCode[];
  faceDown?: CardCode[];
  faceUp?: CardCode[];
  inFaceDownPhase?: boolean;
}

export interface BidEntry {
  seat: number;
  amount: number | "pass";
}

export interface TrickCard {
  seat: number;
  card: CardCode;
}

export type BiddingStatus = "ongoing" | "won" | "redeal";

export interface AuthoritativeGameState {
  gameId: string;
  roundNumber: number;
  phase: GamePhase;
  sequence: number;           // mirrors DB sequence for consistency checks

  // Seats 0=North 1=East 2=South 3=West (4-player)
  // Seats 0–5 supported for 6-player [MIG-006, MIG-007]
  seats: Record<number, SeatState>;

  // Dealer / turn order
  dealerSeat: number;

  // Bidding phase
  // [MIG-022] currentBidderSeat is null when bidding is complete or not in bidding phase
  currentBidderSeat: number | null;
  highestBid: number;
  highestBidderSeat: number | null;
  bids: BidEntry[];
  // [MIG-022] Full bidding lifecycle tracking needed for RoundState reconstruction
  biddingStatus: BiddingStatus;
  consecutivePasses: number;

  // Double / Redouble (Dobla / Char-Guna)
  multiplier: 1 | 2 | 4;
  doubleSeat: number | null;
  redoubleSeat: number | null;

  // Trump phase
  trumpSuit: Suit | null;
  noTrump: boolean;
  /**
   * [MIG-026] [GAP-019] Primary Trump selected after the Primary Bid.
   * If the final bid equals the primary bid, trumpSuit = primaryTrump and no
   * Final Trump selection occurs. null in legacy (non-two-round) mode.
   * Optional — absent in legacy snapshots; service defaults to null.
   */
  primaryTrump?: Suit | null;

  /**
   * [MIG-025] [GAP-017] Whether this round uses the two-round bidding structure.
   * Copied from GameConfig.useTwoRoundBidding at round initialisation.
   * Optional — absent in legacy snapshots; service defaults to false.
   */
  useTwoRoundBidding?: boolean;

  /**
   * [MIG-024] [GAP-003] Remaining deck after Phase 1 deal.
   * Only set when useTwoRoundBidding=true and phase is "primary_bid" or
   * "primary_trump_selection". Cleared once Phase 2/3 are dealt.
   */
  remainingDeck?: string[];

  // Trick-taking phase
  currentTrickLeaderSeat: number | null;
  currentTrick: TrickCard[];
  completedTricksThisRound: number;

  /**
   * [MIG-040] Full completed-trick details stored after every play_card event.
   * Required so the playing-phase RoundState can be reconstructed exactly
   * (without replaying all events from scratch) when a new card arrives.
   * Optional — absent in pre-Part-9 snapshots; treated as [] on reconstruction.
   */
  completedTricks?: Array<{
    index: number;
    cards: TrickCard[];
    ledSuit: string;
    winnerSeat: number;
    winnerTeam: 0 | 1;
    points: number;
  }>;
  consecutiveTricks: { seat: number; count: number } | null;
  // [MIG-022] Consecutive trick win tracker (per team) for Chhakri detection
  consecutiveWins: [number, number];
  chhakri: { team: number; trickIndex: number } | null;

  // Round scoring (running totals for current round)
  team0PointsThisRound: number;
  team1PointsThisRound: number;

  // Game scoring (cumulative)
  team0Score: number;
  team1Score: number;
  targetScore: number;

  // [MIG-021] [GAP-026] Server-side zone tracking (parallel to seats[n].hand).
  // Stored in the authoritative snapshot so handlers can rebuild zone state
  // without re-running the full engine. Never exposed to opponent clients.
  playerCards?: Record<
    number,
    { secretHand: CardCode[]; faceDown: CardCode[]; faceUp: CardCode[] }
  >;

  /**
   * The game mode selected for this session (e.g. "standard", "practice").
   * Copied from gamesTable.gameMode at game initialization.
   * Optional — absent in legacy snapshots.
   */
  gameMode?: string;

  /**
   * The full shuffled deck order at deal time (for replay and audit).
   * Set once at round initialization; never modified thereafter.
   * Optional — absent in legacy snapshots.
   */
  shuffledDeck?: string[];
}

/**
 * ClientGameState — derived from AuthoritativeGameState.
 * Private card data is hidden for opponent seats. Never store this type —
 * always derive it at send time via GameService.buildClientGameState().
 *
 * [MIG-021] [GAP-026] Zone-aware hiding:
 *   hand        — null for opponents; full flat hand for self
 *   secretHand  — null for opponents; full list for self
 *   faceDown    — COUNT only (number) for all seats; contents only for self via myFaceDown
 *   faceUp      — always visible to all players
 */
export interface ClientGameState
  extends Omit<AuthoritativeGameState, "seats" | "playerCards"> {
  seats: Record<
    number,
    Omit<SeatState, "hand" | "secretHand" | "faceDown"> & {
      hand: CardCode[] | null;       // null for opponents
      secretHand: CardCode[] | null; // null for opponents
      faceDownCount: number;         // card count (contents hidden from opponents)
      faceUp: CardCode[];            // always visible
    }
  >;
  mySeat: number;              // which seat this client occupies
  myHand: CardCode[];          // all cards (flat) — convenience alias
  mySecretHand: CardCode[];    // [MIG-021] zone convenience alias
  myFaceDown: CardCode[];      // [MIG-021] zone convenience alias (full contents)
  myFaceUp: CardCode[];        // [MIG-021] zone convenience alias
}
