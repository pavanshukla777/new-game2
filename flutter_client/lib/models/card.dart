/// Card model — Bundelkhandi Chhakri
///
/// A card code is a 2-character string: rank + suit.
/// Ranks: 7 8 9 T J Q K A  (T = 10)
/// Suits: S H D C  (Spades Hearts Diamonds Clubs)

/// Suit enum
enum Suit {
  spades('S', '♠', 'Spades'),
  hearts('H', '♥', 'Hearts'),
  diamonds('D', '♦', 'Diamonds'),
  clubs('C', '♣', 'Clubs');

  const Suit(this.code, this.symbol, this.name);
  final String code;
  final String symbol;
  final String name;

  static Suit? fromCode(String? code) {
    if (code == null) return null;
    return Suit.values.firstWhere(
      (s) => s.code == code,
      orElse: () => Suit.spades,
    );
  }
}

/// A playing card.
class PlayingCard {
  const PlayingCard({required this.rank, required this.suit});

  final String rank;
  final Suit suit;

  /// Build from a 2-char card code such as "AS", "TH", "7D".
  factory PlayingCard.fromCode(String code) {
    assert(code.length == 2, 'Invalid card code: $code');
    return PlayingCard(
      rank: code[0],
      suit: Suit.fromCode(code[1]) ?? Suit.spades,
    );
  }

  String get code => '$rank${suit.code}';

  /// Human-readable rank label.
  String get rankLabel {
    switch (rank) {
      case 'T':
        return '10';
      case 'J':
        return 'J';
      case 'Q':
        return 'Q';
      case 'K':
        return 'K';
      case 'A':
        return 'A';
      default:
        return rank;
    }
  }

  bool get isRed => suit == Suit.hearts || suit == Suit.diamonds;

  @override
  String toString() => code;

  @override
  bool operator ==(Object other) =>
      other is PlayingCard && other.code == code;

  @override
  int get hashCode => code.hashCode;
}
