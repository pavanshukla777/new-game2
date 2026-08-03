/// SeatGrid — displays room seats grouped by team.
///
/// Layout (2-column: Team 0 left, Team 1 right):
///   4-player: 2 rows × 2 columns
///   6-player: 3 rows × 2 columns
///
/// Team 0 = seats 0, 2, 4 (crimson highlight)
/// Team 1 = seats 1, 3, 5 (blue highlight)
///
/// Shows: player name, ready indicator, admin crown.
/// If [amAdmin] and the seat is occupied by someone else, shows a kick button.

import 'package:flutter/material.dart';
import '../models/lobby_models.dart';

class SeatGrid extends StatelessWidget {
  const SeatGrid({
    super.key,
    required this.players,
    required this.maxPlayers,
    required this.myUserId,
    required this.amAdmin,
    this.onKick,
  });

  final List<LobbyPlayer> players;
  final int maxPlayers;
  final String myUserId;
  final bool amAdmin;
  final void Function(String userId)? onKick;

  static const _team0Color = Color(0xFF8B1A1A);
  static const _team1Color = Color(0xFF1A3A8B);

  LobbyPlayer? _playerAtSeat(int seat) {
    try {
      return players.firstWhere((p) => p.seat == seat);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = maxPlayers ~/ 2;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Team headers
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: [
              Expanded(
                child: _teamHeader('Team 0', _team0Color),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _teamHeader('Team 1', _team1Color),
              ),
            ],
          ),
        ),
        // Seat rows
        ...List.generate(rows, (rowIdx) {
          final seat0 = rowIdx * 2;
          final seat1 = rowIdx * 2 + 1;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _SeatCard(
                    seat: seat0,
                    player: _playerAtSeat(seat0),
                    teamColor: _team0Color,
                    isMe: _playerAtSeat(seat0)?.userId == myUserId,
                    amAdmin: amAdmin,
                    onKick: (_playerAtSeat(seat0) != null &&
                            _playerAtSeat(seat0)!.userId != myUserId &&
                            amAdmin)
                        ? () => onKick?.call(_playerAtSeat(seat0)!.userId)
                        : null,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SeatCard(
                    seat: seat1,
                    player: _playerAtSeat(seat1),
                    teamColor: _team1Color,
                    isMe: _playerAtSeat(seat1)?.userId == myUserId,
                    amAdmin: amAdmin,
                    onKick: (_playerAtSeat(seat1) != null &&
                            _playerAtSeat(seat1)!.userId != myUserId &&
                            amAdmin)
                        ? () => onKick?.call(_playerAtSeat(seat1)!.userId)
                        : null,
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _teamHeader(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.18),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Center(
        child: Text(
          label,
          style: TextStyle(
            color: color.withOpacity(0.9),
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 1,
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _SeatCard
// ---------------------------------------------------------------------------

class _SeatCard extends StatelessWidget {
  const _SeatCard({
    required this.seat,
    required this.player,
    required this.teamColor,
    required this.isMe,
    required this.amAdmin,
    this.onKick,
  });

  final int seat;
  final LobbyPlayer? player;
  final Color teamColor;
  final bool isMe;
  final bool amAdmin;
  final VoidCallback? onKick;

  @override
  Widget build(BuildContext context) {
    final occupied = player != null;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: occupied
            ? teamColor.withOpacity(0.12)
            : Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: occupied
              ? teamColor.withOpacity(isMe ? 0.7 : 0.35)
              : Colors.white12,
          width: isMe ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          // Seat number
          Text(
            '${seat + 1}',
            style: TextStyle(
              color: occupied ? teamColor.withOpacity(0.7) : Colors.white24,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 8),

          // Main info
          Expanded(
            child: occupied
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          // Admin crown
                          if (player!.isAdmin)
                            Padding(
                              padding: const EdgeInsets.only(right: 4),
                              child: Text(
                                '👑',
                                style: const TextStyle(fontSize: 10),
                              ),
                            ),
                          Expanded(
                            child: Text(
                              player!.displayName,
                              style: TextStyle(
                                color: isMe
                                    ? Colors.white
                                    : Colors.white.withOpacity(0.8),
                                fontSize: 12,
                                fontWeight: isMe
                                    ? FontWeight.bold
                                    : FontWeight.normal,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (isMe)
                            Padding(
                              padding: const EdgeInsets.only(left: 2),
                              child: Text(
                                'you',
                                style: TextStyle(
                                  color: teamColor.withOpacity(0.7),
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  )
                : Text(
                    'Empty',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.2),
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
          ),

          // Ready indicator (right side)
          if (occupied)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: player!.isReady ? Colors.greenAccent : Colors.white24,
                  boxShadow: player!.isReady
                      ? [
                          BoxShadow(
                            color: Colors.greenAccent.withOpacity(0.5),
                            blurRadius: 4,
                          )
                        ]
                      : null,
                ),
              ),
            ),

          // Kick button (admin only, not on own seat)
          if (onKick != null)
            GestureDetector(
              onTap: onKick,
              child: Padding(
                padding: const EdgeInsets.only(left: 6),
                child: Icon(
                  Icons.close,
                  size: 14,
                  color: Colors.white30,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
