/**
 * GET /api/rooms — List open lobby rooms with live player counts.
 *
 * Returns all rooms whose status is "waiting" (joinable).
 * Protected: requires a valid JWT Bearer token.
 *
 * Response: { rooms: RoomSummary[] }
 *
 * RoomSummary fields match the Socket.IO RoomSummary type in socket/types.ts
 * so the Flutter client can reuse the same model class.
 */

import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";
import { db, roomsTable, roomPlayersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/rooms — list all waiting rooms with player counts
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      /**
       * LEFT JOIN roomPlayersTable so rooms with 0 players still appear.
       * GROUP BY roomsTable.id — PostgreSQL allows this when id is the PK
       * because all other selected columns are functionally dependent on it.
       * count(roomPlayersTable.userId) counts non-null rows = actual occupancy.
       */
      const rows = await db
        .select({
          id: roomsTable.id,
          code: roomsTable.code,
          name: roomsTable.name,
          hostUserId: roomsTable.hostUserId,
          targetScore: roomsTable.targetScore,
          gameMode: roomsTable.gameMode,
          isPrivate: roomsTable.isPrivate,
          status: roomsTable.status,
          maxPlayers: roomsTable.maxPlayers,
          playerCount: count(roomPlayersTable.userId),
        })
        .from(roomsTable)
        .leftJoin(
          roomPlayersTable,
          eq(roomPlayersTable.roomId, roomsTable.id),
        )
        .where(eq(roomsTable.status, "waiting"))
        .groupBy(roomsTable.id);

      // Normalise playerCount to JS number (Drizzle may return string from SQL COUNT)
      const rooms = rows.map((r) => ({
        ...r,
        playerCount: Number(r.playerCount),
      }));

      res.json({ rooms });
    } catch (err) {
      logger.error({ err }, "GET /api/rooms error");
      res
        .status(500)
        .json({ error: "SERVER_ERROR", message: "Failed to list rooms." });
    }
  },
);

export default router;
