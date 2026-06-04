from datetime import datetime, timedelta, timezone

from app.core.security import get_password_hash
from app.db.models import Driver, Order, OrderStatus, User, UserRole, Vehicle
from app.storage.local_store import LocalStore


def seed_initial_data(session: LocalStore) -> None:
    default_users = [
        ("admin", "Administrador", UserRole.admin, "admin123"),
        ("planner", "Planificador", UserRole.planner, "planner123"),
        ("dispatcher", "Despachador", UserRole.dispatcher, "dispatch123"),
    ]
    for username, full_name, role, password in default_users:
        existing_user = session.get_user_by_username(username)
        if existing_user:
            continue
        session.create_user(
            User(
                username=username,
                full_name=full_name,
                role=role,
                hashed_password=get_password_hash(password),
            )
        )

    default_vehicles = [
        Vehicle(
            plate="TRK-101",
            capacity_weight_kg=2800,
            capacity_volume_m3=16,
            compatible_load_types="general,refrigerated",
            cost_per_km=1.9,
            cost_per_hour=20,
        ),
        Vehicle(
            plate="TRK-102",
            capacity_weight_kg=3500,
            capacity_volume_m3=21,
            compatible_load_types="general,hazardous",
            cost_per_km=2.1,
            cost_per_hour=21,
        ),
        Vehicle(
            plate="VAN-205",
            capacity_weight_kg=1300,
            capacity_volume_m3=9,
            compatible_load_types="general",
            cost_per_km=1.5,
            cost_per_hour=16,
        ),
    ]
    for vehicle in default_vehicles:
        existing_vehicle = session.get_vehicle_by_plate(vehicle.plate)
        if existing_vehicle:
            continue
        session.create_vehicle(vehicle)

    default_drivers = [
        ("Ana Rios", "C3"),
        ("Mateo Ruiz", "C2"),
        ("Lucia Perez", "C2"),
    ]
    for driver_name, license_type in default_drivers:
        existing_driver = session.get_driver_by_name(driver_name)
        if existing_driver:
            continue
        session.create_driver(Driver(name=driver_name, license_type=license_type))

    now = datetime.now(timezone.utc)
    base_start = now + timedelta(minutes=30)
    demo_orders = [
        {
            "customer_name": "Cliente Alfa",
            "priority": 5,
            "sla_minutes": 180,
            "weight_kg": 700,
            "volume_m3": 3.8,
            "service_time_min": 20,
            "latitude": 14.6118,
            "longitude": -90.5213,
            "window_start": base_start,
            "window_end": base_start + timedelta(hours=2),
            "load_type": "general",
        },
        {
            "customer_name": "Cliente Beta",
            "priority": 4,
            "sla_minutes": 240,
            "weight_kg": 900,
            "volume_m3": 4.0,
            "service_time_min": 25,
            "latitude": 14.6487,
            "longitude": -90.5133,
            "window_start": base_start + timedelta(minutes=40),
            "window_end": base_start + timedelta(hours=3),
            "load_type": "refrigerated",
        },
        {
            "customer_name": "Cliente Gamma",
            "priority": 3,
            "sla_minutes": 300,
            "weight_kg": 1200,
            "volume_m3": 5.5,
            "service_time_min": 30,
            "latitude": 14.6281,
            "longitude": -90.5522,
            "window_start": base_start + timedelta(minutes=70),
            "window_end": base_start + timedelta(hours=4),
            "load_type": "hazardous",
        },
        {
            "customer_name": "Cliente Delta",
            "priority": 5,
            "sla_minutes": 200,
            "weight_kg": 500,
            "volume_m3": 2.1,
            "service_time_min": 18,
            "latitude": 14.5892,
            "longitude": -90.4910,
            "window_start": base_start + timedelta(minutes=20),
            "window_end": base_start + timedelta(hours=2, minutes=30),
            "load_type": "general",
        },
        {
            "customer_name": "Cliente Epsilon",
            "priority": 2,
            "sla_minutes": 360,
            "weight_kg": 300,
            "volume_m3": 1.5,
            "service_time_min": 15,
            "latitude": 14.6655,
            "longitude": -90.5078,
            "window_start": base_start + timedelta(hours=1),
            "window_end": base_start + timedelta(hours=5),
            "load_type": "general",
        },
    ]

    for payload in demo_orders:
        existing_order = session.get_order_by_customer(payload["customer_name"])
        if existing_order:
            existing_order.priority = payload["priority"]
            existing_order.sla_minutes = payload["sla_minutes"]
            existing_order.weight_kg = payload["weight_kg"]
            existing_order.volume_m3 = payload["volume_m3"]
            existing_order.service_time_min = payload["service_time_min"]
            existing_order.latitude = payload["latitude"]
            existing_order.longitude = payload["longitude"]
            existing_order.window_start = payload["window_start"]
            existing_order.window_end = payload["window_end"]
            existing_order.load_type = payload["load_type"]
            session.update_order(existing_order)
            continue

        session.create_order(Order(**payload, status=OrderStatus.pending))
