import os
import hashlib

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Ciphera 2.0"
    VERSION: str = "4.0.0-alpha"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite:///./data/ciphera.db"
    )
    
    # Auth
    SECRET_KEY: SecretStr = Field(validation_alias="CIPHERA_JWT_SECRET")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    JWT_ISSUER: str = "ciphera-v3"
    JWT_AUDIENCE: str = "ciphera-api"
    ORG_INVITE_AUDIENCE: str = "ciphera-org-invite"
    AUTH_RATE_LIMIT_REDIS_URL: str = Field(
        default_factory=lambda: os.getenv("AUTH_RATE_LIMIT_REDIS_URL")
        or os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    )
    AUTH_LOGIN_IP_LIMIT: int = 20
    AUTH_LOGIN_ACCOUNT_LIMIT: int = 8
    AUTH_LOGIN_WINDOW_SECONDS: int = 900
    AUTH_REFRESH_IP_LIMIT: int = 120
    AUTH_REFRESH_ACCOUNT_LIMIT: int = 30
    AUTH_REFRESH_WINDOW_SECONDS: int = 300

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_signing_key(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value().strip()
        normalized = raw.casefold()
        if (
            len(raw.encode("utf-8")) < 32
            or len(set(raw)) < 12
            or normalized.startswith(("your_", "replace-with", "change-me", "changeme"))
        ):
            raise ValueError("CIPHERA_JWT_SECRET must be a non-placeholder random value of at least 32 bytes")
        return SecretStr(raw)

    @property
    def jwt_signing_secret(self) -> str:
        return self.SECRET_KEY.get_secret_value()

    @property
    def auth_key_version(self) -> str:
        return hashlib.sha256(self.jwt_signing_secret.encode("utf-8")).hexdigest()
    
    # Storage (Phase 9)
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local") # "local" or "s3"
    LOCAL_STORAGE_DIR: str = os.getenv("LOCAL_STORAGE_DIR", "./data/uploads")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "ciphera-documents")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "") # For MinIO

    # Resource & Processing Limits (Phase E7 / Remediation P1)
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(25 * 1024 * 1024))) # 25MB
    MAX_PDF_PAGE_COUNT: int = int(os.getenv("MAX_PDF_PAGE_COUNT", "100")) # 100 pages
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
