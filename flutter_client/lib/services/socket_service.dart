/// SocketService — Bundelkhandi Chhakri
///
/// Wraps socket_io_client to provide typed game socket communication.
/// Connects to the /game namespace with JWT auth.
///
/// Part 5: Full game socket lifecycle with:
///   • Authenticated connection to /game namespace.
///   • game:join emitted on first connect and automatically re-emitted on
///     every socket.io auto-reconnect so the server-side room membership is
///     always fresh.
///   • GameState preserved across temporary disconnects (network blips).
///     _gameState is only cleared by an explicit disconnect() call (logout).
///   • Sequence-number deduplication: out-of-order / duplicate state_update
///     events are silently dropped using ClientGameState.sequence.
///   • Idempotent joinGame: a second call while a join is already in-flight
///     is a no-op if it targets the same gameId.
///   • Duplicate socket protection: connect() disposes the old socket before
///     creating a new one; listeners are registered exactly once per socket.
///
/// Integration fixes (Volume 7 Part 1):
///   • GAP-1: game:emoji_reaction listener added; reactions surfaced via recentEmojis.
///   • GAP-2: sendBid/sendPass/sendSelectTrump/sendPlayCard upgraded to emitWithAck;
///            server rejection errors stored in _actionError and exposed to UI.
///   • GAP-3: _yourTurnPhase cleared when phase is still active but isMyTurn is false
///            (i.e. the turn advanced to another seat within the same phase).
///   • GAP-4: voice:offer / voice:answer / voice:ice_candidate / voice:mute_changed /
///            voice:player_hung_up listeners registered; data exposed for WebRTC consumer.
///   • GAP-5: game:admin_config_changed / game:admin_changed listeners registered.
///   • GAP-6: toggleMute() now emits voice:toggle_mute to the server so other players
///            see the correct mute indicator.
///
/// [MIG-033] Voice signalling events are relayed here.
/// [MIG-034] One-device enforcement: second login kicks old socket (server-side).

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/game_state.dart';

typedef CardSelectedCallback = void Function(String cardCode);
typedef BidSelectedCallback = void Function(int amount);

// ---------------------------------------------------------------------------
// Emoji reaction event
// ---------------------------------------------------------------------------

/// A single emoji reaction received from the server.
/// Stored transiently in [SocketService.recentEmojis]; callers should call
/// [SocketService.removeEmoji] after rendering to avoid duplicate display.
class EmojiReactionEvent {
  EmojiReactionEvent({
    required this.id,
    required this.seat,
    required this.emoji,
  });

  /// Unique identifier for deduplication / removal.
  final String id;
  final int seat;
  final String emoji;
}

// ---------------------------------------------------------------------------
// Incoming voice signal event (for WebRTC consumer)
// ---------------------------------------------------------------------------

/// Carries the payload of a voice signalling event forwarded by the server.
/// The caller is responsible for routing offers/answers/ICE to the WebRTC
/// peer connection for [fromSeat].
class VoiceSignalEvent {
  VoiceSignalEvent({
    required this.type,
    required this.fromSeat,
    this.sdp,
    this.candidate,
    this.isMuted,
  });

  /// 'offer' | 'answer' | 'ice_candidate' | 'mute_changed' | 'hung_up'
  final String type;
  final int fromSeat;
  final String? sdp;
  final String? candidate;
  final bool? isMuted;
}

// ---------------------------------------------------------------------------
// SocketService
// ---------------------------------------------------------------------------

class SocketService extends ChangeNotifier {
  SocketService({required this.serverUrl});

  final String serverUrl;

  io.Socket? _socket;

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  ClientGameState? _gameState;

  /// Highest sequence number applied to _gameState.
  /// Out-of-order / duplicate game:state_update events are dropped when their
  /// sequence ≤ _lastAppliedSequence.
  int _lastAppliedSequence = -1;

  // ---------------------------------------------------------------------------
  // Connection state
  // ---------------------------------------------------------------------------

  String? _error;
  bool _isConnected = false;

  // ---------------------------------------------------------------------------
  // Game room tracking — needed to rejoin after auto-reconnect
  // ---------------------------------------------------------------------------

  /// The gameId that was most recently joined via joinGame().
  /// Preserved across temporary disconnects so auto-reconnect can rejoin.
  /// Cleared only by an explicit disconnect() call.
  String? _currentGameId;

  /// True while a game:join ack is in-flight.
  /// Guards against duplicate join emissions on rapid reconnect/connect calls.
  bool _isJoining = false;

  // ---------------------------------------------------------------------------
  // Voice / mute
  // ---------------------------------------------------------------------------

  bool _isMuted = false;

  /// [GAP-4] Incoming voice signalling events from the server, queued for the
  /// WebRTC consumer. Callers drain this list and call removeVoiceSignal().
  final List<VoiceSignalEvent> _pendingVoiceSignals = [];

  // ---------------------------------------------------------------------------
  // Your-turn notification
  // ---------------------------------------------------------------------------

  String? _yourTurnPhase;
  List<Map<String, dynamic>> _validActions = [];
  DateTime? _turnTimeoutAt;

  // ---------------------------------------------------------------------------
  // [GAP-1] Emoji reactions
  // ---------------------------------------------------------------------------

  final List<EmojiReactionEvent> _recentEmojis = [];

  // ---------------------------------------------------------------------------
  // [GAP-2] Action error — set when the server rejects a game action.
  // ---------------------------------------------------------------------------

  String? _actionError;

  // ---------------------------------------------------------------------------
  // Game-end winner — captured from the server-authoritative GAME_ENDED event.
  // ---------------------------------------------------------------------------

  /// 0 = Team A, 1 = Team B, null = game not yet ended or winner not received.
  int? _gameWinnerTeam;

  // ---------------------------------------------------------------------------
  // [GAP-5] Admin config (latest values broadcast by server)
  // ---------------------------------------------------------------------------

  int? _adminTurnTimerSeconds;
  int? _adminReconnectWindowSeconds;

  // ---------------------------------------------------------------------------
  // Public getters
  // ---------------------------------------------------------------------------

  ClientGameState? get gameState => _gameState;
  String? get error => _error;
  bool get isConnected => _isConnected;
  bool get isMuted => _isMuted;
  bool get isMyTurn => _yourTurnPhase != null;
  String? get yourTurnPhase => _yourTurnPhase;
  List<Map<String, dynamic>> get validActions => _validActions;
  DateTime? get turnTimeoutAt => _turnTimeoutAt;

  /// Server-authoritative winning team from the GAME_ENDED event.
  /// 0 = Team A won, 1 = Team B won, null = game not yet ended.
  /// Prefer this over score-based heuristics in the UI (handles doobna and
  /// Perfect-8 endings that may not cross targetScore from the loser's side).
  int? get gameWinnerTeam => _gameWinnerTeam;

  /// [GAP-1] Unprocessed emoji reactions. Callers should call removeEmoji()
  /// after rendering each one to avoid duplicate display.
  List<EmojiReactionEvent> get recentEmojis => List.unmodifiable(_recentEmojis);

  /// [GAP-2] Latest server rejection message for a game action (bid, play card,
  /// trump selection). Cleared by clearActionError().
  String? get actionError => _actionError;

  /// [GAP-4] Pending voice signal events forwarded from the server.
  List<VoiceSignalEvent> get pendingVoiceSignals =>
      List.unmodifiable(_pendingVoiceSignals);

  /// [GAP-5] Turn timer duration set by admin (seconds), null = default.
  int? get adminTurnTimerSeconds => _adminTurnTimerSeconds;

  /// [GAP-5] Reconnect window duration set by admin (seconds), null = default.
  int? get adminReconnectWindowSeconds => _adminReconnectWindowSeconds;

  // ---------------------------------------------------------------------------
  // Mutators / helpers for consumers
  // ---------------------------------------------------------------------------

  /// [GAP-2] Clear a previously surfaced action error after the UI has shown it.
  void clearActionError() {
    if (_actionError == null) return;
    _actionError = null;
    notifyListeners();
  }

  /// [GAP-1] Remove a processed emoji reaction so it is not shown again.
  void removeEmoji(String id) {
    _recentEmojis.removeWhere((e) => e.id == id);
    // No notifyListeners here — the removal is a side-effect of rendering,
    // not a state change that requires another rebuild.
  }

  /// [GAP-4] Remove a processed voice signal.
  void removeVoiceSignal(String type, int fromSeat) {
    _pendingVoiceSignals
        .removeWhere((e) => e.type == type && e.fromSeat == fromSeat);
  }

  // ---------------------------------------------------------------------------
  // Connect to /game namespace
  //
  // Safe to call multiple times (e.g. on token refresh): disposes the old
  // socket, creates a new one, and re-registers all listeners.
  // _currentGameId is intentionally NOT cleared here so that the new socket's
  // onConnect handler can re-emit game:join for the active game.
  // ---------------------------------------------------------------------------

  void connect(String token) {
    _socket?.dispose();
    // Reset the join guard so the new socket's onConnect can call joinGame.
    _isJoining = false;

    _socket = io.io(
      '$serverUrl/game',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(2147483647)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _isConnected = true;
        _error = null;
        // Auto-reconnect path: if we were already in a game, re-emit game:join
        // so the server restores room membership and sends a fresh snapshot.
        // _gameState is preserved (not cleared) so the UI stays populated
        // while the rejoin ack is in-flight.
        if (_currentGameId != null && !_isJoining) {
          _rejoinGame(_currentGameId!);
        }
        notifyListeners();
      })
      ..onDisconnect((_) {
        _isConnected = false;
        // [NET-6 fix] Reset the join guard so that when the socket
        // auto-reconnects, _rejoinGame() is allowed to fire.
        // Without this, a mid-join disconnect leaves _isJoining = true
        // forever and the auto-rejoin path is silently skipped.
        _isJoining = false;
        // Intentionally preserve _gameState and _currentGameId here.
        // This is a temporary disconnect (network blip or server restart).
        // The UI keeps showing the last known game state instead of blanking.
        notifyListeners();
      })
      ..onConnectError((data) {
        _error = data?.toString() ?? 'Connection failed';
        notifyListeners();
      })
      // ── Core game events ─────────────────────────────────────────────────
      ..on('game:state_update', _onStateUpdate)
      ..on('game:your_turn', _onYourTurn)
      ..on('game:player_disconnected', _onPlayerDisconnected)
      ..on('game:player_reconnected', _onPlayerReconnected)
      ..on('game:player_timeout', _onPlayerTimeout)
      // [GAP-1] Emoji reactions broadcast to all players in the game room.
      ..on('game:emoji_reaction', _onEmojiReaction)
      // ── Voice signalling [GAP-4] ─────────────────────────────────────────
      // These events are registered here so the plumbing exists; a WebRTC
      // consumer layer calls pendingVoiceSignals / removeVoiceSignal().
      ..on('voice:offer', _onVoiceOffer)
      ..on('voice:answer', _onVoiceAnswer)
      ..on('voice:ice_candidate', _onVoiceIceCandidate)
      ..on('voice:mute_changed', _onVoiceMuteChanged)
      ..on('voice:player_hung_up', _onVoicePlayerHungUp)
      // ── Admin events [GAP-5] ─────────────────────────────────────────────
      ..on('game:admin_config_changed', _onAdminConfigChanged)
      ..on('game:admin_changed', _onAdminChanged)
      // ── One-device enforcement ────────────────────────────────────────────
      ..on('kicked', (_) {
        // [MIG-034] Old socket was kicked by a new login on another device.
        _error = 'You connected on another device.';
        notifyListeners();
      })
      ..connect();
  }

  // ---------------------------------------------------------------------------
  // Disconnect — called on logout or app teardown.
  // Clears ALL state including the current game, because the user is leaving.
  // For temporary network drops, the socket auto-reconnects; this is not called.
  // ---------------------------------------------------------------------------

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
    _gameState = null;
    _currentGameId = null;
    _isJoining = false;
    _lastAppliedSequence = -1;
    _yourTurnPhase = null;
    _validActions = [];
    _turnTimeoutAt = null;
    _error = null;
    _actionError = null;
    _gameWinnerTeam = null;
    _recentEmojis.clear();
    _pendingVoiceSignals.clear();
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Join a game room (called by GameScreen.initState)
  //
  // Idempotent: a second call while a join for the same gameId is already
  // in-flight returns immediately.  A call for a different gameId replaces
  // _currentGameId and emits a fresh game:join.
  // ---------------------------------------------------------------------------

  Future<ClientGameState?> joinGame(String gameId) async {
    // Idempotency guard: same game, join already in-flight.
    if (_isJoining && _currentGameId == gameId) {
      return _gameState;
    }

    _currentGameId = gameId;
    _isJoining = true;

    final completer = Completer<ClientGameState?>();

    if (_socket == null) {
      // Socket not yet created (e.g. provider not yet connected).
      // The onConnect handler will rejoin once the socket connects.
      _isJoining = false;
      completer.complete(null);
      return completer.future;
    }

    _socket!.emitWithAck('game:join', {'gameId': gameId}, ack: (response) {
      _isJoining = false;
      if (response is! Map<String, dynamic>) {
        completer.complete(null);
        return;
      }
      if (response['ok'] == true) {
        final stateJson = response['state'] as Map<String, dynamic>?;
        if (stateJson != null) {
          final incoming = ClientGameState.fromJson(stateJson);
          // Accept the snapshot unconditionally — this is a deliberate join,
          // not a push event that might be out of order.
          _gameState = incoming;
          _lastAppliedSequence = incoming.sequence;
          notifyListeners();
          completer.complete(incoming);
        } else {
          completer.complete(null);
        }
      } else {
        _error = (response['error'] as String?) ?? 'Failed to join game';
        notifyListeners();
        completer.complete(null);
      }
    });

    return completer.future;
  }

  // ---------------------------------------------------------------------------
  // Private: re-join after auto-reconnect
  //
  // Unlike joinGame(), this path silently accepts a fresh snapshot only if its
  // sequence is higher than the last applied one, preserving the UI during a
  // brief reconnect window.
  // ---------------------------------------------------------------------------

  void _rejoinGame(String gameId) {
    _isJoining = true;
    _socket!.emitWithAck('game:join', {'gameId': gameId}, ack: (response) {
      _isJoining = false;
      if (response is! Map<String, dynamic>) {
        notifyListeners();
        return;
      }
      if (response['ok'] == true) {
        final stateJson = response['state'] as Map<String, dynamic>?;
        if (stateJson != null) {
          final incoming = ClientGameState.fromJson(stateJson);
          // On reconnect, always accept the server's authoritative snapshot.
          // The server has the latest state; our cached copy may be stale.
          _gameState = incoming;
          _lastAppliedSequence = incoming.sequence;
        }
      } else {
        // Rejoin failed (game ended, abandoned, etc.); surface the error.
        _error = (response['error'] as String?) ?? 'Failed to rejoin game';
      }
      notifyListeners();
    });
  }

  // ---------------------------------------------------------------------------
  // Game actions
  //
  // [GAP-2] All actions now use emitWithAck so server rejection errors (e.g.
  // NOT_YOUR_TURN, MUST_FOLLOW_SUIT) are captured in _actionError and
  // surfaced to the UI instead of being silently discarded.
  //
  // All actions include gameId in the payload, matching the server protocol
  // defined in socket/types.ts (GameClientToServerEvents).
  // ---------------------------------------------------------------------------

  void sendBid(String gameId, int amount) {
    _socket?.emitWithAck(
      'game:bid',
      {'gameId': gameId, 'amount': amount},
      ack: (response) {
        if (response is Map<String, dynamic> && response['ok'] != true) {
          _actionError = _bidErrorToMessage(
              response['error'] as String? ?? 'Bid rejected');
          notifyListeners();
        }
      },
    );
  }

  /// Pass during the bidding phase.
  /// Emits game:bid with pass:true — matching the server's union type:
  ///   { gameId: string; pass: true }
  void sendPass(String gameId) {
    _socket?.emitWithAck(
      'game:bid',
      {'gameId': gameId, 'pass': true},
      ack: (response) {
        if (response is Map<String, dynamic> && response['ok'] != true) {
          _actionError =
              response['error'] as String? ?? 'Pass rejected';
          notifyListeners();
        }
      },
    );
  }

  void sendSelectTrump(String gameId, String suit) {
    _socket?.emitWithAck(
      'game:select_trump',
      {'gameId': gameId, 'suit': suit},
      ack: (response) {
        if (response is Map<String, dynamic> && response['ok'] != true) {
          _actionError =
              response['error'] as String? ?? 'Trump selection rejected';
          notifyListeners();
        }
      },
    );
  }

  void sendPlayCard(String gameId, String cardCode) {
    _socket?.emitWithAck(
      'game:play_card',
      {'gameId': gameId, 'card': cardCode},
      ack: (response) {
        if (response is Map<String, dynamic> && response['ok'] != true) {
          _actionError = _playCardErrorToMessage(
              response['error'] as String? ?? 'Card rejected');
          notifyListeners();
        }
      },
    );
  }

  void sendEmojiReaction(String gameId, String emoji) {
    // Server event name is game:emoji_react (see GameClientToServerEvents in types.ts).
    // The broadcast response arrives as game:emoji_reaction (handled in _onEmojiReaction).
    _socket?.emit('game:emoji_react', {'gameId': gameId, 'emoji': emoji});
  }

  // ---------------------------------------------------------------------------
  // Voice / RTC signalling
  // [GAP-6] toggleMute now also broadcasts the new mute state to the server
  //         so other players see the correct mic indicator.
  // ---------------------------------------------------------------------------

  /// Toggle local mute and broadcast the change to other players in the game.
  void toggleMute() {
    _isMuted = !_isMuted;
    // [GAP-6] Broadcast mute state to all players via voice:toggle_mute.
    if (_currentGameId != null) {
      _socket?.emit('voice:toggle_mute', {
        'gameId': _currentGameId,
        'isMuted': _isMuted,
      });
    }
    notifyListeners();
  }

  /// Notify the server that this player has left voice (hung up).
  void leaveVoice() {
    if (_currentGameId != null) {
      _socket?.emit('voice:hang_up', {'gameId': _currentGameId});
    }
  }

  void sendVoiceOffer(String gameId, int targetSeat, Map<String, dynamic> offer) {
    _socket?.emit('voice:offer', {
      'gameId': gameId,
      'targetSeat': targetSeat,
      'sdp': offer['sdp'] ?? offer,
    });
  }

  void sendVoiceAnswer(String gameId, int targetSeat, Map<String, dynamic> answer) {
    _socket?.emit('voice:answer', {
      'gameId': gameId,
      'targetSeat': targetSeat,
      'sdp': answer['sdp'] ?? answer,
    });
  }

  void sendIceCandidate(String gameId, int targetSeat, Map<String, dynamic> candidate) {
    _socket?.emit('voice:ice_candidate', {
      'gameId': gameId,
      'targetSeat': targetSeat,
      'candidate': candidate['candidate'] ?? candidate,
    });
  }

  // ---------------------------------------------------------------------------
  // Incoming event handlers
  // ---------------------------------------------------------------------------

  void _onStateUpdate(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final stateJson = data['state'] as Map<String, dynamic>?;
    if (stateJson == null) return;

    final incoming = ClientGameState.fromJson(stateJson);

    // Capture the server-authoritative winner from the GAME_ENDED event payload.
    // Score-based heuristics can fail for doobna and Perfect-8 endings; the
    // server's event summary is the single source of truth.
    final event = data['event'] as Map<String, dynamic>?;
    if (event != null && event['type'] == 'GAME_ENDED') {
      final summary = event['summary'] as Map<String, dynamic>?;
      final winningTeam = summary?['winningTeam'];
      if (winningTeam is int) {
        _gameWinnerTeam = winningTeam;
      }
    }

    // Sequence-number deduplication: drop events that are out of order or
    // that duplicate a state we already applied.
    if (incoming.sequence <= _lastAppliedSequence) return;

    _lastAppliedSequence = incoming.sequence;
    _gameState = incoming;

    // [GAP-3] Clear stale turn notification:
    //   Case A — Phase is no longer an action phase → clear unconditionally.
    //   Case B — Phase is still an action phase but it is no longer our
    //            turn (e.g. we passed and the next player is now active).
    //            Without this, the timer lingers until a non-action phase.
    if (_yourTurnPhase != null) {
      final inTurnPhase = incoming.phase == GamePhase.primaryBid ||
          incoming.phase == GamePhase.bidding ||
          incoming.phase == GamePhase.primaryTrumpSelection ||
          incoming.phase == GamePhase.trumpSelection ||
          incoming.phase == GamePhase.playing ||
          incoming.phase == GamePhase.trickEnded;
      // Clear if: not in an action phase OR still in action phase but not our turn.
      if (!inTurnPhase || !incoming.isMyTurn) {
        _yourTurnPhase = null;
        _validActions = [];
        _turnTimeoutAt = null;
      }
    }

    notifyListeners();
  }

  void _onYourTurn(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    _yourTurnPhase = data['phase'] as String?;
    _validActions = (data['validActions'] as List? ?? [])
        .cast<Map<String, dynamic>>();
    final timeoutStr = data['timeoutAt'] as String?;
    _turnTimeoutAt = timeoutStr != null ? DateTime.parse(timeoutStr) : null;
    notifyListeners();
  }

  void _onPlayerDisconnected(dynamic data) {
    // game:state_update will carry the updated connectionState for the seat.
    // Trigger a repaint so the UI can show the disconnected indicator immediately.
    notifyListeners();
  }

  void _onPlayerReconnected(dynamic data) {
    notifyListeners();
  }

  void _onPlayerTimeout(dynamic data) {
    notifyListeners();
  }

  // [GAP-1] Emoji reaction received from the server.
  void _onEmojiReaction(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final seat = (data['seat'] as num?)?.toInt();
    final emoji = data['emoji'] as String?;
    if (seat == null || emoji == null) return;

    _recentEmojis.add(EmojiReactionEvent(
      id: '${seat}_${DateTime.now().microsecondsSinceEpoch}',
      seat: seat,
      emoji: emoji,
    ));
    notifyListeners();
  }

  // [GAP-4] Voice signalling handlers — queue events for the WebRTC consumer.

  void _onVoiceOffer(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final fromSeat = (data['fromSeat'] as num?)?.toInt();
    final sdp = data['sdp'] as String?;
    if (fromSeat == null) return;
    _pendingVoiceSignals.add(VoiceSignalEvent(
      type: 'offer',
      fromSeat: fromSeat,
      sdp: sdp,
    ));
    notifyListeners();
  }

  void _onVoiceAnswer(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final fromSeat = (data['fromSeat'] as num?)?.toInt();
    final sdp = data['sdp'] as String?;
    if (fromSeat == null) return;
    _pendingVoiceSignals.add(VoiceSignalEvent(
      type: 'answer',
      fromSeat: fromSeat,
      sdp: sdp,
    ));
    notifyListeners();
  }

  void _onVoiceIceCandidate(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final fromSeat = (data['fromSeat'] as num?)?.toInt();
    final candidate = data['candidate'] as String?;
    if (fromSeat == null) return;
    _pendingVoiceSignals.add(VoiceSignalEvent(
      type: 'ice_candidate',
      fromSeat: fromSeat,
      candidate: candidate,
    ));
    notifyListeners();
  }

  void _onVoiceMuteChanged(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final seat = (data['seat'] as num?)?.toInt();
    final isMuted = data['isMuted'] as bool?;
    if (seat == null || isMuted == null) return;
    _pendingVoiceSignals.add(VoiceSignalEvent(
      type: 'mute_changed',
      fromSeat: seat,
      isMuted: isMuted,
    ));
    notifyListeners();
  }

  void _onVoicePlayerHungUp(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final seat = (data['seat'] as num?)?.toInt();
    if (seat == null) return;
    _pendingVoiceSignals.add(VoiceSignalEvent(
      type: 'hung_up',
      fromSeat: seat,
    ));
    notifyListeners();
  }

  // [GAP-5] Admin event handlers.

  void _onAdminConfigChanged(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    if (data['turnTimerSeconds'] != null) {
      _adminTurnTimerSeconds = (data['turnTimerSeconds'] as num).toInt();
    }
    if (data['reconnectWindowSeconds'] != null) {
      _adminReconnectWindowSeconds =
          (data['reconnectWindowSeconds'] as num).toInt();
    }
    notifyListeners();
  }

  void _onAdminChanged(dynamic data) {
    // Admin transfer between seats — no client-visible state change required
    // beyond a rebuild (e.g. to update an admin badge in the game UI).
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Error message helpers
  // ---------------------------------------------------------------------------

  static String _bidErrorToMessage(String code) {
    switch (code) {
      case 'NOT_YOUR_TURN':
        return 'It is not your turn to bid.';
      case 'INVALID_BID':
        return 'That bid amount is not valid.';
      case 'PRIMARY_BID_CANNOT_PASS':
        return 'You must place the primary bid — passing is not allowed here.';
      default:
        return 'Bid rejected: $code';
    }
  }

  static String _playCardErrorToMessage(String code) {
    switch (code) {
      case 'NOT_YOUR_TURN':
        return 'It is not your turn to play.';
      case 'INVALID_CARD':
        return 'That card is not in your hand.';
      case 'MUST_FOLLOW_SUIT':
        return 'You must follow suit.';
      default:
        return 'Card rejected: $code';
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
