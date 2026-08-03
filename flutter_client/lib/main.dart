/// Bundelkhandi Chhakri — Flutter Client
///
/// Entry point. Sets up Riverpod ProviderScope, initialises Hive for token
/// persistence, locks orientation to landscape, and boots GoRouter.
///
/// [MIG-050] [GAP-049] Rulebook Section: "UI — Landscape Enforcement"
/// Implements: App is locked to landscape orientation.
///
/// Phase 5: Full auth + GoRouter replacing the Phase 3/4 _EntryScreen.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'config.dart';
import 'router.dart';

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // [MIG-050] Lock to landscape — Rulebook: "Orientation: Landscape only"
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);

  // Status bar: immersive game mode — hide system UI for full-screen experience
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  // Hive — persistent token storage (must be ready before providers initialise)
  await Hive.initFlutter();
  await Hive.openBox<String>(Config.authBoxName);

  runApp(
    const ProviderScope(
      child: ChhakriApp(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Root application widget
// ---------------------------------------------------------------------------

/// Root application widget.
///
/// Uses [MaterialApp.router] with GoRouter (Phase 5).
/// Auth guards in [routerProvider] redirect unauthenticated users to /login
/// and restore the session automatically on startup.
class ChhakriApp extends ConsumerWidget {
  const ChhakriApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Bundelkhandi Chhakri',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF8B1A1A),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF0D0606),
        textTheme: const TextTheme(
          bodyMedium: TextStyle(color: Colors.white70),
        ),
      ),
    );
  }
}
