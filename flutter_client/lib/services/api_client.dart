/// ApiClient — Dio-based HTTP client for the Bundelkhandi Chhakri REST API.
///
/// Handles all /api/auth/* endpoints.
/// Token management (refresh / retry) is handled by AuthRepository,
/// not here, to keep this layer simple and testable.

import 'package:dio/dio.dart';
import '../config.dart';
import '../models/auth_models.dart';
import '../models/lobby_models.dart';

// ---------------------------------------------------------------------------
// Exception
// ---------------------------------------------------------------------------

class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  @override
  String toString() => 'ApiException($code): $message';
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

class ApiClient {
  ApiClient({String? baseUrl})
      : _dio = Dio(
          BaseOptions(
            baseUrl: '${baseUrl ?? Config.apiBaseUrl}/api',
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 15),
            headers: {'Content-Type': 'application/json'},
          ),
        ) {
    _dio.interceptors.add(LogInterceptor(
      requestBody: false,
      responseBody: false,
      error: true,
    ));
  }

  final Dio _dio;

  // ── Auth endpoints ─────────────────────────────────────────────────────────

  Future<AuthResponse> register(RegisterRequest body) =>
      _post('/auth/register', body.toJson());

  Future<AuthResponse> login(LoginRequest body) =>
      _post('/auth/login', body.toJson());

  Future<AuthResponse> loginAsGuest(GuestLoginRequest body) =>
      _post('/auth/guest', body.toJson());

  Future<AuthResponse> refresh({required String refreshToken}) =>
      _post('/auth/refresh', {'refreshToken': refreshToken});

  Future<void> logout({
    required String accessToken,
    required String refreshToken,
  }) async {
    try {
      await _dio.post(
        '/auth/logout',
        data: {'refreshToken': refreshToken},
        options: Options(
          headers: {'Authorization': 'Bearer $accessToken'},
        ),
      );
    } on DioException {
      // Logout is best-effort — swallow all network and HTTP errors.
      // AuthNotifier also ignores this; local session is already cleared.
    }
  }

  // ── Rooms endpoint ─────────────────────────────────────────────────────────

  Future<List<RoomSummary>> getRooms({required String accessToken}) async {
    try {
      final response = await _dio.get(
        '/rooms',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
      final data = response.data as Map<String, dynamic>;
      final list = data['rooms'] as List<dynamic>;
      return list
          .map((r) => RoomSummary.fromJson(r as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw _mapException(e);
    }
  }

  Future<AuthUser> getMe({required String accessToken}) async {
    try {
      final response = await _dio.get(
        '/auth/me',
        options: Options(
          headers: {'Authorization': 'Bearer $accessToken'},
        ),
      );
      return AuthUser.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _mapException(e);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  Future<AuthResponse> _post(String path, Map<String, dynamic> data) async {
    try {
      final response = await _dio.post(path, data: data);
      return AuthResponse.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _mapException(e);
    }
  }

  ApiException _mapException(DioException e) {
    final status = e.response?.statusCode;
    final body = e.response?.data;
    final code = (body is Map<String, dynamic> ? body['error'] : null)
            as String? ??
        'UNKNOWN';
    final message = (body is Map<String, dynamic> ? body['message'] : null)
            as String? ??
        e.message ??
        'Request failed';

    return ApiException(code, message, statusCode: status);
  }
}
