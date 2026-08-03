/// Game state models — Bundelkhandi Chhakri
///
/// Dart equivalents of the server's ClientGameState, SeatState, and
/// related types.  These are received over the Socket.IO connection as
/// JSON and decoded here.

import 'card.dart';

// ---------------------------------------------------------------------------
// Game phase
// ---------------------------------------------------------------------------

enum GamePhase {
  dealing,
  primaryBid,
  primaryTrumpSelection,
  bidding,
  trumpSelection,
  playing,
  trickEnded,
  roundEnded,
  gameEnded;

  static GamePhase fromString(String s) {
    switch (s) {
      case 'dealing':
        return GamePhase.dealing;
      case 'primary_bid':
        return GamePhase.primaryBid;
      case 'primary_trump_selection':
        return GamePhase.primaryTrumpSelection;
      case 'bidding':
        return GamePhase.bidding;
      case 'trump_selection':
        return GamePhase.trumpSelection;
      case 'playing':
        return GamePhase.playing;
      case 'trick_ended':
        return GamePhase.trickEnded;
      case 'round_ended':
        return GamePhase.roundEnded;
      case 'game_ended':
        return GamePhase.gameEnded;
      default:
        return GamePhase.dealing;
    }
  }

  bool get isActive =>
      this != GamePhase.roundEnded && this != GamePhase.gameEnded;

  bool get isBidding =>
      this == GamePhase.primaryBid ||
      this == GamePhase.bidding ||
      this == GamePhase.primaryTrumpSelection ||
      this == GamePhase.trumpSelection;

  bool get isPlaying => this == GamePhase.playing || this == GamePhase.trickEnded;
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

enum ConnectionState {
  connected,
  disconnected,
  reconnecting,
  aiPlaying;

  static ConnectionState fromString(String s) {
    switch (s) {
      case 'CONNECTED':
        return ConnectionState.connected;
      case 'DISCONNECTED':
        return ConnectionState.disconnected;
      case 'RECONNECTING':
        return ConnectionState.reconnecting;
      case 'AI_PLAYING':
        return ConnectionState.aiPlaying;
      default:
        return ConnectionState.connected;
    }
  }

  bool get isOnline => this == ConnectionState.connected;
}

// ---------------------------------------------------------------------------
// Seat state (opponent-visible portion only — as sent by server)
// ---------------------------------------------------------------------------

class SeatState {
  const SeatState({
    required this.userId,
    required this.displayName,
    required this.team,
    this.hand,
    this.secretHand,
    required this.faceDownCount,
    required this.faceUp,
    required this.tricksWon,
    required this.pointsCaptured,
    required this.connectionState,
    required this.isAi,
    this.aiDifficulty,
  });

  final String? userId;
  final String displayName;
  final int team; // 0 or 1
  final List<PlayingCard>? hand; // null for opponents
  final List<PlayingCard>? secretHand; // null for opponents
  final int faceDownCount; // only count visible to opponents
  final List<PlayingCard> faceUp; // always visible
  final int tricksWon;
  final int pointsCaptured;
  final ConnectionState connectionState;
  final bool isAi;
  final String? aiDifficulty;

  bool get isConnected => connectionState.isOnline;

  factory SeatState.fromJson(Map<String, dynamic> json) {
    List<PlayingCard>? parseCards(dynamic v) {
      if (v == null) return null;
      return (v as List).map((c) => PlayingCard.fromCode(c as String)).toList();
    }

    return SeatState(
      userId: json['userId'] as String?,
      displayName: json['displayName'] as String? ?? '?',
      team: (json['team'] as num?)?.toInt() ?? 0,
      hand: parseCards(json['hand']),
      secretHand: parseCards(json['secretHand']),
      faceDownCount: (json['faceDownCount'] as num?)?.toInt() ?? 0,
      faceUp: parseCards(json['faceUp']) ?? [],
      tricksWon: (json['tricksWon'] as num?)?.toInt() ?? 0,
      pointsCaptured: (json['pointsCaptured'] as num?)?.toInt() ?? 0,
      connectionState: ConnectionState.fromString(
        json['connectionState'] as String? ?? 'CONNECTED',
      ),
      isAi: json['isAi'] as bool? ?? false,
      aiDifficulty: json['aiDifficulty'] as String?,
    );
  }
}

// ---------------------------------------------------------------------------
// Trick card
// ---------------------------------------------------------------------------

class TrickCard {
  const TrickCard({required this.seat, required this.card});
  final int seat;
  final PlayingCard card;

  factory TrickCard.fromJson(Map<String, dynamic> json) => TrickCard(
        seat: (json['seat'] as num).toInt(),
        card: PlayingCard.fromCode(json['card'] as String),
      );
}

// ---------------------------------------------------------------------------
// Client game state (authoritative view for the local player)
// ---------------------------------------------------------------------------

class ClientGameState {
  const ClientGameState({
    required this.gameId,
    required this.roundNumber,
    required this.phase,
    required this.sequence,
    required this.seats,
    required this.mySeat,
    required this.myHand,
    required this.mySecretHand,
    required this.myFaceDown,
    required this.myFaceUp,
    required this.dealerSeat,
    required this.currentBidderSeat,
    required this.highestBid,
    required this.highestBidderSeat,
    required this.biddingStatus,
    required this.trumpSuit,
    this.primaryTrump,
    required this.noTrump,
    required this.currentTrickLeaderSeat,
    required this.currentTrick,
    required this.completedTricksThisRound,
    required this.team0Score,
    required this.team1Score,
    required this.targetScore,
  });

  final String gameId;
  final int roundNumber;
  final GamePhase phase;
  final int sequence;
  final Map<int, SeatState> seats;

  // My cards (convenience aliases)
  final int mySeat;
  final List<PlayingCard> myHand;
  final List<PlayingCard> mySecretHand;
  final List<PlayingCard> myFaceDown;
  final List<PlayingCard> myFaceUp;

  // Bidding
  final int dealerSeat;
  final int? currentBidderSeat;
  final int highestBid;
  final int? highestBidderSeat;
  final String biddingStatus; // "ongoing" | "won" | "redeal"

  // Trump
  final Suit? trumpSuit;
  /// Primary trump selected during the primary_trump_selection phase.
  /// Displayed during regular bidding so all players see the declared suit.
  /// Null before primary trump selection has occurred.
  final Suit? primaryTrump;
  final bool noTrump;

  // Trick-taking
  final int? currentTrickLeaderSeat;
  final List<TrickCard> currentTrick;
  final int completedTricksThisRound;

  // Scoring
  final int team0Score;
  final int team1Score;
  final int targetScore;

  factory ClientGameState.fromJson(Map<String, dynamic> json) {
    List<PlayingCard> parseCards(dynamic v) =>
        (v as List? ?? []).map((c) => PlayingCard.fromCode(c as String)).toList();

    final seatsRaw = json['seats'] as Map<String, dynamic>? ?? {};
    final seats = <int, SeatState>{
      for (final entry in seatsRaw.entries)
        int.parse(entry.key): SeatState.fromJson(entry.value as Map<String, dynamic>),
    };

    final trickRaw = json['currentTrick'] as List? ?? [];
    final trick = trickRaw
        .map((t) => TrickCard.fromJson(t as Map<String, dynamic>))
        .toList();

    return ClientGameState(
      gameId: json['gameId'] as String,
      roundNumber: (json['roundNumber'] as num?)?.toInt() ?? 1,
      phase: GamePhase.fromString(json['phase'] as String? ?? 'dealing'),
      sequence: (json['sequence'] as num?)?.toInt() ?? 0,
      seats: seats,
      mySeat: (json['mySeat'] as num).toInt(),
      myHand: parseCards(json['myHand']),
      mySecretHand: parseCards(json['mySecretHand']),
      myFaceDown: parseCards(json['myFaceDown']),
      myFaceUp: parseCards(json['myFaceUp']),
      dealerSeat: (json['dealerSeat'] as num?)?.toInt() ?? 0,
      currentBidderSeat: (json['currentBidderSeat'] as num?)?.toInt(),
      highestBid: (json['highestBid'] as num?)?.toInt() ?? 0,
      highestBidderSeat: (json['highestBidderSeat'] as num?)?.toInt(),
      biddingStatus: json['biddingStatus'] as String? ?? 'ongoing',
      trumpSuit: Suit.fromCode(json['trumpSuit'] as String?),
      primaryTrump: Suit.fromCode(json['primaryTrump'] as String?),
      noTrump: json['noTrump'] as bool? ?? false,
      currentTrickLeaderSeat: (json['currentTrickLeaderSeat'] as num?)?.toInt(),
      currentTrick: trick,
      completedTricksThisRound:
          (json['completedTricksThisRound'] as num?)?.toInt() ?? 0,
      team0Score: (json['team0Score'] as num?)?.toInt() ?? 0,
      team1Score: (json['team1Score'] as num?)?.toInt() ?? 0,
      targetScore: (json['targetScore'] as num?)?.toInt() ?? 52,
    );
  }

  SeatState? get mySeatState => seats[mySeat];

  /// Returns true if it is currently my turn.
  ///
  /// Covers all action phases:
  ///   • Bidding phases  — currentBidderSeat matches
  ///   • Trump phases    — highestBidderSeat matches (I won the bid)
  ///   • Playing phases  — it is my position in the current trick
  bool get isMyTurn =>
      // Primary bid / regular bidding: I am the current bidder
      currentBidderSeat == mySeat ||
      // Trump selection (primary or final): I am the highest bidder
      ((phase == GamePhase.primaryTrumpSelection ||
              phase == GamePhase.trumpSelection) &&
          highestBidderSeat == mySeat) ||
      // Playing / trick-ended: it is my turn in the trick
      (phase.isPlaying && _isMyTrickTurn);

  bool get _isMyTrickTurn {
    if (currentTrickLeaderSeat == null) return false;
    final expected =
        (currentTrickLeaderSeat! + currentTrick.length) % seats.length;
    return expected == mySeat;
  }

  int get myTeam => mySeat % 2;
  int get myTeamScore => myTeam == 0 ? team0Score : team1Score;
  int get opponentTeamScore => myTeam == 0 ? team1Score : team0Score;
}
