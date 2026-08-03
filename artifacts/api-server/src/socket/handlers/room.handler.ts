/**
 * Lobby namespace event handlers — room creation, joining, leaving, readying up.
 *
 * [MIG-041] [GAP-010] Phase 3 — full lobby implementation.
 *
 * lobby:create_room — create a new room; join as seat 0 with isAdmin=true.
 * lobby:join_room   — join an existing room by ID or 5-char code.
 * lobby:leave_room  — leave the current room; host transfer if needed.
 * lobby:set_ready   — mark readiness; auto-start game when all ready.
 * lobby:kick_player — host-only: remove a player from the room.
 *
 * See docs/MULTIPLAYER_DESIGN.md for the full event contract.
 */

import type { LobbyNamespace } from "../index.js";
import type { Socket } from "socket.io";
import type {
  LobbyClientToServerEvents,
  LobbyServerToClientEvents,
  InterServerEvents,
  SocketData,
  RoomSummary,
  RoomDetail,
} from "../types.js";
import { logger } from "../../lib/logger.js";
import { db, roomsTable, roomPlayersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GameService } from "../../services/game.service.js";

type LobbySocket = Socket<
  LobbyClientToServerEvents,
  LobbyServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a 5-character alphanumeric room code.
 * [MIG-031] [GAP-007] Room code is exactly 5 characters.
 * Uses an unambiguous character set (no I, O, 1, 0 to avoid confusion).
 */
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Build a RoomSummary DTO from a DB rooms row and computed player count. */
function toRoomSummary(
  room: typeof roomsTable.$inferSelect,
  playerCount: number,
): RoomSummary {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostUserId: room.hostUserId,
    targetScore: room.targetScore,
    gameMode: room.gameMode,
    isPrivate: room.isPrivate,
    status: room.status,
    playerCount,
    maxPlayers: room.maxPlayers,
  };
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerLobbyHandlers(
  lobby: LobbyNamespace,
  socket: LobbySocket,
): void {
  const userId = socket.data.userId;
  const displayName = socket.data.displayName;

  // -------------------------------------------------------------------------
  // lobby:create_room
  //
  // [MIG-041] [GAP-010]
  // Flow:
  //   1. Validate payload
  //   2. Check user is not already in a room
  //   3. Generate 5-char code (retry on conflict)
  //   4. Insert room + creator as seat-0 admin player in a transaction
  //   5. Join socket room, set currentRoomId
  //   6. Ack with RoomSummary
  // -------------------------------------------------------------------------
  socket.on("lobby:create_room", async (payload, ack) => {
    logger.info({ userId, payload }, "lobby:create_room");

    const { name, targetScore, gameMode, isPrivate, maxPlayers = 4 } = payload;

    try {
      // Check user not already in a room
      const existingRows = await db
        .select({ id: roomPlayersTable.id })
        .from(roomPlayersTable)
        .where(eq(roomPlayersTable.userId, userId))
        .limit(1);

      if (existingRows.length > 0) {
        ack({ ok: false, error: "ALREADY_IN_ROOM" });
        return;
      }

      // Generate a unique room code (retry once on conflict)
      let code = generateRoomCode();
      const conflictCheck = await db
        .select({ id: roomsTable.id })
        .from(roomsTable)
        .where(eq(roomsTable.code, code))
        .limit(1);
      if (conflictCheck.length > 0) {
        code = generateRoomCode(); // second attempt is extremely unlikely to conflict
      }

      const newRoom = await db.transaction(async (tx) => {
        const [room] = await tx
          .insert(roomsTable)
          .values({
            code,
            name: name.trim(),
            hostUserId: userId,
            maxPlayers,
            targetScore,
            gameMode,
            isPrivate: isPrivate ?? false,
          })
          .returning();

        await tx.insert(roomPlayersTable).values({
          roomId: room.id,
          userId,
          seat: 0,
          isAdmin: true,
          isReady: false,
        });

        return room;
      });

      await socket.join(`lobby:${newRoom.id}`);
      socket.data.currentRoomId = newRoom.id;

      logger.info({ userId, roomId: newRoom.id, code: newRoom.code }, "lobby:create_room — room created");
      ack({ ok: true, room: toRoomSummary(newRoom, 1) });

    } catch (err) {
      logger.error({ userId, err }, "lobby:create_room error");
      ack({ ok: false, error: "Failed to create room" });
    }
  });

  // -------------------------------------------------------------------------
  // lobby:join_room
  //
  // [MIG-041] [GAP-010]
  // Flow:
  //   1. Validate: not already in a room
  //   2. Find room by ID or 5-char code
  //   3. Check room is "waiting" and not full
  //   4. Find next available seat (honouring seatPreference)
  //   5. Insert room_player row in a transaction
  //   6. Join socket room, set currentRoomId
  //   7. Broadcast lobby:player_joined to existing players
  //   8. Ack with RoomDetail
  // -------------------------------------------------------------------------
  socket.on("lobby:join_room", async (payload, ack) => {
    logger.info({ userId, payload }, "lobby:join_room");

    try {
      // Reject if already in a room
      const existingRows = await db
        .select({ id: roomPlayersTable.id })
        .from(roomPlayersTable)
        .where(eq(roomPlayersTable.userId, userId))
        .limit(1);

      if (existingRows.length > 0) {
        ack({ ok: false, error: "ALREADY_IN_ROOM" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        // Find room by ID or code
        let roomRows: (typeof roomsTable.$inferSelect)[];
        if (payload.roomId) {
          roomRows = await tx
            .select()
            .from(roomsTable)
            .where(eq(roomsTable.id, payload.roomId))
            .limit(1);
        } else if (payload.code) {
          roomRows = await tx
            .select()
            .from(roomsTable)
            .where(eq(roomsTable.code, payload.code.toUpperCase()))
            .limit(1);
        } else {
          throw Object.assign(new Error("ROOM_NOT_FOUND"), { code: "ROOM_NOT_FOUND" });
        }

        if (roomRows.length === 0) {
          throw Object.assign(new Error("ROOM_NOT_FOUND"), { code: "ROOM_NOT_FOUND" });
        }
        const room = roomRows[0]!;

        if (room.status !== "waiting") {
          throw Object.assign(new Error("ROOM_NOT_FOUND"), { code: "ROOM_NOT_FOUND" });
        }

        // Load current players inside the transaction (prevents TOCTOU)
        const existingPlayers = await tx
          .select({
            userId: roomPlayersTable.userId,
            seat: roomPlayersTable.seat,
            isReady: roomPlayersTable.isReady,
            isAdmin: roomPlayersTable.isAdmin,
            displayName: usersTable.displayName,
          })
          .from(roomPlayersTable)
          .leftJoin(usersTable, eq(roomPlayersTable.userId, usersTable.id))
          .where(eq(roomPlayersTable.roomId, room.id));

        if (existingPlayers.length >= room.maxPlayers) {
          throw Object.assign(new Error("ROOM_FULL"), { code: "ROOM_FULL" });
        }

        // Assign seat
        const takenSeats = new Set(existingPlayers.map((p) => p.seat));
        let assignedSeat = -1;

        const pref = payload.seatPreference;
        if (pref !== undefined && !takenSeats.has(pref)) {
          assignedSeat = pref;
        } else {
          for (let s = 0; s < room.maxPlayers; s++) {
            if (!takenSeats.has(s)) {
              assignedSeat = s;
              break;
            }
          }
        }
        if (assignedSeat < 0) {
          throw Object.assign(new Error("ROOM_FULL"), { code: "ROOM_FULL" });
        }

        await tx.insert(roomPlayersTable).values({
          roomId: room.id,
          userId,
          seat: assignedSeat,
          isAdmin: false,
          isReady: false,
        });

        return { room, existingPlayers, assignedSeat };
      });

      await socket.join(`lobby:${result.room.id}`);
      socket.data.currentRoomId = result.room.id;

      // Build RoomDetail (includes the newly-joined player)
      const roomDetail: RoomDetail = {
        ...toRoomSummary(result.room, result.existingPlayers.length + 1),
        players: [
          ...result.existingPlayers.map((p) => ({
            userId: p.userId!,
            displayName: p.displayName ?? p.userId!,
            avatarUrl: null,
            eloRating: 0,
            isGuest: false,
            isAi: false,
            seat: p.seat,
            isReady: p.isReady,
            isAdmin: p.isAdmin,
          })),
          {
            userId,
            displayName,
            avatarUrl: null,
            eloRating: 0,
            isGuest: socket.data.isGuest,
            isAi: false,
            seat: result.assignedSeat,
            isReady: false,
            isAdmin: false,
          },
        ],
      };

      // Broadcast to existing players (exclude the joining socket itself — it gets the ack)
      socket.to(`lobby:${result.room.id}`).emit("lobby:player_joined", {
        player: {
          userId,
          displayName,
          avatarUrl: null,
          eloRating: 0,
          isGuest: socket.data.isGuest,
          isAi: false,
          seat: result.assignedSeat,
        },
      });

      logger.info({ userId, roomId: result.room.id, seat: result.assignedSeat }, "lobby:join_room — joined");
      ack({ ok: true, room: roomDetail });

    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ROOM_NOT_FOUND") {
        ack({ ok: false, error: "ROOM_NOT_FOUND" });
      } else if (code === "ROOM_FULL") {
        ack({ ok: false, error: "ROOM_FULL" });
      } else if (code === "ALREADY_IN_ROOM") {
        ack({ ok: false, error: "ALREADY_IN_ROOM" });
      } else {
        logger.error({ userId, payload, err }, "lobby:join_room error");
        ack({ ok: false, error: "ROOM_NOT_FOUND" });
      }
    }
  });

  // -------------------------------------------------------------------------
  // lobby:leave_room
  //
  // [MIG-041] [GAP-010]
  // Flow:
  //   1. Find room and player row
  //   2. Delete player row from room_players
  //   3. If room is now empty: delete the room
  //   4. If player was the host and others remain: reassign host to seat-0
  //   5. Broadcast lobby:player_left
  //   6. Leave socket room, clear currentRoomId
  // -------------------------------------------------------------------------
  // Fire-and-forget: client sends no payload and expects no ack.
  // All cleanup is server-driven; the client uses optimistic local state.
  socket.on("lobby:leave_room", async () => {
    logger.info({ userId }, "lobby:leave_room");

    const roomId = socket.data.currentRoomId;
    if (!roomId) return; // Not in a room — no-op

    try {
      // newAdminUserId is set inside the transaction when admin role transfers.
      // Captured outside so it is visible to the broadcast after commit.
      let newAdminUserId: string | null = null;

      await db.transaction(async (tx) => {
        // ── 1. Read leaving player metadata BEFORE deleting the row ──────────
        //    (PostgreSQL would return empty after DELETE within the same tx.)
        const leavingRows = await tx
          .select({
            seat: roomPlayersTable.seat,
            isAdmin: roomPlayersTable.isAdmin,
          })
          .from(roomPlayersTable)
          .where(
            and(
              eq(roomPlayersTable.roomId, roomId),
              eq(roomPlayersTable.userId, userId),
            ),
          )
          .limit(1);
        const leavingPlayer = leavingRows[0] ?? null;

        // ── 2. Delete the player row ─────────────────────────────────────────
        await tx
          .delete(roomPlayersTable)
          .where(
            and(
              eq(roomPlayersTable.roomId, roomId),
              eq(roomPlayersTable.userId, userId),
            ),
          );

        // ── 3. Load remaining players ────────────────────────────────────────
        const remaining = await tx
          .select({
            userId: roomPlayersTable.userId,
            seat: roomPlayersTable.seat,
            isAdmin: roomPlayersTable.isAdmin,
          })
          .from(roomPlayersTable)
          .where(eq(roomPlayersTable.roomId, roomId));

        if (remaining.length === 0) {
          // Last player left — delete the room entirely.
          await tx.delete(roomsTable).where(eq(roomsTable.id, roomId));
        } else {
          // ── 4. [MIG-036] Admin transfer ──────────────────────────────────
          //    If the leaver held isAdmin, promote the lowest-seat teammate.
          if (leavingPlayer?.isAdmin) {
            const leavingTeam = leavingPlayer.seat % 2;
            const sameTeamRemaining = remaining.filter(
              (p) => p.seat % 2 === leavingTeam,
            );
            if (sameTeamRemaining.length > 0) {
              const newAdmin = sameTeamRemaining.sort(
                (a, b) => a.seat - b.seat,
              )[0]!;
              await tx
                .update(roomPlayersTable)
                .set({ isAdmin: true })
                .where(
                  and(
                    eq(roomPlayersTable.roomId, roomId),
                    eq(roomPlayersTable.userId, newAdmin.userId),
                  ),
                );
              // Capture for broadcast so Flutter can update admin badges immediately.
              newAdminUserId = newAdmin.userId;
              logger.info(
                { roomId, oldAdmin: userId, newAdmin: newAdmin.userId, team: leavingTeam },
                "lobby:leave_room — admin role auto-transferred (MIG-036)",
              );
            }
          }

          // ── 5. Host transfer ─────────────────────────────────────────────
          const roomRows = await tx
            .select({ hostUserId: roomsTable.hostUserId })
            .from(roomsTable)
            .where(eq(roomsTable.id, roomId))
            .limit(1);

          if (roomRows[0]?.hostUserId === userId) {
            const newHost = remaining.sort((a, b) => a.seat - b.seat)[0]!;
            await tx
              .update(roomsTable)
              .set({ hostUserId: newHost.userId })
              .where(eq(roomsTable.id, roomId));
          }
        }
      });

      // ── 6. Broadcast ──────────────────────────────────────────────────────
      // Emit to the full room group BEFORE the leaver's socket leaves so they
      // also receive the event (they can ignore their own userId).
      // Include newAdminUserId when admin role transferred — Flutter updates
      // the isAdmin badge for the promoted player immediately on receipt.
      lobby.to(`lobby:${roomId}`).emit("lobby:player_left", {
        userId,
        ...(newAdminUserId !== null ? { newAdminUserId } : {}),
      });

      socket.leave(`lobby:${roomId}`);
      socket.data.currentRoomId = null;

      logger.info({ userId, roomId }, "lobby:leave_room — left");

    } catch (err) {
      logger.error({ userId, roomId, err }, "lobby:leave_room error");
    }
  });

  // -------------------------------------------------------------------------
  // lobby:set_ready
  //
  // [NEW] Player Readiness Validation, Game Start Initialization
  //
  // Flow:
  //   1. Update room_players.is_ready for this user
  //   2. Broadcast lobby:player_ready_changed to the room
  //   3. Ack immediately (client does not wait for game start)
  //   4. If isReady=true: check if ALL seats are filled and ALL players ready
  //   5. If all ready: call GameService.initializeGame, emit game_starting + game_started
  // -------------------------------------------------------------------------
  socket.on("lobby:set_ready", async (payload, ack) => {
    logger.info({ userId, isReady: payload.isReady }, "lobby:set_ready");

    const roomId = socket.data.currentRoomId;
    if (!roomId) {
      ack({ ok: false, error: "Not in a room" });
      return;
    }

    try {
      // 1. Update ready state in DB
      await db
        .update(roomPlayersTable)
        .set({ isReady: payload.isReady })
        .where(
          and(
            eq(roomPlayersTable.roomId, roomId),
            eq(roomPlayersTable.userId, userId),
          ),
        );

      // 2. Broadcast change to all players in the room
      lobby.to(`lobby:${roomId}`).emit("lobby:player_ready_changed", {
        userId,
        isReady: payload.isReady,
      });

      // 3. Ack immediately — client doesn't wait for game start
      ack({ ok: true, isReady: payload.isReady });

      // 4. Only check all-ready when this player just set themselves ready
      if (!payload.isReady) return;

      // Load room + all room players (with display names via join)
      const [roomRows, playerRows] = await Promise.all([
        db
          .select({
            id: roomsTable.id,
            maxPlayers: roomsTable.maxPlayers,
            targetScore: roomsTable.targetScore,
            gameMode: roomsTable.gameMode,
            status: roomsTable.status,
          })
          .from(roomsTable)
          .where(eq(roomsTable.id, roomId))
          .limit(1),

        db
          .select({
            userId: roomPlayersTable.userId,
            seat: roomPlayersTable.seat,
            isReady: roomPlayersTable.isReady,
            isAdmin: roomPlayersTable.isAdmin,
            displayName: usersTable.displayName,
          })
          .from(roomPlayersTable)
          .leftJoin(usersTable, eq(roomPlayersTable.userId, usersTable.id))
          .where(eq(roomPlayersTable.roomId, roomId)),
      ]);

      const room = roomRows[0];
      if (!room || room.status !== "waiting") return;

      // 5. Check all seats filled and all ready
      const allReady = playerRows.every((p) => p.isReady);
      if (!allReady || playerRows.length < room.maxPlayers) return;

      // 5a. Atomically claim the "start game" right by transitioning status
      //     from "waiting" → "in_game" in a single UPDATE … WHERE status = 'waiting'.
      //     If two set_ready handlers fire simultaneously (last two players both
      //     toggle ready in the same tick), only ONE will see rowCount === 1 and
      //     proceed; the other returns here, preventing a double-initializeGame.
      const claimed = await db
        .update(roomsTable)
        .set({ status: "in_game" })
        .where(
          and(
            eq(roomsTable.id, roomId),
            eq(roomsTable.status, "waiting"),
          ),
        )
        .returning({ id: roomsTable.id });

      if (claimed.length === 0) {
        logger.warn({ roomId }, "set_ready: lost init race — another handler already claimed this room");
        return;
      }

      logger.info({ roomId, playerCount: playerRows.length }, "All players ready — starting game");

      // 6. Initialize game
      const gameResult = await GameService.initializeGame({
        roomId,
        players: playerRows.map((p) => ({
          userId: p.userId ?? null,
          seat: p.seat,
          displayName: p.displayName ?? displayName,
          isAdmin: p.isAdmin,
          isAi: false,
        })),
        playerCount: room.maxPlayers as 4 | 6,
        targetScore: room.targetScore,
        gameMode: room.gameMode,
      });

      // 7. Persist the new game ID on the room row (status already set to
      //    "in_game" by the atomic claim above)
      await db
        .update(roomsTable)
        .set({ currentGameId: gameResult.gameId })
        .where(eq(roomsTable.id, roomId));

      // 8. Emit countdown then started
      lobby.to(`lobby:${roomId}`).emit("lobby:game_starting", {
        gameId: gameResult.gameId,
        countdown: 3,
      });

      setTimeout(() => {
        lobby.to(`lobby:${roomId}`).emit("lobby:game_started", {
          gameId: gameResult.gameId,
        });
      }, 3000);

    } catch (err) {
      logger.error({ userId, roomId, err }, "lobby:set_ready error");
      // ack was already called above; nothing more we can do here
    }
  });

  // -------------------------------------------------------------------------
  // lobby:kick_player
  //
  // [MIG-041] [GAP-010] Host/admin only: remove a player from the room.
  // Flow:
  //   1. Verify requester is admin in this room
  //   2. Delete target from room_players
  //   3. Disconnect target socket from the room (via namespace)
  //   4. Broadcast lobby:player_left to remaining players
  //   5. Ack
  // -------------------------------------------------------------------------
  socket.on("lobby:kick_player", async (payload, ack) => {
    logger.info({ userId, target: payload.targetUserId }, "lobby:kick_player");

    const roomId = socket.data.currentRoomId;
    if (!roomId) {
      ack({ ok: false, error: "Not in a room" });
      return;
    }

    try {
      // Verify requester is admin
      const [requesterRow] = await db
        .select({ isAdmin: roomPlayersTable.isAdmin })
        .from(roomPlayersTable)
        .where(
          and(
            eq(roomPlayersTable.roomId, roomId),
            eq(roomPlayersTable.userId, userId),
          ),
        )
        .limit(1);

      if (!requesterRow?.isAdmin) {
        ack({ ok: false, error: "NOT_ADMIN" });
        return;
      }

      // Cannot kick yourself
      if (payload.targetUserId === userId) {
        ack({ ok: false, error: "CANNOT_KICK_SELF" });
        return;
      }

      // Verify target is in the room
      const [targetRow] = await db
        .select({ userId: roomPlayersTable.userId })
        .from(roomPlayersTable)
        .where(
          and(
            eq(roomPlayersTable.roomId, roomId),
            eq(roomPlayersTable.userId, payload.targetUserId),
          ),
        )
        .limit(1);

      if (!targetRow) {
        ack({ ok: false, error: "PLAYER_NOT_FOUND" });
        return;
      }

      // Delete from DB
      await db
        .delete(roomPlayersTable)
        .where(
          and(
            eq(roomPlayersTable.roomId, roomId),
            eq(roomPlayersTable.userId, payload.targetUserId),
          ),
        );

      // Notify the kicked socket BEFORE removing it from the room group so it
      // still receives the event.  After s.leave() the socket is no longer a
      // member of lobby:${roomId} and would miss the subsequent broadcast.
      const allSockets = await lobby.in(`lobby:${roomId}`).fetchSockets();
      for (const s of allSockets) {
        if (s.data.userId === payload.targetUserId) {
          s.emit("lobby:player_left", { userId: payload.targetUserId });
          s.leave(`lobby:${roomId}`);
          (s.data as SocketData).currentRoomId = null;
          break;
        }
      }

      // Broadcast to remaining players (kicked socket has already left the group).
      lobby.to(`lobby:${roomId}`).emit("lobby:player_left", {
        userId: payload.targetUserId,
      });

      logger.info({ userId, roomId, kicked: payload.targetUserId }, "lobby:kick_player — kicked");
      ack({ ok: true });

    } catch (err) {
      logger.error({ userId, roomId, target: payload.targetUserId, err }, "lobby:kick_player error");
      ack({ ok: false, error: "Failed to kick player" });
    }
  });
}
