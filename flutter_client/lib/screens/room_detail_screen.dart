/// RoomDetailScreen — in-room lobby view.
///
/// Shows:
///   Left panel  (55 %): room header, seat grid, ready button.
///   Right panel (45 %): lobby chat.
///
/// Navigation:
///   • Navigates back to /lobby when currentRoom becomes null
///     (user left or was kicked).
///   • Shows an animated countdown overlay when lobby:game_starting fires.
///   • Navigates to /game/:gameId when lobby:game_started fires (once, guarded).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/lobby_models.dart';
import '../providers/auth_provider.dart';
import '../providers/lobby_provider.dart';
import '../services/lobby_socket_service.dart';
import '../widgets/seat_grid.dart';
import '../widgets/lobby_chat_widget.dart';

class RoomDetailScreen extends ConsumerStatefulWidget {
  const RoomDetailScreen({super.key});

  @override
  ConsumerState<RoomDetailScreen> createState() => _RoomDetailScreenState();
}

class _RoomDetailScreenState extends ConsumerState<RoomDetailScreen> {
  bool _kickInProgress = false;
  bool _readyInProgress = false;
  // Guards against duplicate navigation when game_started fires more than once.
  bool _hasNavigatedToGame = false;

  @override
  Widget build(BuildContext context) {
    // Navigate back to /lobby when room becomes null (leave / kick).
    ref.listen<LobbySocketService>(lobbySocketServiceProvider,
        (prev, next) {
      if (prev?.currentRoom != null &&
          next.currentRoom == null &&
          !next.gameStarted) {
        context.go('/lobby');
      }
      if (!(prev?.gameStarted ?? false) &&
          next.gameStarted &&
          !_hasNavigatedToGame) {
        _hasNavigatedToGame = true;
        final gameId = next.startingGameId;
        if (gameId != null && mounted) {
          context.go('/game/$gameId');
        }
      }
    });

    final lobby = ref.watch(lobbySocketServiceProvider);
    final auth = ref.watch(authProvider);
    final room = lobby.currentRoom;

    if (room == null) {
      // Transitional: screen is about to pop via ref.listen.
      return const Scaffold(
        backgroundColor: Color(0xFF0D0606),
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final myUserId = auth.user?.id ?? '';

    return Scaffold(
      backgroundColor: const Color(0xFF0D0606),
      appBar: _buildAppBar(context, lobby, room, myUserId),
      body: Stack(
        children: [
          Row(
            children: [
              // ── Left: seats + ready ──────────────────────────────────────
              Expanded(
                flex: 55,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _RoomHeader(room: room),
                      const SizedBox(height: 12),
                      Expanded(
                        child: SeatGrid(
                          players: room.players,
                          maxPlayers: room.maxPlayers,
                          myUserId: myUserId,
                          amAdmin: lobby.amAdmin,
                          onKick: lobby.amAdmin
                              ? (uid) => _kick(lobby, uid)
                              : null,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _ReadyBar(
                        isReady: lobby.isMyReady,
                        isLoading: _readyInProgress,
                        onToggle: () => _toggleReady(lobby),
                      ),
                    ],
                  ),
                ),
              ),

              // ── Right: chat ──────────────────────────────────────────────
              SizedBox(
                width: MediaQuery.of(context).size.width * 0.38,
                child: LobbyChatWidget(
                  messages: lobby.chatMessages,
                  onSend: lobby.sendChat,
                  myUserId: myUserId,
                ),
              ),
            ],
          ),

          // Countdown overlay
          if (lobby.startingGameId != null && !lobby.gameStarted)
            const _CountdownOverlay(),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // AppBar
  // ---------------------------------------------------------------------------

  PreferredSizeWidget _buildAppBar(
    BuildContext context,
    LobbySocketService lobby,
    RoomDetail room,
    String myUserId,
  ) {
    return AppBar(
      backgroundColor: const Color(0xFF1A0808),
      elevation: 0,
      automaticallyImplyLeading: false,
      title: Row(
        children: [
          Text(
            room.name,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFF8B1A1A).withOpacity(0.3),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(
                  color: const Color(0xFF8B1A1A).withOpacity(0.5)),
            ),
            child: Text(
              room.code,
              style: const TextStyle(
                color: Color(0xFFFFD700),
                fontSize: 12,
                fontWeight: FontWeight.bold,
                letterSpacing: 2,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '${room.playerCount}/${room.maxPlayers} players',
            style: const TextStyle(
              color: Colors.white38,
              fontSize: 12,
            ),
          ),
        ],
      ),
      actions: [
        if (lobby.amAdmin)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Chip(
              label: const Text(
                '👑 Admin',
                style: TextStyle(fontSize: 11, color: Color(0xFFFFD700)),
              ),
              backgroundColor: Colors.white10,
              padding: EdgeInsets.zero,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ),
        TextButton.icon(
          onPressed: () => _leave(lobby),
          icon: const Icon(Icons.exit_to_app,
              size: 16, color: Colors.white38),
          label: const Text(
            'Leave',
            style: TextStyle(color: Colors.white38, fontSize: 13),
          ),
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _toggleReady(LobbySocketService lobby) async {
    if (_readyInProgress) return;
    setState(() => _readyInProgress = true);
    final err = await lobby.setReady(!lobby.isMyReady);
    if (mounted) setState(() => _readyInProgress = false);
    if (err != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: Colors.red.shade800),
      );
    }
  }

  Future<void> _kick(LobbySocketService lobby, String targetUserId) async {
    if (_kickInProgress) return;
    setState(() => _kickInProgress = true);
    final err = await lobby.kickPlayer(targetUserId);
    if (mounted) setState(() => _kickInProgress = false);
    if (err != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: Colors.red.shade800),
      );
    }
  }

  void _leave(LobbySocketService lobby) {
    lobby.leaveRoom();
    // ref.listen will navigate to /lobby when currentRoom becomes null.
  }

}

// ---------------------------------------------------------------------------
// _RoomHeader
// ---------------------------------------------------------------------------

class _RoomHeader extends StatelessWidget {
  const _RoomHeader({required this.room});
  final RoomDetail room;

  @override
  Widget build(BuildContext context) {
    final modeLabel =
        room.gameMode == 'practice' ? 'Practice' : 'Standard';
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.white10,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            modeLabel,
            style: const TextStyle(color: Colors.white54, fontSize: 11),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'Target: ${room.targetScore} pts',
          style: const TextStyle(color: Colors.white38, fontSize: 11),
        ),
        if (room.isPrivate) ...[
          const SizedBox(width: 8),
          const Icon(Icons.lock_outline, size: 12, color: Colors.white24),
          const SizedBox(width: 2),
          const Text(
            'Private',
            style: TextStyle(color: Colors.white24, fontSize: 11),
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// _ReadyBar
// ---------------------------------------------------------------------------

class _ReadyBar extends StatelessWidget {
  const _ReadyBar({
    required this.isReady,
    required this.isLoading,
    required this.onToggle,
  });

  final bool isReady;
  final bool isLoading;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ElevatedButton(
        onPressed: isLoading ? null : onToggle,
        style: ElevatedButton.styleFrom(
          backgroundColor:
              isReady ? Colors.green.shade800 : const Color(0xFF8B1A1A),
          foregroundColor: Colors.white,
          disabledBackgroundColor: Colors.white10,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white70,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isReady
                        ? Icons.check_circle_outline
                        : Icons.radio_button_unchecked,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isReady ? 'Ready  ✓' : 'Not Ready',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _CountdownOverlay
// ---------------------------------------------------------------------------

class _CountdownOverlay extends StatefulWidget {
  const _CountdownOverlay();

  @override
  State<_CountdownOverlay> createState() => _CountdownOverlayState();
}

class _CountdownOverlayState extends State<_CountdownOverlay> {
  // Backend always sends countdown: 3 — we tick 3 → 2 → 1 → 0 (shows "Go!").
  int _count = 3;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        if (_count > 0) {
          _count--;
        } else {
          t.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final label = _count > 0 ? '$_count' : 'Go!';
    return Container(
      color: Colors.black.withOpacity(0.82),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '🃏',
              style: TextStyle(fontSize: 52),
            ),
            const SizedBox(height: 16),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              transitionBuilder: (child, animation) => ScaleTransition(
                scale: animation,
                child: child,
              ),
              child: Text(
                label,
                key: ValueKey(label),
                style: TextStyle(
                  color: _count > 0
                      ? const Color(0xFFFFD700)
                      : Colors.greenAccent,
                  fontSize: 80,
                  fontWeight: FontWeight.bold,
                  shadows: const [
                    Shadow(
                      color: Colors.black54,
                      blurRadius: 12,
                      offset: Offset(2, 2),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Game Starting…',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 18,
                fontWeight: FontWeight.bold,
                letterSpacing: 2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
