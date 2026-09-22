import 'api_client.dart';

enum LanguageMode { english, hindi, mixed }

class LanguageService {
  static Future<LanguageMode> detect(String text) async {
    if (text.trim().isEmpty) return LanguageMode.english;
    final sample = text.length > 3000 ? text.substring(0, 3000) : text;
    final data = await ApiClient.post('/api/v3/detect-language', {'text': sample});
    final mode = (data['mode'] ?? 'english').toString().toLowerCase();
    switch (mode) {
      case 'hindi':
        return LanguageMode.hindi;
      case 'mixed':
        return LanguageMode.mixed;
      default:
        return LanguageMode.english;
    }
  }
}