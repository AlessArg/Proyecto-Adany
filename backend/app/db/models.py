from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    admin = "admin"
    planner = "planner"
    dispatcher = "dispatcher"


class OrderStatus(str, Enum):
    pending = "pending"
    planned = "planned"
    dispatched = "dispatched"
    delivered = "delivered"


class PlanStatus(str, Enum):
    draft = "draft"
    dispatched = "dispatched"
    reprogrammed = "reprogrammed"


class IncidentSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    full_name: str
    role: UserRole
    hashed_password: str
    is_active: bool = True


class Vehicle(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    plate: str = Field(index=True, unique=True)
    capacity_weight_kg: float
    capacity_volume_m3: float
    compatible_load_types: str = "general"
    shift_start_min: int = 360
    shift_end_min: int = 1200
    available: bool = True
    cost_per_km: float = 1.8
    cost_per_hour: float = 18.0


class Driver(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    license_type: str = "C"
    shift_start_min: int = 360
    shift_end_min: int = 1200
    available: bool = True


class Order(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    customer_name: str
    priority: int = 1
    sla_minutes: int = 240
    weight_kg: float
    volume_m3: float
    service_time_min: int = 20
    latitude: float
    longitude: float
    window_start: datetime
    window_end: datetime
    load_type: str = "general"
    status: OrderStatus = OrderStatus.pending


class Plan(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: int
    status: PlanStatus = PlanStatus.draft
    total_distance_km: float = 0
    total_cost: float = 0
    scenario_name: str | None = None
    alerts_json: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
    )


class PlanStop(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    plan_id: int = Field(foreign_key="plan.id", index=True)
    order_id: int = Field(foreign_key="order.id")
    vehicle_id: int = Field(foreign_key="vehicle.id")
    driver_id: int = Field(foreign_key="driver.id")
    sequence: int
    eta: datetime
    etd: datetime
    distance_from_prev_km: float
    risk_level: str = "ok"


class Incident(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    plan_id: int | None = Field(default=None, foreign_key="plan.id")
    severity: IncidentSeverity = IncidentSeverity.medium
    title: str
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_resolved: bool = False


class AuditLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    username: str
    action: str
    entity: str
    entity_id: int | None = None
    details_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
