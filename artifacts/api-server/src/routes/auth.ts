/**
 * /api/auth — Authentication routes
 *
 * POST /register  — Create a new account (username + email + password)
 * POST /login     — Login with email + password → JWT + refresh token
 * POST /guest     — Create ephemeral guest session → JWT + refresh token
 * POST /refresh   — Exchange refresh token for new JWT (token rotation)
 * POST /logout    — Revoke refresh token (requires Bearer token)
 * GET  /me        — Return current authenticated user profile
 *
 * All request bodies are validated with Zod schemas from @workspace/api-zod.
 * Passwords are hashed with argon2id.
 * Refresh tokens are stored as SHA-256 hashes (see auth.service.ts for rationale).
 * JWTs are signed with SESSION_SECRET (HS256, 15 min expiry).
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, usersTable } from "@workspace/db";
import {
  RegisterBody,
  RegisterResponse,
  LoginBody,
  LoginResponse,
  GuestLoginBody,
  GuestLoginResponse,
  RefreshTokenBody,
  RefreshTokenResponse,
  GetMeResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth.js";
import {
  hashPassword,
  verifyPassword,
  generateOpaqueToken,
  generateAccessToken,
  storeRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  buildUserDto,
} from "../services/auth.service.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── POST /register ───────────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
    return;
  }

  const { username, displayName, email, password } = parsed.data;

  try {
    // Username uniqueness
    const [existingUsername] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (existingUsername) {
      res.status(409).json({ error: "USERNAME_TAKEN", message: "Username is already taken." });
      return;
    }

    // Email uniqueness
    const [existingEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingEmail) {
      res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with that email already exists." });
      return;
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(usersTable)
      .values({ username, displayName, email, passwordHash, isGuest: false })
      .returning();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateOpaqueToken();
    await storeRefreshToken(user.id, refreshToken);

    res.status(201).json(
      RegisterResponse.parse({ accessToken, refreshToken, user: buildUserDto(user) }),
    );
  } catch (err) {
    logger.error({ err }, "POST /auth/register error");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /login ─────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    // Gate: must exist, have a password (non-guest), and pass argon2 verify
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      return;
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({ error: "ACCOUNT_BANNED", message: "This account has been banned." });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateOpaqueToken();
    await storeRefreshToken(user.id, refreshToken);

    // Update lastSeenAt (fire-and-forget — don't block the response)
    db.update(usersTable)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .catch((err) => logger.warn({ err, userId: user.id }, "Failed to update lastSeenAt on login"));

    res.json(
      LoginResponse.parse({ accessToken, refreshToken, user: buildUserDto(user) }),
    );
  } catch (err) {
    logger.error({ err }, "POST /auth/login error");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /guest ─────────────────────────────────────────────────────────────

router.post("/guest", async (req, res) => {
  // Body is optional for guest login
  const parsed = GuestLoginBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
    return;
  }

  try {
    const suffix = crypto.randomBytes(4).toString("hex"); // 8 hex chars
    const username = `guest_${suffix}`;
    const displayName = parsed.data.displayName ?? `Guest ${suffix.toUpperCase()}`;

    const [user] = await db
      .insert(usersTable)
      .values({ username, displayName, isGuest: true })
      .returning();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateOpaqueToken();
    await storeRefreshToken(user.id, refreshToken);

    res.status(201).json(
      GuestLoginResponse.parse({ accessToken, refreshToken, user: buildUserDto(user) }),
    );
  } catch (err) {
    logger.error({ err }, "POST /auth/guest error");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  const parsed = RefreshTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
    return;
  }

  try {
    const { newAccessToken, newRefreshToken, user } = await rotateRefreshToken(
      parsed.data.refreshToken,
    );

    res.json(
      RefreshTokenResponse.parse({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: buildUserDto(user),
      }),
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = err instanceof Error ? err.message : "INTERNAL_ERROR";
    if (status < 500) {
      res.status(status).json({ error: code });
    } else {
      logger.error({ err }, "POST /auth/refresh error");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

/**
 * Revokes the provided refresh token (if present in the body).
 * Requires a valid Bearer access token.
 * Always returns 204 — logout is best-effort; a missing/already-revoked
 * token is not treated as an error from the client's perspective.
 */
router.post("/logout", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = RefreshTokenBody.safeParse(req.body);
  if (parsed.success) {
    await revokeRefreshToken(parsed.data.refreshToken).catch((err) =>
      logger.warn({ err }, "POST /auth/logout: failed to revoke refresh token"),
    );
  }
  res.status(204).send();
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.sub;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    res.json(GetMeResponse.parse(buildUserDto(user)));
  } catch (err) {
    logger.error({ err }, "GET /auth/me error");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
