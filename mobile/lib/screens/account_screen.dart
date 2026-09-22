import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('ACCOUNT',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
              const SizedBox(height: 20),
              if (auth.isGuest) _buildGuestPrompt(context) else _buildProfile(context, user),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGuestPrompt(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF5C400).withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('You are browsing as a guest.',
              style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
          SizedBox(height: 6),
          Text('Sign up to save your account, sync stats, and unlock export.',
              style: TextStyle(color: Colors.white54, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildProfile(BuildContext context, user) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.03),
            border: Border.all(color: Colors.white.withOpacity(0.07)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row('Name', user?.fullName ?? '—'),
              const Divider(color: Colors.white12, height: 20),
              _row('Email', user?.email ?? '—'),
              const Divider(color: Colors.white12, height: 20),
              _row('Plan', 'Free'),
            ],
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton(
          onPressed: () => context.read<AuthProvider>().logout(),
          style: OutlinedButton.styleFrom(side: BorderSide(color: Colors.white.withOpacity(0.2))),
          child: const Text('Logout', style: TextStyle(color: Colors.white)),
        ),
      ],
    );
  }

  Widget _row(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
        Flexible(
          child: Text(value,
              textAlign: TextAlign.end,
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}