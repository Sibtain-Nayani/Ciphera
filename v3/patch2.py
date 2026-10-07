import re

# Patch VerificationEngine Layer 3 to catch fragmented text
with open("backend/app/services/verification_engine.py", "r") as f:
    engine_code = f.read()

# We will just add a space-ignoring match for PAN/Aadhaar to Layer 3
defrag_layer = """        for entity_type, pattern in AUDIT_PATTERNS.items():
            for match in pattern.findall(text_to_audit):
                clean_match = str(match).strip()
                if clean_match.lower() not in allowed_texts:
                    leaks.append(f"Regex Leak: {entity_type} ({clean_match})")
                    
        # Layer 3.5: Defragmented fallback for heavily spaced text
        dense_chars = []
        orig_indices = []
        for i, c in enumerate(text_to_audit):
            if not c.isspace():
                dense_chars.append(c)
                orig_indices.append(i)
        dense_text = "".join(dense_chars)
        
        for entity_type, pattern in AUDIT_PATTERNS.items():
            if entity_type not in ["PAN_CARD", "AADHAAR"]: continue
            # Remove \b
            raw_pattern = pattern.pattern.replace(r'\\b', '')
            for match in re.finditer(raw_pattern, dense_text, re.IGNORECASE):
                dense_match = match.group(0)
                orig_start = orig_indices[match.start()]
                orig_end = orig_indices[match.end()-1] + 1
                raw_window = text_to_audit[orig_start:orig_end]
                # If it's highly spaced, it's a fragmentation leak
                if len(raw_window) > len(dense_match) + 2:
                    if raw_window.lower() not in allowed_texts:
                        leaks.append(f"Regex Defrag Leak: {entity_type} ({raw_window})")
"""

engine_code = re.sub(r'        for entity_type, pattern in AUDIT_PATTERNS.items():.*?leaks.append.*?clean_match.*?\)("\n)?', defrag_layer, engine_code, flags=re.DOTALL)

with open("backend/app/services/verification_engine.py", "w") as f:
    f.write(engine_code)
