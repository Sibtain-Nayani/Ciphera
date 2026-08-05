import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'token_storage.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  static Future<http.Response> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool auth = false,
    bool retry = true,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');

    final headers = {'Content-Type': 'application/json'};

    if (auth) {
      final token = await TokenStorage.getAccessToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }

    final encodedBody = body != null ? jsonEncode(body) : null;
    http.Response response;

    switch (method) {
      case 'POST':
        response = await http.post(uri, headers: headers, body: encodedBody);
        break;
      case 'GET':
        response = await http.get(uri, headers: headers);
        break;
      default:
        throw ApiException(0, 'Unsupported method $method');
    }

    if (response.statusCode == 401 && auth && retry) {
      final refreshed = await _tryRefresh();
      if (refreshed) {
        return _send(method, path, body: body, auth: auth, retry: false);
      }
    }

    return response;
  }

  static Future<bool> _tryRefresh() async {
    final refreshToken = await TokenStorage.getRefreshToken();
    if (refreshToken == null) return false;

    final uri = Uri.parse('${ApiConfig.baseUrl}/api/v3/auth/refresh');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refresh_token': refreshToken}),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      await TokenStorage.saveTokens(access: data['access_token'], refresh: data['refresh_token']);
      return true;
    }
    return false;
  }

  static Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body, {bool auth = false}) async {
    final response = await _send('POST', path, body: body, auth: auth);
    return _decode(response);
  }

  static Future<Map<String, dynamic>> get(String path, {bool auth = false}) async {
    final response = await _send('GET', path, auth: auth);
    return _decode(response);
  }

  static Map<String, dynamic> _decode(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    String message = 'Request failed';
    try {
      final data = jsonDecode(response.body);
      message = data['detail']?.toString() ?? message;
    } catch (_) {}
    throw ApiException(response.statusCode, message);
  }
}