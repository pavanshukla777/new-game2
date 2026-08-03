/// Authentication domain models.
///
/// These map 1-to-1 with the shapes defined in @workspace/api-zod.

import 'dart:convert';

// ---------------------------------------------------------------------------
// AuthUser — public user profile returned by all auth endpoints
// ---------------------------------------------------------------------------

class AuthUser {
  const AuthUser({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    required this.eloRating,
    required this.gamesPlayed,
    required this.gamesWon,
    required this.isGuest,
    required this.createdAt,
  });

  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final int eloRating;
  final int gamesPlayed;
  final int gamesWon;
  final bool isGuest;
  final DateTime createdAt;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      eloRating: (json['eloRating'] as num).toInt(),
      gamesPlayed: (json['gamesPlayed'] as num).toInt(),
      gamesWon: (json['gamesWon'] as num).toInt(),
      isGuest: json['isGuest'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'displayName': displayName,
        'avatarUrl': avatarUrl,
        'eloRating': eloRating,
        'gamesPlayed': gamesPlayed,
        'gamesWon': gamesWon,
        'isGuest': isGuest,
        'createdAt': createdAt.toIso8601String(),
      };

  /// Serialize to a JSON string for Hive storage.
  String toJsonString() => jsonEncode(toJson());

  /// Deserialize from a Hive-stored JSON string.
  factory AuthUser.fromJsonString(String s) =>
      AuthUser.fromJson(jsonDecode(s) as Map<String, dynamic>);

  @override
  String toString() => 'AuthUser(id: $id, username: $username, isGuest: $isGuest)';
}

// ---------------------------------------------------------------------------
// AuthResponse — returned by register / login / guest / refresh
// ---------------------------------------------------------------------------

class AuthResponse {
  const AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

class RegisterRequest {
  const RegisterRequest({
    required this.username,
    required this.displayName,
    required this.email,
    required this.password,
  });

  final String username;
  final String displayName;
  final String email;
  final String password;

  Map<String, dynamic> toJson() => {
        'username': username,
        'displayName': displayName,
        'email': email,
        'password': password,
      };
}

class LoginRequest {
  const LoginRequest({required this.email, required this.password});

  final String email;
  final String password;

  Map<String, dynamic> toJson() => {'email': email, 'password': password};
}

class GuestLoginRequest {
  const GuestLoginRequest({this.displayName});

  final String? displayName;

  Map<String, dynamic> toJson() =>
      displayName != null ? {'displayName': displayName} : {};
}
