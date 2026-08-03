/**
 * Auth Service — password hashing, JWT generation, refresh token lifecycle.
 *
 * Passwords:       argon2id  (slow KDF — appropriate for low-entropy user passwords)
 * Refresh tokens:  SHA-256   (fast, deterministic — appropriate for high-entropy
 *                             random tokens; enables direct DB lookup)
 * Access tokens:   HS256 JWT (15 min)
 */

import crypto from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import { db, usersTable, refreshTokensTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import type { User } from "@workspace/db";

// ─── Password ────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return hash(password); // default algorithm is argon2id
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// ─── Refresh token ───────────────────────────────────────────────────────────

const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Cryptographically random opaque refresh token (64 hex chars = 256 bits).
 */
export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * SHA-256 hash of the opaque token for DB storage and lookup.
 *
 * We use SHA-256 (not argon2) deliberately: the token is already high-entropy
 * random, so a slow KDF adds no security benefit and would prevent efficient
 * DB lookup via a unique index on tokenHash.
 */
export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(
  userId: string,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await db.insert(refreshTokensTable).values({ userId, tokenHash, expiresAt });
}

/**
 * Validate the old refresh token, revoke it, and issue new tokens (rotation).
 * Throws an Error with a `.status` property on failure.
 */
export async function rotateRefreshToken(rawOldToken: string): Promise<{
  newAccessToken: string;
  newRefreshToken: string;
  user: User;
}> {
  const oldHash = hashOpaqueToken(rawOldToken);

  const [tokenRow] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, oldHash))
    .limit(1);

  if (!tokenRow) {
    throw Object.assign(new Error("INVALID_REFRESH_TOKEN"), { status: 401 });
  }
  if (tokenRow.revokedAt !== null) {
    throw Object.assign(new Error("REFRESH_TOKEN_REVOKED"), { status: 401 });
  }
  if (tokenRow.expiresAt < new Date()) {
    throw Object.assign(new Error("REFRESH_TOKEN_EXPIRED"), { status: 401 });
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, tokenRow.userId))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error("USER_NOT_FOUND"), { status: 401 });
  }

  // Revoke old token
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.id, tokenRow.id));

  // Issue new tokens
  const newRefreshToken = generateOpaqueToken();
  await storeRefreshToken(user.id, newRefreshToken);
  const newAccessToken = generateAccessToken(user);

  return { newAccessToken, newRefreshToken, user };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(rawToken);
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.tokenHash, tokenHash),
        isNull(refreshTokensTable.revokedAt),
      ),
    );
}

// ─── JWT access token ────────────────────────────────────────────────────────

export function generateAccessToken(
  user: Pick<User, "id" | "username" | "displayName" | "isGuest" | "isBanned">,
): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");

  const payload: Record<string, unknown> = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    isGuest: user.isGuest,
  };
  if (user.isBanned) payload["banned"] = true;

  return jwt.sign(payload, secret, { expiresIn: "15m" });
}

// ─── User DTO ────────────────────────────────────────────────────────────────

/**
 * Map a DB User row to the public-facing shape expected by all auth responses.
 * Matches the Zod shape in @workspace/api-zod (RegisterResponse, LoginResponse, etc.)
 */
export function buildUserDto(user: User) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    eloRating: user.eloRating,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    isGuest: user.isGuest,
    createdAt: user.createdAt,
  };
}
