/**
 * Shared game broadcast helpers.
 *
 * Extracts the recurring "fetch connected sockets, build per-player client
 * state, emit game:state_update to everyone" pattern that appears in multiple
 * handlers and the AI service.
 *
 * Keeps each handler lean and ensures the broadcast logic is tested once.
 */

import { db, gamePlayersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthoritativeGameState } from "@workspace/db";
import { GameService } from "../services/game.service.js";
import { logger } from "../lib/logger.js";
import type { GameEvent } from "./types.js";
import type { GameNamespace } from "./index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BroadcastContext {
  /** userId → seat mapping for every player in the game (from DB). */
  seatByUserId: Map<string, number>;
  /** All currently connected sockets in the game room. */
  roomSockets: Awaited<
    ReturnType<ReturnType<GameNamespace["in"]>["fetchSockets"]>
  >;
}

// ---------------------------------------------------------------------------
// broadcastGameState
// ---------------------------------------------------------------------------

/**
 * Broadcast a game:state_update to every connected socket in a game room.
 *
 * For each socket in `game:${gameId}`, the server builds a per-player
 * ClientGameState (opponent cards hidden) and emits it with the supplied event.
 *
 * Returns the resolved {seatByUserId, roomSockets} so callers can immediately
 * send follow-up game:your_turn notifications without a second DB round-trip.
 *
 * @param game      The /game namespace.
 * @param gameId    UUID of the active game.
 * @param authState Server-authoritative state to broadcast.
 * @param event     Discriminated-union event to attach to the broadcast.
 */
export async function broadcastGameState(
  game: GameNamespace,
  gameId: string,
  authState: AuthoritativeGameState,
  event: GameEvent,
): Promise<BroadcastContext> {
  // Fetch seat assignments from DB (source of truth)
  const allGamePlayers = await db
    .select({ userId: gamePlayersTable.userId, seat: gamePlayersTable.seat })
    .from(gamePlayersTable)
    .where(eq(gamePlayersTable.gameId, gameId));

  const seatByUserId = new Map(
    allGamePlayers
      .filter((p): p is { userId: string; seat: number } => p.userId !== null)
      .map((p) => [p.userId, p.seat]),
  );
  const roomSockets = await game.in(`game:${gameId}`).fetchSockets();

  for (const s of roomSockets) {
    const seatNum = seatByUserId.get(s.data.userId);
    if (seatNum === undefined) continue;
    try {
      const clientState = GameService.buildClientGameState(authState, seatNum);
      s.emit("game:state_update", { state: clientState, event });
    } catch (err) {
      logger.warn(
        { gameId, socketId: s.id, seatNum, err },
        "broadcastGameState: failed to build client state for socket",
      );
    }
  }

  return { seatByUserId, roomSockets };
}

// ---------------------------------------------------------------------------
// findSocketForSeat
// ---------------------------------------------------------------------------

/**
 * Find the connected socket for a specific seat number.
 * Returns undefined if the player is not currently connected.
 */
export function findSocketForSeat(
  seat: number,
  context: BroadcastContext,
): BroadcastContext["roomSockets"][number] | undefined {
  const { seatByUserId, roomSockets } = context;
  return roomSockets.find((s) => seatByUserId.get(s.data.userId) === seat);
}
