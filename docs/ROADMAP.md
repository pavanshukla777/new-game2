# Bundelkhandi Chhakri — Development Roadmap

## Phase 0: Foundation (Current)
**Goal:** Clean architecture, no gameplay logic. ✅

- [x] Project structure and monorepo setup
- [x] Technology stack selection
- [x] Architecture documentation
- [x] Game design document (rules)
- [x] Database schema design
- [x] Multiplayer protocol design
- [x] AI opponent architecture plan
- [x] Flutter client folder structure
- [x] Backend skeleton (Express + Socket.IO setup)
- [x] OpenAPI spec skeleton
- [x] DB schema types (Drizzle)

---

## Phase 1: Core Infrastructure
**Goal:** Working auth, lobby, and real-time connection — no gameplay.

### Backend
- [ ] User registration & login (JWT + refresh)
- [ ] Guest login (ephemeral session)
- [ ] Room creation, listing, joining, leaving
- [ ] Room chat (Socket.IO)
- [ ] Player ready/unready system
- [ ] Basic ELO rating model (stored, not calculated yet)
- [ ] REST endpoints: `/api/auth`, `/api/rooms`, `/api/users`
- [ ] Input validation (Zod) on all endpoints
- [ ] Rate limiting middleware
- [ ] Error handling middleware
- [ ] Health check endpoint
- [ ] Database migrations (Drizzle push)

### Flutter Client
- [ ] Project scaffold (Flutter 3.x + Riverpod + GoRouter)
- [ ] API client setup (Dio + interceptors)
- [ ] Socket.IO client setup
- [ ] Auth screens (login, register, guest play)
- [ ] Lobby screen (room list, create room, join room)
- [ ] Room waiting screen (player list, ready button, chat)
- [ ] Basic app theme (colors, typography — Bundelkhandi palette)
- [ ] Navigation structure

---

## Phase 2: Core Gameplay
**Goal:** Playable 4-player game with all rules implemented.

### Backend — Game Engine
- [ ] Card deck model and shuffle algorithm
- [ ] Dealing logic (13 cards per player)
- [ ] Bidding state machine
  - [ ] Bid validation
  - [ ] Pass logic
  - [ ] Re-deal on all-pass
- [ ] Trump selection
- [ ] Trick-taking engine
  - [ ] Follow-suit enforcement
  - [ ] Trump validation
  - [ ] Trick winner calculation
- [ ] Chhakri detection (6 consecutive tricks)
- [ ] Point counting (Ace=4, K=3, Q=2, J=1, 10=10, 5=5)
- [ ] Round scoring (bid success/failure)
- [ ] Game score accumulation
- [ ] Win condition detection (500 points / Doobna)
- [ ] Game state persistence (snapshots)
- [ ] Reconnection logic (rejoin in-progress game)

### Socket.IO Protocol
- [ ] `game:start` — broadcast initial hands
- [ ] `game:bid` — player submits bid
- [ ] `game:trump` — bidder selects trump
- [ ] `game:play_card` — play a card to trick
- [ ] `game:state` — authoritative state broadcast
- [ ] `game:trick_result` — trick winner announcement
- [ ] `game:round_result` — round scoring summary
- [ ] `game:over` — final result

### Flutter Client — Gameplay
- [ ] Card hand widget (fan layout, scrollable)
- [ ] Card play animation (slide to center)
- [ ] Bidding UI (number selector, pass button)
- [ ] Trump selection UI (suit buttons)
- [ ] Trick area (4 card slots)
- [ ] Score board widget
- [ ] Turn indicator
- [ ] Basic card sound effects

---

## Phase 3: AI Opponent
**Goal:** Play against AI at multiple difficulty levels.

- [ ] Beginner AI (random legal moves)
- [ ] Intermediate AI (basic bidding heuristics, follow partner's lead)
- [ ] Advanced AI (card counting, trump management, partner signaling)
- [ ] Expert AI (minimax, alpha-beta pruning for trick prediction)
- [ ] AI plays at realistic speed (configurable delay)
- [ ] "Practice vs AI" mode
- [ ] Difficulty selection UI

---

## Phase 4: Polish & Social
**Goal:** Production-quality feel, social features.

### Gameplay Polish
- [ ] Card dealing animation (Rive animation)
- [ ] Chhakri celebration animation
- [ ] Win/lose screen with animations
- [ ] Bid double / redouble (Dobla/Char-Guna)
- [ ] Game replay system
- [ ] Spectator mode

### Social Features
- [ ] Player profiles with avatar
- [ ] Friends list
- [ ] Private rooms (password-protected)
- [ ] In-game emoji reactions
- [ ] Post-game chat
- [ ] Game history (last 50 games)
- [ ] Leaderboard (weekly, all-time)

### UX
- [ ] Hindi/English language toggle
- [ ] Colorblind mode
- [ ] Large card mode (accessibility)
- [ ] Notification: your turn (push + in-app)
- [ ] Auto-play on timeout (legal random move)

---

## Phase 5: Matchmaking & Tournaments
**Goal:** Competitive play infrastructure.

- [ ] ELO rating calculation after each ranked game
- [ ] Ranked matchmaking queue
- [ ] Tournament brackets (4, 8, 16 teams)
- [ ] Seasonal leaderboards
- [ ] Achievement system
- [ ] Anti-cheat: move timing analysis, disconnect abuse detection

---

## Phase 6: Monetization (Optional)
**Goal:** Sustain the project.

- [ ] Cosmetic card skins (purchased, not pay-to-win)
- [ ] Avatar frames and chat emotes
- [ ] Premium tournament entry
- [ ] Season pass (cosmetics only)

---

## Milestones Calendar (Target)

| Milestone | Target |
|---|---|
| Phase 0 complete | Week 1 |
| Phase 1 complete | Week 3 |
| Phase 2 complete | Week 7 |
| Phase 3 complete | Week 9 |
| Phase 4 complete | Week 13 |
| Beta launch | Week 14 |
| Phase 5 complete | Week 18 |
| v1.0 launch | Week 20 |

---

## Definition of Done (Per Phase)

A phase is complete when:
1. All checklist items are implemented
2. TypeScript typechecks pass (`pnpm run typecheck`)
3. Unit tests cover all game logic functions
4. Manual QA on iOS + Android
5. No P0/P1 bugs open
