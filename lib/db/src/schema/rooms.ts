import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// rooms — game lobbies
// ---------------------------------------------------------------------------

export const roomStatusEnum = ["waiting", "in_game", "finished"] as const;
export const gameModeEnum = ["standard", "tournament", "practice"] as const;

export const roomsTable = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: text("code").notNull().unique(),             // 5-char join code (MIG-031 enforces length)
    name: text("name").notNull(),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => usersTable.id),

    // Room configuration
    // [MIG-008] [GAP-009] Rulebook: rooms support 4 or 6 players
    maxPlayers: integer("max_players").notNull().default(4),
    // [MIG-014] [GAP-035] Rulebook Section: "Series Engine — targetScore DB"
    // Implements: targetScore must be 52 per Rulebook (series ends at +52).
    // Old default was 500; old check constrained to {300,500,750}.
    targetScore: integer("target_score").notNull().default(52),
    gameMode: text("game_mode").notNull().default("standard"),
    // [MIG-032] [GAP-008] Rulebook Section: "Room Management — no password"
    // passwordHash removed: rooms are Public or Private; no passwords allowed.
    isPrivate: boolean("is_private").notNull().default(false),

    // Current state
    status: text("status").notNull().default("waiting"),
    currentGameId: uuid("current_game_id"),            // set when game starts

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (t) => [
    // [MIG-014] [GAP-035] Rulebook Section: "Series Engine — targetScore DB"
    // Implements: only 52 is a valid targetScore (series ends at +52).
    // Old constraint: IN (300, 500, 750) — replaced by the Rulebook value.
    check("rooms_target_score_check", sql`${t.targetScore} = 52`),
    // [MIG-008] [GAP-009] Rulebook Section: "Deck Construction"
    // Implements: both 4-player and 6-player games are valid.
    // Old constraint was `= 4`; expanded to allow 4 or 6.
    check("rooms_max_players_check", sql`${t.maxPlayers} IN (4, 6)`),
    // [MIG-031] [GAP-007] Rulebook Section: "Room Management — 5-char code"
    // Implements: join code is exactly 5 characters (uppercase alphanumeric).
    check("rooms_code_length_check", sql`char_length(${t.code}) = 5`),
    check("rooms_status_check", sql`${t.status} IN ('waiting', 'in_game', 'finished')`),
    check("rooms_game_mode_check", sql`${t.gameMode} IN ('standard', 'tournament', 'practice')`),
  ],
);

export const insertRoomSchema = createInsertSchema(roomsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  currentGameId: true,
});

export const selectRoomSchema = createSelectSchema(roomsTable);

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;

// ---------------------------------------------------------------------------
// room_players — players currently in a room (lobby state)
// ---------------------------------------------------------------------------

export const roomPlayersTable = pgTable(
  "room_players",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => roomsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    // [MIG-006] [GAP-004] Rulebook Section: "Player Seating"
    // Implements: 6-player games require seats 4 and 5.
    // Old check was BETWEEN 0 AND 3; now allows 0–5.
    seat: integer("seat").notNull(),  // 0–3 (4-player) | 0–5 (6-player)

    // [MIG-009] [GAP-012] Rulebook Section: "Admin System — Dual Admin"
    // Implements: exactly two admins per game (one per team).
    // Application layer assigns isAdmin = true for one player per team at room creation.
    // DB-level one-admin-per-room is NOT strictly required here (teams not yet assigned in lobby);
    // the invariant is enforced by the application. See game_players for team-aware constraint.
    isAdmin: boolean("is_admin").notNull().default(false),

    isReady: boolean("is_ready").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("room_players_room_user_unique").on(t.roomId, t.userId),
    uniqueIndex("room_players_room_seat_unique").on(t.roomId, t.seat),
    // [MIG-006] [GAP-004] Expanded from BETWEEN 0 AND 3
    check("room_players_seat_check", sql`${t.seat} BETWEEN 0 AND 5`),
  ],
);

export const insertRoomPlayerSchema = createInsertSchema(roomPlayersTable).omit({
  id: true,
  joinedAt: true,
});

export type InsertRoomPlayer = z.infer<typeof insertRoomPlayerSchema>;
export type RoomPlayer = typeof roomPlayersTable.$inferSelect;
