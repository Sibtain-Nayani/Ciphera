import re

FILE_PATH = "backend/feature1_pipeline_upgrade.py"

with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

defrag_code = """        if dense_chars:
            dense_text = "".join(dense_chars)
            for pattern, entity_type, base_score in self._compiled:
                if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "PHONE_NUMBER", "BANK_ACCOUNT", "CREDIT_CARD", "VOTER_ID", "GST_NUMBER", "IFSC_CODE", "EMAIL_ADDRESS"}:
                    continue
                
                # Remove \\b from pattern for dense search since word boundaries don't exist in defragmented text
                raw_pattern = pattern.pattern
                if raw_pattern.startswith(r"\\b"):
                    raw_pattern = raw_pattern[2:]
                if raw_pattern.endswith(r"\\b"):
                    raw_pattern = raw_pattern[:-2]
                
                # In Python regex, we must recompile
                dense_pattern = re.compile(raw_pattern, pattern.flags)
                    
                for m in dense_pattern.finditer(dense_text):
                    raw_dense = m.group()"""

# Replace the old defrag loop start
old_defrag = """        if dense_chars:
            dense_text = "".join(dense_chars)
            for pattern, entity_type, base_score in self._compiled:
                if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "PHONE_NUMBER", "BANK_ACCOUNT", "CREDIT_CARD", "VOTER_ID", "GST_NUMBER", "IFSC_CODE", "EMAIL_ADDRESS"}:
                    continue
                    
                for m in pattern.finditer(dense_text):
                    raw_dense = m.group()"""

content = content.replace(old_defrag, defrag_code)

with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print("Defragmentation \\b patched.")
