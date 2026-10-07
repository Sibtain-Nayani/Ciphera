with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace('                      if r.entity_type == "DATE_TIME":', '            if r.entity_type == "DATE_TIME":')
code = code.replace('                      if mapped == "DATE_TIME" and re.match(r"^\\d{10}$", clean):', '            if mapped == "DATE_TIME" and re.match(r"^\\d{10}$", clean):')

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("Patched indent.")
