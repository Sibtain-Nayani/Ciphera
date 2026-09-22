import '../models/entity.dart';
import 'api_client.dart';
import 'language_service.dart';

class RedactionService {
  static Future<List<DetectedEntity>> analyze(
    String text, {
    double threshold = 0.5,
    LanguageMode? languageMode,
  }) async {
    if (text.trim().isEmpty) return [];

    final mode = languageMode ?? await LanguageService.detect(text);
    String endpoint;
    switch (mode) {
      case LanguageMode.hindi:
        endpoint = '/api/v3/analyze-hindi';
        break;
      case LanguageMode.mixed:
        endpoint = '/api/v3/analyze-mixed';
        break;
      case LanguageMode.english:
        endpoint = '/api/v3/analyze';
        break;
    }

    final data = await ApiClient.post(endpoint, {
      'text': text,
      'threshold': threshold,
    });
    final rawEntities = (data['entities'] as List<dynamic>?) ?? [];
    return rawEntities.map((e) => DetectedEntity.fromJson(e as Map<String, dynamic>)).toList();
  }
}