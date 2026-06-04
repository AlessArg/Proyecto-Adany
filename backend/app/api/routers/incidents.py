from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.db.models import Incident, IncidentSeverity, User
from app.db.session import get_session
from app.services.audit_service import log_action
from app.storage.local_store import LocalStore

router = APIRouter()


class IncidentCreate(BaseModel):
    plan_id: int | None = None
    severity: IncidentSeverity = IncidentSeverity.medium
    title: str
    description: str


@router.get("/open")
def list_open_incidents(
    _: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> list[Incident]:
    return session.list_open_incidents()


@router.post("")
def create_incident(
    payload: IncidentCreate,
    current_user: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> Incident:
    incident = Incident(
        plan_id=payload.plan_id,
        severity=payload.severity,
        title=payload.title,
        description=payload.description,
    )
    incident = session.create_incident(incident)
    log_action(
        session=session,
        username=current_user.username,
        action="create_incident",
        entity="incident",
        entity_id=incident.id,
        details={"severity": getattr(incident.severity, "value", incident.severity)},
    )
    return incident


@router.patch("/{incident_id}/resolve")
def resolve_incident(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    session: LocalStore = Depends(get_session),
) -> Incident:
    incident = session.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")

    incident.is_resolved = True
    incident = session.update_incident(incident)
    log_action(
        session=session,
        username=current_user.username,
        action="resolve_incident",
        entity="incident",
        entity_id=incident.id,
        details={},
    )
    return incident
