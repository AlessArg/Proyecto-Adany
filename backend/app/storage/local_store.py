import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import RLock
from typing import Any

from app.db.models import (
    AuditLog,
    Driver,
    Incident,
    IncidentSeverity,
    Order,
    OrderStatus,
    Plan,
    PlanStatus,
    PlanStop,
    User,
    UserRole,
    Vehicle,
)


class LocalStore:
    def __init__(self, file_path: str) -> None:
        self._path = Path(file_path)
        self._lock = RLock()
        self._tables: dict[str, list[dict[str, Any]]] = {}
        self._counters: dict[str, int] = {}
        self._initialize_state()

    def _initialize_state(self) -> None:
        tables = [
            "users",
            "vehicles",
            "drivers",
            "orders",
            "plans",
            "planstops",
            "incidents",
            "auditlogs",
        ]
        self._tables = {table: [] for table in tables}
        self._counters = {table: 0 for table in tables}
        self._load()

    def _load(self) -> None:
        with self._lock:
            if not self._path.exists():
                self._path.parent.mkdir(parents=True, exist_ok=True)
                self._save_unlocked()
                return

            data = json.loads(self._path.read_text(encoding="utf-8"))
            for table in self._tables:
                self._tables[table] = list(data.get("tables", {}).get(table, []))
            self._counters.update(data.get("counters", {}))

            for table, rows in self._tables.items():
                max_id = max((int(row.get("id", 0) or 0) for row in rows), default=0)
                self._counters[table] = max(self._counters.get(table, 0), max_id)

    def _save_unlocked(self) -> None:
        payload = {
            "tables": self._tables,
            "counters": self._counters,
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    def _save(self) -> None:
        with self._lock:
            self._save_unlocked()

    def _next_id(self, table: str) -> int:
        self._counters[table] = int(self._counters.get(table, 0)) + 1
        return self._counters[table]

    def _serialize_value(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc).isoformat()
        if isinstance(value, Enum):
            return value.value
        if isinstance(value, list):
            return [self._serialize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: self._serialize_value(val) for key, val in value.items()}
        return value

    def _enum_value(self, value: Any) -> Any:
        return getattr(value, "value", value)

    def _serialize_model(self, model: Any) -> dict[str, Any]:
        raw = model.model_dump()
        return {key: self._serialize_value(val) for key, val in raw.items()}

    def _deserialize(self, model_cls: Any, row: dict[str, Any]) -> Any:
        payload = dict(row)

        datetime_fields_by_model: dict[Any, list[str]] = {
            Order: ["window_start", "window_end"],
            Plan: ["created_at"],
            PlanStop: ["eta", "etd"],
            Incident: ["created_at"],
            AuditLog: ["timestamp"],
        }
        for field_name in datetime_fields_by_model.get(model_cls, []):
            value = payload.get(field_name)
            if isinstance(value, str):
                payload[field_name] = datetime.fromisoformat(value)

        if model_cls is User and isinstance(payload.get("role"), str):
            payload["role"] = UserRole(payload["role"])
        if model_cls is Order and isinstance(payload.get("status"), str):
            payload["status"] = OrderStatus(payload["status"])
        if model_cls is Plan and isinstance(payload.get("status"), str):
            payload["status"] = PlanStatus(payload["status"])
        if model_cls is Incident and isinstance(payload.get("severity"), str):
            payload["severity"] = IncidentSeverity(payload["severity"])
        return model_cls(**payload)

    def _insert(self, table: str, model: Any) -> Any:
        with self._lock:
            payload = self._serialize_model(model)
            payload["id"] = self._next_id(table)
            self._tables[table].append(payload)
            self._save_unlocked()
            return self._deserialize(type(model), payload)

    def _update(self, table: str, model: Any) -> Any:
        with self._lock:
            payload = self._serialize_model(model)
            model_id = int(payload.get("id") or 0)
            for index, row in enumerate(self._tables[table]):
                if int(row.get("id") or 0) == model_id:
                    self._tables[table][index] = payload
                    self._save_unlocked()
                    return self._deserialize(type(model), payload)
            raise ValueError(f"Registro no encontrado en {table} con id {model_id}")

    def _find_by_id(self, table: str, model_cls: Any, item_id: int) -> Any | None:
        with self._lock:
            for row in self._tables[table]:
                if int(row.get("id") or 0) == item_id:
                    return self._deserialize(model_cls, row)
        return None

    def list_users(self) -> list[User]:
        with self._lock:
            return sorted(
                [self._deserialize(User, row) for row in self._tables["users"]],
                key=lambda item: item.username,
            )

    def get_user(self, user_id: int) -> User | None:
        return self._find_by_id("users", User, user_id)

    def get_user_by_username(self, username: str) -> User | None:
        target = username.strip().lower()
        with self._lock:
            for row in self._tables["users"]:
                if str(row.get("username", "")).lower() == target:
                    return self._deserialize(User, row)
        return None

    def create_user(self, user: User) -> User:
        return self._insert("users", user)

    def update_user(self, user: User) -> User:
        return self._update("users", user)

    def list_vehicles(self) -> list[Vehicle]:
        with self._lock:
            return sorted(
                [self._deserialize(Vehicle, row) for row in self._tables["vehicles"]],
                key=lambda item: item.id or 0,
            )

    def list_available_vehicles(
        self,
        vehicle_ids: list[int] | None = None,
        unavailable_vehicle_ids: list[int] | None = None,
    ) -> list[Vehicle]:
        include = set(vehicle_ids or [])
        unavailable = set(unavailable_vehicle_ids or [])
        vehicles = [vehicle for vehicle in self.list_vehicles() if vehicle.available]
        if include:
            vehicles = [vehicle for vehicle in vehicles if (vehicle.id or 0) in include]
        if unavailable:
            vehicles = [vehicle for vehicle in vehicles if (vehicle.id or 0) not in unavailable]
        return vehicles

    def get_vehicle_by_plate(self, plate: str) -> Vehicle | None:
        target = plate.strip().lower()
        with self._lock:
            for row in self._tables["vehicles"]:
                if str(row.get("plate", "")).lower() == target:
                    return self._deserialize(Vehicle, row)
        return None

    def create_vehicle(self, vehicle: Vehicle) -> Vehicle:
        return self._insert("vehicles", vehicle)

    def list_drivers(self) -> list[Driver]:
        with self._lock:
            return sorted(
                [self._deserialize(Driver, row) for row in self._tables["drivers"]],
                key=lambda item: item.id or 0,
            )

    def list_available_drivers(self, driver_ids: list[int] | None = None) -> list[Driver]:
        include = set(driver_ids or [])
        drivers = [driver for driver in self.list_drivers() if driver.available]
        if include:
            drivers = [driver for driver in drivers if (driver.id or 0) in include]
        return drivers

    def get_driver_by_name(self, name: str) -> Driver | None:
        target = name.strip().lower()
        with self._lock:
            for row in self._tables["drivers"]:
                if str(row.get("name", "")).lower() == target:
                    return self._deserialize(Driver, row)
        return None

    def create_driver(self, driver: Driver) -> Driver:
        return self._insert("drivers", driver)

    def list_orders(self, status: OrderStatus | None = None) -> list[Order]:
        with self._lock:
            orders = [self._deserialize(Order, row) for row in self._tables["orders"]]
        if status is not None:
            status_value = self._enum_value(status)
            orders = [order for order in orders if self._enum_value(order.status) == status_value]
        return sorted(orders, key=lambda item: (-item.priority, item.id or 0))

    def list_orders_for_planning(self, order_ids: list[int] | None = None) -> list[Order]:
        allowed = {
            self._enum_value(OrderStatus.pending),
            self._enum_value(OrderStatus.planned),
            self._enum_value(OrderStatus.dispatched),
        }
        include = set(order_ids or [])
        orders = [order for order in self.list_orders() if self._enum_value(order.status) in allowed]
        if include:
            orders = [order for order in orders if (order.id or 0) in include]
        return orders

    def get_order(self, order_id: int) -> Order | None:
        return self._find_by_id("orders", Order, order_id)

    def get_order_by_customer(self, customer_name: str) -> Order | None:
        target = customer_name.strip().lower()
        with self._lock:
            for row in self._tables["orders"]:
                if str(row.get("customer_name", "")).lower() == target:
                    return self._deserialize(Order, row)
        return None

    def create_order(self, order: Order) -> Order:
        return self._insert("orders", order)

    def update_order(self, order: Order) -> Order:
        return self._update("orders", order)

    def create_plan(self, plan: Plan) -> Plan:
        return self._insert("plans", plan)

    def update_plan(self, plan: Plan) -> Plan:
        return self._update("plans", plan)

    def get_plan(self, plan_id: int) -> Plan | None:
        return self._find_by_id("plans", Plan, plan_id)

    def get_active_plan(self) -> Plan | None:
        with self._lock:
            plans = [self._deserialize(Plan, row) for row in self._tables["plans"]]
        if not plans:
            return None
        return sorted(plans, key=lambda item: item.created_at, reverse=True)[0]

    def list_plans(self) -> list[Plan]:
        with self._lock:
            plans = [self._deserialize(Plan, row) for row in self._tables["plans"]]
        return sorted(plans, key=lambda item: item.created_at, reverse=True)

    def create_plan_stop(self, stop: PlanStop) -> PlanStop:
        return self._insert("planstops", stop)

    def list_plan_stops(self, plan_id: int) -> list[PlanStop]:
        with self._lock:
            stops = [
                self._deserialize(PlanStop, row)
                for row in self._tables["planstops"]
                if int(row.get("plan_id") or 0) == plan_id
            ]
        return sorted(stops, key=lambda item: (item.vehicle_id, item.sequence))

    def list_plan_order_ids(self, plan_id: int) -> list[int]:
        return [stop.order_id for stop in self.list_plan_stops(plan_id)]

    def create_incident(self, incident: Incident) -> Incident:
        return self._insert("incidents", incident)

    def update_incident(self, incident: Incident) -> Incident:
        return self._update("incidents", incident)

    def get_incident(self, incident_id: int) -> Incident | None:
        return self._find_by_id("incidents", Incident, incident_id)

    def list_open_incidents(self) -> list[Incident]:
        with self._lock:
            incidents = [self._deserialize(Incident, row) for row in self._tables["incidents"]]
        incidents = [incident for incident in incidents if not incident.is_resolved]
        return sorted(incidents, key=lambda item: item.created_at, reverse=True)

    def append_audit(self, log: AuditLog) -> AuditLog:
        return self._insert("auditlogs", log)

    def list_orders_by_status(self, status: OrderStatus) -> list[Order]:
        status_value = self._enum_value(status)
        return [order for order in self.list_orders() if self._enum_value(order.status) == status_value]

    def ensure_initialized(self) -> None:
        self._load()

    def clear_all(self) -> None:
        with self._lock:
            self._initialize_state()
            self._save_unlocked()
