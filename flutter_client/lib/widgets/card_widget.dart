/// CardWidget — Bundelkhandi Chhakri
///
/// Renders a single playing card or a face-down card back.
/// Used in hand zones and the current trick area.

import 'package:flutter/material.dart';
import '../models/card.dart';

class CardWidget extends StatelessWidget {
  const CardWidget({
    super.key,
    required this.card,
    this.onTap,
    this.isSelected = false,
    this.isPlayable = false,
    this.width = 48,
  });

  /// Pass null to show a card back.
  final PlayingCard? card;
  final VoidCallback? onTap;
  final bool isSelected;
  final bool isPlayable;
  final double width;

  double get height => width * 1.4;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isPlayable ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        transform: isSelected
            ? (Matrix4.identity()..translate(0.0, -12.0))
            : Matrix4.identity(),
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.4),
              blurRadius: 4,
              offset: const Offset(1, 2),
            ),
            if (isPlayable && !isSelected)
              BoxShadow(
                color: const Color(0xFFFFD700).withOpacity(0.3),
                blurRadius: 6,
                spreadRadius: 1,
              ),
          ],
        ),
        child: card == null ? _buildBack() : _buildFace(card!),
      ),
    );
  }

  Widget _buildFace(PlayingCard c) {
    final isRed = c.isRed;
    final textColor = isRed ? const Color(0xFFCC0000) : Colors.black87;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: isPlayable
              ? const Color(0xFFFFD700).withOpacity(0.8)
              : Colors.grey.shade300,
          width: isPlayable ? 1.5 : 0.5,
        ),
      ),
      child: Stack(
        children: [
          // Top-left rank + suit
          Positioned(
            top: 2,
            left: 3,
            child: Column(
              children: [
                Text(
                  c.rankLabel,
                  style: TextStyle(
                    color: textColor,
                    fontSize: width * 0.22,
                    fontWeight: FontWeight.bold,
                    height: 1.0,
                  ),
                ),
                Text(
                  c.suit.symbol,
                  style: TextStyle(
                    color: textColor,
                    fontSize: width * 0.20,
                    height: 1.0,
                  ),
                ),
              ],
            ),
          ),
          // Center suit symbol
          Center(
            child: Text(
              c.suit.symbol,
              style: TextStyle(
                color: textColor,
                fontSize: width * 0.45,
              ),
            ),
          ),
          // Bottom-right rank + suit (rotated)
          Positioned(
            bottom: 2,
            right: 3,
            child: RotatedBox(
              quarterTurns: 2,
              child: Column(
                children: [
                  Text(
                    c.rankLabel,
                    style: TextStyle(
                      color: textColor,
                      fontSize: width * 0.22,
                      fontWeight: FontWeight.bold,
                      height: 1.0,
                    ),
                  ),
                  Text(
                    c.suit.symbol,
                    style: TextStyle(
                      color: textColor,
                      fontSize: width * 0.20,
                      height: 1.0,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBack() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF8B1A1A),
            Color(0xFF4A0909),
          ],
        ),
        border: Border.all(color: Colors.white.withOpacity(0.2), width: 0.5),
      ),
      child: Center(
        child: Container(
          margin: EdgeInsets.all(width * 0.08),
          decoration: BoxDecoration(
            border: Border.all(
              color: Colors.white.withOpacity(0.25),
              width: 1,
            ),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Center(
            child: Text(
              '🪷',
              style: TextStyle(fontSize: width * 0.35),
            ),
          ),
        ),
      ),
    );
  }
}

/// A horizontal fan of cards with optional selection.
class CardHandWidget extends StatefulWidget {
  const CardHandWidget({
    super.key,
    required this.cards,
    this.playableCards = const [],
    this.onCardTap,
    this.cardWidth = 52,
    this.overlap = 0.55,
  });

  final List<PlayingCard> cards;
  final List<PlayingCard> playableCards;
  final void Function(PlayingCard card)? onCardTap;
  final double cardWidth;
  final double overlap;

  @override
  State<CardHandWidget> createState() => _CardHandWidgetState();
}

class _CardHandWidgetState extends State<CardHandWidget> {
  PlayingCard? _selected;

  // [PROD-3 fix] Clear stale selection when the hand changes.
  // Uses contains() rather than full list equality so that:
  //   • An unchanged hand (e.g. timer tick rebuilds) keeps the selection.
  //   • A hand that no longer contains the selected card (trick played,
  //     round started, cards redistributed) silently clears it.
  // PlayingCard equality is by card code, so matching is semantic.
  @override
  void didUpdateWidget(CardHandWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_selected != null && !widget.cards.contains(_selected)) {
      _selected = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cards.isEmpty) return const SizedBox.shrink();

    final step = widget.cardWidth * (1 - widget.overlap);
    final totalWidth =
        widget.cardWidth + step * (widget.cards.length - 1);

    return SizedBox(
      width: totalWidth,
      height: widget.cardWidth * 1.4 + 14, // extra height for lift
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (int i = 0; i < widget.cards.length; i++)
            Positioned(
              left: step * i,
              child: CardWidget(
                card: widget.cards[i],
                isSelected: _selected == widget.cards[i],
                isPlayable:
                    widget.playableCards.contains(widget.cards[i]),
                width: widget.cardWidth,
                onTap: () {
                  setState(() {
                    if (_selected == widget.cards[i]) {
                      // second tap confirms play
                      widget.onCardTap?.call(widget.cards[i]);
                      _selected = null;
                    } else {
                      _selected = widget.cards[i];
                    }
                  });
                },
              ),
            ),
        ],
      ),
    );
  }
}
