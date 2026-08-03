/**
 * Socket.IO server setup for Bundelkhandi Chhakri
 *
 * Two namespaces:
 *   /lobby — room browsing, player ready, pre-game chat
 *   /game  — in-progress game events (includes voice signaling & admin)
 *
 * Auth: JWT Bearer token required in handshake.auth.token for both namespaces.
 *
 * [MIG-015] [GAP-037] Rulebook Section: "Validation Chain — socket auth"
 * [MIG-034] [GAP-043] Rulebook Section: "Reconnection — one device"
 *   One account = one active socket per namespace.  Second login disconnects
 *   the first socket immediately.
 * [MIG-042] [GAP-041] Reconnect window timer started on disconnect.
 * [MIG-045] [GAP-045] AI takeover fires when reconnect window expires.
 */

import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger";
import { registerLobbyHandlers } from "./handlers/room.handler";
import { registerChatHandlers } from "./handlers/chat.handler";
import { registerGameHandlers } from "./handlers/game.handler";
import { registerVoiceHandlers } from "./handlers/voice.handler";
import { registerAdminHandlers } from "./handlers/admin.handler";
import type { AuthPayload } from "../middlewares/auth";
import { db, gamePlayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  startReconnectTimer,
  getReconnectWindowSeconds,
} from "../services/reconnect.service";
import { cancelTurnTimer } from "../services/turn-timer.service";
import { applyAiTurn } from "../services/ai.service";
import { GameService } from "../services/game.service";
import type {
  LobbyClientToServerEvents,
  LobbyServerToClientEvents,
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./types";

export type LobbyNamespace = ReturnType<
  SocketIOServer<
    LobbyClientToServerEvents,
    LobbyServerToClientEvents,
    InterServerEvents,
    SocketData
  >["of"]
>;

export type GameNamespace = ReturnType<
  SocketIOServer<
    GameClientToServerEvents,
    GameServerToClientEvents,
    InterServerEvents,
    SocketData
  >["of"]
>;

/**
 * Attaches Socket.IO to an existing HTTP server and sets up namespaces.
 * Call this from src/index.ts after creating the HTTP server.
 */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",               // Phase 3: restrict to known origins
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 25000,
    connectTimeout: 10000,
  });

  // ---------------------------------------------------------------------------
  // Auth middleware — applied to both namespaces
  //
  // [MIG-015] [GAP-037] Rulebook Section: "Validation Chain — socket auth"
  // ---------------------------------------------------------------------------
  const authMiddleware = (socket: any, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      logger.warn(
        { socketId: socket.id },
        "Socket connection rejected: no auth token in handshake",
      );
      return next(new Error("UNAUTHORIZED"));
    }

    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      logger.error(
        { socketId: socket.id },
        "Socket auth failed: SESSION_SECRET not configured",
      );
      return next(new Error("SERVER_ERROR"));
    }

    try {
      const payload = jwt.verify(token, secret) as AuthPayload;

      if (payload.banned === true) {
        logger.warn(
          { socketId: socket.id, userId: payload.sub },
          "Socket connection rejected: account is banned",
        );
        return next(new Error("ACCOUNT_BANNED"));
      }

      socket.data = {
        userId: payload.sub,
        displayName: payload.displayName,
        username: payload.username,
        isGuest: payload.isGuest ?? false,
        currentRoomId: null,
        currentGameId: null,
        connectionState: null,
      } satisfies SocketData;

      next();
    } catch (err) {
      const isExpired = err instanceof jwt.TokenExpiredError;
      const code = isExpired ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
      logger.warn(
        { socketId: socket.id, code },
        "Socket connection rejected: invalid or expired token",
      );
      next(new Error(code));
    }
  };

  // ---------------------------------------------------------------------------
  // [MIG-034] [GAP-043] One-account one-device tracking maps
  //
  // userId → socketId for each namespace.
  // When a new socket connects for a userId that already has an active socket,
  // the OLD socket is forcefully disconnected ("second login logs out first").
  // ---------------------------------------------------------------------------
  const connectedLobbyUsers = new Map<string, string>(); // userId → socketId
  const connectedGameUsers = new Map<string, string>();  // userId → socketId

  // ---------------------------------------------------------------------------
  // /lobby namespace — room browsing and pre-game
  // ---------------------------------------------------------------------------
  const lobby = io.of("/lobby");
  lobby.use(authMiddleware);
  lobby.on("connection", (socket) => {
    const userId = socket.data.userId;

    // [MIG-034] One-device enforcement for /lobby
    const existingLobbySocketId = connectedLobbyUsers.get(userId);
    if (existingLobbySocketId && existingLobbySocketId !== socket.id) {
      const existingSocket = lobby.sockets.get(existingLobbySocketId);
      if (existingSocket) {
        logger.info(
          { userId, oldSocketId: existingLobbySocketId, newSocketId: socket.id },
          "MIG-034: second lobby connection — disconnecting existing socket",
        );
        existingSocket.emit("lobby:kicked" as any, { reason: "ANOTHER_DEVICE_CONNECTED" });
        existingSocket.disconnect(true);
      }
    }
    connectedLobbyUsers.set(userId, socket.id);

    logger.info(
      { socketId: socket.id, userId },
      "Lobby connection",
    );
    registerLobbyHandlers(lobby as unknown as LobbyNamespace, socket as any);
    registerChatHandlers(lobby as unknown as LobbyNamespace, socket as any);

    socket.on("disconnect", (reason) => {
      // Only clear the map entry if it still points to THIS socket
      if (connectedLobbyUsers.get(userId) === socket.id) {
        connectedLobbyUsers.delete(userId);
      }
      logger.info(
        { socketId: socket.id, userId, reason },
        "Lobby disconnected",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // /game namespace — in-progress game
  // ---------------------------------------------------------------------------
  const game = io.of("/game");
  game.use(authMiddleware);
  game.on("connection", (socket) => {
    const userId = socket.data.userId;

    // [MIG-034] One-device enforcement for /game
    const existingGameSocketId = connectedGameUsers.get(userId);
    if (existingGameSocketId && existingGameSocketId !== socket.id) {
      const existingSocket = game.sockets.get(existingGameSocketId);
      if (existingSocket) {
        logger.info(
          { userId, oldSocketId: existingGameSocketId, newSocketId: socket.id },
          "MIG-034: second game connection — disconnecting existing socket",
        );
        existingSocket.disconnect(true);
      }
    }
    connectedGameUsers.set(userId, socket.id);

    logger.info(
      { socketId: socket.id, userId },
      "Game connection",
    );

    // Register all game-namespace handlers
    registerGameHandlers(game as unknown as GameNamespace, socket as any);
    registerVoiceHandlers(game as unknown as GameNamespace, socket as any);   // [MIG-033]
    registerAdminHandlers(game as unknown as GameNamespace, socket as any);   // [MIG-035]

    socket.on("disconnect", async (reason) => {
      // [MIG-034] Clean up one-device tracking
      if (connectedGameUsers.get(userId) === socket.id) {
        connectedGameUsers.delete(userId);
      }

      logger.info(
        { socketId: socket.id, userId, reason },
        "Game disconnected",
      );

      // [MIG-010] [GAP-022] Update connection state machine on socket drop
      const gameId = socket.data.currentGameId;
      if (!gameId) return;

      try {
        // Find the player row to get their seat number
        const player = await GameService.findGamePlayer(gameId, userId);
        if (!player) return;

        // [MIG-038] Cancel any active turn timer for this seat — they disconnected
        cancelTurnTimer(gameId, player.seat);

        // [MIG-010] CONNECTED → DISCONNECTED
        await db
          .update(gamePlayersTable)
          .set({ connectionState: "DISCONNECTED" })
          .where(
            and(
              eq(gamePlayersTable.gameId, gameId),
              eq(gamePlayersTable.userId, userId),
            ),
          );

        // [MIG-036] If disconnected player was game admin, auto-reassign to teammate
        const adminRows = await db
          .select({ seat: gamePlayersTable.seat, team: gamePlayersTable.team })
          .from(gamePlayersTable)
          .where(
            and(
              eq(gamePlayersTable.gameId, gameId),
              eq(gamePlayersTable.userId, userId),
              eq(gamePlayersTable.isAdmin, true),
            ),
          )
          .limit(1);

        if (adminRows.length > 0) {
          const adminRow = adminRows[0]!;
          const teammateRows = await db
            .select({ userId: gamePlayersTable.userId, seat: gamePlayersTable.seat })
            .from(gamePlayersTable)
            .where(
              and(
                eq(gamePlayersTable.gameId, gameId),
                eq(gamePlayersTable.team, adminRow.team),
                eq(gamePlayersTable.connectionState, "CONNECTED"),
              ),
            );
          const firstTeammate = teammateRows
            .filter((r) => r.userId !== userId)
            .sort((a, b) => a.seat - b.seat)[0];

          if (firstTeammate && firstTeammate.userId !== null) {
            await db
              .update(gamePlayersTable)
              .set({ isAdmin: false })
              .where(
                and(
                  eq(gamePlayersTable.gameId, gameId),
                  eq(gamePlayersTable.userId, userId),
                ),
              );
            await db
              .update(gamePlayersTable)
              .set({ isAdmin: true })
              .where(
                and(
                  eq(gamePlayersTable.gameId, gameId),
                  eq(gamePlayersTable.userId, firstTeammate.userId as string),
                ),
              );
            game.to(`game:${gameId}`).emit("game:admin_changed", {
              oldAdminSeat: adminRow.seat,
              newAdminSeat: firstTeammate.seat,
              team: adminRow.team as 0 | 1,
            });
            logger.info(
              { gameId, oldAdmin: adminRow.seat, newAdmin: firstTeammate.seat },
              "Game disconnect: admin role auto-transferred (MIG-036)",
            );
          }
        }

        // Broadcast disconnect to the room
        const reconnectWindowSeconds = getReconnectWindowSeconds(gameId);
        game.to(`game:${gameId}`).emit("game:player_disconnected", {
          seat: player.seat,
          displayName: socket.data.displayName,
          reconnectWindowSeconds,
        });

        // [MIG-042] Start reconnect window — on expiry: AI_PLAYING + game:player_timeout
        // [MIG-045] AI takeover: if it's the disconnected seat's turn when timer fires, apply AI move
        startReconnectTimer(
          gameId,
          userId,
          player.seat,
          (seat) => {
            game.to(`game:${gameId}`).emit("game:player_timeout", {
              seat,
              action: "PASS",
            });
            // [MIG-045] Trigger AI for this seat — applyAiTurn guards "not your turn" internally
            applyAiTurn(game as unknown as GameNamespace, gameId, seat).catch((err) => {
              logger.error({ gameId, seat, err }, "AI takeover on reconnect expiry failed");
            });
          },
          reconnectWindowSeconds,
        );

        logger.info(
          { gameId, seat: player.seat, userId, reconnectWindowSeconds },
          "Game disconnect handled — reconnect window started (MIG-010/042/045)",
        );
      } catch (err) {
        logger.error(
          { socketId: socket.id, userId, gameId, err },
          "Error handling game disconnect",
        );
      }
    });
  });

  logger.info("Socket.IO initialized (/lobby, /game namespaces — MIG-034 one-device active)");
  return io;
}
