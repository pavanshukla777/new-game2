import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { roomsTable } from "./rooms";

// ---------------------------------------------------------------------------
// games — a single game session (multiple rounds)
// ---------------------------------------------------------------------------

export const gamesTable = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid("room_id").references(() => roomsTable.id, {
      onDelete: "set null",
    }),

    // Config snapshot from room at game start
    // [MIG-013] [GAP-032] Rulebook Section: "Series Engine — +52 target"
    // Implements: series ends when a team reaches +52. Default updated from 500 to 52.
    targetScore: integer("target_score").notNull().default(52),
    gameMode: text("game_mode").notNull().default("standard"),

    // State
    status: text("status").notNull().default("active"), // active | completed | abandoned
    currentRound: integer("current_round").notNull().default(1),

    // Results (set when status = 'completed')
    winningTeam: integer("winning_team"),         // 0 or 1
    team0FinalScore: integer("team0_final_score"),
    team1FinalScore: integer("team1_final_score"),

    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    check("games_status_check", sql`${t.status} IN ('active', 'completed', 'abandoned')`),
    check("games_winning_team_check", sql`${t.winningTeam} IN (0, 1) OR ${t.winningTeam} IS NULL`),
  ],
);

export const insertGameSchema = createInsertSchema(gamesTable).omit({
  id: true,
  startedAt: true,
  endedAt: true,
  status: true,
  currentRound: true,
  winningTeam: true,
  team0FinalScore: true,
  team1FinalScore: true,
});

export const selectGameSchema = createSelectSchema(gamesTable);
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;

// ---------------------------------------------------------------------------
// game_players — the 4 or 6 players in a specific game
// ---------------------------------------------------------------------------

export const aiDifficultyEnum = ["beginner", "intermediate", "advanced", "expert"] as const;

/**
 * Player connection states for the in-game reconnection state machine.
 *
 * [MIG-010] [GAP-022] Rulebook Section: "Reconnection"
 * Implements: DB-level connection state to track player presence through disconnect cycles.
 *   CONNECTED      — player is live on the socket; normal play.
 *   DISCONNECTED   — socket dropped; reconnect window not yet started (transient).
 *   RECONNECTING   — reconnect window is active; AI has NOT taken over yet.
 *   AI_PLAYING     — reconnect window expired; AI controls this seat until player returns.
 *
 * State transitions:
 *   CONNECTED → DISCONNECTED  (socket drop)
 *   DISCONNECTED → RECONNECTING  (reconnect window started — MIG-042)
 *   RECONNECTING → CONNECTED  (player rejoins within window)
 *   RECONNECTING → AI_PLAYING  (window expires — MIG-045)
 *   AI_PLAYING → CONNECTED  (player returns and reclaims seat — MIG-044)
 */
export const connectionStateEnum = [
  "CONNECTED",
  "DISCONNECTED",
  "RECONNECTING",
  "AI_PLAYING",
] as const;

export type ConnectionState = (typeof connectionStateEnum)[number];

export const gamePlayersTable = pgTable(
  "game_players",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: uuid("game_id")
      .notNull()
      .references(() => gamesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }), // null = AI slot

    // [MIG-007] [GAP-005] Rulebook Section: "Player Seating"
    // Implements: 6-player games require seats 4 and 5.
    // Old check was BETWEEN 0 AND 3; now allows 0–5.
    seat: integer("seat").notNull(),       // 0–3 (4-player) | 0–5 (6-player)
    team: integer("team").notNull(),       // 0: North+South (seats 0,2) | 1: East+West (seats 1,3)

    // AI settings
    isAi: boolean("is_ai").notNull().default(false),
    aiDifficulty: text("ai_difficulty"),   // beginner | intermediate | advanced | expert

    // [MIG-009] [GAP-012] Rulebook Section: "Admin System — Dual Admin"
    // Implements: one admin per team per game (Dual Admin model).
    // Enforced by partial unique index: at most one row per (gameId, team) may have isAdmin = true.
    // Application assigns isAdmin = true to exactly one player per team when the game starts.
    isAdmin: boolean("is_admin").notNull().default(false),

    // [MIG-010] [GAP-022] Rulebook Section: "Reconnection"
    // Implements: connection state machine.
    // Valid values: CONNECTED | DISCONNECTED | RECONNECTING | AI_PLAYING
    connectionState: text("connection_state")
      .notNull()
      .default("CONNECTED"),

    // Per-game stats (accumulated across rounds)
    tricksWon: integer("tricks_won").notNull().default(0),
    pointsCaptured: integer("points_captured").notNull().default(0),
  },
  (t) => [
    uniqueIndex("game_players_game_user_unique").on(t.gameId, t.userId),
    uniqueIndex("game_players_game_seat_unique").on(t.gameId, t.seat),
    // [MIG-007] [GAP-005] Expanded from BETWEEN 0 AND 3
    check("game_players_seat_check", sql`${t.seat} BETWEEN 0 AND 5`),
    check("game_players_team_check", sql`${t.team} IN (0, 1)`),
    check(
      "game_players_ai_difficulty_check",
      sql`${t.aiDifficulty} IN ('beginner', 'intermediate', 'advanced', 'expert') OR ${t.aiDifficulty} IS NULL`,
    ),
    // [MIG-009] [GAP-012] Rulebook Section: "Admin System — Dual Admin"
    // Implements: one admin per team per game.
    check(
      "game_players_connection_state_check",
      sql`${t.connectionState} IN ('CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'AI_PLAYING')`,
    ),
    // [MIG-009] Partial unique index: at most 1 admin per (gameId, team).
    // Drizzle renders this as: CREATE UNIQUE INDEX ... WHERE (is_admin = true)
    uniqueIndex("game_players_one_admin_per_team")
      .on(t.gameId, t.team)
      .where(sql`${t.isAdmin} = true`),
    // Performance index for connection state lookups during reconnect handling
    index("game_players_connection_state_idx").on(t.connectionState),
  ],
);

export const insertGamePlayerSchema = createInsertSchema(gamePlayersTable).omit({
  id: true,
  tricksWon: true,
  pointsCaptured: true,
});

export type InsertGamePlayer = z.infer<typeof insertGamePlayerSchema>;
export type GamePlayer = typeof gamePlayersTable.$inferSelect;

// ---------------------------------------------------------------------------
// game_rounds — one round = one deal
// ---------------------------------------------------------------------------

export const trumpSuitEnum = ["S", "H", "D", "C"] as const; // Spades Hearts Diamonds Clubs

export const gameRoundsTable = pgTable(
  "game_rounds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: uuid("game_id")
      .notNull()
      .references(() => gamesTable.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),

    // Bidding
    bidderSeat: integer("bidder_seat"),
    // [MIG-011] [GAP-018] Rulebook Section: "Bidding — winningBid constraint"
    // Implements: winningBid must be one of the valid bid values {5,6,7,8}.
    // NULL is allowed before the round is finalised.
    winningBid: integer("winning_bid"),
    trumpSuit: text("trump_suit"),         // S | H | D | C

    // Round result
    biddingTeam: integer("bidding_team"),  // 0 or 1
    biddingTeamPointsCaptured: integer("bidding_team_points_captured"),
    defendingTeamPointsCaptured: integer("defending_team_points_captured"),
    bidSucceeded: boolean("bid_succeeded"),
    chhakriTeam: integer("chhakri_team"), // null if no chhakri occurred

    // Score deltas applied to game after this round
    team0ScoreDelta: integer("team0_score_delta").notNull().default(0),
    team1ScoreDelta: integer("team1_score_delta").notNull().default(0),

    // Running totals after this round
    team0CumulativeScore: integer("team0_cumulative_score").notNull().default(0),
    team1CumulativeScore: integer("team1_cumulative_score").notNull().default(0),

    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("game_rounds_game_round_unique").on(t.gameId, t.roundNumber),
    check(
      "game_rounds_trump_suit_check",
      sql`${t.trumpSuit} IN ('S', 'H', 'D', 'C') OR ${t.trumpSuit} IS NULL`,
    ),
    // [MIG-011] [GAP-018] Rulebook Section: "Bidding — winningBid constraint"
    // Implements: only {5, 6, 7, 8} are legal bid values; NULL allowed before round end.
    check(
      "game_rounds_winning_bid_check",
      sql`${t.winningBid} IN (5, 6, 7, 8) OR ${t.winningBid} IS NULL`,
    ),
  ],
);

export const insertGameRoundSchema = createInsertSchema(gameRoundsTable).omit({
  id: true,
  completedAt: true,
});

export const selectGameRoundSchema = createSelectSchema(gameRoundsTable);
export type InsertGameRound = z.infer<typeof insertGameRoundSchema>;
export type GameRound = typeof gameRoundsTable.$inferSelect;
