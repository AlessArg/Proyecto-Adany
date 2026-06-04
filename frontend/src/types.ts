export type Vehicle = {
  id: number;
  plate: string;
  capacity_weight_kg: number;
  capacity_volume_m3: number;
  compatible_load_types: string;
  available: boolean;
};

export type Order = {
  id: number;
  customer_name: string;
  priority: number;
  status: string;
  weight_kg: number;
  volume_m3: number;
  load_type: string;
  latitude: number;
  longitude: number;
};

export type Incident = {
  id: number;
  plan_id: number | null;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  created_at: string;
  is_resolved: boolean;
};

export type UserProfile = {
  username: string;
  full_name: string;
  role: "admin" | "planner" | "dispatcher";
  is_active: boolean;
};

export type UserSummary = {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "planner" | "dispatcher";
  is_active: boolean;
};

export type AlertItem = {
  type: string;
  severity: string;
  message: string;
};

export type TimelineItem = {
  vehicle_id: number;
  order_id: number;
  customer: string;
  eta: string;
  risk: string;
  sequence: number;
};

export type RoutePoint = {
  lat: number;
  lng: number;
  label: string;
};

export type RouteLine = {
  vehicle_id: number;
  points: RoutePoint[];
};

export type Geofence = {
  name: string;
  center: { lat: number; lng: number };
  radius_m: number;
};

export type OverviewResponse = {
  active_plan_id: number | null;
  kpis: {
    pending_orders: number;
    planned_orders: number;
    dispatched_orders: number;
    active_alerts: number;
    total_distance_km: number;
    total_cost: number;
  };
  alerts: AlertItem[];
  timeline: TimelineItem[];
  map: {
    routes: RouteLine[];
    geofences: Geofence[];
  };
  incidents: {
    id: number;
    severity: string;
    title: string;
    description: string;
    created_at: string;
  }[];
};

export type PlanResponse = {
  plan_id: number;
  status: string;
  created_at: string;
  total_distance_km: number;
  total_cost: number;
  alerts: AlertItem[];
  stops: {
    order_id: number;
    vehicle_id: number;
    driver_id: number;
    sequence: number;
    eta: string;
    etd: string;
    distance_from_prev_km: number;
    risk_level: string;
  }[];
};

export type PlanHistoryItem = {
  plan_id: number;
  status: string;
  created_at: string;
  total_distance_km: number;
  total_cost: number;
  stops_count: number;
};

export type WhatIfResponse = {
  baseline_distance_km: number;
  baseline_cost: number;
  scenario_distance_km: number;
  scenario_cost: number;
  delta_distance_km: number;
  delta_cost: number;
  alerts: AlertItem[];
};

export type TrackingPoint = {
  vehicle_id: number;
  order_id: number | null;
  status: string;
  label: string;
  lat: number;
  lng: number;
  event_time: string;
};

export type TrackingResponse = {
  plan_id: number;
  generated_at: string;
  points: TrackingPoint[];
};
