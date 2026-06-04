from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.db.models import Driver, Order, OrderStatus, User, Vehicle
from app.db.session import get_session
from app.storage.local_store import LocalStore

router = APIRouter()


@router.get("/orders")
def list_orders(
    status: OrderStatus | None = None,
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> list[Order]:
    return session.list_orders(status=status)


@router.get("/vehicles")
def list_vehicles(
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> list[Vehicle]:
    return session.list_vehicles()


@router.get("/drivers")
def list_drivers(
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> list[Driver]:
    return session.list_drivers()
