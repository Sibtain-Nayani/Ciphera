import os

file_path = "backend/app/schemas/auth.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target_to_remove = """class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    global_role: GlobalRole
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True"""

if target_to_remove in content:
    content = content.replace(target_to_remove, "")
    
    insert_pos = content.find("class TokenResponse(BaseModel):")
    if insert_pos != -1:
        content = content[:insert_pos] + target_to_remove + "\n\n" + content[insert_pos:]
        
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched auth.py schema ordering")
else:
    print("Could not find UserResponse to move")
