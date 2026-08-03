/// LobbyChatWidget — pre-game lobby chat panel.
///
/// Displays an ephemeral list of [ChatMessage] objects and an input field.
/// The parent supplies the messages and the [onSend] callback.
/// This widget manages its own scroll and text-input state.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/lobby_models.dart';

class LobbyChatWidget extends StatefulWidget {
  const LobbyChatWidget({
    super.key,
    required this.messages,
    required this.onSend,
    required this.myUserId,
  });

  final List<ChatMessage> messages;
  final void Function(String message) onSend;
  final String myUserId;

  @override
  State<LobbyChatWidget> createState() => _LobbyChatWidgetState();
}

class _LobbyChatWidgetState extends State<LobbyChatWidget> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  static const _maxLength = 200;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(LobbyChatWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Auto-scroll to bottom when new messages arrive.
    if (widget.messages.length != oldWidget.messages.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF110404),
        border: Border(
          left: BorderSide(color: Colors.white.withOpacity(0.07)),
        ),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: Colors.white.withOpacity(0.07)),
              ),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.chat_bubble_outline,
                  size: 14,
                  color: Colors.white38,
                ),
                const SizedBox(width: 6),
                const Text(
                  'Room Chat',
                  style: TextStyle(
                    color: Colors.white38,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),

          // Message list
          Expanded(
            child: widget.messages.isEmpty
                ? const Center(
                    child: Text(
                      'No messages yet',
                      style: TextStyle(
                        color: Colors.white24,
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(8),
                    itemCount: widget.messages.length,
                    itemBuilder: (context, index) =>
                        _MessageBubble(
                      message: widget.messages[index],
                      isMe: widget.messages[index].userId == widget.myUserId,
                    ),
                  ),
          ),

          // Input
          Container(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(color: Colors.white.withOpacity(0.07)),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    maxLength: _maxLength,
                    maxLengthEnforcement: MaxLengthEnforcement.enforced,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Say something…',
                      hintStyle: const TextStyle(
                        color: Colors.white24,
                        fontSize: 13,
                      ),
                      counterText: '',
                      filled: true,
                      fillColor: Colors.white.withOpacity(0.06),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(6),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onSubmitted: (_) => _send(),
                    textInputAction: TextInputAction.send,
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  onPressed: _send,
                  icon: const Icon(Icons.send_rounded),
                  color: const Color(0xFF8B1A1A),
                  iconSize: 20,
                  padding: const EdgeInsets.all(8),
                  constraints: const BoxConstraints(),
                  tooltip: 'Send',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// _MessageBubble
// ---------------------------------------------------------------------------

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isMe});

  final ChatMessage message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final time = _formatTime(message.timestamp);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        crossAxisAlignment:
            isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // Sender + time
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Text(
              isMe ? 'You  $time' : '${message.displayName}  $time',
              style: TextStyle(
                color: Colors.white.withOpacity(0.3),
                fontSize: 10,
              ),
            ),
          ),
          const SizedBox(height: 2),
          // Bubble
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            constraints: const BoxConstraints(maxWidth: 220),
            decoration: BoxDecoration(
              color: isMe
                  ? const Color(0xFF8B1A1A).withOpacity(0.35)
                  : Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              message.message,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _formatTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}
