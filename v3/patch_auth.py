import re

# Patch feature15_auth.py
with open("backend/feature15_auth.py", "r") as f:
    content = f.read()

content = re.sub(
    r'JWT_SECRET\s*=\s*os\.getenv\("CIPHERA_JWT_SECRET",\s*secrets\.token_hex\(32\)\)',
    'from app.core.config import settings\nJWT_SECRET = settings.SECRET_KEY',
    content
)
with open("backend/feature15_auth.py", "w") as f:
    f.write(content)

# Patch app/api/auth.py
with open("backend/app/api/auth.py", "r") as f:
    content2 = f.read()

content2 = re.sub(
    r'def create_access_token\(.*?\):.*?return jwt\.encode\(payload, settings\.SECRET_KEY, algorithm=settings\.ALGORITHM\)',
    'from feature15_auth import create_access_token',
    content2,
    flags=re.DOTALL
)

content2 = re.sub(
    r'access_token = create_access_token\(user\.id, user\.email, user\.global_role\.value\)',
    'access_token = create_access_token(user.id, user.email, None, user.global_role.value)',
    content2
)

with open("backend/app/api/auth.py", "w") as f:
    f.write(content2)

# Patch app/schemas/auth.py
with open("backend/app/schemas/auth.py", "r") as f:
    content3 = f.read()
    
content3 = content3.replace('id: str\n    email: EmailStr', 'user_id: str = Field(alias="id")\n    email: EmailStr')
content3 = "from pydantic import Field\n" + content3

with open("backend/app/schemas/auth.py", "w") as f:
    f.write(content3)
