/**
 * Socket.IO type definitions for Bundelkhandi Chhakri
 *
 * These types are used by both the lobby and game namespaces.
 * They map 1:1 with the event protocol documented in docs/MULTIPLAYER_DESIGN.md.
 *
 * Usage pattern:
 *   Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
 *
 * [MIG-008] [GAP-009] seatPreference now accepts 0–5 (was 0–3), enabling 6-player rooms.
 * [MIG-010] [GAP-022] SocketData now carries connectionState for the reconnection
 *   state machine. ConnectionState imported from @workspace/db.
 */

import type { ClientGameState, AuthoritativeGameState, ConnectionState } from "@workspace/db";

// ---------------------------------------------------------------------------
// Shared payload types
// ---------------------------------------------------------------------------

export interface PlayerSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  eloRating: number;
  isGuest: boolean;
  isAi: boolean;
  aiDifficulty?: string;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  hostUserId: string;
  targetScore: number;
  gameMode: string;
  isPrivate: boolean;
  status: string;
  playerCount: number;
  maxPlayers: number;
}

export interface RoomDetail extends RoomSummary {
  players: Array<PlayerSummary & { seat: number; isReady: boolean; isAdmin: boolean }>;
}

export interface RoundSummary {
  roundNumber: number;
  biddingTeam: number;
  winningBid: number;
  trumpSuit: string | null;
  team0Points: number;
  team1Points: number;
  bidSucceeded: boolean;
  chhakriTeam: number | null;
  team0ScoreDelta: number;
  team1ScoreDelta: number;
  team0CumulativeScore: number;
  team1CumulativeScore: number;
}

export interface GameSummary {
  gameId: string;
  winningTeam: number;
  team0FinalScore: number;
  team1FinalScore: number;
  totalRounds: number;
}

export type EmojiReaction = "👍" | "🎉" | "😅" | "🙏" | "🔥";

// Re-export ConnectionState so callers can import it from this module
// without reaching into @workspace/db directly.
export type { ConnectionState };

// ---------------------------------------------------------------------------
// Game event discriminated union (mirrors docs/MULTIPLAYER_DESIGN.md)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "CARDS_DEALT" }
  | { type: "BID_PLACED"; seat: number; amount: number }
  | { type: "PLAYER_PASSED"; seat: number }
  | { type: "BID_WON"; seat: number; bid: number }
  | { type: "TRUMP_SELECTED"; suit: string }
  | { type: "CARD_PLAYED"; seat: number; card: string }
  | { type: "TRICK_WON"; winningSeat: number; points: number }
  | { type: "CHHAKRI"; team: number; consecutiveTricks: number }
  | { type: "ROUND_ENDED"; summary: RoundSummary }
  | { type: "GAME_ENDED"; summary: GameSummary };

export interface ValidAction {
  type: "bid" | "pass" | "select_trump" | "play_card";
  // For 'bid':
  minBid?: number;
  maxBid?: number;
  // For 'play_card':
  validCards?: string[];
}

// ---------------------------------------------------------------------------
// Lobby namespace: /lobby
// ---------------------------------------------------------------------------

export interface LobbyClientToServerEvents {
  "lobby:create_room": (
    payload: {
      name: string;
      // [MIG-014] [GAP-035] Rulebook Section: "Series Engine — targetScore DB"
      // Implements: only 52 is a valid targetScore (series ends at +52).
      // Old type: 300 | 500 | 750 — replaced by the single Rulebook value.
      targetScore: 52;
      gameMode: "standard" | "practice";
      isPrivate: boolean;
      password?: string;
      // [MIG-008] [GAP-009] Rulebook: rooms support 4 or 6 players
      maxPlayers?: 4 | 6;
    },
    ack: (res: { ok: true; room: RoomSummary } | { ok: false; error: string }) => void,
  ) => void;

  "lobby:join_room": (
    payload: {
      roomId?: string;
      code?: string;
      password?: string;
      // [MIG-008] [GAP-009] Rulebook Section: "Player Seating"
      // Implements: 6-player games require seats 4 and 5.
      // Old type: 0 | 1 | 2 | 3 — now expanded to 0 | 1 | 2 | 3 | 4 | 5.
      seatPreference?: 0 | 1 | 2 | 3 | 4 | 5;
    },
    ack: (
      res:
        | { ok: true; room: RoomDetail }
        | {
            ok: false;
            error:
              | "ROOM_NOT_FOUND"
              | "ROOM_FULL"
              | "WRONG_PASSWORD"
              | "ALREADY_IN_ROOM";
          },
    ) => void,
  ) => void;

  // Fire-and-forget — client sends no payload and expects no ack.
  // The server handles cleanup and broadcasts lobby:player_left.
  "lobby:leave_room": () => void;

  "lobby:set_ready": (
    payload: { isReady: boolean },
    ack: (res: { ok: true; isReady: boolean } | { ok: false; error: string }) => void,
  ) => void;

  "lobby:chat": (payload: { message: string }) => void;

  "lobby:kick_player": (
    payload: { targetUserId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
}

export interface LobbyServerToClientEvents {
  "lobby:room_updated": (payload: { room: RoomDetail }) => void;
  "lobby:player_joined": (payload: { player: PlayerSummary & { seat: number } }) => void;
  "lobby:player_left": (payload: { userId: string; newHostUserId?: string; newAdminUserId?: string }) => void;
  "lobby:player_ready_changed": (payload: { userId: string; isReady: boolean }) => void;
  "lobby:chat_message": (payload: {
    userId: string;
    displayName: string;
    message: string;
    timestamp: string;
  }) => void;
  "lobby:game_starting": (payload: { gameId: string; countdown: number }) => void;
  "lobby:game_started": (payload: { gameId: string }) => void;
  "lobby:rooms_updated": (payload: { rooms: RoomSummary[] }) => void;
}

// ---------------------------------------------------------------------------
// Game namespace: /game
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Voice signaling events (in /game namespace — players already authenticated)
// [MIG-033] [GAP-046] Rulebook Section: "Voice"
// ---------------------------------------------------------------------------

export interface VoiceClientToServerEvents {
  /** Initiate a WebRTC peer connection by sending an offer to a target seat. */
  "voice:offer": (payload: {
    gameId: string;
    targetSeat: number;
    sdp: string;
  }) => void;

  /** Respond to a WebRTC offer from another seat. */
  "voice:answer": (payload: {
    gameId: string;
    targetSeat: number;
    sdp: string;
  }) => void;

  /** Relay an ICE candidate to a specific peer seat. */
  "voice:ice_candidate": (payload: {
    gameId: string;
    targetSeat: number;
    candidate: string;
  }) => void;

  /** Broadcast mic-mute state to all players in the game room. */
  "voice:toggle_mute": (payload: { gameId: string; isMuted: boolean }) => void;

  /** Notify all players this seat has left voice. */
  "voice:hang_up": (payload: { gameId: string }) => void;
}

export interface VoiceServerToClientEvents {
  "voice:offer": (payload: { fromSeat: number; sdp: string }) => void;
  "voice:answer": (payload: { fromSeat: number; sdp: string }) => void;
  "voice:ice_candidate": (payload: { fromSeat: number; candidate: string }) => void;
  "voice:mute_changed": (payload: { seat: number; isMuted: boolean }) => void;
  "voice:player_hung_up": (payload: { seat: number }) => void;
}

// ---------------------------------------------------------------------------
// Admin game-time events (in /game namespace)
// [MIG-035] [GAP-013] Rulebook Section: "Admin System — socket events"
// ---------------------------------------------------------------------------

export interface AdminClientToServerEvents {
  /** [MIG-038] Admin sets turn-timer duration for the game (seconds). */
  "game:admin_set_timer": (
    payload: { gameId: string; seconds: number },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;

  /** [MIG-035] Admin sets reconnect-window duration for the game (seconds). */
  "game:admin_set_reconnect": (
    payload: { gameId: string; seconds: number },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;

  /** [MIG-035] Admin hands admin role to a teammate. */
  "game:admin_transfer": (
    payload: { gameId: string; targetUserId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;

  /** [MIG-035] Admin force-kicks a player into AI_PLAYING immediately. */
  "game:admin_kick_player": (
    payload: { gameId: string; targetUserId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
}

export interface AdminServerToClientEvents {
  /** Broadcast when any admin changes a game configuration value. */
  "game:admin_config_changed": (payload: {
    turnTimerSeconds?: number;
    reconnectWindowSeconds?: number;
  }) => void;

  /** Broadcast when admin role changes hands (within a team). */
  "game:admin_changed": (payload: {
    oldAdminSeat: number;
    newAdminSeat: number;
    team: 0 | 1;
  }) => void;
}

// ---------------------------------------------------------------------------
// Game namespace: /game
// ---------------------------------------------------------------------------

export interface GameClientToServerEvents
  extends VoiceClientToServerEvents,
    AdminClientToServerEvents {
  "game:join": (
    payload: { gameId: string },
    ack: (
      res:
        | { ok: true; state: ClientGameState }
        | { ok: false; error: "GAME_NOT_FOUND" | "NOT_A_PLAYER" },
    ) => void,
  ) => void;

  "game:bid": (
    payload: { gameId: string; amount: number } | { gameId: string; pass: true },
    ack: (
      res:
        | { ok: true }
        | {
            ok: false;
            error:
              | "NOT_YOUR_TURN"
              | "INVALID_BID"
              | "PRIMARY_BID_CANNOT_PASS"; // [MIG-024]
          },
    ) => void,
  ) => void;

  "game:select_trump": (
    payload: { gameId: string; suit: "S" | "H" | "D" | "C" },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;

  "game:play_card": (
    payload: { gameId: string; card: string },
    ack: (
      res:
        | { ok: true }
        | {
            ok: false;
            error: "NOT_YOUR_TURN" | "INVALID_CARD" | "MUST_FOLLOW_SUIT";
          },
    ) => void,
  ) => void;

  "game:emoji_react": (payload: {
    gameId: string;
    emoji: EmojiReaction;
  }) => void;
}

export interface GameServerToClientEvents
  extends VoiceServerToClientEvents,
    AdminServerToClientEvents {
  "game:state_update": (payload: {
    state: ClientGameState;
    event: GameEvent;
  }) => void;

  "game:your_turn": (payload: {
    phase:
      | "bidding"
      | "primary_bid"             // [MIG-024]
      | "primary_trump_selection" // [MIG-024]
      | "trump_selection"
      | "playing";
    validActions: ValidAction[];
    timeoutAt: string;
  }) => void;

  "game:player_timeout": (payload: {
    seat: number;
    action: "PASS" | { card: string };
  }) => void;

  "game:player_disconnected": (payload: {
    seat: number;
    displayName: string;
    reconnectWindowSeconds: number;
  }) => void;

  "game:player_reconnected": (payload: { seat: number }) => void;

  "game:emoji_reaction": (payload: {
    seat: number;
    emoji: EmojiReaction;
  }) => void;
}

// ---------------------------------------------------------------------------
// Socket data (stored on each socket instance via socket.data)
// ---------------------------------------------------------------------------

export interface SocketData {
  userId: string;
  displayName: string;
  username: string;
  isGuest: boolean;
  currentRoomId: string | null;
  currentGameId: string | null;
  /**
   * [MIG-010] [GAP-022] Rulebook Section: "Reconnection"
   * Implements: per-socket connection state, mirroring the DB row for
   * fast in-memory access during disconnect/reconnect handling.
   * Null when the player is not in an active game.
   */
  connectionState: ConnectionState | null;
}

// ---------------------------------------------------------------------------
// Inter-server events (for future Redis adapter / horizontal scaling)
// ---------------------------------------------------------------------------

export interface InterServerEvents {
  // Placeholder for Phase 2 Redis pub/sub events
  ping: () => void;
}
