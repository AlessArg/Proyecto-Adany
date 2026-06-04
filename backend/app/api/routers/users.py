from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_roles
from app.core.security import get_password_hash
from app.db.models import User, UserRole
from app.db.session import get_session
from app.schemas.users import (
    UserCreateRequest,
    UserPasswordResetRequest,
    UserRead,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)
from app.services.audit_service import log_action
from app.storage.local_store import LocalStore

router = APIRouter()


def to_user_read(user: User) -> UserRead:
    role_value = getattr(user.role, "value", user.role)
    return UserRead(
        id=user.id or 0,
        username=user.username,
        full_name=user.full_name,
        role=role_value,
        is_active=user.is_active,
    )


@router.get("", response_model=list[UserRead])
def list_users(
    _: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> list[UserRead]:
    users = session.list_users()
    return [to_user_read(user) for user in users]


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> UserRead:
    existing = session.get_user_by_username(payload.username)
    if existing:
        raise HTTPException(status_code=409, detail="El usuario ya existe")

    new_user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        role=payload.role,
        hashed_password=get_password_hash(payload.password),
        is_active=True,
    )
    new_user = session.create_user(new_user)

    log_action(
        session=session,
        username=current_user.username,
        action="create_user",
        entity="user",
        entity_id=new_user.id,
        details={"role": getattr(new_user.role, "value", new_user.role), "username": new_user.username},
    )

    return to_user_read(new_user)


@router.patch("/{user_id}/role", response_model=UserRead)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdateRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> UserRead:
    user = session.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    previous_role = getattr(user.role, "value", user.role)
    user.role = payload.role
    user = session.update_user(user)

    log_action(
        session=session,
        username=current_user.username,
        action="update_user_role",
        entity="user",
        entity_id=user.id,
        details={"from": previous_role, "to": getattr(user.role, "value", user.role), "username": user.username},
    )

    return to_user_read(user)


@router.patch("/{user_id}/status", response_model=UserRead)
def update_user_status(
    user_id: int,
    payload: UserStatusUpdateRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> UserRead:
    user = session.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.username == current_user.username and not payload.is_active:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propio usuario")

    user.is_active = payload.is_active
    user = session.update_user(user)

    log_action(
        session=session,
        username=current_user.username,
        action="update_user_status",
        entity="user",
        entity_id=user.id,
        details={"is_active": user.is_active, "username": user.username},
    )

    return to_user_read(user)


@router.patch("/{user_id}/password", status_code=204)
def reset_user_password(
    user_id: int,
    payload: UserPasswordResetRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> None:
    user = session.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.hashed_password = get_password_hash(payload.new_password)
    session.update_user(user)

    log_action(
        session=session,
        username=current_user.username,
        action="reset_user_password",
        entity="user",
        entity_id=user.id,
        details={"username": user.username},
    )
