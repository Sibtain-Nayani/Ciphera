import '../models/user.dart';
import 'api_client.dart';
import 'token_storage.dart';

class AuthService {
  static Future<CipheraUser> register({
    required String email,
    required String password,
    required String fullName,
  }) async {
    final data = await ApiClient.post('/api/v3/auth/register', {
      'email': email,
      'password': password,
      'full_name': fullName,
    });
    await TokenStorage.saveTokens(access: data['access_token'], refresh: data['refresh_token']);
    return fetchCurrentUser();
  }

  static Future<CipheraUser> login({required String email, required String password}) async {
    final data = await ApiClient.post('/api/v3/auth/login', {'email': email, 'password': password});
    await TokenStorage.saveTokens(access: data['access_token'], refresh: data['refresh_token']);
    return fetchCurrentUser();
  }

  static Future<CipheraUser> fetchCurrentUser() async {
    final data = await ApiClient.get('/api/v3/auth/me', auth: true);
    return CipheraUser.fromJson(data);
  }

  // Guest mode mirrors the web app: no backend account, purely local state.
  static Future<CipheraUser> continueAsGuest() async {
    await TokenStorage.setGuest(true);
    return CipheraUser.guest();
  }

  static Future<void> logout() async {
    await TokenStorage.clearAll();
  }
}