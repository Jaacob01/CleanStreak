from pydantic import BaseModel, Field
from datetime import datetime


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


class UserResponse(BaseModel):
    id: int
    username: str
    role: str = "user"
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(UserResponse):
    token: str
