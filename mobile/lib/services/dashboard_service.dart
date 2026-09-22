import '../models/dashboard_stats.dart';
import 'api_client.dart';

class DashboardService {
  static Future<DashboardStats> fetchStats() async {
    final data = await ApiClient.get('/api/v3/audit/stats', auth: true);
    return DashboardStats.fromJson(data);
  }
}