/// AuthRepository — bridges ApiClient with domain logic.
///
/// Responsible for:
///   - All auth API calls (register, login, guest, refresh, logout, me)
///   - Session restoration: try stored access token → refresh token fallback
///   - Translating ApiException into user-facing error strings

import '../models/auth_models.dart';
import '../services/api_client.dart';
import '../services/storage_service.dart';

class AuthRepository {
  const AuthRepository({
    required ApiClient apiClient,
    required StorageService storageService,
  })  : _api = apiClient,
        _storage = storageService;

  final ApiClient _api;
  final StorageService _storage;

  // ── Public API ─────────────────────────────────────────────────────────────

  Future<AuthResponse> register(RegisterRequest request) =>
      _api.register(request);

  Future<AuthResponse> login(LoginRequest request) => _api.login(request);

  Future<AuthResponse> loginAsGuest(GuestLoginRequest request) =>
      _api.loginAsGuest(request);

  Future<void> logout({
    required String accessToken,
    required String refreshToken,
  }) =>
      _api.logout(accessToken: accessToken, refreshToken: refreshToken);

  /// Attempt to restore a session from stored tokens.
  ///
  /// Strategy:
  ///   1. No tokens stored → return null (must log in).
  ///   2. Stored access token valid → return current user.
  ///   3. Access token expired (401) → try refresh token.
  ///   4. Refresh also fails → clear storage, return null.
  Future<SessionRestoreResult?> tryRestoreSession() async {
    if (!_storage.hasTokens) return null;

    final accessToken = _storage.accessToken!;
    final refreshToken = _storage.refreshToken!;

    // Fast path: use cached user + validate access token
    try {
      final user = await _api.getMe(accessToken: accessToken);
      return SessionRestoreResult(
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: user,
      );
    } on ApiException catch (e) {
      if (e.statusCode != 401) rethrow;
    }

    // Slow path: access token expired — try refresh
    try {
      final response = await _api.refresh(refreshToken: refreshToken);
      return SessionRestoreResult(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
      );
    } on ApiException {
      // Refresh also rejected — session is fully expired
      await _storage.clearSession();
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Result type for session restoration
// ---------------------------------------------------------------------------

class SessionRestoreResult {
  const SessionRestoreResult({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;
}
