/// LivePanel — Bundelkhandi Chhakri
///
/// [MIG-048] [GAP-028] Rulebook Section: "UI — Live Match Panel"
/// Implements: Match Progress Panel permanently visible during gameplay.
///
/// Shows:
///   • Round number
///   • Team scores vs target (Team A / Team B, zero-sum)
///   • Current bid and bidder seat
///   • Trump suit (once declared)
///   • Trick progress (N / 8 tricks completed this round)
///   • Current phase label
///   • Turn countdown timer

import 'dart:async';
import 'package:flutter/material.dart';
import '../models/game_state.dart';
import '../models/card.dart';

class LivePanel extends StatefulWidget {
  const LivePanel({
    super.key,
    required this.gameState,
    this.turnTimeoutAt,
  });

  final ClientGameState gameState;
  final DateTime? turnTimeoutAt;

  @override
  State<LivePanel> createState() => _LivePanelState();
}

class _LivePanelState extends State<LivePanel> {
  Timer? _countdownTimer;
  int _secondsLeft = 0;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void didUpdateWidget(LivePanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.turnTimeoutAt != oldWidget.turnTimeoutAt) {
      _countdownTimer?.cancel();
      _startCountdown();
    }
  }

  void _startCountdown() {
    final timeout = widget.turnTimeoutAt;
    if (timeout == null) {
      setState(() => _secondsLeft = 0);
      return;
    }
    _tick(timeout);
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => _tick(timeout));
  }

  void _tick(DateTime timeout) {
    final remaining = timeout.difference(DateTime.now()).inSeconds;
    if (mounted) setState(() => _secondsLeft = remaining < 0 ? 0 : remaining);
    if (remaining <= 0) _countdownTimer?.cancel();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final gs = widget.gameState;
    return Container(
      width: 170,
      decoration: BoxDecoration(
        color: const Color(0xFF1A0A0A).withOpacity(0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFF8B1A1A).withOpacity(0.6),
          width: 1.0,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildHeader(gs),
          const Divider(color: Color(0xFF8B1A1A), height: 1, thickness: 0.5),
          _buildScoreSection(gs),
          const Divider(color: Color(0xFF3A2A2A), height: 1, thickness: 0.5),
          _buildBidSection(gs),
          if (gs.trumpSuit != null || gs.noTrump) ...[
            const Divider(color: Color(0xFF3A2A2A), height: 1, thickness: 0.5),
            _buildTrumpSection(gs),
          ],
          const Divider(color: Color(0xFF3A2A2A), height: 1, thickness: 0.5),
          _buildTricksSection(gs),
          if (widget.turnTimeoutAt != null) ...[
            const Divider(color: Color(0xFF3A2A2A), height: 1, thickness: 0.5),
            _buildTimerSection(),
          ],
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Header: Round N • Phase label
  // ---------------------------------------------------------------------------

  Widget _buildHeader(ClientGameState gs) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Round ${gs.roundNumber}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.bold,
            ),
          ),
          _phaseChip(gs.phase),
        ],
      ),
    );
  }

  Widget _phaseChip(GamePhase phase) {
    final (label, color) = _phaseInfo(phase);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w600),
      ),
    );
  }

  (String, Color) _phaseInfo(GamePhase phase) {
    switch (phase) {
      case GamePhase.dealing:
        return ('Dealing', Colors.grey);
      case GamePhase.primaryBid:
        return ('Primary Bid', const Color(0xFF81D4FA));
      case GamePhase.primaryTrumpSelection:
        return ('Primary Trump', const Color(0xFF81D4FA));
      case GamePhase.bidding:
        return ('Bidding', const Color(0xFFFFCC80));
      case GamePhase.trumpSelection:
        return ('Trump', const Color(0xFFFFCC80));
      case GamePhase.playing:
      case GamePhase.trickEnded:
        return ('Playing', const Color(0xFFA5D6A7));
      case GamePhase.roundEnded:
        return ('Round Over', Colors.purple);
      case GamePhase.gameEnded:
        return ('Game Over!', const Color(0xFFFFD700));
    }
  }

  // ---------------------------------------------------------------------------
  // Score section: Team A vs Team B
  // ---------------------------------------------------------------------------

  Widget _buildScoreSection(ClientGameState gs) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Score  /  ${gs.targetScore}',
            style: TextStyle(
              color: Colors.white.withOpacity(0.5),
              fontSize: 9,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 4),
          _scoreBar(
            label: 'Team A',
            score: gs.team0Score,
            target: gs.targetScore,
            color: const Color(0xFF1565C0),
          ),
          const SizedBox(height: 4),
          _scoreBar(
            label: 'Team B',
            score: gs.team1Score,
            target: gs.targetScore,
            color: const Color(0xFFB71C1C),
          ),
        ],
      ),
    );
  }

  Widget _scoreBar({
    required String label,
    required int score,
    required int target,
    required Color color,
  }) {
    final clamped = (score / target).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 10)),
            Text(
              '$score',
              style: TextStyle(
                color: score >= target ? const Color(0xFFFFD700) : Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: clamped,
            minHeight: 5,
            backgroundColor: color.withOpacity(0.15),
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Bid section
  // ---------------------------------------------------------------------------

  Widget _buildBidSection(ClientGameState gs) {
    final hasBid = gs.highestBid > 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.gavel, size: 14, color: Color(0xFFCE93D8)),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasBid
                      ? 'Bid: ${gs.highestBid}'
                      : (gs.phase.isBidding ? 'Bidding…' : 'No Bid'),
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                ),
                if (gs.highestBidderSeat != null)
                  Text(
                    'Seat ${gs.highestBidderSeat}',
                    style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Trump section
  // ---------------------------------------------------------------------------

  Widget _buildTrumpSection(ClientGameState gs) {
    final suit = gs.trumpSuit;
    final label = gs.noTrump ? 'No Trump' : (suit != null ? '${suit.symbol} ${suit.name}' : '—');
    final color = suit != null && (suit == Suit.hearts || suit == Suit.diamonds)
        ? Colors.red[300]!
        : Colors.white;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.star, size: 14, color: Color(0xFFFFD700)),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Trump',
                style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9),
              ),
              Text(
                label,
                style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Tricks section
  // ---------------------------------------------------------------------------

  Widget _buildTricksSection(ClientGameState gs) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tricks',
            style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${gs.completedTricksThisRound} / 8',
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
              ),
              // Trick pips
              Row(
                children: List.generate(8, (i) {
                  final done = i < gs.completedTricksThisRound;
                  return Container(
                    width: 7,
                    height: 7,
                    margin: const EdgeInsets.only(left: 2),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: done
                          ? const Color(0xFFA5D6A7)
                          : Colors.white.withOpacity(0.1),
                      border: Border.all(
                        color: done
                            ? const Color(0xFF4CAF50)
                            : Colors.white.withOpacity(0.2),
                        width: 0.5,
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Per-team trick count
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _trickCount(gs, 0, 'A'),
              _trickCount(gs, 1, 'B'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _trickCount(ClientGameState gs, int team, String teamLabel) {
    int won = 0;
    for (final seat in gs.seats.entries) {
      if (seat.value.team == team) won += seat.value.tricksWon;
    }
    final color = team == 0 ? const Color(0xFF1565C0) : const Color(0xFFB71C1C);
    return Row(
      children: [
        Text('Team $teamLabel: ', style: TextStyle(color: color, fontSize: 9)),
        Text('$won', style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Turn timer
  // ---------------------------------------------------------------------------

  Widget _buildTimerSection() {
    final isUrgent = _secondsLeft <= 10 && _secondsLeft > 0;
    final color = isUrgent ? Colors.redAccent : const Color(0xFFFFCC80);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Icon(Icons.timer, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            '$_secondsLeft s',
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
          const Spacer(),
          if (isUrgent)
            Text(
              'Hurry!',
              style: TextStyle(color: color, fontSize: 9),
            ),
        ],
      ),
    );
  }
}
