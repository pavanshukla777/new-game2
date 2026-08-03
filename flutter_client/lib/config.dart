/// Bundelkhandi Chhakri — App Configuration
///
/// Server URLs are injected at build time via --dart-define so the same
/// binary is not accidentally shipped with the Android-emulator loopback
/// address baked in.
///
/// Usage:
///   # Development (Android emulator — default, no defines needed)
///   flutter run
///
///   # Production release build
///   flutter build apk \
///     --dart-define=API_BASE_URL=https://your-server.com \
///     --dart-define=WS_BASE_URL=https://your-server.com
///
///   # iOS
///   flutter build ios \
///     --dart-define=API_BASE_URL=https://your-server.com \
///     --dart-define=WS_BASE_URL=https://your-server.com
///
/// The defaultValue for both constants is the Android-emulator loopback
/// (10.0.2.2 maps to the host machine's localhost when running in AVD).
/// NEVER ship a production build without overriding these values.

class Config {
  Config._();

  /// Base URL for all REST API requests (no trailing slash).
  /// The /api prefix is added by the ApiClient.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8080',
  );

  /// WebSocket server base URL used by SocketService and LobbySocketService.
  static const String wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'http://10.0.2.2:8080',
  );

  /// Hive box name for persisted auth data.
  static const String authBoxName = 'auth';

  /// Access token TTL assumed by the client (15 min).
  static const Duration accessTokenTtl = Duration(minutes: 15);
}
