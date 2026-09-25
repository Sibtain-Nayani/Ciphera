with open('backend/app/core/config.py', 'r') as f:
    content = f.read()

content = content.replace('ACCESS_TOKEN_EXPIRE_MINUTES: int = 15', 'ACCESS_TOKEN_EXPIRE_MINUTES: int = 604800')

with open('backend/app/core/config.py', 'w') as f:
    f.write(content)
