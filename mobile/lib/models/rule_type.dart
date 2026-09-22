class RuleDef {
  final String id;
  final String label;
  final String category;
  const RuleDef({required this.id, required this.label, required this.category});
}

const List<RuleDef> allRules = [
  RuleDef(id: 'aadhaar', label: 'Aadhaar', category: 'Indian PII'),
  RuleDef(id: 'pan', label: 'PAN', category: 'Indian PII'),
  RuleDef(id: 'gst', label: 'GST / GSTIN', category: 'Indian PII'),
  RuleDef(id: 'ifsc', label: 'IFSC', category: 'Indian PII'),
  RuleDef(id: 'voterid', label: 'Voter ID', category: 'Indian PII'),
  RuleDef(id: 'passport', label: 'Passport', category: 'Indian PII'),
  RuleDef(id: 'vehiclereg', label: 'Vehicle Registration', category: 'Indian PII'),
  RuleDef(id: 'upi', label: 'UPI ID', category: 'Indian PII'),
  RuleDef(id: 'bankaccount', label: 'Bank Account', category: 'Indian PII'),
  RuleDef(id: 'drivinglicence', label: 'Driving Licence', category: 'Indian PII'),
  RuleDef(id: 'pincode', label: 'PIN Code', category: 'Indian PII'),
  RuleDef(id: 'person', label: 'Names', category: 'Identity'),
  RuleDef(id: 'email_address', label: 'Email', category: 'Identity'),
  RuleDef(id: 'phone_number', label: 'Phone', category: 'Identity'),
  RuleDef(id: 'dob', label: 'Date of Birth', category: 'Identity'),
  RuleDef(id: 'date_time', label: 'General Dates', category: 'Identity'),
  RuleDef(id: 'credit_card', label: 'Credit Card', category: 'Financial'),
  RuleDef(id: 'us_ssn', label: 'SSN / TIN', category: 'Financial'),
  RuleDef(id: 'url', label: 'URLs', category: 'Network'),
  RuleDef(id: 'ip_address', label: 'IP Addresses', category: 'Network'),
];