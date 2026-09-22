import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/dashboard_stats.dart';
import '../providers/auth_provider.dart';
import '../services/dashboard_service.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Future<DashboardStats>? _statsFuture;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthProvider>();
    if (!auth.isGuest) {
      _statsFuture = DashboardService.fetchStats();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('DASHBOARD',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
              const SizedBox(height: 4),
              Text(
                auth.isGuest
                    ? 'Guest session'
                    : 'Welcome back${auth.user?.fullName.isNotEmpty == true ? ", ${auth.user!.fullName}" : ""}',
                style: const TextStyle(color: Colors.white54, fontSize: 12),
              ),
              const SizedBox(height: 20),
              Expanded(
                child: auth.isGuest ? _buildGuestState() : _buildAuthedState(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGuestState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text("Guest sessions don't sync stats to the server.",
              textAlign: TextAlign.center, style: TextStyle(color: Colors.white54, fontSize: 13)),
          const SizedBox(height: 12),
          const Text('Sign up to track documents secured over time.',
              textAlign: TextAlign.center, style: TextStyle(color: Color(0xFFF5C400), fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildAuthedState() {
    return FutureBuilder<DashboardStats>(
      future: _statsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: Text('Could not load stats: ${snapshot.error}',
                style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 12)),
          );
        }
        final stats = snapshot.data!;
        return Row(
          children: [
            Expanded(child: _statCard('DOCS SECURED', stats.documentsSecured.toString())),
            const SizedBox(width: 10),
            Expanded(child: _statCard('ENTITIES MASKED', stats.entitiesMasked.toString())),
          ],
        );
      },
    );
  }

  Widget _statCard(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        border: Border.all(color: Colors.white.withOpacity(0.07)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 9)),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(color: Color(0xFFF5C400), fontSize: 30, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}