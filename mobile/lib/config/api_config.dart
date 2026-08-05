import 'dart:io' show Platform;

class ApiConfig {
  static const String _port = '8000';

  static String get baseUrl {
    if (Platform.isAndroid) {
      // Android emulator maps 10.0.2.2 to the host machine's localhost.
      // "localhost" inside the emulator refers to the emulator itself, not your Mac.
      return 'http://10.0.2.2:$_port';
    }
    // iOS simulator shares the Mac's network directly, so localhost works as-is.
    return 'http://localhost:$_port';
  }
}