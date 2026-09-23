import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Ciphera 2.0"
    VERSION: str = "4.0.0-alpha"
    
    # Use SQLite as a fallback for local development if Postgres isn't provided yet
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite:///./data/ciphera.db"
    )
    
    SECRET_KEY: str = os.getenv("CIPHERA_JWT_SECRET", "super-secret-key-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
