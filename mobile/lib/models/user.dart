class CipheraUser {
  final String userId;
  final String email;
  final String fullName;
  final bool isGuest;

  CipheraUser({
    required this.userId,
    required this.email,
    required this.fullName,
    this.isGuest = false,
  });

  factory CipheraUser.fromJson(Map<String, dynamic> json) {
    return CipheraUser(
      userId: json['user_id']?.toString() ?? json['id']?.toString() ?? '',
      email: json['email'] ?? '',
      fullName: json['full_name'] ?? '',
      isGuest: false,
    );
  }

  factory CipheraUser.guest() {
    final id = 'guest_${DateTime.now().millisecondsSinceEpoch}';
    return CipheraUser(userId: id, email: '', fullName: 'Guest', isGuest: true);
  }
}