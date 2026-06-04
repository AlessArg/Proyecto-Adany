from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, require_roles
from app.db.models import Order, OrderStatus, Plan, PlanStatus, PlanStop, User, UserRole
from app.db.session import get_session
from app.schemas.planning import (
    DispatchRequest,
    PlanGenerateRequest,
    ReprogramRequest,
    TrackingGenerateRequest,
    WhatIfRequest,
)
from app.services.audit_service import log_action
from app.services.planning_service import planning_engine
from app.storage.local_store import LocalStore

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/plans/generate")
def generate_plan(
    request: PlanGenerateRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> dict:
    try:
        computation = planning_engine.compute_plan(
            session=session,
            order_ids=request.order_ids,
            vehicle_ids=request.vehicle_ids,
            driver_ids=request.driver_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    plan = planning_engine.persist_plan(
        session=session,
        created_by=current_user.id or 0,
        computation=computation,
    )
    log_action(
        session=session,
        username=current_user.username,
        action="generate_plan",
        entity="plan",
        entity_id=plan.id,
        details={"assigned_orders": len(computation.assignments)},
    )
    return planning_engine.serialize_plan(session, plan)


@router.get("/plans")
def list_plans(
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> list[dict]:
    plans = session.list_plans()
    result: list[dict] = []
    for plan in plans:
        stops = session.list_plan_stops(plan.id or 0)
        status = getattr(plan.status, "value", plan.status)
        result.append(
            {
                "plan_id": plan.id,
                "status": status,
                "created_at": plan.created_at,
                "total_distance_km": plan.total_distance_km,
                "total_cost": plan.total_cost,
                "stops_count": len(stops),
            }
        )
    return result


@router.get("/plans/{plan_id}")
def get_plan(
    plan_id: int,
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> dict:
    plan = session.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return planning_engine.serialize_plan(session, plan)


@router.post("/plans/{plan_id}/dispatch")
def dispatch_plan(
    plan_id: int,
    request: DispatchRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.dispatcher, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> dict:
    plan = session.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    plan.status = PlanStatus.dispatched
    plan = session.update_plan(plan)

    order_ids = session.list_plan_order_ids(plan.id or 0)
    if order_ids:
        related_orders = [session.get_order(order_id) for order_id in order_ids]
        for order in related_orders:
            if not order:
                continue
            order.status = OrderStatus.dispatched
            session.update_order(order)

    log_action(
        session=session,
        username=current_user.username,
        action="dispatch_plan",
        entity="plan",
        entity_id=plan.id,
        details={"notes": request.notes or ""},
    )
    return planning_engine.serialize_plan(session, plan)


@router.post("/plans/{plan_id}/reprogram")
def reprogram_plan(
    plan_id: int,
    request: ReprogramRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner)),
    session: LocalStore = Depends(get_session),
) -> dict:
    source_plan = session.get_plan(plan_id)
    if not source_plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    order_ids = session.list_plan_order_ids(source_plan.id or 0)
    if not order_ids:
        raise HTTPException(status_code=400, detail="El plan no tiene ordenes")

    try:
        computation = planning_engine.compute_plan(
            session=session,
            order_ids=order_ids,
            unavailable_vehicle_ids=request.unavailable_vehicle_ids,
            extra_delay_minutes=request.extra_delay_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    new_plan = planning_engine.persist_plan(
        session=session,
        created_by=current_user.id or 0,
        computation=computation,
        scenario_name=f"Reprogramacion de plan {source_plan.id}",
    )
    source_plan.status = PlanStatus.reprogrammed
    session.update_plan(source_plan)
    log_action(
        session=session,
        username=current_user.username,
        action="reprogram_plan",
        entity="plan",
        entity_id=new_plan.id,
        details={"source_plan_id": source_plan.id},
    )
    return planning_engine.serialize_plan(session, new_plan)


@router.post("/simulations/what-if")
def run_what_if(
    request: WhatIfRequest,
    _: User = Depends(require_roles(UserRole.admin, UserRole.planner, UserRole.dispatcher)),
    session: LocalStore = Depends(get_session),
) -> dict:
    active_plan = planning_engine.get_active_plan(session)
    scoped_order_ids = []
    if active_plan:
        scoped_order_ids = session.list_plan_order_ids(active_plan.id or 0)

    try:
        simulation = planning_engine.compute_plan(
            session=session,
            order_ids=scoped_order_ids,
            unavailable_vehicle_ids=request.unavailable_vehicle_ids,
            extra_delay_minutes=request.extra_delay_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return planning_engine.compare_with_baseline(active_plan, simulation)


@router.post("/tracking/generate")
def generate_tracking(
    request: TrackingGenerateRequest = TrackingGenerateRequest(),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.planner, UserRole.dispatcher)),
    session: LocalStore = Depends(get_session),
) -> dict:
    target_plan: Plan | None = None
    if request.plan_id is not None:
        target_plan = session.get_plan(request.plan_id)
        if not target_plan:
            raise HTTPException(status_code=404, detail="Plan no encontrado para generar tracking")
    else:
        target_plan = planning_engine.get_active_plan(session)

    if not target_plan:
        raise HTTPException(status_code=400, detail="No hay un plan disponible para generar tracking")

    tracking_points = planning_engine.build_tracking_feed(session, target_plan)
    if not tracking_points:
        raise HTTPException(status_code=400, detail="El plan seleccionado no tiene paradas para generar tracking")

    log_action(
        session=session,
        username=current_user.username,
        action="generate_tracking",
        entity="plan",
        entity_id=target_plan.id,
        details={"tracking_points": len(tracking_points)},
    )
    return {
        "plan_id": target_plan.id,
        "generated_at": datetime.now(timezone.utc),
        "points": tracking_points,
    }


@router.get("/dashboard/overview")
def dashboard_overview(
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> dict:
    return planning_engine.build_dashboard_overview(session)
