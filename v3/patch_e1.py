with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace `if digits[0] in "01":  return 0` with `if digits[0] == "0":  return 0`
code = code.replace('if digits[0] in "01":  return 0', 'if digits[0] == "0":  return 0')

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated _validate in feature1_pipeline_upgrade.py")
