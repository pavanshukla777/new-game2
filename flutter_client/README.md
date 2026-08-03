# Chhakri — Flutter Client

> ⚠️ **Platform Note:** Flutter native apps require a desktop environment (macOS, Linux, or Windows).
> Open this project at [replit.com](https://replit.com) to build and run the Flutter client.
> The backend in this monorepo is fully ready to connect to.

---

## What This Is

The Flutter mobile client for **Bundelkhandi Chhakri**, a traditional Indian card game from the Bundelkhand region. Cross-platform: iOS, Android, and Flutter Web.

## Getting Started

```bash
# Install Flutter dependencies
flutter pub get

# Generate Freezed models + JSON serialization
dart run build_runner build --delete-conflicting-outputs

# Run on iOS simulator
flutter run -d iPhone

# Run on Android emulator
flutter run -d android

# Connect to local backend
flutter run --dart-define=API_BASE_URL=http://localhost:PORT/api \
            --dart-define=SOCKET_URL=ws://localhost:PORT
```

Replace `PORT` with the backend server port (check the `API Server` workflow).

## Project Structure

See `docs/FLUTTER_CLIENT.md` for the full architecture and folder structure breakdown.

## Backend API

The Flutter client connects to the Express API server in `artifacts/api-server/`.

- REST API docs: `/api/healthz` (health check), `/api/auth`, `/api/rooms`, `/api/games`
- Real-time: Socket.IO on `/lobby` and `/game` namespaces
- Full event protocol: `docs/MULTIPLAYER_DESIGN.md`

## Game Rules

See `docs/GAME_DESIGN.md` for the complete Bundelkhandi Chhakri rule set.

## Technology Stack

| Concern | Package |
|---|---|
| State | flutter_riverpod |
| Navigation | go_router |
| HTTP | dio |
| WebSocket | socket_io_client |
| Local storage | hive_flutter |
| Animations | rive |
| Audio | just_audio |
| Models | freezed + json_serializable |
