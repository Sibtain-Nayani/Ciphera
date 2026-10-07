import re

with open("backend/feature1_pipeline_upgrade.py", "r", encoding="utf-8") as f:
    content = f.read()

old_validate = """        if entity_type == "PAN_NUMBER":
            pan = value.strip().upper()
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan): return 0
            # 4th letter is the status (P=Person, C=Company, etc.)
            if pan[3] not in {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}:
                return base_score * 0.4 # likely false positive
            return base_score

        if entity_type == "IP_ADDRESS":"""

new_validate = """        if entity_type == "PAN_NUMBER":
            pan = value.strip().upper()
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan): return 0
            # 4th letter is the status (P=Person, C=Company, etc.)
            if pan[3] not in {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}:
                return base_score * 0.4 # likely false positive
            return base_score
            
        if entity_type == "DRIVING_LICENCE":
            state_codes = {'AP', 'AR', 'AS', 'BR', 'CG', 'GA', 'GJ', 'HR', 'HP', 'JH', 'KA', 'KL', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PB', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UP', 'UK', 'WB', 'AN', 'CH', 'DN', 'DD', 'DL', 'JK', 'LA', 'LD', 'PY'}
            if value[:2].upper() not in state_codes:
                return base_score * 0.3
            return base_score

        if entity_type == "IP_ADDRESS":"""

content = content.replace(old_validate, new_validate)

with open("backend/feature1_pipeline_upgrade.py", "w", encoding="utf-8") as f:
    f.write(content)
