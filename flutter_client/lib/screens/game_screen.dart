/// GameScreen — Bundelkhandi Chhakri
///
/// [MIG-049] [GAP-048] Rulebook Section: "UI — Flutter Game UI"
/// Implements: Full in-game screen with oval table, 4-player and 6-player
/// seat layouts, card zones (Secret Hand / Face-down / Face-up), current
/// trick area, and permanently-visible Live Match Panel.
///
/// [MIG-050] Landscape-only — enforced at app level in main.dart.
///
/// Layout (landscape):
///   ┌───────────────────────────────────────────────┬──────────┐
///   │           North player (seat 2)               │          │
///   │  ╔═══════════════════════════════════════╗    │  Live    │
///   │  ║  West (1) │   Trick Area   │ East (3) ║    │  Panel   │
///   │  ╚═══════════════════════════════════════╝    │          │
///   │           South player (seat 0 / local)       │          │
///   └───────────────────────────────────────────────┴──────────┘
///
/// Seat layout for 4-player (seats 0-3):
///   Seat 0 = South (local)   Seat 1 = West
///   Seat 2 = North            Seat 3 = East
///
/// Seat layout for 6-player (seats 0-5, local player always South):
///   Screen seat 0 = South (local)   Screen seat 3 = North
///   Screen seat 1 = South-West      Screen seat 4 = North-East
///   Screen seat 2 = North-West      Screen seat 5 = South-East
///
/// Part 4: gameId is received as a route parameter from /game/:gameId.
/// The screen connects to the /game namespace and shows a loading state
/// until the game payload arrives (Part 5).
///
/// Volume 7 Part 1 integration fixes:
///   [GAP-1] Emoji reactions received from the server are drained and
///           displayed as floating emoji bubbles near each seat's position.
///   [GAP-2] Server-side action errors (NOT_YOUR_TURN, MUST_FOLLOW_SUIT, etc.)
///           are shown as transient SnackBars.
///   [GAP-7] _extractPlayableCards now uses the server-authoritative
///           validCards list from game:your_turn instead of showing the
///           entire hand as tappable.

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/game_state.dart';
import '../models/card.dart';
import '../services/socket_service.dart';
import '../providers/lobby_provider.dart';
import '../widgets/live_panel.dart';
import '../widgets/player_identity.dart';
import '../widgets/card_widget.dart';

class GameScreen extends ConsumerStatefulWidget {
  const GameScreen({
    super.key,
    required this.gameId,
  });

  final String gameId;

  @override
  ConsumerState<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends ConsumerState<GameScreen> {
  late final SocketService _socketService;

  // [GAP-1] Per-seat emoji displayed transiently (seat → emoji string).
  final Map<int, String> _seatEmojis = {};
  final Map<int, Timer?> _emojiTimers = {};

  @override
  void initState() {
    super.initState();
    // Read the shared game socket service and join the game room.
    // The service is already connected (auth-driven in gameSocketServiceProvider).
    _socketService = ref.read(gameSocketServiceProvider);
    _socketService.addListener(_onSocketUpdate);
    _socketService.joinGame(widget.gameId);
  }

  @override
  void dispose() {
    _socketService.removeListener(_onSocketUpdate);
    for (final t in _emojiTimers.values) {
      t?.cancel();
    }
    super.dispose();
  }

  void _onSocketUpdate() {
    if (!mounted) return;

    // [GAP-2] Surface server-side action rejection errors as SnackBars.
    // [PROD-1 fix] clearActionError() calls notifyListeners() which would
    // re-enter _onSocketUpdate synchronously.  Defer it into the post-frame
    // callback so the clear happens after the current listener chain is done.
    final err = _socketService.actionError;
    if (err != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _socketService.clearActionError();
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(err),
            backgroundColor: Colors.red.shade800,
            duration: const Duration(seconds: 2),
          ));
        }
      });
    }

    setState(() {});

    // [GAP-1] Drain pending emoji reactions after the current frame so that
    // removeEmoji() does not trigger a nested notifyListeners call.
    if (_socketService.recentEmojis.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _drainEmojis());
    }
  }

  // [GAP-1] Move pending emoji reactions into local _seatEmojis state,
  // then auto-clear them after 3 seconds.
  void _drainEmojis() {
    if (!mounted) return;
    final reactions = List.of(_socketService.recentEmojis);
    if (reactions.isEmpty) return;
    for (final r in reactions) {
      _socketService.removeEmoji(r.id);
      if (!mounted) return;
      setState(() => _seatEmojis[r.seat] = r.emoji);
      _emojiTimers[r.seat]?.cancel();
      _emojiTimers[r.seat] = Timer(const Duration(seconds: 3), () {
        if (mounted) setState(() => _seatEmojis.remove(r.seat));
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Return to lobby — acknowledges the completed transition, clears room state,
  // and navigates back to /lobby.
  // ---------------------------------------------------------------------------

  void _returnToLobby() {
    ref.read(lobbySocketServiceProvider).acknowledgeGameStart();
    context.go('/lobby');
  }

  // ---------------------------------------------------------------------------
  // Seat layout helpers
  // ---------------------------------------------------------------------------

  /// Maps logical seat → screen position for N-player layout.
  /// The local player's seat is always placed at South (screen seat 0).
  int _screenSeat(int gameSeat, int mySeat, int playerCount) {
    return (gameSeat - mySeat + playerCount) % playerCount;
  }

  /// Maps a screen seat index to an [Alignment] around the table.
  ///
  /// 4-player — cardinal compass positions:
  ///   0 = South, 1 = West, 2 = North, 3 = East
  ///
  /// 6-player — hexagonal positions (landscape, local player always South):
  ///   0 = South, 1 = South-West, 2 = North-West,
  ///   3 = North, 4 = North-East, 5 = South-East
  Alignment _seatAlignment(int screenSeat, int playerCount) {
    if (playerCount == 6) {
      switch (screenSeat) {
        case 0: return const Alignment(0.0, 1.0);    // South (bottom centre)
        case 1: return const Alignment(-1.0, 0.65);  // South-West
        case 2: return const Alignment(-1.0, -0.65); // North-West
        case 3: return const Alignment(0.0, -1.0);   // North (top centre)
        case 4: return const Alignment(1.0, -0.65);  // North-East
        case 5: return const Alignment(1.0, 0.65);   // South-East
        default: return Alignment.center;
      }
    }
    // 4-player default
    switch (screenSeat) {
      case 0: return Alignment.bottomCenter;
      case 1: return Alignment.centerLeft;
      case 2: return Alignment.topCenter;
      case 3: return Alignment.centerRight;
      default: return Alignment.center;
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final gs = _socketService.gameState;

    return Scaffold(
      backgroundColor: const Color(0xFF0D0606),
      body: gs == null
          ? _buildConnecting(context)
          : _buildGame(context, gs),
    );
  }

  /// Shown while waiting for the first game state push from the server.
  ///
  /// Two sub-states:
  ///   • No error — spinner + "Joining game…" message.
  ///   • Error     — error text + "Return to Lobby" button.
  ///
  /// Always shows a "Return to Lobby" escape hatch so the user is never
  /// stuck if the game payload is delayed or the server rejects the join.
  Widget _buildConnecting(BuildContext context) {
    final errorText = _socketService.error;
    final hasError = errorText != null;

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (hasError) ...[
            const Icon(Icons.wifi_off, color: Color(0xFF8B1A1A), size: 40),
            const SizedBox(height: 16),
            Text(
              errorText,
              style: const TextStyle(color: Color(0xFFCF6679), fontSize: 14),
              textAlign: TextAlign.center,
            ),
          ] else ...[
            const CircularProgressIndicator(color: Color(0xFF8B1A1A)),
            const SizedBox(height: 16),
            const Text(
              'Joining game…',
              style: TextStyle(color: Colors.white70, fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              widget.gameId,
              style: const TextStyle(color: Colors.white24, fontSize: 11),
            ),
          ],
          const SizedBox(height: 32),
          TextButton(
            onPressed: _returnToLobby,
            child: Text(
              'Return to Lobby',
              style: TextStyle(
                color: hasError
                    ? const Color(0xFF8B1A1A)
                    : Colors.white38,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGame(BuildContext context, ClientGameState gs) {
    return Row(
      children: [
        // Main game table area
        Expanded(
          child: _buildTableArea(context, gs),
        ),
        // [MIG-048] Live Panel — permanently visible
        Padding(
          padding: const EdgeInsets.all(8),
          child: LivePanel(
            gameState: gs,
            turnTimeoutAt: _socketService.turnTimeoutAt,
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Table area
  // ---------------------------------------------------------------------------

  Widget _buildTableArea(BuildContext context, ClientGameState gs) {
    final size = MediaQuery.of(context).size;
    final tableW = size.width - 190; // minus live panel
    final tableH = size.height;

    return SizedBox(
      width: tableW,
      height: tableH,
      child: Stack(
        children: [
          // Background felt
          Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.center,
                radius: 0.9,
                colors: [
                  Color(0xFF1A0808),
                  Color(0xFF0D0404),
                ],
              ),
            ),
          ),

          // Oval wooden table
          Center(
            child: _buildOvalTable(tableW, tableH),
          ),

          // ── Seat positions ──
          // Rendered for both 4-player and 6-player via _seatAlignment.
          // The local player (mySeat) is always screen seat 0 = South.
          for (int gameSeat = 0; gameSeat < gs.seats.length; gameSeat++)
            _buildSeatArea(
              gs: gs,
              gameSeat: gameSeat,
              alignment: _seatAlignment(
                _screenSeat(gameSeat, gs.mySeat, gs.seats.length),
                gs.seats.length,
              ),
              tableW: tableW,
              tableH: tableH,
            ),

          // Current trick in center
          Center(
            child: _buildTrickArea(gs),
          ),

          // Phase / action overlay at bottom
          if (gs.isMyTurn)
            Positioned(
              bottom: 130,
              left: 0,
              right: 0,
              child: _buildActionBar(gs),
            ),

          // [GAP-1] Emoji reaction bubbles — one per seat, auto-cleared.
          ..._buildEmojiOverlays(gs, tableW, tableH),

          // Round-end popup
          if (gs.phase == GamePhase.roundEnded)
            _buildRoundEndOverlay(gs),
          if (gs.phase == GamePhase.gameEnded)
            _buildGameEndOverlay(gs),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Oval table
  // ---------------------------------------------------------------------------

  Widget _buildOvalTable(double w, double h) {
    final tableWidth = w * 0.62;
    final tableHeight = h * 0.52;
    return Container(
      width: tableWidth,
      height: tableHeight,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(Radius.elliptical(tableWidth / 2, tableHeight / 2)),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF3E1F00), // walnut dark
            Color(0xFF5C2E00), // walnut mid
            Color(0xFF3E1F00),
          ],
          stops: [0.0, 0.5, 1.0],
        ),
        border: Border.all(
          color: const Color(0xFF8B5E1A),
          width: 4,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.7),
            blurRadius: 24,
            spreadRadius: 4,
          ),
        ],
      ),
      // Inner felt ring
      child: Container(
        margin: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.all(
            Radius.elliptical(tableWidth / 2 - 10, tableHeight / 2 - 10),
          ),
          color: const Color(0xFF1A3A1A).withOpacity(0.85),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Seat area
  // ---------------------------------------------------------------------------

  Widget _buildSeatArea({
    required ClientGameState gs,
    required int gameSeat,
    required Alignment alignment,
    required double tableW,
    required double tableH,
  }) {
    final seatState = gs.seats[gameSeat];
    if (seatState == null) return const SizedBox.shrink();

    final isLocal = gameSeat == gs.mySeat;
    final isCurrentTurn = _isSeatTurn(gs, gameSeat);

    return Positioned.fill(
      child: Align(
        alignment: alignment,
        child: Padding(
          padding: _seatPadding(alignment),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Identity widget (compact on non-local seats)
              PlayerIdentityWidget(
                seat: gameSeat,
                seatState: seatState,
                isDealer: gs.dealerSeat == gameSeat,
                isBidWinner: gs.highestBidderSeat == gameSeat,
                isAdmin: false, // admin info not in ClientGameState
                isCurrentPlayer: isCurrentTurn,
                compact: !isLocal,
              ),
              const SizedBox(height: 6),
              // Card zones
              if (isLocal)
                _buildLocalCardZones(gs)
              else
                _buildOpponentCardZones(gs, gameSeat, seatState, alignment),
            ],
          ),
        ),
      ),
    );
  }

  EdgeInsets _seatPadding(Alignment a) {
    if (a == Alignment.bottomCenter) return const EdgeInsets.only(bottom: 8);
    if (a == Alignment.topCenter) return const EdgeInsets.only(top: 8);
    if (a == Alignment.centerLeft) return const EdgeInsets.only(left: 8);
    if (a == Alignment.centerRight) return const EdgeInsets.only(right: 8);
    // Diagonal corner positions (6-player: SW / NW / NE / SE).
    // Apply edge padding on whichever sides the seat is pressed against.
    return EdgeInsets.only(
      left: a.x < -0.5 ? 8 : 0,
      right: a.x > 0.5 ? 8 : 0,
      top: a.y < -0.5 ? 8 : 0,
      bottom: a.y > 0.5 ? 8 : 0,
    );
  }

  // ---------------------------------------------------------------------------
  // Local player card zones
  // ---------------------------------------------------------------------------

  Widget _buildLocalCardZones(ClientGameState gs) {
    final playable = _extractPlayableCards(gs);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Face-up zone (always visible)
        if (gs.myFaceUp.isNotEmpty)
          _zoneRow('Face-Up', gs.myFaceUp, playable, gs),

        // Secret hand (shown to local player)
        if (gs.mySecretHand.isNotEmpty)
          _zoneRow('Secret', gs.mySecretHand, playable, gs),

        // Face-down (shown count only until eligible to play)
        if (gs.myFaceDown.isNotEmpty)
          _faceDownZone(gs.myFaceDown, playable, gs),

        // Full hand (legacy / single-phase mode)
        if (gs.myHand.isNotEmpty &&
            gs.myFaceUp.isEmpty &&
            gs.mySecretHand.isEmpty)
          _zoneRow('Hand', gs.myHand, playable, gs),
      ],
    );
  }

  Widget _zoneRow(
    String label,
    List<PlayingCard> cards,
    List<PlayingCard> playable,
    ClientGameState gs,
  ) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.4),
            fontSize: 9,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 3),
        CardHandWidget(
          cards: cards,
          playableCards: playable,
          onCardTap: (card) => _onCardTap(gs, card),
          cardWidth: 50,
        ),
        const SizedBox(height: 6),
      ],
    );
  }

  Widget _faceDownZone(
    List<PlayingCard> cards,
    List<PlayingCard> playable,
    ClientGameState gs,
  ) {
    final anyPlayable = cards.any((c) => playable.contains(c));
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Face-Down',
          style: TextStyle(
            color: Colors.white.withOpacity(0.4),
            fontSize: 9,
          ),
        ),
        const SizedBox(height: 3),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (anyPlayable)
              ...cards.map(
                (c) => Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: CardWidget(
                    card: c,
                    isPlayable: true,
                    width: 50,
                    onTap: () => _onCardTap(gs, c),
                  ),
                ),
              )
            else
              ...List.generate(
                cards.length,
                (_) => const Padding(
                  padding: EdgeInsets.only(right: 4),
                  child: CardWidget(card: null, width: 50),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Opponent card zones (abbreviated)
  // ---------------------------------------------------------------------------

  Widget _buildOpponentCardZones(
    ClientGameState gs,
    int gameSeat,
    SeatState seat,
    Alignment alignment,
  ) {
    final isVertical = alignment == Alignment.centerLeft ||
        alignment == Alignment.centerRight;

    final faceUpCards = seat.faceUp;
    final faceDownCount = seat.faceDownCount;

    if (isVertical) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (faceUpCards.isNotEmpty)
            ...faceUpCards.map(
              (c) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: CardWidget(card: c, width: 34),
              ),
            ),
          if (faceDownCount > 0)
            Text(
              '$faceDownCount↓',
              style: TextStyle(
                color: Colors.white.withOpacity(0.5),
                fontSize: 10,
              ),
            ),
        ],
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ...faceUpCards.take(4).map(
              (c) => Padding(
                padding: const EdgeInsets.only(right: 2),
                child: CardWidget(card: c, width: 34),
              ),
            ),
        if (faceDownCount > 0)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              '+$faceDownCount ↓',
              style: TextStyle(
                color: Colors.white.withOpacity(0.5),
                fontSize: 10,
              ),
            ),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Trick area (center of table)
  // ---------------------------------------------------------------------------

  Widget _buildTrickArea(ClientGameState gs) {
    if (gs.currentTrick.isEmpty) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 160,
          height: 160,
          child: Stack(
            children: gs.currentTrick.map((tc) {
              final pos = _trickCardPosition(tc.seat, gs.mySeat, gs.seats.length);
              return Positioned(
                left: pos.dx,
                top: pos.dy,
                child: CardWidget(card: tc.card, width: 42),
              );
            }).toList(),
          ),
        ),
        if (gs.trumpSuit != null)
          Text(
            'Trump: ${gs.trumpSuit!.symbol}',
            style: TextStyle(
              color: (gs.trumpSuit == Suit.hearts || gs.trumpSuit == Suit.diamonds)
                  ? Colors.red[300]
                  : Colors.white.withOpacity(0.7),
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
      ],
    );
  }

  Offset _trickCardPosition(int gameSeat, int mySeat, int playerCount) {
    final screen = _screenSeat(gameSeat, mySeat, playerCount);
    const cx = 59.0;
    const cy = 59.0;
    if (playerCount == 6) {
      // 6-player: clock-face positions around the 160×160 trick area.
      // Screen seats go clockwise: S(0)→SW(1)→NW(2)→N(3)→NE(4)→SE(5)
      switch (screen) {
        case 0: return const Offset(cx, cy + 44);       // 6 o'clock  (S)
        case 1: return const Offset(cx - 38, cy + 22);  // 8 o'clock  (SW)
        case 2: return const Offset(cx - 38, cy - 22);  // 10 o'clock (NW)
        case 3: return const Offset(cx, cy - 44);       // 12 o'clock (N)
        case 4: return const Offset(cx + 38, cy - 22);  // 2 o'clock  (NE)
        case 5: return const Offset(cx + 38, cy + 22);  // 4 o'clock  (SE)
        default: return Offset(cx, cy);
      }
    }
    // 4-player: cardinal positions
    switch (screen) {
      case 0: return const Offset(cx, cy + 52);
      case 1: return const Offset(cx - 52, cy);
      case 2: return const Offset(cx, cy - 52);
      case 3: return const Offset(cx + 52, cy);
      default: return Offset(cx, cy);
    }
  }

  // ---------------------------------------------------------------------------
  // [GAP-1] Emoji reaction overlays — one floating bubble per seat.
  //
  // Returns Positioned widgets placed near each seat's screen position.
  // Each bubble auto-dismisses after 3 seconds (driven by _emojiTimers).
  // ---------------------------------------------------------------------------

  List<Widget> _buildEmojiOverlays(
      ClientGameState gs, double tableW, double tableH) {
    if (_seatEmojis.isEmpty) return const [];

    final widgets = <Widget>[];

    for (final entry in _seatEmojis.entries) {
      final gameSeat = entry.key;
      final emoji = entry.value;
      final screen = _screenSeat(gameSeat, gs.mySeat, gs.seats.length);

      // Reuse _seatAlignment so bubbles track the correct position for both
      // 4-player and 6-player layouts without a separate switch.
      final alignment = _seatAlignment(screen, gs.seats.length);

      // Offset the bubble towards the center so it doesn't overlap the seat.
      // Uses alignment components so this works for diagonal corners too.
      final dx = alignment.x < -0.5
          ? tableW * 0.18
          : alignment.x > 0.5
              ? -tableW * 0.18
              : 0.0;
      final dy = alignment.y < -0.5
          ? tableH * 0.18
          : alignment.y > 0.5
              ? -tableH * 0.22
              : 0.0;

      widgets.add(
        Positioned.fill(
          child: Align(
            alignment: alignment,
            child: Transform.translate(
              offset: Offset(dx, dy),
              child: _EmojiBubble(emoji: emoji),
            ),
          ),
        ),
      );
    }

    return widgets;
  }

  // ---------------------------------------------------------------------------
  // Action bar (bid / trump / pass)
  // ---------------------------------------------------------------------------

  Widget _buildActionBar(ClientGameState gs) {
    final phase = gs.phase;

    if (phase == GamePhase.primaryBid || phase == GamePhase.bidding) {
      return _buildBidBar(gs, isPrimary: phase == GamePhase.primaryBid);
    }
    if (phase == GamePhase.primaryTrumpSelection ||
        phase == GamePhase.trumpSelection) {
      return _buildTrumpBar(gs);
    }
    return const SizedBox.shrink();
  }

  Widget _buildBidBar(ClientGameState gs, {required bool isPrimary}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (isPrimary)
            _actionButton(
              label: 'Bid 5 (Primary)',
              color: const Color(0xFF1565C0),
              onTap: () => _socketService.sendBid(gs.gameId, 5),
            )
          else ...[
            for (final amount in [5, 6, 7, 8])
              if (amount > gs.highestBid)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _actionButton(
                    label: 'Bid $amount',
                    color: const Color(0xFF1565C0),
                    onTap: () => _socketService.sendBid(gs.gameId, amount),
                  ),
                ),
            _actionButton(
              label: 'Pass',
              color: Colors.grey.shade700,
              onTap: () => _socketService.sendPass(gs.gameId),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTrumpBar(ClientGameState gs) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final suit in Suit.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _actionButton(
                label: '${suit.symbol} ${suit.name}',
                color: (suit == Suit.hearts || suit == Suit.diamonds)
                    ? const Color(0xFFB71C1C)
                    : const Color(0xFF212121),
                onTap: () =>
                    _socketService.sendSelectTrump(gs.gameId, suit.code),
              ),
            ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
    );
  }

  // ---------------------------------------------------------------------------
  // Overlays
  // ---------------------------------------------------------------------------

  Widget _buildRoundEndOverlay(ClientGameState gs) {
    return _overlayCard(
      title: 'Round ${gs.roundNumber} Complete',
      children: [
        Text(
          'Team A: ${gs.team0Score}  |  Team B: ${gs.team1Score}',
          style: const TextStyle(color: Colors.white, fontSize: 16),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'Target: ${gs.targetScore}',
          style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 12),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildGameEndOverlay(ClientGameState gs) {
    // Use the server-authoritative winner captured from the GAME_ENDED event
    // payload.  This correctly handles doobna endings (team goes below -500)
    // and Perfect-8 victories where neither team may have crossed targetScore
    // at the moment the game ends.
    //
    // Fall back to a score comparison only if the event winner was not yet
    // received (e.g. the overlay is built from a re-joined snapshot).
    final serverWinner = _socketService.gameWinnerTeam;
    final winningTeam0 = serverWinner != null
        ? serverWinner == 0
        : gs.team0Score > gs.team1Score;
    final myTeamWon = gs.myTeam == 0 ? winningTeam0 : !winningTeam0;
    final winTeam = winningTeam0 ? 'Team A' : 'Team B';
    return _overlayCard(
      title: myTeamWon ? '🏆 Victory!' : '💔 Defeat',
      children: [
        Text(
          '$winTeam wins the series!',
          style: const TextStyle(
            color: Color(0xFFFFD700),
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'Final: Team A ${gs.team0Score}  —  Team B ${gs.team1Score}',
          style: const TextStyle(color: Colors.white, fontSize: 14),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: _returnToLobby,
          style: TextButton.styleFrom(foregroundColor: const Color(0xFF8B1A1A)),
          child: const Text('Return to Lobby'),
        ),
      ],
    );
  }

  Widget _overlayCard({
    required String title,
    required List<Widget> children,
  }) {
    return Container(
      color: Colors.black.withOpacity(0.7),
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(24),
          margin: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: const Color(0xFF1A0A0A),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF8B1A1A), width: 1.5),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFFFFD700),
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              ...children,
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  bool _isSeatTurn(ClientGameState gs, int seat) {
    final phase = gs.phase;
    if (phase == GamePhase.primaryBid || phase == GamePhase.bidding) {
      return gs.currentBidderSeat == seat;
    }
    if (phase == GamePhase.primaryTrumpSelection ||
        phase == GamePhase.trumpSelection) {
      return gs.highestBidderSeat == seat;
    }
    if (phase == GamePhase.playing || phase == GamePhase.trickEnded) {
      if (gs.currentTrickLeaderSeat == null) return false;
      final expected =
          (gs.currentTrickLeaderSeat! + gs.currentTrick.length) %
              gs.seats.length;
      return expected == seat;
    }
    return false;
  }

  /// [GAP-7] Return the subset of hand cards the server has deemed legal for
  /// the current play turn, using the validCards list from game:your_turn.
  ///
  /// Falls back to the full hand if the server has not yet sent validCards
  /// (e.g. on reconnect before the next your_turn event arrives).  The server
  /// enforces legality at action time regardless, so the fallback is safe.
  List<PlayingCard> _extractPlayableCards(ClientGameState gs) {
    if (!gs.isMyTurn) return [];
    final phase = gs.phase;
    if (phase != GamePhase.playing && phase != GamePhase.trickEnded) {
      return [];
    }

    // Find the play_card action emitted by game:your_turn.
    final playCardAction = _socketService.validActions
        .cast<Map<String, dynamic>>()
        .where((a) => a['type'] == 'play_card')
        .firstOrNull;

    final validCardCodes = (playCardAction?['validCards'] as List?)
        ?.cast<String>()
        .toSet();

    final allCards = [
      ...gs.myFaceUp,
      ...gs.mySecretHand,
      ...gs.myHand,
    ];

    if (validCardCodes != null && validCardCodes.isNotEmpty) {
      // Filter to only server-authorised cards.
      return allCards.where((c) => validCardCodes.contains(c.code)).toList();
    }

    // Fallback — server will enforce legality at the time the card is sent.
    return allCards;
  }

  void _onCardTap(ClientGameState gs, PlayingCard card) {
    _socketService.sendPlayCard(gs.gameId, card.code);
  }
}

// ---------------------------------------------------------------------------
// [GAP-1] _EmojiBubble — animated emoji that appears near a seat.
// ---------------------------------------------------------------------------

class _EmojiBubble extends StatefulWidget {
  const _EmojiBubble({required this.emoji});
  final String emoji;

  @override
  State<_EmojiBubble> createState() => _EmojiBubbleState();
}

class _EmojiBubbleState extends State<_EmojiBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _scale = CurvedAnimation(parent: _ctrl, curve: Curves.elasticOut);
    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: ScaleTransition(
        scale: _scale,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.65),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Colors.white.withOpacity(0.15),
              width: 1,
            ),
          ),
          child: Text(
            widget.emoji,
            style: const TextStyle(fontSize: 28),
          ),
        ),
      ),
    );
  }
}
