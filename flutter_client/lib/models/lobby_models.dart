/// Lobby data models for Bundelkhandi Chhakri.
///
/// These map 1:1 with the Socket.IO types defined in
/// artifacts/api-server/src/socket/types.ts and the HTTP response
/// from GET /api/rooms.
///
/// RoomSummary  — lightweight, used in the room list.
/// LobbyPlayer  — player within a room (seat, team, ready state).
/// RoomDetail   — full room state (summary + players list).
/// ChatMessage  — ephemeral pre-game chat message.

// ---------------------------------------------------------------------------
// RoomSummary
// ---------------------------------------------------------------------------

class RoomSummary {
  const RoomSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.hostUserId,
    required this.targetScore,
    required this.gameMode,
    required this.isPrivate,
    required this.status,
    required this.playerCount,
    required this.maxPlayers,
  });

  final String id;
  final String code;
  final String name;
  final String hostUserId;
  final int targetScore;
  final String gameMode;
  final bool isPrivate;
  final String status;
  final int playerCount;
  final int maxPlayers;

  bool get isFull => playerCount >= maxPlayers;
  bool get isJoinable => status == 'waiting' && !isFull;

  factory RoomSummary.fromJson(Map<String, dynamic> json) => RoomSummary(
        id: json['id'] as String,
        code: json['code'] as String,
        name: json['name'] as String,
        hostUserId: json['hostUserId'] as String,
        targetScore: (json['targetScore'] as num).toInt(),
        gameMode: json['gameMode'] as String,
        isPrivate: json['isPrivate'] as bool,
        status: json['status'] as String,
        playerCount: (json['playerCount'] as num).toInt(),
        maxPlayers: (json['maxPlayers'] as num).toInt(),
      );
}

// ---------------------------------------------------------------------------
// LobbyPlayer
// ---------------------------------------------------------------------------

class LobbyPlayer {
  const LobbyPlayer({
    required this.userId,
    required this.displayName,
    required this.avatarUrl,
    required this.eloRating,
    required this.isGuest,
    required this.isAi,
    required this.seat,
    required this.isReady,
    required this.isAdmin,
  });

  final String userId;
  final String displayName;
  final String? avatarUrl;
  final int eloRating;
  final bool isGuest;
  final bool isAi;
  final int seat;
  final bool isReady;
  final bool isAdmin;

  /// Team is derived from seat number (seat % 2).
  /// Team 0 → seats 0, 2, 4. Team 1 → seats 1, 3, 5.
  int get team => seat % 2;

  LobbyPlayer copyWith({bool? isReady, bool? isAdmin}) => LobbyPlayer(
        userId: userId,
        displayName: displayName,
        avatarUrl: avatarUrl,
        eloRating: eloRating,
        isGuest: isGuest,
        isAi: isAi,
        seat: seat,
        isReady: isReady ?? this.isReady,
        isAdmin: isAdmin ?? this.isAdmin,
      );

  factory LobbyPlayer.fromJson(Map<String, dynamic> json) => LobbyPlayer(
        userId: json['userId'] as String,
        displayName: json['displayName'] as String,
        avatarUrl: json['avatarUrl'] as String?,
        eloRating: (json['eloRating'] as num? ?? 0).toInt(),
        isGuest: json['isGuest'] as bool? ?? false,
        isAi: json['isAi'] as bool? ?? false,
        seat: (json['seat'] as num).toInt(),
        isReady: json['isReady'] as bool? ?? false,
        isAdmin: json['isAdmin'] as bool? ?? false,
      );
}

// ---------------------------------------------------------------------------
// RoomDetail
// ---------------------------------------------------------------------------

/// Full room state — a RoomSummary plus the live players list.
///
/// Uses composition: [summary] holds all scalar fields, [players] is the live
/// roster. [playerCount] is derived from [players.length] so it's always
/// accurate after incremental updates (lobby:player_joined / left).
class RoomDetail {
  const RoomDetail({required this.summary, required this.players});

  final RoomSummary summary;
  final List<LobbyPlayer> players;

  // Forward RoomSummary fields so callers don't have to reach into summary.
  String get id => summary.id;
  String get code => summary.code;
  String get name => summary.name;
  String get hostUserId => summary.hostUserId;
  int get targetScore => summary.targetScore;
  String get gameMode => summary.gameMode;
  bool get isPrivate => summary.isPrivate;
  String get status => summary.status;
  int get maxPlayers => summary.maxPlayers;

  // Derived — always reflects the actual player list.
  int get playerCount => players.length;
  bool get isFull => playerCount >= maxPlayers;

  /// Return a new RoomDetail with a different players list.
  RoomDetail withPlayers(List<LobbyPlayer> newPlayers) =>
      RoomDetail(summary: summary, players: newPlayers);

  factory RoomDetail.fromJson(Map<String, dynamic> json) {
    final summary = RoomSummary.fromJson(json);
    final players = (json['players'] as List<dynamic>? ?? [])
        .map((p) => LobbyPlayer.fromJson(p as Map<String, dynamic>))
        .toList();
    return RoomDetail(summary: summary, players: players);
  }

  factory RoomDetail.fromSummaryAndPlayers({
    required RoomSummary summary,
    required List<LobbyPlayer> players,
  }) =>
      RoomDetail(summary: summary, players: players);
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

class ChatMessage {
  const ChatMessage({
    required this.userId,
    required this.displayName,
    required this.message,
    required this.timestamp,
  });

  final String userId;
  final String displayName;
  final String message;
  final DateTime timestamp;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        userId: json['userId'] as String,
        displayName: json['displayName'] as String,
        message: json['message'] as String,
        timestamp: DateTime.parse(json['timestamp'] as String).toLocal(),
      );
}
