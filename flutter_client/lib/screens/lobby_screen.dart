/// LobbyScreen — authenticated landing page showing the room list.
///
/// Features:
///   • Connection status indicator in the AppBar.
///   • Pull-to-refresh room list (GET /api/rooms).
///   • Room tiles with JOIN button.
///   • Join by Code dialog (5-char room code).
///   • Create Room dialog (name, mode, privacy, player count).
///   • Navigates to /room when currentRoom becomes non-null.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../providers/lobby_provider.dart';
import '../services/lobby_socket_service.dart';
import '../widgets/room_list_tile.dart';

class LobbyScreen extends ConsumerWidget {
  const LobbyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Navigate to /room when user creates or joins a room.
    ref.listen<LobbySocketService>(lobbySocketServiceProvider,
        (prev, next) {
      if (prev?.currentRoom == null && next.currentRoom != null) {
        context.go('/room');
      }
    });

    final lobby = ref.watch(lobbySocketServiceProvider);
    final auth = ref.watch(authProvider);
    final user = auth.user;

    return Scaffold(
      backgroundColor: const Color(0xFF0D0606),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A0808),
        elevation: 0,
        title: Row(
          children: [
            const Text(
              'छक्री',
              style: TextStyle(
                // TiroDevanagari font bundling is deferred; system Devanagari
                // font renders correctly on Android/iOS without an explicit
                // fontFamily declaration.
                color: Color(0xFFFFD700),
                fontSize: 18,
                letterSpacing: 2,
              ),
            ),
            const SizedBox(width: 16),
            _ConnectionChip(lobby: lobby),
          ],
        ),
        actions: [
          // User info
          if (user != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              child: Row(
                children: [
                  if (user.isGuest)
                    Container(
                      margin: const EdgeInsets.only(right: 6),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white12,
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: const Text(
                        'GUEST',
                        style: TextStyle(
                            fontSize: 9,
                            color: Colors.white38,
                            letterSpacing: 1),
                      ),
                    ),
                  Text(
                    user.displayName,
                    style: const TextStyle(
                        color: Colors.white60, fontSize: 13),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'ELO ${user.eloRating}',
                    style: const TextStyle(
                        color: Colors.white30, fontSize: 11),
                  ),
                ],
              ),
            ),

          // Refresh
          IconButton(
            icon: lobby.isLoadingRooms
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white38),
                  )
                : const Icon(Icons.refresh, size: 20, color: Colors.white38),
            tooltip: 'Refresh rooms',
            onPressed: lobby.isLoadingRooms ? null : lobby.loadRooms,
          ),

          // Join by code
          TextButton.icon(
            onPressed: lobby.isConnected
                ? () => _showJoinByCodeDialog(context, lobby)
                : null,
            icon: const Icon(Icons.qr_code_scanner,
                size: 16, color: Color(0xFFFFD700)),
            label: const Text(
              'Join by Code',
              style:
                  TextStyle(color: Color(0xFFFFD700), fontSize: 12),
            ),
          ),

          const SizedBox(width: 4),

          // Logout
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout, size: 18, color: Colors.white30),
            onPressed: () => ref.read(authProvider.notifier).logout(),
          ),
          const SizedBox(width: 4),
        ],
      ),

      // FAB — Create Room
      floatingActionButton: lobby.isConnected
          ? FloatingActionButton.extended(
              onPressed: lobby.isCreatingRoom
                  ? null
                  : () => _showCreateRoomDialog(context, lobby),
              backgroundColor: const Color(0xFF8B1A1A),
              foregroundColor: Colors.white,
              icon: lobby.isCreatingRoom
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white70),
                    )
                  : const Icon(Icons.add, size: 20),
              label: const Text(
                'Create Room',
                style:
                    TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5),
              ),
            )
          : null,

      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Connection error banner
          if (lobby.connectionError != null)
            _ErrorBanner(
              message: lobby.connectionError!,
              onDismiss: lobby.clearConnectionError,
            ),

          // Connecting / not connected state
          if (!lobby.isConnected && lobby.isConnecting)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Column(
                  children: [
                    CircularProgressIndicator(
                        color: Color(0xFF8B1A1A)),
                    SizedBox(height: 12),
                    Text(
                      'Connecting to lobby…',
                      style: TextStyle(
                          color: Colors.white38, fontSize: 13),
                    ),
                  ],
                ),
              ),
            )
          else if (!lobby.isConnected && !lobby.isConnecting) ...[
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(
                child: Text(
                  'Not connected to lobby.',
                  style: TextStyle(color: Colors.white38),
                ),
              ),
            ),
          ] else ...[
            // Section header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
              child: Row(
                children: [
                  const Text(
                    'Open Rooms',
                    style: TextStyle(
                      color: Colors.white60,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (!lobby.isLoadingRooms)
                    Text(
                      '(${lobby.rooms.length})',
                      style: const TextStyle(
                          color: Colors.white24, fontSize: 12),
                    ),
                ],
              ),
            ),
            const Divider(
                height: 1, thickness: 1, color: Colors.white12,
                indent: 16, endIndent: 16),
            const SizedBox(height: 4),

            // Room list
            Expanded(
              child: _RoomList(lobby: lobby),
            ),
          ],
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Dialogs
  // ---------------------------------------------------------------------------

  Future<void> _showJoinByCodeDialog(
      BuildContext context, LobbySocketService lobby) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _JoinByCodeDialog(lobby: lobby),
    );
  }

  Future<void> _showCreateRoomDialog(
      BuildContext context, LobbySocketService lobby) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _CreateRoomDialog(lobby: lobby),
    );
  }
}

// ---------------------------------------------------------------------------
// _RoomList
// ---------------------------------------------------------------------------

class _RoomList extends StatelessWidget {
  const _RoomList({required this.lobby});
  final LobbySocketService lobby;

  @override
  Widget build(BuildContext context) {
    if (lobby.isLoadingRooms) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF8B1A1A)),
      );
    }

    if (lobby.rooms.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.table_restaurant_outlined,
              size: 40,
              color: Color(0xFF8B1A1A),
            ),
            const SizedBox(height: 12),
            const Text(
              'No open rooms yet.',
              style: TextStyle(color: Colors.white38, fontSize: 14),
            ),
            const SizedBox(height: 4),
            const Text(
              'Create one to get started.',
              style: TextStyle(color: Colors.white24, fontSize: 12),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFF8B1A1A),
      backgroundColor: const Color(0xFF1A0808),
      onRefresh: lobby.loadRooms,
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 80), // FAB clearance
        itemCount: lobby.rooms.length,
        itemBuilder: (context, index) {
          final room = lobby.rooms[index];
          return RoomListTile(
            room: room,
            isLoading: lobby.isJoiningRoom,
            onJoin: () async {
              final err = await lobby.joinRoom(roomId: room.id);
              if (err != null && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(err),
                    backgroundColor: Colors.red.shade800,
                  ),
                );
              }
            },
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _ConnectionChip
// ---------------------------------------------------------------------------

class _ConnectionChip extends StatelessWidget {
  const _ConnectionChip({required this.lobby});
  final LobbySocketService lobby;

  @override
  Widget build(BuildContext context) {
    final Color dotColor;
    final String label;

    if (lobby.isConnected) {
      dotColor = Colors.greenAccent;
      label = 'Connected';
    } else if (lobby.isConnecting) {
      dotColor = Colors.orange;
      label = 'Connecting';
    } else {
      dotColor = Colors.red.shade400;
      label = 'Disconnected';
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: dotColor,
            boxShadow: [
              BoxShadow(color: dotColor.withOpacity(0.5), blurRadius: 4)
            ],
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            color: dotColor.withOpacity(0.8),
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// _ErrorBanner
// ---------------------------------------------------------------------------

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onDismiss});
  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.red.shade900.withOpacity(0.85),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded,
              size: 16, color: Colors.white70),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 16, color: Colors.white38),
            onPressed: onDismiss,
            constraints: const BoxConstraints(),
            padding: const EdgeInsets.all(4),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _JoinByCodeDialog
// ---------------------------------------------------------------------------

class _JoinByCodeDialog extends StatefulWidget {
  const _JoinByCodeDialog({required this.lobby});
  final LobbySocketService lobby;

  @override
  State<_JoinByCodeDialog> createState() => _JoinByCodeDialogState();
}

class _JoinByCodeDialogState extends State<_JoinByCodeDialog> {
  final _controller = TextEditingController();
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    final code = _controller.text.trim().toUpperCase();
    if (code.length != 5) {
      setState(() => _error = 'Room code must be exactly 5 characters.');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    final err = await widget.lobby.joinRoom(code: code);
    if (!mounted) return;
    if (err != null) {
      setState(() {
        _isLoading = false;
        _error = err;
      });
    } else {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF1A0808),
      title: const Text(
        'Join by Code',
        style: TextStyle(color: Colors.white, fontSize: 16),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _controller,
            autofocus: true,
            maxLength: 5,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
              _UpperCaseFormatter(),
            ],
            style: const TextStyle(
              color: Color(0xFFFFD700),
              fontSize: 20,
              letterSpacing: 4,
              fontWeight: FontWeight.bold,
            ),
            decoration: InputDecoration(
              hintText: 'ABCDE',
              hintStyle: const TextStyle(
                  color: Colors.white24, letterSpacing: 4),
              counterText: '',
              filled: true,
              fillColor: Colors.white.withOpacity(0.06),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: BorderSide.none,
              ),
            ),
            onSubmitted: (_) => _join(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Colors.red.shade300, fontSize: 12),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel',
              style: TextStyle(color: Colors.white38)),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _join,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF8B1A1A),
            foregroundColor: Colors.white,
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white70),
                )
              : const Text('Join'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// _CreateRoomDialog
// ---------------------------------------------------------------------------

class _CreateRoomDialog extends StatefulWidget {
  const _CreateRoomDialog({required this.lobby});
  final LobbySocketService lobby;

  @override
  State<_CreateRoomDialog> createState() => _CreateRoomDialogState();
}

class _CreateRoomDialogState extends State<_CreateRoomDialog> {
  final _nameController = TextEditingController();
  String _gameMode = 'standard';
  bool _isPrivate = false;
  int _maxPlayers = 4;
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter a room name.');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    final err = await widget.lobby.createRoom(
      name: name,
      gameMode: _gameMode,
      isPrivate: _isPrivate,
      maxPlayers: _maxPlayers,
    );
    if (!mounted) return;
    if (err != null) {
      setState(() {
        _isLoading = false;
        _error = err;
      });
    } else {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF1A0808),
      title: const Text(
        'Create Room',
        style: TextStyle(color: Colors.white, fontSize: 16),
      ),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Room name
            TextField(
              controller: _nameController,
              autofocus: true,
              maxLength: 40,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Room name',
                labelStyle:
                    const TextStyle(color: Colors.white38),
                counterText: '',
                filled: true,
                fillColor: Colors.white.withOpacity(0.06),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(6),
                  borderSide: BorderSide.none,
                ),
              ),
              onSubmitted: (_) => _create(),
            ),
            const SizedBox(height: 16),

            // Game mode
            const Text(
              'Mode',
              style: TextStyle(
                  color: Colors.white38,
                  fontSize: 12,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            _ToggleRow(
              options: const {'standard': 'Standard', 'practice': 'Practice'},
              selected: _gameMode,
              onSelect: (v) => setState(() => _gameMode = v),
            ),
            const SizedBox(height: 16),

            // Player count
            const Text(
              'Players',
              style: TextStyle(
                  color: Colors.white38,
                  fontSize: 12,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            _ToggleRow(
              options: const {4: '4 Players', 6: '6 Players'},
              selected: _maxPlayers,
              onSelect: (v) => setState(() => _maxPlayers = v as int),
            ),
            const SizedBox(height: 16),

            // Private toggle
            Row(
              children: [
                const Text(
                  'Private room',
                  style: TextStyle(
                      color: Colors.white60, fontSize: 13),
                ),
                const Spacer(),
                Switch(
                  value: _isPrivate,
                  onChanged: (v) => setState(() => _isPrivate = v),
                  activeColor: const Color(0xFF8B1A1A),
                ),
              ],
            ),

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(
                    color: Colors.red.shade300, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel',
              style: TextStyle(color: Colors.white38)),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _create,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF8B1A1A),
            foregroundColor: Colors.white,
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white70),
                )
              : const Text('Create'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// _ToggleRow
// ---------------------------------------------------------------------------

class _ToggleRow<T> extends StatelessWidget {
  const _ToggleRow({
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final Map<T, String> options;
  final T selected;
  final void Function(T) onSelect;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: options.entries.map((e) {
        final active = e.key == selected;
        return Expanded(
          child: GestureDetector(
            onTap: () => onSelect(e.key),
            child: Container(
              margin: EdgeInsets.only(
                  right: e.key == options.keys.first ? 6 : 0),
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: active
                    ? const Color(0xFF8B1A1A)
                    : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: active
                      ? const Color(0xFF8B1A1A)
                      : Colors.white12,
                ),
              ),
              child: Center(
                child: Text(
                  e.value,
                  style: TextStyle(
                    color: active ? Colors.white : Colors.white38,
                    fontSize: 13,
                    fontWeight: active
                        ? FontWeight.w600
                        : FontWeight.normal,
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ---------------------------------------------------------------------------
// _UpperCaseFormatter — forces input to uppercase letters
// ---------------------------------------------------------------------------

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}
