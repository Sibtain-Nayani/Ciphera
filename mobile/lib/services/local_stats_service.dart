import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class LocalStatsService {
  static const _storage = FlutterSecureStorage();
  static const _docsKey = 'ciphera_local_docs_secured';
  static const _entitiesKey = 'ciphera_local_entities_masked';

  static Future<void> recordSession(int entityCount) async {
    if (entityCount <= 0) return;
    final docs = int.tryParse(await _storage.read(key: _docsKey) ?? '0') ?? 0;
    final entities = int.tryParse(await _storage.read(key: _entitiesKey) ?? '0') ?? 0;
    await _storage.write(key: _docsKey, value: (docs + 1).toString());
    await _storage.write(key: _entitiesKey, value: (entities + entityCount).toString());
  }

  static Future<(int, int)> readStats() async {
    final docs = int.tryParse(await _storage.read(key: _docsKey) ?? '0') ?? 0;
    final entities = int.tryParse(await _storage.read(key: _entitiesKey) ?? '0') ?? 0;
    return (docs, entities);
  }
}