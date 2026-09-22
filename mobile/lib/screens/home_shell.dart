import 'package:flutter/material.dart';
import 'redact_screen.dart';
import 'dashboard_screen.dart';
import 'settings_screen.dart';
import 'account_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  final _screens = const [RedactScreen(), DashboardScreen(), SettingsScreen(), AccountScreen()];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: BottomNavigationBar(
        backgroundColor: const Color(0xFF080808),
        currentIndex: _index,
        selectedItemColor: const Color(0xFFF5C400),
        unselectedItemColor: Colors.white38,
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.shield_outlined), label: 'Redact'),
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_outlined), label: 'Settings'),
          BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: 'Account'),
        ],
      ),
    );
  }
}