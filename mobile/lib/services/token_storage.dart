import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  static const _storage = FlutterSecureStorage();
  static const _accessKey = 'ciphera_access_token';
  static const _refreshKey = 'ciphera_refresh_token';
  static const _guestKey = 'ciphera_guest_flag';

  static Future<void> saveTokens({required String access, required String refresh}) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
    await _storage.delete(key: _guestKey);
  }

  static Future<String?> getAccessToken() => _storage.read(key: _accessKey);
  static Future<String?> getRefreshToken() => _storage.read(key: _refreshKey);

  static Future<void> setGuest(bool value) async {
    if (value) {
      await _storage.write(key: _guestKey, value: '1');
    } else {
      await _storage.delete(key: _guestKey);
    }
  }

  static Future<bool> isGuest() async {
    final v = await _storage.read(key: _guestKey);
    return v == '1';
  }

  static Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}