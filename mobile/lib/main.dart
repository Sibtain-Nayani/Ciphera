import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'auth_test_screen.dart';
import 'screens/home_shell.dart';
import 'providers/rules_provider.dart';

void main() {
  runApp(const CipheraApp());
}

class CipheraApp extends StatelessWidget {
  const CipheraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..tryAutoLogin()),
        ChangeNotifierProvider(create: (_) => RulesProvider()),
      ],
      child: MaterialApp(
        title: 'Ciphera',
        theme: ThemeData(
          scaffoldBackgroundColor: const Color(0xFF080808),
          brightness: Brightness.dark,
        ),
        home: const AuthGate(),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (auth.isAuthenticated) {
      return const HomeShell();
    }
    return const AuthTestScreen();
  }
}