/**
 * Lobby chat handler — pre-game room chat messages.
 *
 * Chat is in-lobby only (before the game starts).
 * In-game communication uses emoji reactions (game:emoji_react).
 *
 * Messages are NOT persisted to the database (ephemeral).
 * Max message length: 200 characters.
 */

import type { LobbyNamespace } from "../index.js";
import type { Socket } from "socket.io";
import type {
  LobbyClientToServerEvents,
  LobbyServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types.js";
import { logger } from "../../lib/logger.js";

type LobbySocket = Socket<
  LobbyClientToServerEvents,
  LobbyServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const MAX_MESSAGE_LENGTH = 200;

export function registerChatHandlers(
  lobby: LobbyNamespace,
  socket: LobbySocket,
): void {
  socket.on("lobby:chat", (payload) => {
    const roomId = socket.data.currentRoomId;
    if (!roomId) {
      logger.warn(
        { userId: socket.data.userId },
        "lobby:chat received but user is not in a room",
      );
      return;
    }

    const message = payload.message.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message) return;

    logger.info(
      { userId: socket.data.userId, roomId, msgLength: message.length },
      "lobby:chat",
    );

    // Broadcast to all players in this room (including sender)
    lobby.to(`lobby:${roomId}`).emit("lobby:chat_message", {
      userId: socket.data.userId,
      displayName: socket.data.displayName,
      message,
      timestamp: new Date().toISOString(),
    });
  });
}
