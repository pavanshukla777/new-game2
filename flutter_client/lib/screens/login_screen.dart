/// LoginScreen — email + password login with guest login shortcut.
///
/// After successful authentication, navigation to /lobby is performed
/// explicitly instead of relying only on GoRouter's auth refresh listener.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../widgets/auth_form_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final error = await ref.read(authProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

    if (!mounted) return;

    if (error != null) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = _friendlyError(error);
      });
      return;
    }

    // Login successful.
    // Navigate explicitly instead of relying only on router refresh.
    context.go('/lobby');
  }

  Future<void> _guestLogin() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final error = await ref.read(authProvider.notifier).loginAsGuest();

    if (!mounted) return;

    if (error != null) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = _friendlyError(error);
      });
      return;
    }

    // Guest login successful.
    // Navigate explicitly to lobby.
    context.go('/lobby');
  }

  String _friendlyError(String code) {
    switch (code) {
      case 'INVALID_CREDENTIALS':
        return 'Invalid email or password.';
      case 'ACCOUNT_BANNED':
        return 'This account has been banned.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0606),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: 32,
              vertical: 24,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'छक्री',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'TiroDevanagari',
                        fontSize: 52,
                        color: Color(0xFFFFD700),
                        letterSpacing: 4,
                      ),
                    ),

                    const SizedBox(height: 8),

                    const Text(
                      'Sign in to play',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white54,
                        fontSize: 14,
                        letterSpacing: 1,
                      ),
                    ),

                    const SizedBox(height: 40),

                    if (_errorMessage != null) ...[
                      AuthErrorBanner(
                        message: _errorMessage!,
                      ),
                      const SizedBox(height: 20),
                    ],

                    AuthField(
                      controller: _emailController,
                      label: 'Email',
                      hint: 'you@example.com',
                      keyboardType: TextInputType.emailAddress,
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Email is required';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 16),

                    AuthField(
                      controller: _passwordController,
                      label: 'Password',
                      hint: '••••••••',
                      obscureText: _obscurePassword,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: Colors.white38,
                          size: 20,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) {
                          return 'Password is required';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 28),

                    AuthPrimaryButton(
                      label: 'Sign In',
                      isLoading: _isSubmitting,
                      onPressed: _isSubmitting ? null : _submit,
                    ),

                    const SizedBox(height: 12),

                    TextButton(
                      onPressed: _isSubmitting
                          ? null
                          : () => context.push('/register'),
                      child: const Text(
                        'New here? Create an account',
                        style: TextStyle(
                          color: Color(0xFFFFD700),
                          fontSize: 13,
                        ),
                      ),
                    ),

                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: AuthDivider(),
                    ),

                    OutlinedButton(
                      onPressed: _isSubmitting ? null : _guestLogin,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white60,
                        side: const BorderSide(
                          color: Colors.white24,
                          width: 0.8,
                        ),
                        padding: const EdgeInsets.symmetric(
                          vertical: 14,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text(
                        'Continue as Guest',
                        style: TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
