/**
 * Voice namespace event handlers — WebRTC signaling relay.
 *
 * [MIG-033] [GAP-046] Rulebook Section: "Voice"
 * Implements: peer-to-peer WebRTC signaling via server relay.
 *
 * The server acts as a blind relay — it forwards offer/answer/ICE-candidate
 * payloads from one seat to another without inspecting the SDP content.
 * Actual audio/video streams travel directly peer-to-peer (no media server).
 *
 * Registered on the /game namespace (players are already authenticated and
 * in an active game room before voice handshakes begin).
 *
 * Events handled:
 *   voice:offer          → relay to target seat
 *   voice:answer         → relay to target seat
 *   voice:ice_candidate  → relay to target seat
 *   voice:toggle_mute    → broadcast mute state to entire room
 *   voice:hang_up        → broadcast disconnect to entire room
 */

import type { GameNamespace } from "../index.js";
import type { Socket } from "socket.io";
import type {
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types.js";
import { logger } from "../../lib/logger.js";
import { GameService } from "../../services/game.service.js";

type GameSocket = Socket<
  GameClientToServerEvents,
  GameServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerVoiceHandlers(
  game: GameNamespace,
  socket: GameSocket,
): void {
  const userId = socket.data.userId;

  // -------------------------------------------------------------------------
  // voice:offer — relay a WebRTC offer to a specific seat
  // -------------------------------------------------------------------------
  socket.on("voice:offer", async (payload) => {
    const { gameId, targetSeat, sdp } = payload;
    if (!gameId || targetSeat === undefined || !sdp) return;

    try {
      const [caller, target] = await Promise.all([
        GameService.findGamePlayer(gameId, userId),
        GameService.findGamePlayerBySeat(gameId, targetSeat),
      ]);
      if (!caller || !target) return;

      // Relay the offer only to the target seat's socket
      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();
      const targetSocket = roomSockets.find(
        (s) => s.data.userId === target.userId,
      );
      if (targetSocket) {
        targetSocket.emit("voice:offer", {
          fromSeat: caller.seat,
          sdp,
        });
      }

      logger.debug(
        { gameId, fromSeat: caller.seat, toSeat: targetSeat },
        "voice:offer relayed",
      );
    } catch (err) {
      logger.warn({ userId, gameId, err }, "voice:offer relay failed");
    }
  });

  // -------------------------------------------------------------------------
  // voice:answer — relay a WebRTC answer back to the caller
  // -------------------------------------------------------------------------
  socket.on("voice:answer", async (payload) => {
    const { gameId, targetSeat, sdp } = payload;
    if (!gameId || targetSeat === undefined || !sdp) return;

    try {
      const [answerer, target] = await Promise.all([
        GameService.findGamePlayer(gameId, userId),
        GameService.findGamePlayerBySeat(gameId, targetSeat),
      ]);
      if (!answerer || !target) return;

      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();
      const targetSocket = roomSockets.find(
        (s) => s.data.userId === target.userId,
      );
      if (targetSocket) {
        targetSocket.emit("voice:answer", {
          fromSeat: answerer.seat,
          sdp,
        });
      }

      logger.debug(
        { gameId, fromSeat: answerer.seat, toSeat: targetSeat },
        "voice:answer relayed",
      );
    } catch (err) {
      logger.warn({ userId, gameId, err }, "voice:answer relay failed");
    }
  });

  // -------------------------------------------------------------------------
  // voice:ice_candidate — relay an ICE candidate to a specific seat
  // -------------------------------------------------------------------------
  socket.on("voice:ice_candidate", async (payload) => {
    const { gameId, targetSeat, candidate } = payload;
    if (!gameId || targetSeat === undefined || !candidate) return;

    try {
      const [sender, target] = await Promise.all([
        GameService.findGamePlayer(gameId, userId),
        GameService.findGamePlayerBySeat(gameId, targetSeat),
      ]);
      if (!sender || !target) return;

      const roomSockets = await game.in(`game:${gameId}`).fetchSockets();
      const targetSocket = roomSockets.find(
        (s) => s.data.userId === target.userId,
      );
      if (targetSocket) {
        targetSocket.emit("voice:ice_candidate", {
          fromSeat: sender.seat,
          candidate,
        });
      }
    } catch (err) {
      logger.warn({ userId, gameId, err }, "voice:ice_candidate relay failed");
    }
  });

  // -------------------------------------------------------------------------
  // voice:toggle_mute — broadcast mute state change to the whole room
  // -------------------------------------------------------------------------
  socket.on("voice:toggle_mute", async (payload) => {
    const { gameId, isMuted } = payload;
    if (!gameId) return;

    try {
      const player = await GameService.findGamePlayer(gameId, userId);
      if (!player) return;

      game.to(`game:${gameId}`).emit("voice:mute_changed", {
        seat: player.seat,
        isMuted,
      });

      logger.debug(
        { gameId, seat: player.seat, isMuted },
        "voice:toggle_mute broadcast",
      );
    } catch (err) {
      logger.warn({ userId, gameId, err }, "voice:toggle_mute failed");
    }
  });

  // -------------------------------------------------------------------------
  // voice:hang_up — player disconnected from voice; broadcast to room
  // -------------------------------------------------------------------------
  socket.on("voice:hang_up", async (payload) => {
    const { gameId } = payload;
    if (!gameId) return;

    try {
      const player = await GameService.findGamePlayer(gameId, userId);
      if (!player) return;

      game.to(`game:${gameId}`).emit("voice:player_hung_up", {
        seat: player.seat,
      });
    } catch (err) {
      logger.warn({ userId, gameId, err }, "voice:hang_up failed");
    }
  });
}
