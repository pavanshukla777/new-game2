import { Router } from "express";

/**
 * /api/users — User profile routes
 *
 * Phase 1 implementation will add:
 *   GET  /:id        — Get public user profile (display name, ELO, stats)
 *   PUT  /me         — Update own profile (display name, avatar)
 *   GET  /leaderboard — Top players by ELO rating (paginated)
 *
 * Sensitive fields (email, passwordHash) are never returned.
 * All responses use the `PublicUser` schema from @workspace/api-zod.
 */

const router = Router();

// Placeholder — Phase 1 will implement these
router.get("/leaderboard", (_req, res) => {
  res.json({ users: [], message: "Leaderboard — not yet implemented. See ROADMAP.md Phase 1." });
});

export default router;
