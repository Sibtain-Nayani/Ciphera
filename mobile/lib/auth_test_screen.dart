import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';

class AuthTestScreen extends StatefulWidget {
  const AuthTestScreen({super.key});
  @override
  State<AuthTestScreen> createState() => _AuthTestScreenState();
}

class _AuthTestScreenState extends State<AuthTestScreen> {
  final _emailController = TextEditingController(text: 'test@ciphera.dev');
  final _passwordController = TextEditingController(text: 'TestPass123!');
  final _nameController = TextEditingController(text: 'Test User');
  String _status = '';

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (auth.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('CIPHERA', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white)),
              const SizedBox(height: 8),
              Text(
                auth.isAuthenticated
                    ? 'Logged in as ${auth.user!.email.isEmpty ? "Guest" : auth.user!.email} (guest: ${auth.isGuest})'
                    : 'Not logged in',
                style: const TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 24),
              TextField(controller: _nameController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Full name', labelStyle: TextStyle(color: Colors.white54))),
              TextField(controller: _emailController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Email', labelStyle: TextStyle(color: Colors.white54))),
              TextField(controller: _passwordController, obscureText: true, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Password', labelStyle: TextStyle(color: Colors.white54))),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () async {
                  final ok = await auth.register(_emailController.text, _passwordController.text, _nameController.text);
                  setState(() => _status = ok ? 'Register succeeded' : 'Register failed: ${auth.error}');
                },
                child: const Text('Register'),
              ),
              ElevatedButton(
                onPressed: () async {
                  final ok = await auth.login(_emailController.text, _passwordController.text);
                  setState(() => _status = ok ? 'Login succeeded' : 'Login failed: ${auth.error}');
                },
                child: const Text('Login'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFF5C400)),
                onPressed: () async {
                  await auth.continueAsGuest();
                  setState(() => _status = 'Continued as guest');
                },
                child: const Text('Continue as guest', style: TextStyle(color: Colors.black)),
              ),
              if (auth.isAuthenticated)
                TextButton(
                  onPressed: () async {
                    await auth.logout();
                    setState(() => _status = 'Logged out');
                  },
                  child: const Text('Logout'),
                ),
              const SizedBox(height: 16),
              Text(_status, style: const TextStyle(color: Color(0xFFF5C400))),
            ],
          ),
        ),
      ),
    );
  }
}