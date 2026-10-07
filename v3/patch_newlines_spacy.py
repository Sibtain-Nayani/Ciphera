with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove '\n' check in PresidioStage
code = code.replace('if "\\n" in span:\n                continue', '')

# Remove '\n' check in SpacyNERStage
code = code.replace('if "\\n" in ent.text:\n                continue', '')

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("Patched newlines.")
