/**
 * HTTP Auth Middleware
 *
 * [MIG-005] [GAP-036] Rulebook Section: "Validation Chain — Identity"
 * Implements: Enforce JWT Bearer token verification on all protected REST endpoints.
 *   Step 1 of the 7-step validation chain:
 *     Identity → Match State → Turn Ownership → Action Legality →
 *     Rule Compliance → State Update → Client Sync
 *
 * Behaviour:
 *   - Reads `Authorization: Bearer <token>` header.
 *   - Verifies signature with SESSION_SECRET env var (HS256).
 *   - Attaches decoded payload to (req as AuthenticatedRequest).user on success.
 *   - Returns 401 on missing, malformed, expired, or invalid tokens.
 *   - Returns 403 on banned accounts.
 *   - Returns 500 when SESSION_SECRET is not configured (server misconfiguration).
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  sub: string;          // user ID
  username: string;
  displayName: string;
  isGuest: boolean;
  /** Present and true when the account has been banned. */
  banned?: boolean;
  iat: number;
  exp: number;
}

/**
 * Extend Express Request to carry the decoded JWT payload.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

/**
 * requireAuth — verifies JWT Bearer token; allows guest tokens.
 *
 * [MIG-005] [GAP-036] Rulebook Section: "Validation Chain — Identity"
 * Implements: Identity verification step of the 7-step validation chain.
 *   Returns 401 when no valid token is provided.
 *   Returns 403 when the account is banned.
 *   Attaches decoded payload to req.user on success.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Bearer token required.",
    });
    return;
  }

  const token = authHeader.slice(7).trim();

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Server misconfiguration — SESSION_SECRET must be set in all environments
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Authentication service not configured.",
    });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;

    if (payload.banned === true) {
      res.status(403).json({
        error: "ACCOUNT_BANNED",
        message: "This account has been banned.",
      });
      return;
    }

    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? "Token has expired."
        : "Token is invalid or malformed.";

    res.status(401).json({
      error: "UNAUTHORIZED",
      message,
    });
  }
}

/**
 * requireFullAuth — verifies JWT; rejects guest tokens.
 * Use on routes that require a registered account (e.g. update profile, create room).
 */
export function requireFullAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user?.isGuest) {
      res.status(403).json({
        error: "GUEST_NOT_ALLOWED",
        message: "This action requires a registered account.",
      });
      return;
    }
    next();
  });
}
