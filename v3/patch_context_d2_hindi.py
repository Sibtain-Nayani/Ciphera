import os

path = r'backend/feature12_hindi_support.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

replacement = """        if entity.entity_type == "PIN_CODE":
            if any(kw in ctx for kw in ["version","otp","code","ref"]):
                entity.score = max(0.0, entity.score - 0.30)
        if entity.entity_type == "DATE_TIME":
            if any(kw in ctx for kw in ["phone","mobile","contact","tel","aadhaar","pan","gst","ifsc","uid","account","a/c","à¤«à¥‹à¤¨","à¤®à¥‹à¤¬à¤¾à¤‡à¤²","à¤¸à¤‚à¤ªà¤°à¥ à¤•","à¤†à¤§à¤¾à¤°","à¤ªà¥ˆà¤¨","à¤–à¤¾à¤¤à¤¾"]):
                entity.score = max(0.0, entity.score - 0.60)
    return entities"""

code = code.replace("""        if entity.entity_type == "PIN_CODE":
            if any(kw in ctx for kw in ["version","otp","code","ref"]):
                entity.score = max(0.0, entity.score - 0.30)
    return entities""", replacement)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched apply_hindi_context_scoring")
