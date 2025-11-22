"""
Database models for Ciphera application.

This module defines the User model which represents the 'users' table in the database.

Key Concepts:
- Model: A Python class that maps to a database table
- Column: Represents a column in the table
- Each instance of User class = one row in the users table

Example:
    user = User(email="test@example.com", hashed_password="...", full_name="Test User")
    # This creates a new user object (not yet saved to database)
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    """
    User model representing the users table.
    
    This class inherits from Base (defined in database.py), which tells
    SQLAlchemy that this is a database model.
    
    Attributes:
        id: Primary key, auto-incremented integer
        email: User's email address (unique, required)
        hashed_password: Bcrypt hashed password (NEVER store plain text!)
        full_name: User's display name (optional)
        is_active: Whether the account is active (default: True)
        created_at: Timestamp when user was created (auto-set)
    """
    
    # Table name in the database
    __tablename__ = "users"
    
    # Primary key - unique identifier for each user
    # Integer: whole number type
    # primary_key=True: makes this the unique identifier
    # index=True: creates an index for faster lookups
    id = Column(Integer, primary_key=True, index=True)
    
    # Email field
    # String: text type
    # unique=True: no two users can have the same email
    # index=True: faster lookups when searching by email
    # nullable=False: this field is required (can't be empty)
    email = Column(String, unique=True, index=True, nullable=False)
    
    # Hashed password field
    # We NEVER store plain text passwords!
    # This will contain the bcrypt hash (looks like: $2b$12$...)
    # nullable=False: password is required
    hashed_password = Column(String, nullable=False)
    
    # Full name field
    # nullable=True (default): this field is optional
    full_name = Column(String, nullable=True)
    
    # Active status
    # Boolean: True/False value
    # default=True: new users are active by default
    # This allows us to "soft delete" users (set to False instead of deleting)
    is_active = Column(Boolean, default=True)
    
    # Created timestamp
    # DateTime: stores date and time
    # server_default=func.now(): automatically set to current time when user is created
    # This uses SQLAlchemy's func.now() which translates to the database's NOW() function
    created_at = Column(DateTime, server_default=func.now())
    
    def __repr__(self):
        """
        String representation of the User object.
        Useful for debugging - when you print a User object, you'll see this.
        
        Example:
            user = User(email="test@example.com", full_name="Test")
            print(user)  # Output: <User(email='test@example.com', name='Test')>
        """
        return f"<User(email='{self.email}', name='{self.full_name}')>"


class Job(Base):
    """
    Job model representing anonymization tasks.
    """
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, nullable=False)  # Filename or "Free text"
    technique = Column(String, nullable=False)
    entity_count = Column(Integer, default=0)
    status = Column(String, default="success")
    created_at = Column(DateTime, server_default=func.now())
