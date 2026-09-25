import re

with open("backend/feature17_social_auth.py", "r") as f:
    content = f.read()

# Replace imports
content = content.replace("from feature15_auth import get_db, DB_PATH", "from app.core.database import get_db, SessionLocal\nfrom app.models.identity import User, Session as DBSessionObj\nfrom app.api.auth import create_access_token")

# Replace _find_or_create_google_user
new_find = """
def _find_or_create_google_user(
    google_id: str,
    email:     str,
    full_name: str,
) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        if user:
            return user
        
        user = User(
            email=email.lower(),
            full_name=full_name,
            password_hash="" # Google users don't have a password
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()
"""

# Replace _create_session_for_user
new_session = """
def _create_session_for_user(user: User, ip: str = "oauth") -> tuple[str, str]:
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta
        import secrets
        import hashlib
        
        refresh_token_plain = secrets.token_hex(32)
        refresh_token_hash = hashlib.sha256(refresh_token_plain.encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(days=30)
        
        session_obj = DBSessionObj(
            user_id=user.id,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at
        )
        db.add(session_obj)
        db.commit()
        
        access_token = create_access_token(user.id, user.email, user.global_role.value)
        return access_token, refresh_token_plain
    finally:
        db.close()
"""

# RegEx replacements for the functions
content = re.sub(r'def _find_or_create_google_user.*?return dict\(user\)', new_find.strip(), content, flags=re.DOTALL)
content = re.sub(r'def _create_session_for_user.*?return access_token, refresh_token', new_session.strip(), content, flags=re.DOTALL)

# Update google_callback dictionary access
content = content.replace('user.get("is_active")', 'user.is_active')
content = content.replace("user['user_id']", "user.id")
content = content.replace("user.get('plan','free')", "'free'")

with open("backend/feature17_social_auth.py", "w") as f:
    f.write(content)
print("Patched!")
