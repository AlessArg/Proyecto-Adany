from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.db.models import User
from app.db.session import get_session
from app.schemas.auth import Token
from app.storage.local_store import LocalStore

router = APIRouter()


@router.post("/token", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: LocalStore = Depends(get_session),
) -> Token:
    user = session.get_user_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales invalidas",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo. Contacta al administrador.",
        )

    role_value = getattr(user.role, "value", user.role)
    token = create_access_token(subject=user.username, role=role_value)
    return Token(access_token=token)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    role_value = getattr(current_user.role, "value", current_user.role)
    return {
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": role_value,
        "is_active": current_user.is_active,
    }
