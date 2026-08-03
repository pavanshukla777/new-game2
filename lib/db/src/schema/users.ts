import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// users — registered and guest player accounts
// ---------------------------------------------------------------------------

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").unique(),           // null for guests
  passwordHash: text("password_hash"),     // null for guests / OAuth
  avatarUrl: text("avatar_url"),

  // Stats
  eloRating: integer("elo_rating").notNull().default(1200),
  gamesPlayed: integer("games_played").notNull().default(0),
  gamesWon: integer("games_won").notNull().default(0),
  totalScore: bigint("total_score", { mode: "number" }).notNull().default(0),

  // Flags
  isGuest: boolean("is_guest").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),

  // Timestamps
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  eloRating: true,
  gamesPlayed: true,
  gamesWon: true,
  totalScore: true,
  isBanned: true,
});

export const selectUserSchema = createSelectSchema(usersTable);

export const publicUserSchema = selectUserSchema.omit({
  passwordHash: true,
  email: true,
  isBanned: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type PublicUser = z.infer<typeof publicUserSchema>;

// ---------------------------------------------------------------------------
// refresh_tokens — JWT refresh token registry
// ---------------------------------------------------------------------------

export const refreshTokensTable = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), // Argon2 hash of token
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  revokedAt: timestamp("revoked_at", { withTimezone: true }), // null = still valid
});

export const insertRefreshTokenSchema = createInsertSchema(refreshTokensTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type RefreshToken = typeof refreshTokensTable.$inferSelect;
