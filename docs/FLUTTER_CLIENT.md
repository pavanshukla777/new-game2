# Bundelkhandi Chhakri — Flutter Client Architecture

> ⚠️ Flutter native apps cannot be built on the Replit iOS app.
> Open this project at replit.com to scaffold and run the Flutter client.
> The backend (this repo) is fully ready to connect to.

---

## Project Location

```
flutter_client/   ← Flutter project root
```

## Technology Choices

| Concern | Package | Version |
|---|---|---|
| State management | `flutter_riverpod` | ^2.5.x |
| Navigation | `go_router` | ^14.x |
| HTTP client | `dio` | ^5.x |
| WebSocket | `socket_io_client` | ^2.x |
| Local storage | `hive_flutter` | ^1.x |
| Animations | `rive` | ^0.13.x |
| Audio | `just_audio` | ^0.9.x |
| Card rendering | Custom Flutter canvas | — |
| Localization | `flutter_localizations` | SDK |
| Code generation | `freezed` + `json_serializable` | ^2.x |
| DI | Riverpod providers | — |

---

## Folder Structure

```
flutter_client/
├── pubspec.yaml
├── pubspec.lock
├── analysis_options.yaml
├── l10n.yaml                        # Localization config
│
├── android/                         # Android-specific config
├── ios/                             # iOS-specific config
│
├── assets/
│   ├── animations/                  # Rive animation files (.riv)
│   │   ├── card_deal.riv
│   │   ├── chhakri_celebration.riv
│   │   └── win_lose.riv
│   ├── audio/                       # Sound effects
│   │   ├── card_place.mp3
│   │   ├── card_flip.mp3
│   │   ├── trick_win.mp3
│   │   └── chhakri.mp3
│   ├── images/
│   │   ├── cards/                   # Card face images (52 PNGs or SVGs)
│   │   │   ├── AS.png               # Ace of Spades
│   │   │   ├── KH.png               # King of Hearts
│   │   │   └── ...
│   │   ├── card_back.png
│   │   └── table_felt.png
│   └── fonts/
│       ├── Tiro_Devanagari.ttf      # Hindi script
│       └── Inter.ttf                # Latin script
│
└── lib/
    ├── main.dart                    # App entry point
    │
    ├── core/                        # Cross-cutting infrastructure
    │   ├── app.dart                 # MaterialApp + GoRouter setup
    │   ├── constants/
    │   │   ├── app_constants.dart   # API URLs, timeouts
    │   │   ├── game_constants.dart  # Card values, suit symbols
    │   │   └── colors.dart          # Brand palette
    │   ├── theme/
    │   │   ├── app_theme.dart       # ThemeData (light + dark)
    │   │   ├── card_theme.dart      # Card widget styling
    │   │   └── text_styles.dart
    │   ├── router/
    │   │   ├── app_router.dart      # GoRouter config + guards
    │   │   └── routes.dart          # Route name constants
    │   ├── di/
    │   │   └── providers.dart       # Global Riverpod providers
    │   ├── network/
    │   │   ├── dio_client.dart      # Dio setup + interceptors
    │   │   ├── auth_interceptor.dart # Attach JWT, refresh on 401
    │   │   └── api_exception.dart   # Typed API errors
    │   └── socket/
    │       ├── socket_service.dart  # Socket.IO connection manager
    │       ├── lobby_socket.dart    # /lobby namespace events
    │       └── game_socket.dart     # /game namespace events
    │
    ├── features/                    # Feature modules (one per screen group)
    │
    │   ├── auth/
    │   │   ├── data/
    │   │   │   ├── auth_repository.dart
    │   │   │   └── auth_remote_datasource.dart
    │   │   ├── domain/
    │   │   │   ├── models/
    │   │   │   │   ├── user.dart           # @freezed
    │   │   │   │   └── auth_tokens.dart    # @freezed
    │   │   │   └── auth_service.dart       # Token storage, refresh
    │   │   └── presentation/
    │   │       ├── auth_provider.dart      # Riverpod StateNotifier
    │   │       ├── login_screen.dart
    │   │       ├── register_screen.dart
    │   │       └── guest_play_screen.dart
    │
    │   ├── lobby/
    │   │   ├── data/
    │   │   │   ├── lobby_repository.dart
    │   │   │   └── lobby_remote_datasource.dart
    │   │   ├── domain/
    │   │   │   └── models/
    │   │   │       ├── room.dart           # @freezed
    │   │   │       └── room_player.dart    # @freezed
    │   │   └── presentation/
    │   │       ├── lobby_provider.dart
    │   │       ├── room_list_screen.dart   # Browse + search rooms
    │   │       ├── create_room_screen.dart # Room config form
    │   │       ├── room_waiting_screen.dart # Seat selection + ready
    │   │       └── widgets/
    │   │           ├── room_card.dart
    │   │           ├── player_seat_widget.dart
    │   │           └── room_chat_widget.dart
    │
    │   ├── game/
    │   │   ├── data/
    │   │   │   └── game_repository.dart
    │   │   ├── domain/
    │   │   │   ├── models/
    │   │   │   │   ├── game_state.dart     # @freezed — mirrors server ClientGameState
    │   │   │   │   ├── card.dart           # @freezed — suit, rank, code
    │   │   │   │   ├── game_event.dart     # @freezed — discriminated union
    │   │   │   │   └── bid.dart            # @freezed
    │   │   │   └── game_rules.dart        # Pure functions for UI validation hints
    │   │   └── presentation/
    │   │       ├── game_provider.dart     # Game state + socket events
    │   │       ├── game_screen.dart       # Main game screen
    │   │       └── widgets/
    │   │           ├── card_widget.dart          # Single card face/back
    │   │           ├── hand_widget.dart           # Fan of cards
    │   │           ├── trick_area_widget.dart     # 4 card slots
    │   │           ├── bid_panel_widget.dart      # Bid input
    │   │           ├── trump_select_widget.dart   # Suit buttons
    │   │           ├── score_board_widget.dart    # Running scores
    │   │           ├── player_avatar_widget.dart  # Player info + turn indicator
    │   │           ├── action_prompt_widget.dart  # "Your turn" overlay
    │   │           └── round_result_widget.dart   # End-of-round popup
    │
    │   ├── profile/
    │   │   ├── data/
    │   │   │   └── profile_repository.dart
    │   │   └── presentation/
    │   │       ├── profile_provider.dart
    │   │       ├── profile_screen.dart
    │   │       └── game_history_screen.dart
    │
    │   └── leaderboard/
    │       ├── data/
    │       │   └── leaderboard_repository.dart
    │       └── presentation/
    │           ├── leaderboard_provider.dart
    │           └── leaderboard_screen.dart
    │
    └── shared/                      # Shared widgets + utilities
        ├── widgets/
        │   ├── loading_widget.dart
        │   ├── error_widget.dart
        │   ├── avatar_widget.dart
        │   └── bottom_nav_bar.dart
        ├── extensions/
        │   ├── string_extensions.dart
        │   ├── card_extensions.dart
        │   └── context_extensions.dart
        └── utils/
            ├── card_utils.dart        # Parse "AS" → Ace of Spades
            ├── date_utils.dart
            └── snackbar_utils.dart
```

---

## State Management Pattern (Riverpod)

```dart
// Features use AsyncNotifier for async state
@riverpod
class GameNotifier extends _$GameNotifier {
  @override
  FutureOr<GameState?> build() => null;

  Future<void> joinGame(String gameId) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final socket = ref.read(gameSocketProvider);
      return socket.joinGame(gameId);
    });
  }

  void onCardPlayed(CardPlayedEvent event) {
    // Update state from server event
    state = AsyncData(state.value!.applyEvent(event));
  }
}
```

---

## API Integration

```dart
// lib/core/constants/app_constants.dart
class AppConstants {
  static const String apiBaseUrl = 
    String.fromEnvironment('API_BASE_URL', defaultValue: 'https://api.chhakri.app');
  static const String socketUrl = 
    String.fromEnvironment('SOCKET_URL', defaultValue: 'wss://api.chhakri.app');
  static const Duration jwtExpiry = Duration(minutes: 15);
  static const Duration refreshExpiry = Duration(days: 30);
  static const int turnTimeoutSeconds = 30;
}
```

---

## Building for Development

```bash
# From flutter_client/ directory

# Install dependencies
flutter pub get

# Generate code (Freezed models + JSON serialization)
dart run build_runner build --delete-conflicting-outputs

# Run on iOS simulator
flutter run -d iPhone

# Run on Android emulator
flutter run -d android

# Run as web (for debug UI testing)
flutter run -d chrome

# Build release APK
flutter build apk --release --dart-define=API_BASE_URL=https://api.chhakri.app

# Build release IPA (requires macOS + Xcode)
flutter build ios --release
```

---

## Backend Connection Config

The Flutter app connects to this project's API server. For local development:

```
API_BASE_URL = http://<replit-dev-domain>/api
SOCKET_URL   = wss://<replit-dev-domain>
```

Find your dev domain in the Replit preview URL.

---

## Card Rendering

Cards are rendered with a custom Flutter widget using `CustomPainter` for performance, with optional PNG overlays for face cards. Card codes follow:

```
Rank codes: A K Q J 10 9 8 7 6 5 4 3 2
Suit codes: S H D C  (Spades Hearts Diamonds Clubs)
Card code:  rank + suit  →  "AS" "KH" "10D" "2C"
```

---

## Notes for Replit.com Development

1. Create a new Replit from this repo
2. Install Flutter: use Nix packages (`pkgs.flutter`) in `replit.nix`
3. The Flutter SDK is large (~2GB); allow time for first install
4. Use Replit's mobile preview for Flutter web; use emulator for native
