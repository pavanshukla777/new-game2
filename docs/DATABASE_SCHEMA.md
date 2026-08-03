# Bundelkhandi Chhakri — Database Schema

## Overview

PostgreSQL 17 via Drizzle ORM. Schema files live in `lib/db/src/schema/`. Each entity gets its own file. Run `pnpm --filter @workspace/db run push` to apply schema changes in development.

---

## Entity Relationship Diagram

```
users ──────────────────┐
  │                     │
  │ 1:N                 │ 1:N (host)
  ▼                     ▼
game_players         rooms
  │                     │
  │ N:1                 │ 1:N
  ▼                     ▼
games ◄──────────────── rooms
  │
  │ 1:N
  ▼
game_rounds
  │
  │ 1:N
  ▼
game_state_snapshots
```

---

## Table Definitions

### `users`
Stores registered and guest user accounts.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,           -- e.g. "ramprasad_42"
  display_name  TEXT NOT NULL,                  -- shown in-game
  email         TEXT UNIQUE,                    -- nullable for guests
  password_hash TEXT,                           -- null for guests/OAuth
  avatar_url    TEXT,                           -- profile picture URL
  
  -- Stats
  elo_rating    INTEGER NOT NULL DEFAULT 1200,
  games_played  INTEGER NOT NULL DEFAULT 0,
  games_won     INTEGER NOT NULL DEFAULT 0,
  total_score   BIGINT NOT NULL DEFAULT 0,
  
  -- Account type
  is_guest      BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_elo ON users(elo_rating DESC);
```

**Drizzle file:** `lib/db/src/schema/users.ts`

---

### `refresh_tokens`
Tracks active refresh tokens for JWT auth.

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,             -- Argon2 hash of token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ                        -- null = still valid
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```

**Drizzle file:** `lib/db/src/schema/users.ts`

---

### `rooms`
Game lobbies — created before a game starts.

```sql
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          CHAR(6) UNIQUE NOT NULL,         -- e.g. "KHAND7" — share code
  name          TEXT NOT NULL,
  host_user_id  UUID NOT NULL REFERENCES users(id),
  
  -- Configuration
  max_players   INTEGER NOT NULL DEFAULT 4,      -- always 4 for now
  target_score  INTEGER NOT NULL DEFAULT 500,    -- 300 / 500 / 750
  game_mode     TEXT NOT NULL DEFAULT 'standard', -- standard | tournament | practice
  is_private    BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,                            -- null for public rooms
  
  -- Status
  status        TEXT NOT NULL DEFAULT 'waiting', -- waiting | in_game | finished
  current_game_id UUID,                          -- FK to games (set when game starts)
  
  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_code ON rooms(code);
```

**Drizzle file:** `lib/db/src/schema/rooms.ts`

---

### `room_players`
Players currently in a room (lobby state, not game state).

```sql
CREATE TABLE room_players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat         INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3), -- 0=North,1=East,2=South,3=West
  is_ready     BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (room_id, user_id),
  UNIQUE (room_id, seat)
);
```

**Drizzle file:** `lib/db/src/schema/rooms.ts`

---

### `games`
A completed or in-progress game session.

```sql
CREATE TABLE games (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID REFERENCES rooms(id) ON DELETE SET NULL,
  
  -- Config (snapshot of room settings at game start)
  target_score INTEGER NOT NULL DEFAULT 500,
  game_mode    TEXT NOT NULL DEFAULT 'standard',
  
  -- State
  status       TEXT NOT NULL DEFAULT 'active', -- active | completed | abandoned
  current_round INTEGER NOT NULL DEFAULT 1,
  
  -- Results (set when status = 'completed')
  winning_team INTEGER,                         -- 0 or 1
  team0_final_score INTEGER,
  team1_final_score INTEGER,
  
  -- Timestamps
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ
);

CREATE INDEX idx_games_room_id ON games(room_id);
CREATE INDEX idx_games_status ON games(status);
```

**Drizzle file:** `lib/db/src/schema/games.ts`

---

### `game_players`
The 4 players in a specific game, with their team assignment, seat, and final stats.

```sql
CREATE TABLE game_players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL, -- null = AI slot
  
  seat         INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
  team         INTEGER NOT NULL CHECK (team IN (0, 1)),      -- 0: North+South, 1: East+West
  
  -- AI settings
  is_ai        BOOLEAN NOT NULL DEFAULT FALSE,
  ai_difficulty TEXT,                           -- beginner | intermediate | advanced | expert
  
  -- Per-game stats
  tricks_won   INTEGER NOT NULL DEFAULT 0,
  points_captured INTEGER NOT NULL DEFAULT 0,
  
  UNIQUE (game_id, user_id),
  UNIQUE (game_id, seat)
);
```

**Drizzle file:** `lib/db/src/schema/games.ts`

---

### `game_rounds`
One round = one deal. Multiple rounds make up a game.

```sql
CREATE TABLE game_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number    INTEGER NOT NULL,
  
  -- Bidding result
  bidder_seat     INTEGER,                      -- which seat won the bid
  winning_bid     INTEGER,                      -- bid value (51-100)
  trump_suit      TEXT,                         -- hearts | diamonds | clubs | spades | none
  
  -- Round result
  bidding_team    INTEGER,                      -- 0 or 1
  bidding_team_points_captured INTEGER,
  defending_team_points_captured INTEGER,
  bid_succeeded   BOOLEAN,
  chhakri_team    INTEGER,                      -- null if no chhakri occurred
  
  -- Score delta applied to game
  team0_score_delta INTEGER NOT NULL DEFAULT 0,
  team1_score_delta INTEGER NOT NULL DEFAULT 0,
  
  -- Running totals after this round
  team0_cumulative_score INTEGER NOT NULL DEFAULT 0,
  team1_cumulative_score INTEGER NOT NULL DEFAULT 0,
  
  completed_at    TIMESTAMPTZ,
  
  UNIQUE (game_id, round_number)
);
```

**Drizzle file:** `lib/db/src/schema/games.ts`

---

### `game_state_snapshots`
Full game state stored as JSONB. Used for reconnection and replay.

```sql
CREATE TABLE game_state_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id    UUID REFERENCES game_rounds(id) ON DELETE SET NULL,
  
  sequence    BIGINT NOT NULL,                  -- monotonically increasing per game
  event_type  TEXT NOT NULL,                    -- deal | bid | trump | play_card | trick_end | round_end | game_end
  
  -- The full authoritative game state at this moment
  state       JSONB NOT NULL,
  
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (game_id, sequence)
);

CREATE INDEX idx_snapshots_game_id ON game_state_snapshots(game_id, sequence);
```

**Game state JSONB shape:**
```typescript
interface GameStateSnapshot {
  gameId: string;
  roundNumber: number;
  phase: 'dealing' | 'bidding' | 'trump_selection' | 'playing' | 'scoring';
  
  // Per-seat (not per-player, to keep seats stable)
  seats: {
    [seat: number]: {
      userId: string | null;    // null = AI
      displayName: string;
      team: 0 | 1;
      hand: string[];           // card codes e.g. "AS", "KH", "2C"
      isYou: boolean;           // set per-client before sending
    };
  };
  
  // Bidding
  currentBidderSeat: number | null;
  highestBid: number;
  highestBidderSeat: number | null;
  bids: { seat: number; amount: number | 'pass' }[];
  
  // Trump
  trumpSuit: 'S' | 'H' | 'D' | 'C' | null;
  
  // Trick-taking
  currentTrickSeat: number | null;      // who leads current trick
  currentTrick: { seat: number; card: string }[];
  completedTricks: number;              // total tricks completed this round
  consecutiveTricksBySeat: { seat: number; count: number } | null;
  
  // Scoring
  team0Score: number;
  team1Score: number;
  team0PointsThisRound: number;
  team1PointsThisRound: number;
}
```

**Drizzle file:** `lib/db/src/schema/game_states.ts`

---

## Indexes Summary

| Table | Index | Purpose |
|---|---|---|
| users | username | Login lookup |
| users | elo_rating DESC | Leaderboard queries |
| rooms | status | Active room listing |
| rooms | code | Join by code |
| games | room_id | Room→game lookup |
| games | status | Active game monitoring |
| game_state_snapshots | (game_id, sequence) | Replay, reconnect |

---

## Migration Strategy

1. Development: `pnpm --filter @workspace/db run push` (Drizzle push — destructive OK in dev)
2. Staging/Production: Generate migration files with `drizzle-kit generate`, apply with `drizzle-kit migrate`
3. Never run `push` against a production database

---

## Seeding (Development)

Seed script at `lib/db/src/seed.ts` will create:
- 8 test users (4 human, 4 AI)
- 2 open rooms
- 1 completed game with full replay data
