/// lobbySocketServiceProvider — single shared LobbySocketService instance.
///
/// Lifecycle:
///   Created lazily when first accessed (typically by LobbyScreen).
///   Automatically connects when auth state is authenticated.
///   Automatically disconnects when auth state becomes unauthenticated.
///   Disposed (and socket closed) when the ProviderScope is torn down.
///
/// Usage:
///   final lobby = ref.watch(lobbySocketServiceProvider);
///   lobby.createRoom(...), lobby.joinRoom(...), etc.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config.dart';
import '../providers/auth_provider.dart';
import '../services/lobby_socket_service.dart';
import '../services/socket_service.dart';

final lobbySocketServiceProvider =
    ChangeNotifierProvider<LobbySocketService>((ref) {
  final service = LobbySocketService(
    serverUrl: Config.wsBaseUrl,
    apiClient: ref.watch(apiClientProvider),
  );

  // Respond to auth state changes: connect on login, disconnect on logout.
  ref.listen<AuthState>(authProvider, (_, next) {
    if (next.isAuthenticated && next.accessToken != null) {
      service.connect(
        next.accessToken!,
        userId: next.user!.id,
        displayName: next.user!.displayName,
        isGuest: next.user!.isGuest,
      );
    } else if (!next.isLoading) {
      service.disconnect();
    }
  });

  // Eagerly connect if already authenticated when the provider is first created.
  final auth = ref.read(authProvider);
  if (auth.isAuthenticated && auth.accessToken != null) {
    service.connect(
      auth.accessToken!,
      userId: auth.user!.id,
      displayName: auth.user!.displayName,
      isGuest: auth.user!.isGuest,
    );
  }

  // Disconnect when the provider is disposed (app shutdown / scope tear-down).
  ref.onDispose(service.disconnect);

  return service;
});

// ---------------------------------------------------------------------------
// gameSocketServiceProvider — /game namespace socket for in-game events.
//
// Lifecycle mirrors lobbySocketServiceProvider:
//   Created lazily, connected on auth, disconnected on logout.
//   GameScreen reads this provider to join the game and receive state pushes.
// ---------------------------------------------------------------------------

final gameSocketServiceProvider = ChangeNotifierProvider<SocketService>((ref) {
  final service = SocketService(serverUrl: Config.wsBaseUrl);

  // React to auth state changes.
  ref.listen<AuthState>(authProvider, (_, next) {
    if (next.isAuthenticated && next.accessToken != null) {
      service.connect(next.accessToken!);
    } else if (!next.isLoading) {
      service.disconnect();
    }
  });

  // Eagerly connect if already authenticated when the provider is first created.
  final auth = ref.read(authProvider);
  if (auth.isAuthenticated && auth.accessToken != null) {
    service.connect(auth.accessToken!);
  }

  ref.onDispose(service.disconnect);
  return service;
});
