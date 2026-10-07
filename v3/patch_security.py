import os

file_path = "backend/main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

import_target = "from fastapi.middleware.cors import CORSMiddleware"
import_replacement = """from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response"""

if import_target in content:
    content = content.replace(import_target, import_replacement)

middleware_target = "app.add_middleware("
middleware_replacement = """app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware("""

if middleware_target in content:
    content = content.replace(middleware_target, middleware_replacement, 1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched main.py for security headers")
