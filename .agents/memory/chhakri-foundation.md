---
name: Chhakri project foundation
description: Phase 0–5 decisions — Socket.IO setup, Zod codegen pitfall, auth stub pattern, Flutter location, native dep pitfalls, auth architecture, and lobby (Part 3)
---

## Monorepo structure
- `lib/game-engine/` — 384 passing tests; never modify without running engine tests
- `lib/db/` — Drizzle ORM + PostgreSQL; `usersTable`, `refreshTokensTable`
- `lib/api-zod/` — generated Zod schemas from OpenAPI; do NOT hand-edit
- `artifacts/api-server/` — Express 5 + Socket.IO 4 (port 8080)
- `flutter_client/` — Flutter 3.x, landscape, Riverpod, GoRouter

## Native deps on Replit (critical)
- `argon2` npm package **cannot compile** on Replit (no Python/node-gyp). Use `@node-rs/argon2` instead (pre-built NAPI-RS binaries).
- `@node-rs/argon2` must be listed in esbuild's `external[]` in `build.mjs`.
- Do NOT add `argon2` to `pnpm.onlyBuiltDependencies` — it still fails without Python.
- `@node-rs/argon2` API: `import { hash, verify } from '@node-rs/argon2'` — `hash()` defaults to argon2id; no `Algorithm` const enum needed (avoids `isolatedModules` error).

## Auth backend (auth.service.ts + auth.ts routes)
- Passwords: argon2id via `@node-rs/argon2` (not the old `argon2` package)
- Refresh tokens: stored as SHA-256 hash (deterministic lookup); argon2 is reserved for passwords (non-deterministic).
- JWT: HS256, 15-min expiry, `SESSION_SECRET` env var
- Logout: best-effort (always 204); revokes token if present
- Token rotation on every `/refresh` call
- **The 6 endpoints are live and smoke-tested**: register, login, guest, refresh, logout, me

## Volume 5 Part 2 — Flutter auth (COMPLETED)
### Key architectural decisions
- `RouterNotifier` is created **inside** `routerProvider` (not a separate provider) — ensures correct lifecycle and prevents GoRouter recreation on auth change.
- `ref.listen<AuthState>` in `RouterNotifier` constructor ties subscription to `routerProvider`'s lifetime.
- `withOpacity` used instead of `withValues(alpha:)` — pubspec min is Flutter 3.19; `withValues` requires 3.27+.
- Shared auth form widgets in `auth_form_widgets.dart` — Dart private symbols (`_`) cannot cross library boundaries.
- Hive box must be opened before `ProviderScope` starts (done in `main()` before `runApp`).

## Volume 5 Part 3 — Flutter lobby (COMPLETED)
### All 94 backend tests still pass after Part 3 backend edits.

### Files created / modified (Flutter)
- `lib/models/lobby_models.dart` — `RoomSummary`, `LobbyPlayer` (copyWith), `RoomDetail` (composition + withPlayers), `ChatMessage`
- `lib/widgets/room_list_tile.dart` — room card with JOIN button
- `lib/widgets/seat_grid.dart` — 2-column team layout, ready dots, kick button
- `lib/widgets/lobby_chat_widget.dart` — message list + input field
- `lib/services/api_client.dart` — added `getRooms({required String accessToken})`
- `lib/services/lobby_socket_service.dart` — `LobbySocketService extends ChangeNotifier`; `/lobby` namespace; full room lifecycle
- `lib/providers/lobby_provider.dart` — `ChangeNotifierProvider` auto-connecting on auth change
- `lib/screens/lobby_screen.dart` — room list, create-room dialog, join-by-code dialog
- `lib/screens/room_detail_screen.dart` — seat grid + chat, ready button, game-start overlay
- `lib/router.dart` — `/room` route added; `/lobby` and `/room` are auth-guarded

### Files modified (backend)
- `src/socket/index.ts` — `registerChatHandlers` wired alongside `registerLobbyHandlers`
- `src/routes/rooms.ts` — `GET /` returns all `waiting` rooms with player counts (LEFT JOIN + GROUP BY), protected by `requireAuth`

### Key decisions for Part 3
- `LobbySocketService.connect()` takes `token, userId, displayName, isGuest` so it can construct `currentRoom` locally after `create_room` ack (backend returns summary only).
- `leaveRoom()` is optimistic: clears local state immediately, then fire-and-forgets `lobby:leave_room`. The backend handler has no data payload ack; optimistic approach avoids hang.
- `RoomDetail.playerCount` is derived from `players.length` (not summary field) so incremental socket updates stay consistent.
- `lobbySocketServiceProvider` is non-autodispose; lives for the app lifetime; `ref.listen<AuthState>` inside handles connect/disconnect.
- Room navigation: `LobbyScreen` → `ref.listen` on `currentRoom` → `context.go('/room')`. `RoomDetailScreen` → `ref.listen` on `currentRoom == null` → `context.go('/lobby')`.
- `lobby:rooms_updated` listener in service updates `_rooms` (server may emit in future; primary room list is HTTP-driven with manual refresh).

### Part 3 Finalization fixes (all applied)
- **Kick notification bug fixed**: `lobby:kick_player` now emits `lobby:player_left` directly to the kicked socket before `s.leave()`, so the kicked client navigates away correctly.
- **Admin transfer bug fixed**: `lobby:leave_room` now reads leavingPlayer metadata BEFORE the DELETE (previously read after, so leavingPlayer was always null), captures `newAdminUserId` from the transaction, and includes it in the `lobby:player_left` broadcast. Flutter `_onPlayerLeft` updates `isAdmin` flags immediately on receipt.
- **`leave_room` ack TypeError eliminated**: handler signature changed to `async () =>` (fire-and-forget), matching the Flutter optimistic emit. No ack calls remain.
- **`lobby:leave_room` type updated**: `LobbyClientToServerEvents` changed to `() => void` (no payload, no ack).
- **`lobby:player_left` type updated**: added `newAdminUserId?: string` field.
- **chat.handler.ts import extensions fixed**: `"../index"` → `"../index.js"`, `"../types"` → `"../types.js"`, `"../../lib/logger"` → `"../../lib/logger.js"`.
- **Flutter lint warnings eliminated**: removed unused `config.dart` import from `lobby_socket_service.dart`; removed unused `onLeave` from `_ReadyBar`; removed unused `gameId` from `_CountdownOverlay`.

### Volume 6 Part 2 completed — Official Game Initialization
Unsupported assumptions annotated in `constants.ts`: `PASSES_TO_END_BIDDING`, `DEFAULT_DOOBNA_THRESHOLD`, `TOTAL_DECK_POINTS`/`DECK_TOTAL_POINTS`/`getCardPoints` (all marked [LEGACY] or [ISOLATED]). Production `initializeGame` now uses `useTwoRoundBidding: true, allowDobla: false`. Added `firstDealerSeat?` to `GameInitInput`. New static validators: `validateTeamMapping` [RULE-005], `validateDealer`, `validateInitialSnapshot`. KEY INSIGHT: with `useTwoRoundBidding: true`, `round.hands[seat]` has only 2 cards at init (Phase 1 secret hand); remaining 6 come in Phases 2+3 after Primary Bid. `remainingDeck` holds 24 (4P) or 36 (6P) cards. Unresolved bug: `calculateRoundScore` bid-failure formula gives `−(1×bid)` to bid team but Rulebook requires `−(2×bid)`; violates zero-sum invariant — deferred to scoring Part. api-server: 194/194, game-engine: 384/384.

### Volume 6 Part 1 completed — Deck Engine Foundation
New file: `lib/game-engine/src/deck-validator.ts` (exported from index). New test file: `artifacts/api-server/src/__tests__/deck-engine.test.ts` (55 tests). `AuthoritativeGameState` extended with optional `gameMode?: string` and `shuffledDeck?: string[]`. `RoundState` extended with optional `shuffledDeck?: CardCode[]` (populated by `initRound` in both legacy and two-round paths). `buildAuthoritativeSnapshot` accepts optional `gameMode` and forwards `roundState.shuffledDeck`. All 8 call sites updated. `assertDealIntegrity` called in `initializeGame` after deal. api-server: 149/149, game-engine: 384/384.

### Part 6 completed — Validation & Hardening
Bugs found and fixed:
- `double.maxFinite.toInt()` in `socket_service.dart` → changed to `2147483647` (avoids RangeError on web/JS platforms).
- `_positionLabel` dead method in `game_screen.dart` → removed (was defined but never called).
- Pointless ternary `hasError ? 'Return to Lobby' : 'Return to Lobby'` in `game_screen.dart` → collapsed to literal.
- Stale "Part 4 placeholder" comment in `lobby_screen.dart` → removed.
No new features, no architecture changes.

### Part 5 completed — Game Socket Infrastructure & State Sync
- `socket_service.dart` fully rewritten for Part 5 requirements:
  - `_currentGameId` stored; `onConnect` re-emits `game:join` after every auto-reconnect (idempotent with `_isJoining` guard).
  - `_lastAppliedSequence` field: `_onStateUpdate` drops events with sequence ≤ last applied (deduplication/out-of-order guard).
  - `_gameState` preserved across temporary disconnects; cleared only by explicit `disconnect()` call (logout path).
  - `joinGame(gameId)` guard: second call while in-flight for the same gameId is a no-op.
  - Private `_rejoinGame(gameId)` for auto-reconnect path — always accepts server snapshot (authoritative).
  - Action methods (`sendBid`, `sendPass`, `sendSelectTrump`, `sendPlayCard`, `sendEmojiReaction`) now accept `gameId` as first param, match server protocol (`GameClientToServerEvents` in types.ts).
  - `sendPass` now emits `game:bid` with `{ pass: true }` (not `game:pass`).
  - Emoji event fixed: `game:emoji_react` (was `game:emoji_reaction`).
  - Voice methods updated to include `gameId` and use `sdp`/`candidate` string fields matching `VoiceClientToServerEvents`.
- `game_screen.dart`: `_buildConnecting` now shows error icon + message when `_socketService.error != null`, with a styled "Return to Lobby" button.
- No backend changes needed — `game:join` handler was already complete.

### Part 4 completed — Game Start & Real-Time Transition
- `gameSocketServiceProvider` in `lobby_provider.dart` — creates `SocketService` for `/game` namespace, auth-driven lifecycle mirroring lobby provider.
- `GameScreen` converted to `ConsumerStatefulWidget` — reads `gameSocketServiceProvider`, takes only `gameId` route param, shows loading state until game payload arrives (Part 5). Added "Return to Lobby" escape hatch.
- Router: `/game/:gameId` route added, passes path param to `GameScreen`.
- `RoomDetailScreen`: replaces placeholder dialog with `context.go('/game/$gameId')` guarded by `_hasNavigatedToGame` flag.
- `_CountdownOverlay` is now animated `StatefulWidget` with 3→2→1→Go! using `Timer.periodic` + `AnimatedSwitcher`.
- `LobbySocketService._onGameStarted`: captures `gameId` from payload (handles missed `game_starting`).
- `LobbySocketService.onConnect`: if `_startingGameId != null && !_gameStarted` on reconnect, sets `_gameStarted = true` and skips `loadRooms`.

### Remaining known limitations (defer to Part 5+)
- `Config.apiBaseUrl` still points to `http://10.0.2.2:8080` (Android emulator). Update for real device or Replit dev domain.
- `emitWithAck` futures have no timeout: if server never acks, `createRoom`/`joinRoom` hangs indefinitely.
- Flutter `flutter analyze` cannot run on Replit — user must run locally.
- `eloRating: 0` hardcoded for room creator in `createRoom()` local RoomDetail construction.
- `GameScreen._positionLabel` helper is defined but not used by any widget (compiles fine, Part 5 may use it).
