import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/rule_type.dart';
import '../providers/rules_provider.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final rules = context.watch<RulesProvider>();
    final categories = <String>[];
    for (final r in allRules) {
      if (!categories.contains(r.category)) categories.add(r.category);
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('SETTINGS',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
              const Text('Detection rules', style: TextStyle(color: Colors.white54, fontSize: 12)),
              const SizedBox(height: 20),
              Text('CONFIDENCE THRESHOLD  ${(rules.threshold * 100).toStringAsFixed(0)}%',
                  style: const TextStyle(color: Color(0xFFF5C400), fontSize: 11, letterSpacing: 1)),
              Slider(
                value: rules.threshold,
                min: 0.1,
                max: 0.9,
                divisions: 8,
                activeColor: const Color(0xFFF5C400),
                inactiveColor: Colors.white.withOpacity(0.1),
                onChanged: (v) => rules.setThreshold(v),
              ),
              const Text('Lower catches more, but with more false positives.',
                  style: TextStyle(color: Colors.white38, fontSize: 11)),
              const SizedBox(height: 12),
              Expanded(
                child: ListView(
                  children: [
                    for (final category in categories) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: 16, bottom: 6),
                        child: Text(category.toUpperCase(),
                            style: const TextStyle(color: Color(0xFFF5C400), fontSize: 11, letterSpacing: 1)),
                      ),
                      for (final rule in allRules.where((r) => r.category == category))
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(rule.label, style: const TextStyle(color: Colors.white, fontSize: 14)),
                          value: rules.ruleValue(rule.id),
                          activeColor: const Color(0xFFF5C400),
                          onChanged: (v) => rules.toggle(rule.id, v),
                        ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}