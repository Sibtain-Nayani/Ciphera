import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/token_storage.dart';

class AuthProvider extends ChangeNotifier {
  CipheraUser? _user;
  bool _loading = true;
  String? _error;

  CipheraUser? get user => _user;
  bool get loading => _loading;
  bool get isAuthenticated => _user != null;
  bool get isGuest => _user?.isGuest ?? false;
  String? get error => _error;

  Future<void> tryAutoLogin() async {
    _loading = true;
    notifyListeners();

    if (await TokenStorage.isGuest()) {
      _user = CipheraUser.guest();
      _loading = false;
      notifyListeners();
      return;
    }

    final token = await TokenStorage.getAccessToken();
    if (token == null) {
      _loading = false;
      notifyListeners();
      return;
    }

    try {
      _user = await AuthService.fetchCurrentUser();
    } catch (_) {
      await TokenStorage.clearAll();
      _user = null;
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _error = null;
    try {
      _user = await AuthService.login(email: email, password: password);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> register(String email, String password, String fullName) async {
    _error = null;
    try {
      _user = await AuthService.register(email: email, password: password, fullName: fullName);
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> continueAsGuest() async {
    _user = await AuthService.continueAsGuest();
    notifyListeners();
  }

  Future<void> logout() async {
    await AuthService.logout();
    _user = null;
    notifyListeners();
  }
}