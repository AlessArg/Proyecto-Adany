from typing import Any

from app.db.models import AuditLog
from app.storage.local_store import LocalStore


def log_action(
    session: LocalStore,
    username: str,
    action: str,
    entity: str,
    entity_id: int | None,
    details: dict[str, Any],
) -> None:
    log = AuditLog(
        username=username,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details_json=details,
    )
    session.append_audit(log)
