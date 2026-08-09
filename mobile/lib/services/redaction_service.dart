import '../models/entity.dart';
import 'api_client.dart';

class RedactionService {
  static Future<List<DetectedEntity>> analyze(String text, {double threshold = 0.5}) async {
    if (text.trim().isEmpty) return [];
    final data = await ApiClient.post('/api/v3/analyze', {
      'text': text,
      'threshold': threshold,
    });
    final rawEntities = (data['entities'] as List<dynamic>?) ?? [];
    return rawEntities.map((e) => DetectedEntity.fromJson(e as Map<String, dynamic>)).toList();
  }
}