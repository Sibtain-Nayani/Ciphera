import 'package:flutter/foundation.dart';
import '../models/rule_type.dart';

class RulesProvider extends ChangeNotifier {
  final Map<String, bool> _enabled = {
    for (final r in allRules) r.id: true,
  };

  double _threshold = 0.5;
  double get threshold => _threshold;

  void setThreshold(double value) {
    _threshold = value;
    notifyListeners();
  }

  bool isEnabled(String entityType) {
    final key = entityType.toLowerCase().replaceAll('-', '_');
    if (!_enabled.containsKey(key)) return true;
    return _enabled[key]!;
  }

  bool ruleValue(String id) => _enabled[id] ?? true;

  void toggle(String id, bool value) {
    _enabled[id] = value;
    notifyListeners();
  }
}