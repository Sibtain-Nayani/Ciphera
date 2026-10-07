import os

path = r'backend/feature1_pipeline_upgrade.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

replacement = """CONTEXT_SUPPRESSION = [
    ("PERSON",          ["order","invoice","ref","id","number","product","item","section"],-0.15),
    ("AADHAAR_NUMBER",  ["order","invoice","ref","tracking","ticket","version"],          -0.20),
    ("DATE_TIME",       ["phone","mobile","contact","tel","aadhaar","pan","gst","ifsc","uid","account","a/c"], -0.60),
    ("ORGANIZATION",    ["aadhaar","pan","gst","ifsc","uid"],                             -0.40),
    ("LOCATION",        ["pan","ifsc","gst"],                                             -0.35),
    ("DATE_OF_BIRTH",   ["version","v.","release","patch"],                               -0.90),
    ("PIN_CODE",        ["version","v.","release","patch","otp","code"],                  -0.40),
]"""

code = code.replace("""CONTEXT_SUPPRESSION = [
    ("PERSON",          ["order","invoice","ref","id","number","product","item","section"],-0.15),
    ("AADHAAR_NUMBER",  ["order","invoice","ref","tracking","ticket","version"],          -0.20),
    ("DATE_TIME",       ["phone","mobile","contact","tel"],                               -0.60),
    ("ORGANIZATION",    ["aadhaar","pan","gst","ifsc","uid"],                             -0.40),
    ("LOCATION",        ["pan","ifsc","gst"],                                             -0.35),
    ("DATE_OF_BIRTH",   ["version","v.","release","patch"],                               -0.90),
    ("PIN_CODE",        ["version","v.","release","patch","otp","code"],                  -0.40),
]""", replacement)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched CONTEXT_SUPPRESSION")
