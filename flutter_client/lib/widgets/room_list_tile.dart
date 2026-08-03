/// RoomListTile — a single room entry in the lobby room list.
///
/// Displays room code, name, game mode, player count, and a JOIN button.
/// The JOIN button is disabled when the room is full.

import 'package:flutter/material.dart';
import '../models/lobby_models.dart';

class RoomListTile extends StatelessWidget {
  const RoomListTile({
    super.key,
    required this.room,
    required this.onJoin,
    this.isLoading = false,
  });

  final RoomSummary room;
  final VoidCallback onJoin;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final joinable = room.isJoinable;
    final modeLabel = room.gameMode == 'practice' ? 'Practice' : 'Standard';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xFF1A0808),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: joinable
              ? const Color(0xFF8B1A1A).withOpacity(0.6)
              : Colors.white12,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            // Room code badge
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF8B1A1A).withOpacity(0.3),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(
                  color: const Color(0xFF8B1A1A).withOpacity(0.6),
                ),
              ),
              child: Text(
                room.code,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: Color(0xFFFFD700),
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  letterSpacing: 2,
                ),
              ),
            ),
            const SizedBox(width: 14),

            // Room name + mode
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    room.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    modeLabel,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.45),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 14),

            // Player count
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.people_outline,
                  size: 14,
                  color: joinable ? Colors.white54 : Colors.white24,
                ),
                const SizedBox(width: 4),
                Text(
                  '${room.playerCount}/${room.maxPlayers}',
                  style: TextStyle(
                    color: joinable ? Colors.white70 : Colors.white30,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 16),

            // Join button
            SizedBox(
              width: 72,
              child: ElevatedButton(
                onPressed: (joinable && !isLoading) ? onJoin : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF8B1A1A),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.white10,
                  disabledForegroundColor: Colors.white24,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                  elevation: 0,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: isLoading
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white54,
                        ),
                      )
                    : Text(
                        room.isFull ? 'FULL' : 'JOIN',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
