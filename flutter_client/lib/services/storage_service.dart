/// StorageService — persists auth tokens and user profile using Hive.
///
/// Hive stores strings only (no generated adapters needed).
/// Open the box before constructing this service:
///   await Hive.initFlutter();
///   await Hive.openBox<String>(Config.authBoxName);

import 'package:hive_flutter/hive_flutter.dart';
import '../config.dart';
import '../models/auth_models.dart';

class StorageService {
  StorageService() : _box = Hive.box<String>(Config.authBoxName);

  final Box<String> _box;

  static const _kAccessToken = 'access_token';
  static const _kRefreshToken = 'refresh_token';
  static const _kUser = 'user_json';

  // ── Accessors ──────────────────────────────────────────────────────────────

  String? get accessToken => _box.get(_kAccessToken);
  String? get refreshToken => _box.get(_kRefreshToken);

  AuthUser? get user {
    final raw = _box.get(_kUser);
    if (raw == null) return null;
    try {
      return AuthUser.fromJsonString(raw);
    } catch (_) {
      return null;
    }
  }

  bool get hasTokens =>
      _box.containsKey(_kAccessToken) && _box.containsKey(_kRefreshToken);

  // ── Mutators ───────────────────────────────────────────────────────────────

  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required AuthUser user,
  }) async {
    await _box.put(_kAccessToken, accessToken);
    await _box.put(_kRefreshToken, refreshToken);
    await _box.put(_kUser, user.toJsonString());
  }

  Future<void> updateAccessToken(String accessToken) async {
    await _box.put(_kAccessToken, accessToken);
  }

  Future<void> clearSession() async {
    await _box.deleteAll([_kAccessToken, _kRefreshToken, _kUser]);
  }
}
