import os
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
    SECRET_KEY: str = os.getenv("CIPHERA_JWT_SECRET", "super-secret-key-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 604800
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
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
