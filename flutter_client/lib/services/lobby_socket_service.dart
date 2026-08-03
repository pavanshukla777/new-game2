/// LobbySocketService — Socket.IO /lobby namespace client.
///
/// Connects to the backend /lobby namespace after authentication.
/// Manages the full lifecycle: connect → room interactions → disconnect.
///
/// Design:
///   - ChangeNotifier so widgets rebuild reactively via ref.watch.
///   - connect() called by lobbySocketServiceProvider when auth succeeds.
///   - disconnect() called on logout or provider disposal.
///   - All emitWithAck events return Future<String?> (null = success, error message otherwise).
///   - leaveRoom() is optimistic: clears local state immediately, then fires the
///     socket event. The /lobby namespace backend handler for leave_room has a
///     no-payload-no-ack design mismatch with socket_io_client Dart; the optimistic
///     approach guarantees correct client UX regardless of server ack delivery.
///
/// [MIG-034] One-device enforcement: if kicked (lobby:kicked), connection error is set.
/// [MIG-041] Room event protocol matches socket/types.ts LobbyClientToServerEvents.

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/lobby_models.dart';
import 'api_client.dart';

class LobbySocketService extends ChangeNotifier {
  LobbySocketService({
    required this.serverUrl,
    required this.apiClient,
  });

  final String serverUrl;
  final ApiClient apiClient;

  io.Socket? _socket;

  // ── Connection ──────────────────────────────────────────────────────────────
  bool _isConnected = false;
  bool _isConnecting = false;
  String? _connectionError;

  // ── Identity (filled when connect is called) ─────────────────────────────
  String? _myUserId;
  String? _myDisplayName;
  bool _myIsGuest = false;
  String? _accessToken;

  // ── Room list ─────────────────────────────────────────────────────────────
  List<RoomSummary> _rooms = [];
  bool _isLoadingRooms = false;

  // ── Current room ──────────────────────────────────────────────────────────
  RoomDetail? _currentRoom;
  bool _isCreatingRoom = false;
  bool _isJoiningRoom = false;

  // ── Chat ─────────────────────────────────────────────────────────────────
  static const _maxChatMessages = 100;
  final List<ChatMessage> _chatMessages = [];

  // ── Game start ───────────────────────────────────────────────────────────
  String? _startingGameId;
  bool _gameStarted = false;

  // ---------------------------------------------------------------------------
  // Public getters
  // ---------------------------------------------------------------------------

  bool get isConnected => _isConnected;
  bool get isConnecting => _isConnecting;
  String? get connectionError => _connectionError;

  List<RoomSummary> get rooms => List.unmodifiable(_rooms);
  bool get isLoadingRooms => _isLoadingRooms;

  RoomDetail? get currentRoom => _currentRoom;
  bool get isCreatingRoom => _isCreatingRoom;
  bool get isJoiningRoom => _isJoiningRoom;

  List<ChatMessage> get chatMessages => List.unmodifiable(_chatMessages);

  String? get startingGameId => _startingGameId;
  bool get gameStarted => _gameStarted;

  String? get myUserId => _myUserId;

  bool get amAdmin => _findMe()?.isAdmin ?? false;
  bool get isMyReady => _findMe()?.isReady ?? false;

  // ---------------------------------------------------------------------------
  // connect — set up the /lobby socket after authentication
  // ---------------------------------------------------------------------------

  void connect(
    String token, {
    required String userId,
    required String displayName,
    required bool isGuest,
  }) {
    // Idempotent: skip if already connected as this user with the same token.
    if (_myUserId == userId && _isConnected && _accessToken == token) return;

    _accessToken = token;
    _myUserId = userId;
    _myDisplayName = displayName;
    _myIsGuest = isGuest;

    // Tear down any existing socket before creating a new one.
    _socket?.dispose();
    _isConnecting = true;
    _isConnected = false;
    _connectionError = null;
    notifyListeners();

    _socket = io.io(
      '$serverUrl/lobby',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(9999)
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(10000)
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _isConnected = true;
        _isConnecting = false;
        _connectionError = null;
        // Reconnect-during-countdown: if game_starting was received before the
        // socket dropped, game_started may already have been emitted while we
        // were offline.  Mark the game as started now so the UI navigates to
        // the game screen without waiting for an event that will never arrive.
        if (_startingGameId != null && !_gameStarted) {
          _gameStarted = true;
        }
        notifyListeners();
        // Skip room list refresh when transitioning to or already in a game.
        if (_currentRoom == null && !_gameStarted) loadRooms();
      })
      ..onDisconnect((_) {
        _isConnected = false;
        // Clear room membership on disconnect: after reconnection the server
        // creates a fresh socket with no room context, so the local state
        // would be stale. User must rejoin the room.
        _currentRoom = null;
        _chatMessages.clear();
        // [RC-FIX] Reset in-flight action guards so the UI re-enables
        // buttons after reconnection.  Without this, a socket drop while a
        // createRoom or joinRoom ack is in-flight leaves _isCreatingRoom /
        // _isJoiningRoom = true permanently (the ack callback never fires),
        // disabling the FAB and all Join buttons until the app is restarted.
        _isCreatingRoom = false;
        _isJoiningRoom = false;
        notifyListeners();
      })
      ..onConnectError((data) {
        _isConnecting = false;
        _connectionError = data?.toString() ?? 'Connection failed';
        notifyListeners();
      })
      ..onReconnecting((_) {
        _isConnecting = true;
        notifyListeners();
      })
      ..on('lobby:player_joined', _onPlayerJoined)
      ..on('lobby:player_left', _onPlayerLeft)
      ..on('lobby:player_ready_changed', _onPlayerReadyChanged)
      ..on('lobby:room_updated', _onRoomUpdated)
      ..on('lobby:rooms_updated', _onRoomsUpdated)
      ..on('lobby:chat_message', _onChatMessage)
      ..on('lobby:game_starting', _onGameStarting)
      ..on('lobby:game_started', _onGameStarted)
      ..on('lobby:kicked', _onKicked)
      ..connect();
  }

  // ---------------------------------------------------------------------------
  // disconnect — call on logout or provider disposal
  // ---------------------------------------------------------------------------

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
    _isConnecting = false;
    _connectionError = null;
    _rooms = [];
    _currentRoom = null;
    _chatMessages.clear();
    _startingGameId = null;
    _gameStarted = false;
    // [RC-FIX] Reset in-flight action guards (mirrors onDisconnect reset).
    _isCreatingRoom = false;
    _isJoiningRoom = false;
    _myUserId = null;
    _myDisplayName = null;
    _accessToken = null;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // loadRooms — GET /api/rooms
  // ---------------------------------------------------------------------------

  Future<void> loadRooms() async {
    if (_accessToken == null) return;
    _isLoadingRooms = true;
    notifyListeners();
    try {
      _rooms = await apiClient.getRooms(accessToken: _accessToken!);
    } on ApiException catch (e) {
      // Non-fatal: just leave the old list in place.
      debugPrint('LobbySocketService.loadRooms error: $e');
    } catch (e) {
      debugPrint('LobbySocketService.loadRooms unexpected error: $e');
    } finally {
      _isLoadingRooms = false;
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // createRoom
  // ---------------------------------------------------------------------------

  /// Returns null on success, or an error code string on failure.
  Future<String?> createRoom({
    required String name,
    required String gameMode,
    required bool isPrivate,
    required int maxPlayers,
  }) async {
    if (_socket == null || !_isConnected) return 'Not connected';
    if (name.trim().isEmpty) return 'Room name cannot be empty';

    // [PROD-4 fix] Capture identity fields as locals before the async gap.
    // If disconnect() is called while the ack is in-flight (e.g. logout),
    // _myUserId and _myDisplayName are set to null.  The ack callback must
    // not use null-assertion operators on instance fields it did not
    // observe to be non-null at the time of the call.
    final myUserId = _myUserId;
    final myDisplayName = _myDisplayName;
    final myIsGuest = _myIsGuest;
    if (myUserId == null || myDisplayName == null) return 'Not authenticated';

    _isCreatingRoom = true;
    notifyListeners();

    final completer = Completer<String?>();

    _socket!.emitWithAck(
      'lobby:create_room',
      {
        'name': name.trim(),
        'targetScore': 52, // fixed per backend type spec
        'gameMode': gameMode,
        'isPrivate': isPrivate,
        'maxPlayers': maxPlayers,
      },
      ack: (dynamic response) {
        _isCreatingRoom = false;
        try {
          final data = response as Map<String, dynamic>;
          if (data['ok'] == true) {
            final roomJson = data['room'] as Map<String, dynamic>;
            final summary = RoomSummary.fromJson(roomJson);
            // Construct RoomDetail: backend inserts creator as seat 0 + isAdmin.
            _currentRoom = RoomDetail.fromSummaryAndPlayers(
              summary: summary,
              players: [
                LobbyPlayer(
                  userId: myUserId,
                  displayName: myDisplayName,
                  avatarUrl: null,
                  eloRating: 0,
                  isGuest: myIsGuest,
                  isAi: false,
                  seat: 0,
                  isReady: false,
                  isAdmin: true,
                ),
              ],
            );
            _chatMessages.clear();
            notifyListeners();
            completer.complete(null);
          } else {
            final err = data['error'] as String? ?? 'Failed to create room';
            notifyListeners();
            completer.complete(err);
          }
        } catch (e) {
          notifyListeners();
          completer.complete('Unexpected server response');
        }
      },
    );

    return completer.future;
  }

  // ---------------------------------------------------------------------------
  // joinRoom
  // ---------------------------------------------------------------------------

  /// Returns null on success, or a user-facing error string on failure.
  Future<String?> joinRoom({String? roomId, String? code}) async {
    if (_socket == null || !_isConnected) return 'Not connected';
    if (roomId == null && code == null) return 'Room ID or code required';

    _isJoiningRoom = true;
    notifyListeners();

    final completer = Completer<String?>();

    final payload = <String, dynamic>{};
    if (roomId != null) payload['roomId'] = roomId;
    if (code != null) payload['code'] = code.toUpperCase();
    // seatPreference omitted → backend assigns lowest available seat.

    _socket!.emitWithAck(
      'lobby:join_room',
      payload,
      ack: (dynamic response) {
        _isJoiningRoom = false;
        try {
          final data = response as Map<String, dynamic>;
          if (data['ok'] == true) {
            _currentRoom = RoomDetail.fromJson(
              data['room'] as Map<String, dynamic>,
            );
            _chatMessages.clear();
            notifyListeners();
            completer.complete(null);
          } else {
            final code = data['error'] as String? ?? 'JOIN_FAILED';
            notifyListeners();
            completer.complete(_joinErrorToMessage(code));
          }
        } catch (e) {
          notifyListeners();
          completer.complete('Unexpected server response');
        }
      },
    );

    return completer.future;
  }

  // ---------------------------------------------------------------------------
  // leaveRoom — optimistic: clear local state first, then notify server
  // ---------------------------------------------------------------------------

  void leaveRoom() {
    _currentRoom = null;
    _chatMessages.clear();
    _startingGameId = null;
    _gameStarted = false;
    notifyListeners();
    // Fire-and-forget. The backend cleans up DB and broadcasts player_left.
    // See class-level doc for the ack mismatch note.
    _socket?.emit('lobby:leave_room', {});
  }

  // ---------------------------------------------------------------------------
  // setReady
  // ---------------------------------------------------------------------------

  Future<String?> setReady(bool isReady) async {
    if (_socket == null || !_isConnected) return 'Not connected';
    if (_currentRoom == null) return 'Not in a room';

    final completer = Completer<String?>();

    _socket!.emitWithAck(
      'lobby:set_ready',
      {'isReady': isReady},
      ack: (dynamic response) {
        try {
          final data = response as Map<String, dynamic>;
          if (data['ok'] == true) {
            // Update local state optimistically; server will also broadcast
            // lobby:player_ready_changed which will reconcile.
            _updateMyReady(isReady);
            completer.complete(null);
          } else {
            completer.complete(data['error'] as String? ?? 'Failed to set ready');
          }
        } catch (_) {
          completer.complete('Unexpected server response');
        }
      },
    );

    return completer.future;
  }

  // ---------------------------------------------------------------------------
  // sendChat
  // ---------------------------------------------------------------------------

  void sendChat(String message) {
    final trimmed = message.trim();
    if (trimmed.isEmpty || _currentRoom == null) return;
    _socket?.emit('lobby:chat', {'message': trimmed});
  }

  // ---------------------------------------------------------------------------
  // kickPlayer (admin only)
  // ---------------------------------------------------------------------------

  Future<String?> kickPlayer(String targetUserId) async {
    if (_socket == null || !_isConnected) return 'Not connected';
    if (!amAdmin) return 'Not authorised';

    final completer = Completer<String?>();

    _socket!.emitWithAck(
      'lobby:kick_player',
      {'targetUserId': targetUserId},
      ack: (dynamic response) {
        try {
          final data = response as Map<String, dynamic>;
          completer.complete(
            data['ok'] == true ? null : (data['error'] as String? ?? 'Kick failed'),
          );
        } catch (_) {
          completer.complete('Unexpected server response');
        }
      },
    );

    return completer.future;
  }

  // ---------------------------------------------------------------------------
  // acknowledgeGameStart — call after user dismisses the game-started dialog
  // ---------------------------------------------------------------------------

  void acknowledgeGameStart() {
    _gameStarted = false;
    _startingGameId = null;
    // Room membership will be reassigned by the game phase; clear it.
    _currentRoom = null;
    _chatMessages.clear();
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // clearConnectionError
  // ---------------------------------------------------------------------------

  void clearConnectionError() {
    _connectionError = null;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Incoming event handlers
  // ---------------------------------------------------------------------------

  void _onPlayerJoined(dynamic data) {
    if (data is! Map<String, dynamic> || _currentRoom == null) return;
    final playerJson = data['player'] as Map<String, dynamic>?;
    if (playerJson == null) return;

    // Merge missing fields before parsing (lobby:player_joined omits isReady/isAdmin)
    final merged = {
      'isReady': false,
      'isAdmin': false,
      'eloRating': 0,
      'isGuest': false,
      'isAi': false,
      'avatarUrl': null,
      ...playerJson,
    };
    final player = LobbyPlayer.fromJson(merged);
    final updated = List<LobbyPlayer>.from(_currentRoom!.players)..add(player);
    _currentRoom = _currentRoom!.withPlayers(updated);
    notifyListeners();
  }

  void _onPlayerLeft(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final leftUserId = data['userId'] as String?;
    if (leftUserId == null) return;

    if (leftUserId == _myUserId) {
      // We were kicked by admin.
      _connectionError = 'You were removed from the room.';
      _currentRoom = null;
      _chatMessages.clear();
      notifyListeners();
      return;
    }

    if (_currentRoom == null) return;

    // Remove the departing player.
    var updated = _currentRoom!.players
        .where((p) => p.userId != leftUserId)
        .toList();

    // If admin role transferred (leave_room emits newAdminUserId), update the
    // isAdmin badge on the newly-promoted player so the SeatGrid updates
    // immediately without waiting for a full room-state refresh.
    final newAdminUserId = data['newAdminUserId'] as String?;
    if (newAdminUserId != null) {
      updated = updated
          .map((p) => p.copyWith(isAdmin: p.userId == newAdminUserId))
          .toList();
    }

    _currentRoom = _currentRoom!.withPlayers(updated);
    notifyListeners();
  }

  void _onPlayerReadyChanged(dynamic data) {
    if (data is! Map<String, dynamic> || _currentRoom == null) return;
    final uid = data['userId'] as String?;
    final ready = data['isReady'] as bool?;
    if (uid == null || ready == null) return;

    final updated = _currentRoom!.players.map((p) {
      return p.userId == uid ? p.copyWith(isReady: ready) : p;
    }).toList();
    _currentRoom = _currentRoom!.withPlayers(updated);
    notifyListeners();
  }

  void _onRoomUpdated(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final roomJson = data['room'] as Map<String, dynamic>?;
    if (roomJson == null) return;
    _currentRoom = RoomDetail.fromJson(roomJson);
    notifyListeners();
  }

  void _onRoomsUpdated(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final list = data['rooms'] as List<dynamic>?;
    if (list == null) return;
    _rooms = list
        .map((r) => RoomSummary.fromJson(r as Map<String, dynamic>))
        .toList();
    notifyListeners();
  }

  void _onChatMessage(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final msg = ChatMessage.fromJson(data);
    _chatMessages.add(msg);
    // Cap the in-memory list to avoid unbounded growth.
    if (_chatMessages.length > _maxChatMessages) {
      _chatMessages.removeAt(0);
    }
    notifyListeners();
  }

  void _onGameStarting(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    _startingGameId = data['gameId'] as String?;
    notifyListeners();
  }

  void _onGameStarted(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    // Sync _startingGameId from game_started in case game_starting was missed
    // (e.g. the socket reconnected between the two events).
    final gameId = data['gameId'] as String?;
    if (gameId != null) _startingGameId = gameId;
    _gameStarted = true;
    notifyListeners();
  }

  void _onKicked(dynamic data) {
    // [MIG-034] Another device connected with the same account.
    _isConnected = false;
    _connectionError = 'Another device connected with your account.';
    _currentRoom = null;
    _chatMessages.clear();
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  LobbyPlayer? _findMe() {
    if (_myUserId == null || _currentRoom == null) return null;
    try {
      return _currentRoom!.players.firstWhere((p) => p.userId == _myUserId);
    } catch (_) {
      return null;
    }
  }

  void _updateMyReady(bool isReady) {
    if (_currentRoom == null || _myUserId == null) return;
    final updated = _currentRoom!.players.map((p) {
      return p.userId == _myUserId ? p.copyWith(isReady: isReady) : p;
    }).toList();
    _currentRoom = _currentRoom!.withPlayers(updated);
    notifyListeners();
  }

  static String _joinErrorToMessage(String code) {
    switch (code) {
      case 'ROOM_NOT_FOUND':
        return 'Room not found. Check the code and try again.';
      case 'ROOM_FULL':
        return 'That room is already full.';
      case 'ALREADY_IN_ROOM':
        return 'You are already in a room.';
      default:
        return 'Could not join room ($code).';
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  @override
  void dispose() {
    _socket?.dispose();
    super.dispose();
  }
}
