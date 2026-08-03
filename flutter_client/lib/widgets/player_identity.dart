/// PlayerIdentityWidget — Bundelkhandi Chhakri
///
/// [MIG-051] [GAP-050] Rulebook Section: "UI — Player Identity Display"
/// Implements: Profile Photo, Display Name, Village Name,
/// Online/Connection/Mic Status indicators, Admin/Dealer/Bid-Winner badges.
///
/// Two variants:
///   full    — sidebar / info panel (default)
///   compact — in-seat overlay on the table

import 'package:flutter/material.dart';
import '../models/game_state.dart' as gs;

class PlayerIdentityWidget extends StatelessWidget {
  const PlayerIdentityWidget({
    super.key,
    required this.seat,
    required this.seatState,
    required this.isDealer,
    required this.isBidWinner,
    required this.isAdmin,
    this.isMuted = false,
    this.isCurrentPlayer = false,
    this.villageName,
    this.avatarUrl,
    this.compact = false,
  });

  final int seat;
  final gs.SeatState seatState;
  final bool isDealer;
  final bool isBidWinner;
  final bool isAdmin;
  final bool isMuted;
  final bool isCurrentPlayer;
  final String? villageName;
  final String? avatarUrl;
  final bool compact;

  // ---------------------------------------------------------------------------
  // Theme helpers
  // ---------------------------------------------------------------------------

  static const Color _teamAColor = Color(0xFF1565C0);
  static const Color _teamBColor = Color(0xFFB71C1C);
  static const Color _connectedColor = Color(0xFF4CAF50);
  static const Color _disconnectedColor = Color(0xFF9E9E9E);
  static const Color _aiColor = Color(0xFFFFA726);
  static const Color _activeGlow = Color(0xFFFFD700);

  Color get _teamColor =>
      seatState.team == 0 ? _teamAColor : _teamBColor;

  Color get _connectionColor {
    switch (seatState.connectionState) {
      case gs.ConnectionState.connected:
        return _connectedColor;
      case gs.ConnectionState.disconnected:
      case gs.ConnectionState.reconnecting:
        return _disconnectedColor;
      case gs.ConnectionState.aiPlaying:
        return _aiColor;
    }
  }

  String get _connectionLabel {
    switch (seatState.connectionState) {
      case gs.ConnectionState.connected:
        return 'Online';
      case gs.ConnectionState.disconnected:
        return 'Offline';
      case gs.ConnectionState.reconnecting:
        return 'Reconnecting…';
      case gs.ConnectionState.aiPlaying:
        return 'AI';
    }
  }

  IconData get _connectionIcon {
    switch (seatState.connectionState) {
      case gs.ConnectionState.connected:
        return Icons.wifi;
      case gs.ConnectionState.disconnected:
        return Icons.wifi_off;
      case gs.ConnectionState.reconnecting:
        return Icons.sync;
      case gs.ConnectionState.aiPlaying:
        return Icons.smart_toy;
    }
  }

  @override
  Widget build(BuildContext context) {
    return compact ? _buildCompact() : _buildFull();
  }

  // ---------------------------------------------------------------------------
  // Full layout
  // ---------------------------------------------------------------------------

  Widget _buildFull() {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      decoration: BoxDecoration(
        color: const Color(0xFF1A0A0A).withOpacity(0.85),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color:
              isCurrentPlayer ? _activeGlow : _teamColor.withOpacity(0.5),
          width: isCurrentPlayer ? 2.0 : 1.0,
        ),
        boxShadow: isCurrentPlayer
            ? [
                BoxShadow(
                  color: _activeGlow.withOpacity(0.4),
                  blurRadius: 12,
                  spreadRadius: 2,
                ),
              ]
            : null,
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _buildAvatarWithStatus(),
          const SizedBox(height: 6),
          Text(
            seatState.displayName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (villageName != null) ...[
            const SizedBox(height: 2),
            Text(
              villageName!,
              style: TextStyle(
                color: Colors.white.withOpacity(0.55),
                fontSize: 10,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 6),
          // Connection + mic row
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_connectionIcon, size: 12, color: _connectionColor),
              const SizedBox(width: 3),
              Text(
                _connectionLabel,
                style: TextStyle(color: _connectionColor, fontSize: 10),
              ),
              if (isMuted) ...[
                const SizedBox(width: 6),
                const Icon(
                  Icons.mic_off,
                  size: 12,
                  color: Colors.redAccent,
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          _buildBadges(),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Compact layout
  // ---------------------------------------------------------------------------

  Widget _buildCompact() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF1A0A0A).withOpacity(0.80),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isCurrentPlayer
              ? _activeGlow
              : _teamColor.withOpacity(0.6),
          width: isCurrentPlayer ? 1.5 : 1.0,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildMiniAvatar(),
          const SizedBox(width: 5),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                seatState.displayName,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 1,
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_connectionIcon, size: 9, color: _connectionColor),
                  if (isMuted)
                    const Padding(
                      padding: EdgeInsets.only(left: 2),
                      child: Icon(
                        Icons.mic_off,
                        size: 9,
                        color: Colors.redAccent,
                      ),
                    ),
                  if (isAdmin)
                    const Padding(
                      padding: EdgeInsets.only(left: 2),
                      child: Icon(
                        Icons.shield,
                        size: 9,
                        color: Color(0xFFFFD700),
                      ),
                    ),
                  if (isDealer)
                    const Padding(
                      padding: EdgeInsets.only(left: 2),
                      child: Icon(
                        Icons.casino,
                        size: 9,
                        color: Color(0xFF81C784),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Avatar widgets
  // ---------------------------------------------------------------------------

  Widget _buildAvatarWithStatus() {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: 26,
          backgroundColor: _teamColor.withOpacity(0.3),
          backgroundImage:
              avatarUrl != null ? NetworkImage(avatarUrl!) : null,
          child: avatarUrl == null
              ? Text(
                  seatState.displayName.isNotEmpty
                      ? seatState.displayName[0].toUpperCase()
                      : '?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                )
              : null,
        ),
        if (seatState.isAi)
          Positioned(
            bottom: -2,
            right: -2,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: _aiColor,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.black, width: 1),
              ),
              child: const Icon(
                Icons.smart_toy,
                size: 10,
                color: Colors.white,
              ),
            ),
          ),
        Positioned(
          top: 0,
          right: 0,
          child: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: _connectionColor,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.black, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMiniAvatar() {
    return CircleAvatar(
      radius: 12,
      backgroundColor: _teamColor.withOpacity(0.4),
      backgroundImage:
          avatarUrl != null ? NetworkImage(avatarUrl!) : null,
      child: avatarUrl == null
          ? Text(
              seatState.displayName.isNotEmpty
                  ? seatState.displayName[0].toUpperCase()
                  : '?',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            )
          : null,
    );
  }

  // ---------------------------------------------------------------------------
  // Badges
  // ---------------------------------------------------------------------------

  Widget _buildBadges() {
    if (!isAdmin && !isDealer && !isBidWinner) {
      return const SizedBox.shrink();
    }
    return Wrap(
      spacing: 4,
      runSpacing: 2,
      alignment: WrapAlignment.center,
      children: [
        if (isAdmin) _badge('Admin', const Color(0xFFFFD700), Icons.shield),
        if (isDealer) _badge('Dealer', const Color(0xFF81C784), Icons.casino),
        if (isBidWinner) _badge('Bid', const Color(0xFFCE93D8), Icons.gavel),
      ],
    );
  }

  Widget _badge(String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.6), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 9, color: color),
          const SizedBox(width: 2),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
