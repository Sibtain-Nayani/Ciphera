class RedactToken {
  final String type;
  final String value;
  final double? score;
  final int? start;
  final int? end;

  RedactToken({required this.type, required this.value, this.score, this.start, this.end});

  bool get isEntity => type != 'text';
}