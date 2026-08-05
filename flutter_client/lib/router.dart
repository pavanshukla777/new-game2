/// GoRouter configuration with authentication guards.
///
/// Routes:
///   /            → SplashScreen      (session restore in progress)
///   /login       → LoginScreen       (public)
///   /register    → RegisterScreen    (public)
///   /lobby       → LobbyScreen       (requires auth)
///   /room        → RoomDetailScreen  (requires auth; navigated to by LobbyScreen
///                                    when currentRoom becomes non-null)
///
/// Redirect logic:
///   Loading  → always /           (wait for session restore)
///   Unauth   → /login             (if trying to reach protected route)
///   Auth     → /lobby             (if on /, /login, or /register)
///
/// Room-membership guarding is handled within RoomDetailScreen itself
/// (navigates back to /lobby if currentRoom is null), not at the router
/// level, to avoid coupling the router to the lobby socket provider.
///
/// RouterNotifier is created directly inside routerProvider so its lifecycle
/// is tied to the provider; ref.listen keeps the authProvider subscription
/// alive for as long as routerProvider lives.

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'screens/game_screen.dart';
import 'screens/lobby_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/room_detail_screen.dart';
import 'screens/splash_screen.dart';

// ---------------------------------------------------------------------------
// RouterNotifier — pipes AuthState changes into GoRouter.refreshListenable
// ---------------------------------------------------------------------------

class RouterNotifier extends ChangeNotifier {
  RouterNotifier(Ref ref) {
    _authState = ref.read(authProvider);
    // ref.listen is scoped to ref's owner (routerProvider); it's cleaned
    // up automatically when routerProvider is disposed.
    ref.listen<AuthState>(authProvider, (_, next) {
      _authState = next;
      notifyListeners();
    });
  }

  late AuthState _authState;

  String? redirect(BuildContext context, GoRouterState routerState) {
    final loc = routerState.matchedLocation;

    // Hold on splash while session is being restored from storage.
    if (_authState.isLoading) {
      return loc == '/' ? null : '/';
    }

    // Once loading completes, always navigate away from the splash screen.
    // Without this, an unauthenticated user at '/' matches publicRoutes and
    // neither guard below fires — the spinner runs forever.
    if (loc == '/') {
      return _authState.isAuthenticated ? '/lobby' : '/login';
    }

    final authenticated = _authState.isAuthenticated;
    const publicRoutes = <String>{'/login', '/register', '/'};
    final onPublicRoute = publicRoutes.contains(loc);

    if (!authenticated && !onPublicRoute) return '/login';
    if (authenticated && onPublicRoute) return '/lobby';
    return null;
  }
}

// ---------------------------------------------------------------------------
// routerProvider — stable GoRouter instance for the app lifetime
// ---------------------------------------------------------------------------

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = RouterNotifier(ref);
  ref.onDispose(notifier.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: notifier,
    redirect: notifier.redirect,
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (_, __) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/lobby',
        builder: (_, __) => const LobbyScreen(),
      ),
      GoRoute(
        path: '/room',
        builder: (_, __) => const RoomDetailScreen(),
      ),
      GoRoute(
        path: '/game/:gameId',
        builder: (_, state) => GameScreen(
          gameId: state.pathParameters['gameId']!,
        ),
      ),
    ],
  );
});
