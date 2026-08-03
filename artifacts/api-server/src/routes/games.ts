import { Router } from "express";

/**
 * /api/games — Game session routes
 *
 * Phase 2 implementation will add:
 *   GET  /:id          — Get game state (public view, no hidden hands)
 *   GET  /:id/replay   — Get ordered list of game state snapshots for replay
 *   GET  /history      — Authenticated user's game history (paginated)
 *
 * In-progress game actions (play card, bid, etc.) are handled via
 * Socket.IO /game namespace — not REST. See docs/MULTIPLAYER_DESIGN.md.
 */

const router = Router();

// Placeholder — Phase 2 will implement these
router.get("/history", (_req, res) => {
  res.json({ games: [], message: "Game history — not yet implemented. See ROADMAP.md Phase 2." });
});

export default router;
