import re
FILE_PATH = "backend/feature1_pipeline_upgrade.py"
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

old_defrag_filter = 'if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "PHONE_NUMBER", "BANK_ACCOUNT", "CREDIT_CARD", "VOTER_ID", "GST_NUMBER", "IFSC_CODE", "EMAIL_ADDRESS"}:'
new_defrag_filter = 'if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "GST_NUMBER", "IFSC_CODE"}:'

content = content.replace(old_defrag_filter, new_defrag_filter)

# Also, for AADHAAR and PAN defragmentation, enforce max spacing
# Add this inside the loop where raw_orig is extracted
old_raw_orig = """                  orig_start = original_indices[dense_start]
                  orig_end = original_indices[dense_end] + 1
                  raw_orig = text[orig_start:orig_end]"""

new_raw_orig = """                  orig_start = original_indices[dense_start]
                  orig_end = original_indices[dense_end] + 1
                  raw_orig = text[orig_start:orig_end]
                  
                  # Structural validation of the fragment
                  # 1. Reject if it spans across multiple lines (more than 1 newline)
                  if raw_orig.count('\\n') > 1:
                      continue
                  # 2. Reject if the ratio of spaces to chars is absurd (e.g. more spaces than chars + 5)
                  # A fully spaced PAN (10 chars) has 9 spaces, length 19.
                  if len(raw_orig) > len(raw_dense) * 2 + 2:
                      continue
                  # 3. For Aadhaar, it shouldn't be fully spaced out digit by digit unless context is super strong.
                  if entity_type == "AADHAAR_NUMBER" and len(raw_orig) > 14: # 12 digits + 2 spaces is normal (4-4-4)
                      ctx = _get_context(text, orig_start, orig_end, self._CTX_WINDOW).lower()
                      if not any(kw in ctx for kw in self._AADHAAR_CTX_KW):
                          continue"""

content = content.replace(old_raw_orig, new_raw_orig)

with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print("P1-A De-fragmentation fixed.")
