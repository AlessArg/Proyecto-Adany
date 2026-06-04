from pydantic import BaseModel, Field

from app.db.models import UserRole


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=3, max_length=120)
    role: UserRole
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    id: int
    username: str
    full_name: str
    role: UserRole
    is_active: bool


class UserRoleUpdateRequest(BaseModel):
    role: UserRole


class UserStatusUpdateRequest(BaseModel):
    is_active: bool


class UserPasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
