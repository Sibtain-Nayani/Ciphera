/// Produces a title-cased version of [text] for sending to the detection API.
/// Preserves the exact character count and positions of [text], so entity
/// start/end offsets returned by the backend remain valid when applied back
/// onto the original text.
String normalizeCaseForDetection(String text) {
  final buffer = StringBuffer();
  bool atWordStart = true;

  for (final rune in text.runes) {
    final char = String.fromCharCode(rune);
    final isAsciiLetter = RegExp(r'[A-Za-z]').hasMatch(char);

    if (isAsciiLetter) {
      buffer.write(atWordStart ? char.toUpperCase() : char.toLowerCase());
      atWordStart = false;
    } else {
      buffer.write(char);
      // Any non-letter (space, punctuation, digit, Devanagari, etc.)
      // starts a new "word" boundary for capitalization purposes.
      atWordStart = true;
    }
  }

  return buffer.toString();
}