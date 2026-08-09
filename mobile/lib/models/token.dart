class RedactToken {
  final String type; // 'text' or an entity type like 'email', 'aadhaar'
  final String value;
  final double? score;

  RedactToken({required this.type, required this.value, this.score});

  bool get isEntity => type != 'text';
}