/// SplashScreen — shown while the session is being restored from storage.
///
/// Automatically dismissed by the GoRouter redirect once auth state resolves.

import 'package:flutter/material.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF0D0606),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'छक्री',
              style: TextStyle(
                // TiroDevanagari font binary is not yet bundled; system
                // Devanagari renders correctly on Android/iOS without an
                // explicit fontFamily declaration. Do not add one here until
                // the .ttf is placed in assets/fonts/ and declared in pubspec.
                fontSize: 64,
                color: Color(0xFFFFD700),
                letterSpacing: 4,
              ),
            ),
            SizedBox(height: 32),
            SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF8B1A1A)),
                strokeWidth: 2.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
