/// Auth state management using Riverpod.
///
/// Providers exposed:
///   authProvider          — current AuthState (sync, always available)
///   authNotifierProvider  — AuthNotifier for actions (login/register/etc.)
///   apiClientProvider     — singleton ApiClient
///   storageServiceProvider — singleton StorageService
///   authRepositoryProvider — singleton AuthRepository

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/auth_models.dart';
import '../repositories/auth_repository.dart';
import '../services/api_client.dart';
import '../services/storage_service.dart';

// ---------------------------------------------------------------------------
// Infrastructure providers
// ---------------------------------------------------------------------------

final storageServiceProvider = Provider<StorageService>((ref) {
  return StorageService();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    apiClient: ref.watch(apiClientProvider),
    storageService: ref.watch(storageServiceProvider),
  );
});

// ---------------------------------------------------------------------------
// AuthState
// ---------------------------------------------------------------------------

enum AuthStatus { loading, unauthenticated, authenticated }

class AuthState {
  const AuthState._({
    required this.status,
    this.user,
    this.accessToken,
    this.refreshToken,
    this.error,
  });

  const AuthState.loading()
      : this._(status: AuthStatus.loading);

  const AuthState.unauthenticated({String? error})
      : this._(status: AuthStatus.unauthenticated, error: error);

  const AuthState.authenticated({
    required AuthUser user,
    required String accessToken,
    required String refreshToken,
  }) : this._(
          status: AuthStatus.authenticated,
          user: user,
          accessToken: accessToken,
          refreshToken: refreshToken,
        );

  final AuthStatus status;
  final AuthUser? user;
  final String? accessToken;
  final String? refreshToken;
  final String? error;

  bool get isLoading => status == AuthStatus.loading;
  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isUnauthenticated => status == AuthStatus.unauthenticated;
}

// ---------------------------------------------------------------------------
// AuthNotifier — manages auth lifecycle
// ---------------------------------------------------------------------------

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier({
    required AuthRepository authRepository,
    required StorageService storageService,
  })  : _repo = authRepository,
        _storage = storageService,
        super(const AuthState.loading()) {
    _restoreSession();
  }

  final AuthRepository _repo;
  final StorageService _storage;

  // ── Session restore ────────────────────────────────────────────────────────

  Future<void> _restoreSession() async {
    try {
      final result = await _repo.tryRestoreSession();
      if (result == null) {
        state = const AuthState.unauthenticated();
        return;
      }
      await _storage.saveSession(
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      );
      state = AuthState.authenticated(
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      );
    } catch (_) {
      state = const AuthState.unauthenticated();
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  /// Returns null on success, or an error message string on failure.
  Future<String?> login({
    required String email,
    required String password,
  }) async {
    state = const AuthState.loading();
    try {
      final response = await _repo.login(
        LoginRequest(email: email, password: password),
      );
      await _storage.saveSession(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
      );
      state = AuthState.authenticated(
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      );
      return null;
    } on ApiException catch (e) {
      state = AuthState.unauthenticated(error: e.message);
      return e.message;
    } catch (e) {
      const msg = 'Unexpected error. Please try again.';
      state = const AuthState.unauthenticated(error: msg);
      return msg;
    }
  }

  Future<String?> register({
    required String username,
    required String displayName,
    required String email,
    required String password,
  }) async {
    state = const AuthState.loading();
    try {
      final response = await _repo.register(
        RegisterRequest(
          username: username,
          displayName: displayName,
          email: email,
          password: password,
        ),
      );
      await _storage.saveSession(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
      );
      state = AuthState.authenticated(
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      );
      return null;
    } on ApiException catch (e) {
      state = AuthState.unauthenticated(error: e.message);
      return e.message;
    } catch (e) {
      const msg = 'Unexpected error. Please try again.';
      state = const AuthState.unauthenticated(error: msg);
      return msg;
    }
  }

  Future<String?> loginAsGuest({String? displayName}) async {
    state = const AuthState.loading();
    try {
      final response = await _repo.loginAsGuest(
        GuestLoginRequest(displayName: displayName),
      );
      await _storage.saveSession(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
      );
      state = AuthState.authenticated(
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      );
      return null;
    } on ApiException catch (e) {
      state = AuthState.unauthenticated(error: e.message);
      return e.message;
    } catch (e) {
      const msg = 'Unexpected error. Please try again.';
      state = const AuthState.unauthenticated(error: msg);
      return msg;
    }
  }

  Future<void> logout() async {
    final current = state;
    if (!current.isAuthenticated) return;

    // Optimistically clear state first so the UI responds immediately
    state = const AuthState.unauthenticated();
    await _storage.clearSession();

    // Best-effort server-side revocation
    try {
      await _repo.logout(
        accessToken: current.accessToken!,
        refreshToken: current.refreshToken!,
      );
    } catch (_) {
      // Ignore — local session is already cleared
    }
  }
}

// ---------------------------------------------------------------------------
// authProvider — the main provider consumed by UI and GoRouter
// ---------------------------------------------------------------------------

final authProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    authRepository: ref.watch(authRepositoryProvider),
    storageService: ref.watch(storageServiceProvider),
  );
});
