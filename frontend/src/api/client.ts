import type {
  Incident,
  Order,
  OverviewResponse,
  PlanHistoryItem,
  PlanResponse,
  TrackingResponse,
  UserProfile,
  UserSummary,
  Vehicle,
  WhatIfResponse,
} from "../types";

const FALLBACK_API_URL =
  typeof window === "undefined"
    ? "http://localhost:8000/api/v1"
    : `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

const API_URL = import.meta.env.VITE_API_URL ?? FALLBACK_API_URL;

function toApiError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      `No se pudo conectar con la API (${API_URL}). Verifica que el backend este iniciado y que frontend/backend usen origen permitido por CORS.`,
    );
  }
  return error instanceof Error ? error : new Error("Error inesperado de conexion");
}

async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let detail: string | null = null;
      try {
        const parsed = JSON.parse(errorBody) as { detail?: string };
        detail = parsed.detail ?? null;
      } catch {
        detail = null;
      }
      throw new Error(detail || errorBody || "Error de API");
    }

    if (response.status === 204 || response.status === 205) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);

  try {
    const response = await fetch(`${API_URL}/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error("No se pudo iniciar sesion");
    }

    const json = (await response.json()) as { access_token: string };
    return json.access_token;
  } catch (error) {
    throw toApiError(error);
  }
}

export function getOverview(token: string): Promise<OverviewResponse> {
  return request<OverviewResponse>("/dashboard/overview", token);
}

export function getCurrentUser(token: string): Promise<UserProfile> {
  return request<UserProfile>("/auth/me", token);
}

export function getVehicles(token: string): Promise<Vehicle[]> {
  return request<Vehicle[]>("/resources/vehicles", token);
}

export function getOrders(token: string): Promise<Order[]> {
  return request<Order[]>("/resources/orders", token);
}

export function getOpenIncidents(token: string): Promise<Incident[]> {
  return request<Incident[]>("/incidents/open", token);
}

export function listUsers(token: string): Promise<UserSummary[]> {
  return request<UserSummary[]>("/users", token);
}

export function createUser(
  token: string,
  payload: {
    username: string;
    full_name: string;
    role: "admin" | "planner" | "dispatcher";
    password: string;
  },
): Promise<UserSummary> {
  return request<UserSummary>("/users", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUserRole(
  token: string,
  userId: number,
  role: "admin" | "planner" | "dispatcher",
): Promise<UserSummary> {
  return request<UserSummary>(`/users/${userId}/role`, token, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function updateUserStatus(token: string, userId: number, isActive: boolean): Promise<UserSummary> {
  return request<UserSummary>(`/users/${userId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}

export function resetUserPassword(token: string, userId: number, newPassword: string): Promise<void> {
  return request<void>(`/users/${userId}/password`, token, {
    method: "PATCH",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export function createIncident(
  token: string,
  payload: { plan_id: number | null; severity: "low" | "medium" | "high" | "critical"; title: string; description: string },
): Promise<Incident> {
  return request<Incident>("/incidents", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resolveIncident(token: string, incidentId: number): Promise<Incident> {
  return request<Incident>(`/incidents/${incidentId}/resolve`, token, {
    method: "PATCH",
  });
}

export function generatePlan(token: string, payload: { vehicle_ids: number[] }): Promise<PlanResponse> {
  return request<PlanResponse>("/plans/generate", token, {
    method: "POST",
    body: JSON.stringify({
      order_ids: [],
      vehicle_ids: payload.vehicle_ids,
      driver_ids: [],
    }),
  });
}

export function listPlans(token: string): Promise<PlanHistoryItem[]> {
  return request<PlanHistoryItem[]>('/plans', token);
}

export function dispatchPlan(token: string, planId: number): Promise<PlanResponse> {
  return request<PlanResponse>(`/plans/${planId}/dispatch`, token, {
    method: "POST",
    body: JSON.stringify({ notes: "Despacho confirmado desde panel" }),
  });
}

export function getPlanById(token: string, planId: number): Promise<PlanResponse> {
  return request<PlanResponse>(`/plans/${planId}`, token);
}

export function reprogramPlan(
  token: string,
  planId: number,
  payload: { unavailable_vehicle_ids: number[]; extra_delay_minutes: number },
): Promise<PlanResponse> {
  return request<PlanResponse>(`/plans/${planId}/reprogram`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runWhatIf(
  token: string,
  payload: { unavailable_vehicle_ids: number[]; extra_delay_minutes: number; scenario_name: string },
): Promise<WhatIfResponse> {
  return request<WhatIfResponse>("/simulations/what-if", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateTracking(token: string, planId?: number): Promise<TrackingResponse> {
  return request<TrackingResponse>("/tracking/generate", token, {
    method: "POST",
    body: JSON.stringify({ plan_id: planId ?? null }),
  });
}
