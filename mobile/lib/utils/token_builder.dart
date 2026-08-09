import '../models/entity.dart';
import '../models/token.dart';

List<RedactToken> buildTokenStream(String text, List<DetectedEntity> entities) {
  final sorted = [...entities]..sort((a, b) => a.start.compareTo(b.start));
  final tokens = <RedactToken>[];
  int cursor = 0;

  for (final e in sorted) {
    if (e.start < cursor || e.start >= text.length) continue; // skip overlaps/out-of-range
    final end = e.end.clamp(0, text.length);
    if (e.start > cursor) {
      tokens.add(RedactToken(type: 'text', value: text.substring(cursor, e.start)));
    }
    tokens.add(RedactToken(type: e.entityType, value: text.substring(e.start, end), score: e.score));
    cursor = end;
  }

  if (cursor < text.length) {
    tokens.add(RedactToken(type: 'text', value: text.substring(cursor)));
  }

  return tokens;
}

String maskedReplacement(String type, String value) {
  final label = type.toUpperCase();
  return '[$label]';
}