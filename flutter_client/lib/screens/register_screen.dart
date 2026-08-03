/// RegisterScreen — create a new account with username, display name,
/// email, and password.
///
/// On success: GoRouter redirect takes the user to /lobby automatically.
/// On failure: inline error banner.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../widgets/auth_form_widgets.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _displayNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _displayNameController.dispose();
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

    final error = await ref.read(authProvider.notifier).register(
          username: _usernameController.text.trim(),
          displayName: _displayNameController.text.trim(),
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

    if (!mounted) return;
    if (error != null) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = _friendlyError(error);
      });
    }
  }

  String _friendlyError(String code) {
    switch (code) {
      case 'USERNAME_TAKEN':
        return 'That username is already taken. Try another.';
      case 'EMAIL_TAKEN':
        return 'An account with that email already exists.';
      case 'VALIDATION_ERROR':
        return 'Please check your inputs and try again.';
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
            padding:
                const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Title ────────────────────────────────────────────
                    const Text(
                      'Create Account',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Join the table',
                      textAlign: TextAlign.center,
                      style:
                          TextStyle(color: Colors.white38, fontSize: 13),
                    ),
                    const SizedBox(height: 32),

                    // ── Error banner ─────────────────────────────────────
                    if (_errorMessage != null) ...[
                      AuthErrorBanner(message: _errorMessage!),
                      const SizedBox(height: 20),
                    ],

                    // ── Username ─────────────────────────────────────────
                    AuthField(
                      controller: _usernameController,
                      label: 'Username',
                      hint: 'bundelkh_player',
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Username is required';
                        }
                        if (v.trim().length < 3) {
                          return 'Minimum 3 characters';
                        }
                        if (v.trim().length > 24) {
                          return 'Maximum 24 characters';
                        }
                        final valid = RegExp(r'^[a-zA-Z0-9_]+$');
                        if (!valid.hasMatch(v.trim())) {
                          return 'Only letters, numbers, and underscores';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // ── Display name ─────────────────────────────────────
                    AuthField(
                      controller: _displayNameController,
                      label: 'Display Name',
                      hint: 'Kanha Patel',
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Display name is required';
                        }
                        if (v.trim().length < 2) {
                          return 'Minimum 2 characters';
                        }
                        if (v.trim().length > 32) {
                          return 'Maximum 32 characters';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    // ── Email ────────────────────────────────────────────
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
                    const SizedBox(height: 14),

                    // ── Password ─────────────────────────────────────────
                    AuthField(
                      controller: _passwordController,
                      label: 'Password',
                      hint: '•••••••• (min 8 characters)',
                      obscureText: _obscurePassword,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: Colors.white38,
                          size: 20,
                        ),
                        onPressed: () => setState(
                          () => _obscurePassword = !_obscurePassword,
                        ),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) {
                          return 'Password is required';
                        }
                        if (v.length < 8) {
                          return 'Minimum 8 characters';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 28),

                    // ── Submit ───────────────────────────────────────────
                    AuthPrimaryButton(
                      label: 'Create Account',
                      isLoading: _isSubmitting,
                      onPressed: _isSubmitting ? null : _submit,
                    ),
                    const SizedBox(height: 12),

                    // ── Back to login ────────────────────────────────────
                    TextButton(
                      onPressed: _isSubmitting ? null : () => context.pop(),
                      child: const Text(
                        'Already have an account? Sign in',
                        style: TextStyle(
                          color: Color(0xFFFFD700),
                          fontSize: 13,
                        ),
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
