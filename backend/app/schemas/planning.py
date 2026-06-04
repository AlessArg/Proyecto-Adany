from datetime import datetime

from pydantic import BaseModel, Field


class PlanGenerateRequest(BaseModel):
    order_ids: list[int] = Field(default_factory=list)
    vehicle_ids: list[int] = Field(default_factory=list)
    driver_ids: list[int] = Field(default_factory=list)


class DispatchRequest(BaseModel):
    notes: str | None = None


class ReprogramRequest(BaseModel):
    unavailable_vehicle_ids: list[int] = Field(default_factory=list)
    extra_delay_minutes: int = 0


class WhatIfRequest(BaseModel):
    unavailable_vehicle_ids: list[int] = Field(default_factory=list)
    extra_delay_minutes: int = 0
    scenario_name: str = "Simulacion What-If"


class TrackingGenerateRequest(BaseModel):
    plan_id: int | None = None


class PlanStopRead(BaseModel):
    order_id: int
    vehicle_id: int
    driver_id: int
    sequence: int
    eta: datetime
    etd: datetime
    distance_from_prev_km: float
    risk_level: str


class PlanRead(BaseModel):
    plan_id: int
    status: str
    created_at: datetime
    total_distance_km: float
    total_cost: float
    alerts: list[dict]
    stops: list[PlanStopRead]


class ScenarioComparison(BaseModel):
    baseline_distance_km: float
    baseline_cost: float
    scenario_distance_km: float
    scenario_cost: float
    delta_distance_km: float
    delta_cost: float
    alerts: list[dict]
