from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

from app.core.config import settings
from app.db.models import (
    Driver,
    Incident,
    Order,
    OrderStatus,
    Plan,
    PlanStatus,
    PlanStop,
    Vehicle,
)
from app.storage.local_store import LocalStore


@dataclass
class PlanComputation:
    assignments: list[dict]
    alerts: list[dict]
    total_distance_km: float
    total_cost: float


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    c = 2 * asin(sqrt(a))
    return radius_km * c


def minute_of_day_to_datetime(base_date: datetime, minute_of_day: int) -> datetime:
    midnight = datetime(
        year=base_date.year,
        month=base_date.month,
        day=base_date.day,
        tzinfo=timezone.utc,
    )
    return midnight + timedelta(minutes=minute_of_day)


def ensure_utc_datetime(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if value.tzinfo is None:
        try:
            local_tz = ZoneInfo(settings.operation_timezone)
        except ZoneInfoNotFoundError:
            local_tz = timezone(timedelta(hours=settings.operation_utc_offset_hours))
        return value.replace(tzinfo=local_tz).astimezone(timezone.utc)
    return value.astimezone(timezone.utc)


class PlanningEngine:
    def __init__(self) -> None:
        self.depot = (settings.depot_latitude, settings.depot_longitude)

    def compute_plan(
        self,
        session: LocalStore,
        order_ids: list[int] | None = None,
        vehicle_ids: list[int] | None = None,
        driver_ids: list[int] | None = None,
        unavailable_vehicle_ids: list[int] | None = None,
        extra_delay_minutes: int = 0,
    ) -> PlanComputation:
        now = datetime.now(timezone.utc)
        unavailable_set = set(unavailable_vehicle_ids or [])

        orders = session.list_orders_for_planning(order_ids=order_ids)
        vehicles = session.list_available_vehicles(
            vehicle_ids=vehicle_ids,
            unavailable_vehicle_ids=list(unavailable_set),
        )
        drivers = session.list_available_drivers(driver_ids=driver_ids)

        if not orders:
            return PlanComputation(assignments=[], alerts=[], total_distance_km=0, total_cost=0)
        if not vehicles:
            raise ValueError("No hay vehiculos disponibles para planificar")
        if not drivers:
            raise ValueError("No hay conductores disponibles para planificar")

        vehicle_states: list[dict] = []
        for index, vehicle in enumerate(vehicles):
            driver = drivers[index % len(drivers)]
            start_time = minute_of_day_to_datetime(now, vehicle.shift_start_min)
            shift_end = minute_of_day_to_datetime(now, vehicle.shift_end_min)
            if now > shift_end:
                start_time += timedelta(days=1)
                shift_end += timedelta(days=1)
            start_time = start_time + timedelta(minutes=extra_delay_minutes)
            vehicle_states.append(
                {
                    "vehicle": vehicle,
                    "driver": driver,
                    "current_lat": self.depot[0],
                    "current_lon": self.depot[1],
                    "current_time": start_time,
                    "used_weight": 0.0,
                    "used_volume": 0.0,
                    "sequence": 0,
                    "distance": 0.0,
                    "minutes": 0.0,
                    "shift_end": shift_end,
                }
            )

        sorted_orders = sorted(
            orders,
            key=lambda order: (-order.priority, order.window_end),
        )

        assignments: list[dict] = []
        alerts: list[dict] = []

        for order in sorted_orders:
            best_state: dict | None = None
            best_assignment: dict | None = None

            for state in vehicle_states:
                vehicle: Vehicle = state["vehicle"]
                compatible_types = {item.strip() for item in vehicle.compatible_load_types.split(",")}
                if order.load_type not in compatible_types:
                    continue

                next_weight = state["used_weight"] + order.weight_kg
                next_volume = state["used_volume"] + order.volume_m3
                if next_weight > vehicle.capacity_weight_kg:
                    continue
                if next_volume > vehicle.capacity_volume_m3:
                    continue

                distance_km = haversine_km(
                    state["current_lat"],
                    state["current_lon"],
                    order.latitude,
                    order.longitude,
                )
                travel_minutes = (distance_km / settings.average_speed_kmh) * 60
                eta = state["current_time"] + timedelta(minutes=travel_minutes)
                window_start = ensure_utc_datetime(order.window_start)
                window_end = ensure_utc_datetime(order.window_end)

                # In demo data, persisted windows may become stale after some hours/days.
                # Shift expired windows forward preserving duration to keep scenarios operable.
                if window_end < now:
                    window_duration = max(window_end - window_start, timedelta(minutes=30))
                    window_start = now + timedelta(minutes=10)
                    window_end = window_start + window_duration

                eta = max(eta, window_start)
                etd = eta + timedelta(minutes=order.service_time_min)
                shift_end = state["shift_end"]
                if etd > shift_end:
                    continue
                if eta > window_end:
                    continue

                minutes_to_window_end = (window_end - eta).total_seconds() / 60
                risk_level = "ok"
                if minutes_to_window_end < 20:
                    risk_level = "high"
                elif minutes_to_window_end < 45:
                    risk_level = "medium"

                # Priorizamos cercania, pero permitimos que prioridad alta empuje la asignacion.
                score = distance_km - (order.priority * 0.35)
                if not best_assignment or score < best_assignment["score"]:
                    best_state = state
                    best_assignment = {
                        "score": score,
                        "vehicle_id": vehicle.id,
                        "driver_id": state["driver"].id,
                        "order_id": order.id,
                        "eta": eta,
                        "etd": etd,
                        "distance_km": distance_km,
                        "risk_level": risk_level,
                    }

            if not best_state or not best_assignment:
                alerts.append(
                    {
                        "type": "unassigned_order",
                        "severity": "high",
                        "message": f"Orden {order.id} no se pudo asignar con restricciones actuales",
                    }
                )
                continue

            best_state["sequence"] += 1
            best_state["used_weight"] += order.weight_kg
            best_state["used_volume"] += order.volume_m3
            best_state["current_lat"] = order.latitude
            best_state["current_lon"] = order.longitude
            best_state["current_time"] = best_assignment["etd"]
            best_state["distance"] += best_assignment["distance_km"]
            best_state["minutes"] += (
                (best_assignment["etd"] - best_assignment["eta"]).total_seconds() / 60
                + (best_assignment["distance_km"] / settings.average_speed_kmh) * 60
            )

            assignments.append(
                {
                    "order_id": best_assignment["order_id"],
                    "vehicle_id": best_assignment["vehicle_id"],
                    "driver_id": best_assignment["driver_id"],
                    "sequence": best_state["sequence"],
                    "eta": best_assignment["eta"],
                    "etd": best_assignment["etd"],
                    "distance_from_prev_km": round(best_assignment["distance_km"], 2),
                    "risk_level": best_assignment["risk_level"],
                }
            )

            if best_assignment["risk_level"] in {"medium", "high"}:
                alerts.append(
                    {
                        "type": "eta_risk",
                        "severity": best_assignment["risk_level"],
                        "message": f"Orden {order.id} tiene riesgo {best_assignment['risk_level']} por ventana ajustada",
                    }
                )

        total_distance_km = round(sum(state["distance"] for state in vehicle_states), 2)
        total_cost = 0.0
        for state in vehicle_states:
            vehicle = state["vehicle"]
            total_cost += state["distance"] * vehicle.cost_per_km
            total_cost += (state["minutes"] / 60) * vehicle.cost_per_hour

        return PlanComputation(
            assignments=assignments,
            alerts=alerts,
            total_distance_km=total_distance_km,
            total_cost=round(total_cost, 2),
        )

    def persist_plan(
        self,
        session: LocalStore,
        created_by: int,
        computation: PlanComputation,
        scenario_name: str | None = None,
    ) -> Plan:
        plan = Plan(
            created_by=created_by,
            total_distance_km=computation.total_distance_km,
            total_cost=computation.total_cost,
            alerts_json=computation.alerts,
            scenario_name=scenario_name,
        )
        plan = session.create_plan(plan)

        for assignment in computation.assignments:
            stop = PlanStop(plan_id=plan.id, **assignment)
            session.create_plan_stop(stop)

            order = session.get_order(assignment["order_id"])
            if order:
                order.status = OrderStatus.planned
                session.update_order(order)

        return plan

    def serialize_plan(self, session: LocalStore, plan: Plan) -> dict:
        stops = session.list_plan_stops(plan.id or 0)
        return {
            "plan_id": plan.id,
            "status": getattr(plan.status, "value", plan.status),
            "created_at": plan.created_at,
            "total_distance_km": plan.total_distance_km,
            "total_cost": plan.total_cost,
            "alerts": plan.alerts_json,
            "stops": [
                {
                    "order_id": stop.order_id,
                    "vehicle_id": stop.vehicle_id,
                    "driver_id": stop.driver_id,
                    "sequence": stop.sequence,
                    "eta": stop.eta,
                    "etd": stop.etd,
                    "distance_from_prev_km": stop.distance_from_prev_km,
                    "risk_level": stop.risk_level,
                }
                for stop in stops
            ],
        }

    def get_active_plan(self, session: LocalStore) -> Plan | None:
        return session.get_active_plan()

    def compare_with_baseline(self, active_plan: Plan | None, simulation: PlanComputation) -> dict:
        baseline_distance = active_plan.total_distance_km if active_plan else 0.0
        baseline_cost = active_plan.total_cost if active_plan else 0.0
        scenario_distance = simulation.total_distance_km
        scenario_cost = simulation.total_cost
        return {
            "baseline_distance_km": baseline_distance,
            "baseline_cost": baseline_cost,
            "scenario_distance_km": scenario_distance,
            "scenario_cost": scenario_cost,
            "delta_distance_km": round(scenario_distance - baseline_distance, 2),
            "delta_cost": round(scenario_cost - baseline_cost, 2),
            "alerts": simulation.alerts,
        }

    def build_tracking_feed(self, session: LocalStore, plan: Plan) -> list[dict]:
        stops = session.list_plan_stops(plan.id or 0)
        if not stops:
            return []

        grouped: dict[int, list[PlanStop]] = {}
        for stop in stops:
            grouped.setdefault(stop.vehicle_id, []).append(stop)

        tracking_points: list[dict] = []
        generated_at = datetime.now(timezone.utc)

        for vehicle_id, vehicle_stops in grouped.items():
            tracking_points.append(
                {
                    "vehicle_id": vehicle_id,
                    "order_id": None,
                    "status": "salida_hub",
                    "label": "Salida de hub",
                    "lat": self.depot[0],
                    "lng": self.depot[1],
                    "event_time": generated_at,
                }
            )

            for index, stop in enumerate(vehicle_stops):
                order = session.get_order(stop.order_id)
                if not order:
                    continue
                status = "en_ruta"
                label = f"En ruta a orden {order.id}"
                if plan.status == PlanStatus.dispatched and index == len(vehicle_stops) - 1:
                    status = "entregado"
                    label = f"Entrega final orden {order.id}"

                tracking_points.append(
                    {
                        "vehicle_id": vehicle_id,
                        "order_id": order.id,
                        "status": status,
                        "label": label,
                        "lat": order.latitude,
                        "lng": order.longitude,
                        "event_time": generated_at + timedelta(minutes=8 * (index + 1)),
                    }
                )

        return tracking_points

    def build_dashboard_overview(self, session: LocalStore) -> dict:
        active_plan = self.get_active_plan(session)

        pending_orders = session.list_orders_by_status(OrderStatus.pending)
        planned_orders = session.list_orders_by_status(OrderStatus.planned)
        dispatched_orders = session.list_orders_by_status(OrderStatus.dispatched)

        incidents = session.list_open_incidents()

        alerts = active_plan.alerts_json if active_plan else []
        timeline: list[dict] = []
        map_routes: list[dict] = []

        if active_plan:
            stops = session.list_plan_stops(active_plan.id or 0)
            grouped: dict[int, list[PlanStop]] = {}
            for stop in stops:
                grouped.setdefault(stop.vehicle_id, []).append(stop)

            for vehicle_id, vehicle_stops in grouped.items():
                vehicle_route = [
                    {
                        "lat": self.depot[0],
                        "lng": self.depot[1],
                        "label": "Depot",
                    }
                ]
                for stop in vehicle_stops:
                    order = session.get_order(stop.order_id)
                    if not order:
                        continue
                    timeline.append(
                        {
                            "vehicle_id": vehicle_id,
                            "order_id": order.id,
                            "customer": order.customer_name,
                            "eta": stop.eta,
                            "risk": stop.risk_level,
                            "sequence": stop.sequence,
                        }
                    )
                    vehicle_route.append(
                        {
                            "lat": order.latitude,
                            "lng": order.longitude,
                            "label": f"Orden {order.id}",
                        }
                    )
                map_routes.append({"vehicle_id": vehicle_id, "points": vehicle_route})

        geofences = [
            {
                "name": "Hub Ciudad de Guatemala",
                "center": {"lat": self.depot[0], "lng": self.depot[1]},
                "radius_m": 1800,
            }
        ]

        return {
            "active_plan_id": active_plan.id if active_plan else None,
            "kpis": {
                "pending_orders": len(pending_orders),
                "planned_orders": len(planned_orders),
                "dispatched_orders": len(dispatched_orders),
                "active_alerts": len(alerts) + len(incidents),
                "total_distance_km": active_plan.total_distance_km if active_plan else 0.0,
                "total_cost": active_plan.total_cost if active_plan else 0.0,
            },
            "alerts": alerts,
            "timeline": sorted(timeline, key=lambda item: (item["vehicle_id"], item["sequence"])),
            "map": {
                "routes": map_routes,
                "geofences": geofences,
            },
            "incidents": [
                {
                    "id": incident.id,
                    "severity": getattr(incident.severity, "value", incident.severity),
                    "title": incident.title,
                    "description": incident.description,
                    "created_at": incident.created_at,
                }
                for incident in incidents
            ],
        }


planning_engine = PlanningEngine()
