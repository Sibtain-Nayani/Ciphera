class DetectedEntity {
  final int start;
  final int end;
  final String entityType;
  final double score;

  DetectedEntity({
    required this.start,
    required this.end,
    required this.entityType,
    required this.score,
  });

  factory DetectedEntity.fromJson(Map<String, dynamic> json) {
    return DetectedEntity(
      start: json['start'] as int,
      end: json['end'] as int,
      entityType: (json['entity_type'] ?? json['type'] ?? 'unknown').toString(),
      score: (json['score'] as num?)?.toDouble() ?? 0.0,
    );
  }
}