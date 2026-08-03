---
name: Chhakri release blockers
description: RC blockers fixed in Vol 7 Part 3, Vol 7 Part 4A production bugs fixed, Vol 8 final audit verdict and store blockers.
---

## Vol 7 Part 3 — RC Blockers (all fixed)
- RC-1: Config hardcoded to Android emulator → `String.fromEnvironment` with emulator default
- RC-2: `_isCreatingRoom`/`_isJoiningRoom` not reset on disconnect → reset in `onDisconnect` and `disconnect()`
- RC-3: Asset dirs absent, font binaries missing → dirs created with `.gitkeep`, fonts block commented out, `fontFamily: 'TiroDevanagari'` removed from `lobby_screen.dart`

## Vol 7 Part 4A — Production Bugs Fixed
- BLOCKER: `ClientGameState.isMyTurn` never true during trump phases → fixed to cover `highestBidderSeat == mySeat` in trump phases
- BLOCKER: `lobby:set_ready` double-game-init race → atomic `UPDATE rooms SET status='in_game' WHERE status='waiting'` claim before `initializeGame`
- HIGH: Reconnect DB write race (RECONNECTING overwrites CONNECTED) → conditional `WHERE connectionState='DISCONNECTED'` on the RECONNECTING update
- HIGH: `isYourTurn` tautology in `game.handler.ts` → simplified to `validActions.length > 0 && isSeatCurrentActor(...)`
- HIGH: `_screenSeat` hardcoded `% 4` → uses `playerCount` param; seat layout uses `gs.seats.length`; 6-player shows explicit placeholder
- HIGH: `primaryTrump` field never parsed → added to `ClientGameState`, parsed from JSON
- HIGH: Game-end winner uses score heuristic → `SocketService` now captures `gameWinnerTeam` from GAME_ENDED event; overlay uses server value

## Vol 8 — Final Audit Code Fix
- Removed stale `fontFamily: 'TiroDevanagari'` from `splash_screen.dart` (RC-3 missed it; graceful fallback but inconsistent)

## Vol 8 — Store Submission Blockers (VERDICT: NOT READY)
These cannot be fixed in code alone — they require developer environment action:

1. **CRITICAL**: No `flutter_client/android/` or `flutter_client/ios/` directories. Run `flutter create --platforms=android,ios .` inside `flutter_client/`.
2. **CRITICAL**: No Android keystore / `key.properties`, no iOS provisioning profile. Cannot sign a release build.
3. **CRITICAL**: No Privacy Policy screen or URL. Both stores require it for apps with user accounts.
4. **HIGH**: No app launcher icons at any density (`assets/images/` is empty).
5. **HIGH**: Voice chat not end-to-end implemented. Signaling (SDP/ICE via Socket.IO) is wired on both sides but Flutter has no WebRTC plugin — no `flutter_webrtc` in pubspec.yaml. Audio will never play.
6. **MEDIUM**: CORS unrestricted (`cors()` with no options in `app.ts`). Harmless for native mobile but a security gap if any web interface is ever added.
7. **MEDIUM**: No Terms of Service.
8. **LOW**: No in-game chat (only lobby pre-game chat exists).
9. **LOW**: No "Play Again" button on game-end overlay.
10. **LOW**: `lobby:rooms_updated` event never emitted by server — room list does not update in real time.

## Deploy guidance
- Production builds must pass `--dart-define=API_BASE_URL=https://... --dart-define=WS_BASE_URL=https://...`
- `SESSION_SECRET` env var is the only secret required by the backend. It is used for JWT signing.
- Backend reads `PORT` env var (required, will throw if absent).
