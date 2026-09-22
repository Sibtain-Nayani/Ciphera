class DashboardStats {
  final int documentsSecured;
  final int entitiesMasked;

  DashboardStats({required this.documentsSecured, required this.entitiesMasked});

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    int readInt(List<String> keys) {
      for (final k in keys) {
        final v = json[k];
        if (v is int) return v;
        if (v is num) return v.toInt();
      }
      return 0;
    }

    return DashboardStats(
      documentsSecured: readInt(['documents_secured', 'total_documents', 'documents', 'doc_count']),
      entitiesMasked: readInt(['entities_masked', 'total_entities', 'entities', 'entity_count']),
    );
  }
}