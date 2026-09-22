import 'package:flutter/material.dart';

const Map<String, Color> _entityColors = {
  'person': Color(0xFF3B82F6),
  'email_address': Color(0xFF60A5FA),
  'phone_number': Color(0xFF34D399),
  'credit_card': Color(0xFFF59E0B),
  'us_ssn': Color(0xFFF472B6),
  'date_time': Color(0xFF94A3B8),
  'url': Color(0xFF06B6D4),
  'ip_address': Color(0xFFA78BFA),
  'location': Color(0xFFFB7185),
  'nrp': Color(0xFF818CF8),
  'aadhaar_number': Color(0xFFF97316),
  'aadhaar': Color(0xFFF97316),
  'pan_number': Color(0xFFEAB308),
  'pan': Color(0xFFEAB308),
  'gst_number': Color(0xFF2DD4BF),
  'gst': Color(0xFF2DD4BF),
  'ifsc_code': Color(0xFF38BDF8),
  'ifsc': Color(0xFF38BDF8),
  'upi_id': Color(0xFF34D399),
  'upi': Color(0xFF34D399),
  'voter_id': Color(0xFFEC4899),
  'passport_number': Color(0xFF818CF8),
  'vehicle_registration': Color(0xFFFB7185),
  'bank_account': Color(0xFF60A5FA),
  'driving_licence': Color(0xFFF97316),
  'pin_code': Color(0xFF60A5FA),
};

const Color _fallbackColor = Color(0xFF9CA3AF);

Color colorForEntityType(String type) {
  final key = type.toLowerCase().replaceAll('_', '').replaceAll('-', '');
  return _entityColors[key] ?? _fallbackColor;
}