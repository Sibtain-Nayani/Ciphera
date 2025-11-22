"""
Database configuration for Ciphera application.

This module sets up the SQLite database connection using SQLAlchemy ORM.

Key Concepts:
- SQLite: File-based database (stored as ciphera.db)
- SQLAlchemy: ORM (Object-Relational Mapping) library
- Engine: Manages database connections
- SessionLocal: Factory for creating database sessions
- Base: Base class for all database models
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database URL - SQLite file will be created in the backend directory
# Format: sqlite:///./filename.db
# The "./" means current directory, "ciphera.db" is the database file
SQLALCHEMY_DATABASE_URL = "sqlite:///./ciphera.db"

# Create database engine
# check_same_thread=False is needed for SQLite to work with FastAPI
# (FastAPI uses multiple threads, SQLite by default only allows one thread)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# SessionLocal: This is a factory for creating database sessions
# A session is like opening a connection to the database
# autocommit=False: Changes aren't saved until we explicitly commit
# autoflush=False: Don't automatically flush changes to database
# bind=engine: Connect this session factory to our database engine
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base: All our database models will inherit from this class
# This allows SQLAlchemy to track all our models and create tables
Base = declarative_base()


# Dependency function for FastAPI routes
# This function will be used in our endpoints to get a database session
def get_db():
    """
    Dependency that provides a database session to route handlers.
    
    Usage in FastAPI:
        @app.get("/users")
        def get_users(db: Session = Depends(get_db)):
            # db is now a database session
            users = db.query(User).all()
            return users
    
    The 'finally' block ensures the session is always closed,
    even if an error occurs. This prevents database connection leaks.
    """
    db = SessionLocal()
    try:
        yield db  # Provide the session to the route handler
    finally:
        db.close()  # Always close the session when done
