from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.models import User, UserRole
from app.db.session import get_session
from app.storage.local_store import LocalStore

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/token")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: LocalStore = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        if not payload:
            raise credentials_exception
        username = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = session.get_user_by_username(username)
    if not user:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole) -> Callable:
    def role_dependency(current_user: User = Depends(get_current_user)) -> User:
        allowed_values = {role.value for role in roles}
        user_role = getattr(current_user.role, "value", current_user.role)
        if user_role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta accion",
            )
        return current_user

    return role_dependency
