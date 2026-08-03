# Bundelkhandi Chhakri — Multiplayer & Socket.IO Protocol Design

## Overview

Real-time multiplayer is built on **Socket.IO 4** over WebSocket with HTTP long-poll fallback. The server is the single source of truth. Clients are thin renderers — they send intents, receive authoritative state.

---

## Connection Architecture

### Namespaces
```
/lobby   — room browsing, creation, joining, chat before game
/game    — in-progress game events, per-game rooms
```

### Socket.IO Rooms (Server-side Grouping)
```
lobby:all          — broadcast to all connected clients (room list updates)
lobby:{roomId}     — players waiting in a specific room
game:{gameId}      — players in an active game
```

---

## Authentication

Before connecting, the Flutter client must:
1. Obtain a JWT via REST `POST /api/auth/login` or `POST /api/auth/guest`
2. Pass the JWT as a Socket.IO auth handshake:

```dart
// Flutter
final socket = io('wss://api.chhakri.app', OptionBuilder()
  .setTransports(['websocket'])
  .setAuth({'token': jwtToken})
  .build());
```

```typescript
// Server middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const payload = verifyJwt(token);
    socket.data.userId = payload.sub;
    socket.data.username = payload.username;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});
```

---

## Event Protocol

### Naming Convention
```
{namespace}:{action}         → client emits to server
{namespace}:{action}_result  → server emits to ONE client (ack or private)
{namespace}:{action}_update  → server broadcasts to room
{namespace}:{event}          → server-initiated event (no client trigger)
```

---

## /lobby Namespace Events

### Client → Server

#### `lobby:create_room`
Create a new room.
```typescript
// Emit payload
{
  name: string;           // Room display name
  targetScore: 300 | 500 | 750;
  gameMode: 'standard' | 'practice';
  isPrivate: boolean;
  password?: string;      // only if isPrivate
}

// Ack response
{
  ok: true;
  room: RoomSummary;      // includes join code
} | {
  ok: false;
  error: string;
}
```

#### `lobby:join_room`
Join an existing room by ID or code.
```typescript
// Emit payload
{
  roomId?: string;
  code?: string;    // 6-char code (either roomId or code required)
  password?: string;
  seatPreference?: 0 | 1 | 2 | 3; // optional seat choice
}

// Ack response
{
  ok: true;
  room: RoomDetail;       // full room state including all players
} | {
  ok: false;
  error: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'WRONG_PASSWORD' | 'ALREADY_IN_ROOM';
}
```

#### `lobby:leave_room`
Leave the current room.
```typescript
// No payload

// Ack response
{ ok: true }
```

#### `lobby:set_ready`
Toggle ready state.
```typescript
{ isReady: boolean }
// Ack: { ok: true; isReady: boolean }
```

#### `lobby:chat`
Send a chat message in the room.
```typescript
{ message: string }  // max 200 chars
// No ack (fire-and-forget)
```

#### `lobby:kick_player`
Host only — remove a player from the room.
```typescript
{ targetUserId: string }
// Ack: { ok: true } | { ok: false; error: string }
```

---

### Server → Client (Lobby)

#### `lobby:room_updated`
Broadcast to `lobby:{roomId}` when room state changes.
```typescript
{
  room: RoomDetail;       // full snapshot
}
```

#### `lobby:player_joined`
```typescript
{
  player: PlayerSummary;
  seat: number;
}
```

#### `lobby:player_left`
```typescript
{
  userId: string;
  newHostUserId?: string; // if host changed
}
```

#### `lobby:player_ready_changed`
```typescript
{
  userId: string;
  isReady: boolean;
}
```

#### `lobby:chat_message`
```typescript
{
  userId: string;
  displayName: string;
  message: string;
  timestamp: string; // ISO 8601
}
```

#### `lobby:game_starting`
Sent 3 seconds before the game starts (all players ready).
```typescript
{
  gameId: string;
  countdown: 3; // seconds
}
```

#### `lobby:game_started`
Transition to game namespace.
```typescript
{
  gameId: string;
}
```

---

## /game Namespace Events

### Client → Server

#### `game:join`
Reconnect or join the active game (called immediately after navigating to game screen).
```typescript
{ gameId: string }

// Ack: full game state for THIS player (hand is private)
{
  ok: true;
  state: ClientGameState; // hand cards are shown only to this player
} | {
  ok: false;
  error: 'GAME_NOT_FOUND' | 'NOT_A_PLAYER';
}
```

#### `game:bid`
Submit a bid or pass during bidding phase.
```typescript
{
  gameId: string;
  amount: number;  // 51-100
} | {
  gameId: string;
  pass: true;
}

// Ack
{ ok: true } | { ok: false; error: 'NOT_YOUR_TURN' | 'INVALID_BID' }
```

#### `game:select_trump`
Bidder selects trump suit after winning bid.
```typescript
{
  gameId: string;
  suit: 'S' | 'H' | 'D' | 'C';  // Spades, Hearts, Diamonds, Clubs
}

// Ack
{ ok: true } | { ok: false; error: string }
```

#### `game:play_card`
Play a card to the current trick.
```typescript
{
  gameId: string;
  card: string; // card code e.g. "AS", "KH", "10D", "2C"
}

// Ack
{ ok: true } | { ok: false; error: 'NOT_YOUR_TURN' | 'INVALID_CARD' | 'MUST_FOLLOW_SUIT' }
```

#### `game:emoji_react`
Send a quick emoji reaction (no game state impact).
```typescript
{
  gameId: string;
  emoji: '👍' | '🎉' | '😅' | '🙏' | '🔥';
}
```

---

### Server → Client (Game)

#### `game:state_update`
Authoritative state broadcast after any state change. Sent to each player with their private hand included.
```typescript
{
  state: ClientGameState;   // see GameStateSnapshot in DATABASE_SCHEMA.md
  event: GameEvent;         // what just happened
}

// GameEvent discriminated union:
type GameEvent =
  | { type: 'CARDS_DEALT' }
  | { type: 'BID_PLACED'; seat: number; amount: number }
  | { type: 'PLAYER_PASSED'; seat: number }
  | { type: 'BID_WON'; seat: number; bid: number }
  | { type: 'TRUMP_SELECTED'; suit: string }
  | { type: 'CARD_PLAYED'; seat: number; card: string }
  | { type: 'TRICK_WON'; seat: number; points: number }
  | { type: 'CHHAKRI'; team: number; tricks: number }
  | { type: 'ROUND_ENDED'; summary: RoundSummary }
  | { type: 'GAME_ENDED'; summary: GameSummary };
```

#### `game:your_turn`
Sent only to the player whose turn it is.
```typescript
{
  phase: 'bidding' | 'trump_selection' | 'playing';
  validActions: ValidAction[];
  timeoutAt: string; // ISO 8601 — auto-play after this time
}

// ValidAction examples:
{ type: 'bid'; min: 51; max: 100 }
{ type: 'pass' }
{ type: 'select_trump' }
{ type: 'play_card'; validCards: string[] }
```

#### `game:player_timeout`
A player took too long — server played automatically.
```typescript
{
  seat: number;
  action: 'PASS' | { card: string };
}
```

#### `game:player_disconnected`
```typescript
{
  seat: number;
  displayName: string;
  reconnectWindowSeconds: 60;
}
```

#### `game:player_reconnected`
```typescript
{ seat: number }
```

#### `game:emoji_reaction`
```typescript
{
  seat: number;
  emoji: string;
}
```

---

## Reconnection Strategy

### Client
- Socket.IO auto-reconnect: exponential backoff, max 10 attempts
- On successful reconnect, emit `game:join` with gameId to receive full state
- Show "Reconnecting…" overlay with countdown; don't allow UI interaction

### Server
- On disconnect, set a 60-second timer per player
- Game continues (AI takes over disconnected player, or game pauses based on room config)
- On reconnect within 60s: inject current state, resume
- After 60s: player is marked abandoned; AI fills seat permanently

---

## Turn Timeout

- Default: **30 seconds** per turn
- Warning at 10 seconds remaining (client-side countdown)
- On timeout: server plays the highest legal card automatically
- Configurable per room (15s / 30s / 60s)

---

## State Synchronization

### Client State Machine
```
DISCONNECTED
    │ connect()
    ▼
CONNECTED (lobby)
    │ game_started event
    ▼
IN_GAME (game namespace)
    │ disconnect
    ▼
RECONNECTING
    │ reconnected + game:join
    ▼
IN_GAME (state restored)
```

### Conflict Resolution
- Server state always wins
- On reconnect, client discards its local state and replaces with server state
- Optimistic updates: card play is shown immediately; reverted if server rejects

---

## Performance Targets

| Metric | Target |
|---|---|
| Server action processing | < 20ms |
| State broadcast (4 clients) | < 50ms |
| Turn timeout precision | ± 500ms |
| Reconnection state restoration | < 200ms |
| Concurrent games per server | 500+ |

---

## Error Codes Reference

| Code | Meaning |
|---|---|
| `NOT_YOUR_TURN` | Player acted out of turn |
| `INVALID_BID` | Bid too low, too high, or in wrong phase |
| `INVALID_CARD` | Card not in hand or not a valid card code |
| `MUST_FOLLOW_SUIT` | Player has the led suit but played another |
| `GAME_NOT_FOUND` | gameId doesn't exist or is already finished |
| `NOT_A_PLAYER` | User is not a participant in this game |
| `ROOM_FULL` | Room has 4 players already |
| `WRONG_PASSWORD` | Private room password mismatch |
