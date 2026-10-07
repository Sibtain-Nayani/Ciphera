import os

file_path = "backend/app/schemas/auth.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str"""

replacement = """class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    user: UserResponse"""

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched auth.py schema")
else:
    print("Target schema not found")

file_path = "backend/app/api/auth.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_plain,
        user_id=user.id
    )"""

replacement = """    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_plain,
        user_id=user.id,
        user=user
    )"""

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched auth.py logic")
else:
    print("Target logic not found")

target2 = """    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_plain,
        user_id=user.id
    )"""

replacement2 = """    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_plain,
        user_id=user.id,
        user=user
    )"""

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()
    
if target2 in content:
    content = content.replace(target2, replacement2)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched auth.py refresh logic")

