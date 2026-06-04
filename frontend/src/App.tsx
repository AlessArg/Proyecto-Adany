import { AlertTriangle, Clock4, Route, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createIncident,
  createUser,
  dispatchPlan,
  generatePlan,
  generateTracking,
  getCurrentUser,
  getOpenIncidents,
  getOrders,
  getOverview,
  getPlanById,
  getVehicles,
  listPlans,
  listUsers,
  login,
  resetUserPassword,
  reprogramPlan,
  resolveIncident,
  runWhatIf,
  updateUserRole,
  updateUserStatus,
} from "./api/client";
import RouteMap from "./components/RouteMap";
import type {
  Incident,
  Order,
  OverviewResponse,
  PlanHistoryItem,
  PlanResponse,
  RouteLine,
  TrackingPoint,
  UserProfile,
  UserSummary,
  Vehicle,
  WhatIfResponse,
} from "./types";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function sameIdList(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

type MapViewMode = "plan" | "tracking" | "both";

export default function App() {
  const [username, setUsername] = useState("planner");
  const [password, setPassword] = useState("planner123");
  const [token, setToken] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [openIncidents, setOpenIncidents] = useState<Incident[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [vehiclesSelectionInitialized, setVehiclesSelectionInitialized] = useState(false);

  const [delayMinutes, setDelayMinutes] = useState(25);
  const [scenarioName, setScenarioName] = useState("Bloqueo de acceso zona norte");
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);
  const [whatIfGeneratedAt, setWhatIfGeneratedAt] = useState<string | null>(null);
  const [whatIfIsStale, setWhatIfIsStale] = useState(false);
  const [trackingPoints, setTrackingPoints] = useState<TrackingPoint[]>([]);
  const [trackingGeneratedAt, setTrackingGeneratedAt] = useState<string | null>(null);
  const [trackingPlanId, setTrackingPlanId] = useState<number | null>(null);
  const [planHistory, setPlanHistory] = useState<PlanHistoryItem[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanResponse | null>(null);
  const [selectedPlanLoading, setSelectedPlanLoading] = useState(false);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("plan");
  const [incidentTitle, setIncidentTitle] = useState("Retraso en acceso a cliente");
  const [incidentDescription, setIncidentDescription] = useState("Reporte de bloqueo vial en corredor principal.");
  const [incidentSeverity, setIncidentSeverity] = useState<Incident["severity"]>("medium");
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<UserSummary["role"]>("dispatcher");
  const [newPassword, setNewPassword] = useState("");
  const [pendingRoleByUser, setPendingRoleByUser] = useState<Record<number, UserSummary["role"]>>({});
  const [passwordResetByUser, setPasswordResetByUser] = useState<Record<number, string>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<"dashboard" | "users">("dashboard");

  async function refreshDashboard(
    activeToken: string,
    preferredPlanId: number | null | undefined = undefined,
  ): Promise<void> {
    const [overviewData, vehiclesData, ordersData, incidentsData, me, plansData] = await Promise.all([
      getOverview(activeToken),
      getVehicles(activeToken),
      getOrders(activeToken),
      getOpenIncidents(activeToken),
      getCurrentUser(activeToken),
      listPlans(activeToken),
    ]);
    setOverview(overviewData);
    setVehicles(vehiclesData);
    setOrders(ordersData);
    setOpenIncidents(incidentsData);
    setCurrentUser(me);
    setPlanHistory(plansData);

    const availableIds = new Set(plansData.map((plan) => plan.plan_id));
    let nextSelectedPlanId = preferredPlanId ?? selectedPlanId;
    if (nextSelectedPlanId === null || !availableIds.has(nextSelectedPlanId)) {
      if (overviewData.active_plan_id !== null && availableIds.has(overviewData.active_plan_id)) {
        nextSelectedPlanId = overviewData.active_plan_id;
      } else {
        nextSelectedPlanId = plansData.length ? plansData[0].plan_id : null;
      }
    }
    if (nextSelectedPlanId !== selectedPlanId) {
      markSimulationStale();
    }
    setSelectedPlanId(nextSelectedPlanId);

    if (nextSelectedPlanId !== null) {
      try {
        const refreshedPlan = await getPlanById(activeToken, nextSelectedPlanId);
        setSelectedPlan(refreshedPlan);
      } catch {
        setSelectedPlan(null);
      }
    } else {
      setSelectedPlan(null);
    }

    if (me.role === "admin" || me.role === "planner") {
      const usersData = await listUsers(activeToken);
      setUsers(usersData);
    } else {
      setUsers([]);
    }

    const validVehicleIds = new Set(vehiclesData.map((vehicle) => vehicle.id));
    const normalizedSelection = selectedVehicleIds.filter((vehicleId) => validVehicleIds.has(vehicleId));

    if (!vehiclesSelectionInitialized) {
      const defaultSelection = vehiclesData.filter((vehicle) => vehicle.available).map((vehicle) => vehicle.id);
      setSelectedVehicleIds(defaultSelection);
      setVehiclesSelectionInitialized(true);
    } else if (!sameIdList(normalizedSelection, selectedVehicleIds)) {
      setSelectedVehicleIds(normalizedSelection);
    }
  }

  useEffect(() => {
    if (!token || selectedPlanId === null) {
      setSelectedPlan(null);
      return;
    }

    let isCancelled = false;
    setSelectedPlanLoading(true);

    void getPlanById(token, selectedPlanId)
      .then((planData) => {
        if (!isCancelled) {
          setSelectedPlan(planData);
        }
      })
      .catch((operationError) => {
        if (!isCancelled) {
          setSelectedPlan(null);
          setError((operationError as Error).message);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setSelectedPlanLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [token, selectedPlanId]);

  function clearSimulation(): void {
    setWhatIfResult(null);
    setWhatIfGeneratedAt(null);
    setWhatIfIsStale(false);
  }

  function clearTracking(): void {
    setTrackingPoints([]);
    setTrackingGeneratedAt(null);
    setTrackingPlanId(null);
  }

  function markSimulationStale(): void {
    if (whatIfResult) {
      setWhatIfIsStale(true);
    }
  }

  async function handleLogin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const newToken = await login(username, password);
      setToken(newToken);
      await refreshDashboard(newToken);
      setCurrentView("dashboard");
    } catch (loginError) {
      setError((loginError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGeneratePlan(): Promise<void> {
    if (!token) {
      return;
    }
    if (!selectedVehicleIds.length) {
      setError("Selecciona al menos un vehiculo para generar un plan.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const generatedPlan = await generatePlan(token, { vehicle_ids: selectedVehicleIds });
      setSelectedPlanId(generatedPlan.plan_id);
      setSelectedPlan(generatedPlan);
      setLastActionMessage(
        `Plan ${generatedPlan.plan_id} creado en estado borrador con ${generatedPlan.stops.length} paradas.`,
      );
      clearSimulation();
      await refreshDashboard(token, generatedPlan.plan_id);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDispatch(): Promise<void> {
    if (!token || selectedPlanId === null) {
      return;
    }

    const selectedStatus = selectedPlanMeta?.status ?? selectedPlan?.status;
    if (selectedStatus && selectedStatus !== "draft") {
      setError("Solo puedes confirmar planes en estado draft.");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const dispatchedPlan = await dispatchPlan(token, selectedPlanId);
      setSelectedPlan(dispatchedPlan);
      setSelectedPlanId(dispatchedPlan.plan_id);
      setLastActionMessage(`Despacho confirmado para el plan ${dispatchedPlan.plan_id}.`);
      clearSimulation();
      await refreshDashboard(token, dispatchedPlan.plan_id);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleQuickDispatch(): Promise<void> {
    if (!token) {
      return;
    }
    if (!selectedVehicleIds.length) {
      setError("Selecciona al menos un vehiculo para crear despacho rapido.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const generatedPlan = await generatePlan(token, { vehicle_ids: selectedVehicleIds });
      const dispatchedPlan = await dispatchPlan(token, generatedPlan.plan_id);
      const generatedTracking = await generateTracking(token, dispatchedPlan.plan_id);
      setSelectedPlanId(dispatchedPlan.plan_id);
      setSelectedPlan(dispatchedPlan);
      setTrackingPoints(generatedTracking.points);
      setTrackingGeneratedAt(generatedTracking.generated_at);
      setTrackingPlanId(generatedTracking.plan_id);
      setMapViewMode("both");
      clearSimulation();
      setLastActionMessage(
        `Despacho rapido completado en plan ${dispatchedPlan.plan_id} y tracking generado con ${generatedTracking.points.length} eventos.`,
      );
      await refreshDashboard(token, dispatchedPlan.plan_id);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReprogram(): Promise<void> {
    if (!token || selectedPlanId === null) {
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const reprogrammedPlan = await reprogramPlan(token, selectedPlanId, {
        unavailable_vehicle_ids: selectedVehicleIds.length ? [selectedVehicleIds[0]] : [],
        extra_delay_minutes: delayMinutes,
      });
      setSelectedPlanId(reprogrammedPlan.plan_id);
      setSelectedPlan(reprogrammedPlan);
      setLastActionMessage(`Reprogramacion creada en plan ${reprogrammedPlan.plan_id}.`);
      clearSimulation();
      await refreshDashboard(token, reprogrammedPlan.plan_id);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleWhatIf(): Promise<void> {
    if (!token) {
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const simulation = await runWhatIf(token, {
        unavailable_vehicle_ids: selectedVehicleIds.length ? [selectedVehicleIds[0]] : [],
        extra_delay_minutes: delayMinutes,
        scenario_name: scenarioName,
      });
      setWhatIfResult(simulation);
      setWhatIfGeneratedAt(new Date().toISOString());
      setWhatIfIsStale(false);
      setLastActionMessage("Simulacion What-If ejecutada. No se modifico el despacho real.");
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerateTracking(): Promise<void> {
    if (!token || selectedPlanId === null) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const generatedTracking = await generateTracking(token, selectedPlanId);
      setTrackingPoints(generatedTracking.points);
      setTrackingGeneratedAt(generatedTracking.generated_at);
      setTrackingPlanId(generatedTracking.plan_id);
      setMapViewMode("both");
      setLastActionMessage(`Tracking generado para plan ${generatedTracking.plan_id} con ${generatedTracking.points.length} eventos.`);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateIncident(): Promise<void> {
    if (!token) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await createIncident(token, {
        plan_id: selectedPlanId,
        severity: incidentSeverity,
        title: incidentTitle,
        description: incidentDescription,
      });
      setLastActionMessage("Incidencia registrada correctamente.");
      await refreshDashboard(token);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResolveIncident(incidentId: number): Promise<void> {
    if (!token) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await resolveIncident(token, incidentId);
      setLastActionMessage(`Incidencia ${incidentId} resuelta.`);
      await refreshDashboard(token);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateUser(): Promise<void> {
    if (!token) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await createUser(token, {
        username: newUsername.trim(),
        full_name: newFullName.trim(),
        role: newRole,
        password: newPassword,
      });
      setNewUsername("");
      setNewFullName("");
      setNewRole("dispatcher");
      setNewPassword("");
      await refreshDashboard(token);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateUserRole(userId: number): Promise<void> {
    if (!token) {
      return;
    }

    const selectedRole = pendingRoleByUser[userId];
    if (!selectedRole) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await updateUserRole(token, userId, selectedRole);
      await refreshDashboard(token);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleUserStatus(userItem: UserSummary): Promise<void> {
    if (!token) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await updateUserStatus(token, userItem.id, !userItem.is_active);
      await refreshDashboard(token);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetUserPassword(userId: number): Promise<void> {
    if (!token) {
      return;
    }

    const nextPassword = passwordResetByUser[userId] ?? "";
    if (nextPassword.length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await resetUserPassword(token, userId, nextPassword);
      setPasswordResetByUser((prev) => ({ ...prev, [userId]: "" }));
      await refreshDashboard(token);
    } catch (operationError) {
      setError((operationError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  const visibleVehicleIds = useMemo(() => {
    return new Set(selectedVehicleIds);
  }, [selectedVehicleIds]);

  const canManageUsers = currentUser?.role === "admin" || currentUser?.role === "planner";

  const selectedPlanMeta = useMemo(() => {
    if (selectedPlanId === null) {
      return null;
    }
    return planHistory.find((plan) => plan.plan_id === selectedPlanId) ?? null;
  }, [selectedPlanId, planHistory]);

  const ordersById = useMemo(() => {
    return new Map(orders.map((order) => [order.id, order]));
  }, [orders]);

  const visibleRoutes = useMemo<RouteLine[]>(() => {
    if (!selectedPlan) {
      return [];
    }

    const depot = overview?.map.geofences[0]?.center ?? { lat: 14.6349, lng: -90.5069 };
    const groupedStops = new Map<number, PlanResponse["stops"]>();

    const sortedStops = [...selectedPlan.stops].sort((a, b) => {
      if (a.vehicle_id !== b.vehicle_id) {
        return a.vehicle_id - b.vehicle_id;
      }
      return a.sequence - b.sequence;
    });

    sortedStops.forEach((stop) => {
      const current = groupedStops.get(stop.vehicle_id) ?? [];
      current.push(stop);
      groupedStops.set(stop.vehicle_id, current);
    });

    const routes: RouteLine[] = [];
    groupedStops.forEach((stops, vehicleId) => {
      const points = [{ lat: depot.lat, lng: depot.lng, label: "Depot" }];
      stops.forEach((stop) => {
        const relatedOrder = ordersById.get(stop.order_id);
        if (!relatedOrder) {
          return;
        }
        points.push({
          lat: relatedOrder.latitude,
          lng: relatedOrder.longitude,
          label: `Orden ${stop.order_id}`,
        });
      });

      if (points.length > 1) {
        routes.push({ vehicle_id: vehicleId, points });
      }
    });

    return routes.filter((route) => visibleVehicleIds.has(route.vehicle_id));
  }, [selectedPlan, overview, ordersById, visibleVehicleIds]);

  const timelineByVehicle = useMemo(() => {
    const grouped = new Map<
      number,
      {
        vehicle_id: number;
        order_id: number;
        customer: string;
        eta: string;
        risk: string;
        sequence: number;
      }[]
    >();

    if (!selectedPlan) {
      return grouped;
    }

    const sortedStops = [...selectedPlan.stops].sort((a, b) => {
      if (a.vehicle_id !== b.vehicle_id) {
        return a.vehicle_id - b.vehicle_id;
      }
      return a.sequence - b.sequence;
    });

    sortedStops.forEach((stop) => {
      const relatedOrder = ordersById.get(stop.order_id);
      const rows = grouped.get(stop.vehicle_id) ?? [];
      rows.push({
        vehicle_id: stop.vehicle_id,
        order_id: stop.order_id,
        customer: relatedOrder?.customer_name ?? "Cliente no disponible",
        eta: stop.eta,
        risk: stop.risk_level,
        sequence: stop.sequence,
      });
      grouped.set(stop.vehicle_id, rows);
    });

    return grouped;
  }, [selectedPlan, ordersById]);

  const visibleTrackingPoints = useMemo(() => {
    if (trackingPlanId === null || selectedPlanId === null || trackingPlanId !== selectedPlanId) {
      return [];
    }
    return trackingPoints.filter((point) => visibleVehicleIds.has(point.vehicle_id));
  }, [trackingPlanId, selectedPlanId, trackingPoints, visibleVehicleIds]);

  const mapRoutesToRender = useMemo(() => {
    if (mapViewMode === "tracking") {
      return [];
    }
    return visibleRoutes;
  }, [mapViewMode, visibleRoutes]);

  const mapTrackingToRender = useMemo(() => {
    if (mapViewMode === "plan") {
      return [];
    }
    return visibleTrackingPoints;
  }, [mapViewMode, visibleTrackingPoints]);

  const routePinCount = useMemo(() => {
    return visibleRoutes.reduce((total, route) => total + route.points.length, 0);
  }, [visibleRoutes]);

  const selectedVehiclesWithoutStops = useMemo(() => {
    if (!selectedPlan) {
      return [];
    }

    const planVehicleIds = new Set(selectedPlan.stops.map((stop) => stop.vehicle_id));

    return vehicles
      .filter((vehicle) => selectedVehicleIds.includes(vehicle.id) && !planVehicleIds.has(vehicle.id))
      .map((vehicle) => vehicle.plate);
  }, [selectedPlan, selectedVehicleIds, vehicles]);

  const trackingLoadedForAnotherPlan = useMemo(() => {
    if (trackingPlanId === null || selectedPlanId === null) {
      return false;
    }
    return trackingPlanId !== selectedPlanId;
  }, [trackingPlanId, selectedPlanId]);

  const displayedPlanHistory = useMemo(() => planHistory.slice(0, 20), [planHistory]);

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="tag">Control Tower</p>
          <h1>Plataforma de Programacion y Despacho</h1>
          <p className="subtitle">Accede para simular escenarios, programar rutas y gestionar incidencias en tiempo real.</p>

          <form onSubmit={handleLogin}>
            <label>
              Usuario
              <input value={username} onChange={(event) => setUsername(event.target.value)} required />
            </label>
            <label>
              Contrasena
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Ingresando..." : "Entrar"}
            </button>
            {error ? <p className="error-text">{error}</p> : null}
          </form>
          <p className="demo-note">Usuarios demo: admin/admin123, planner/planner123, dispatcher/dispatch123</p>
        </section>
      </main>
    );
  }

  if (currentView === "users" && canManageUsers) {
    return (
      <main className="dashboard-shell">
        <header className="topbar">
          <div>
            <p className="tag">Administracion</p>
            <h1>Modulo de Usuarios</h1>
          </div>
          <div className="button-row">
            <button
              onClick={() => {
                setCurrentView("dashboard");
              }}
            >
              Volver al Panel
            </button>
            <button
              onClick={() => {
                void refreshDashboard(token);
              }}
              disabled={isLoading}
            >
              Actualizar Usuarios
            </button>
          </div>
        </header>

        {error ? <p className="error-text">{error}</p> : null}

        <section className="layout-grid second-row">
          <article className="panel">
            <h2>Creacion de Usuarios</h2>
            <p className="panel-help">Crea cuentas con rol para operar el sistema.</p>
            <label>
              Username
              <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
            </label>
            <label>
              Nombre completo
              <input value={newFullName} onChange={(event) => setNewFullName(event.target.value)} />
            </label>
            <label>
              Rol
              <select value={newRole} onChange={(event) => setNewRole(event.target.value as UserSummary["role"])}>
                <option value="admin">admin</option>
                <option value="planner">planner</option>
                <option value="dispatcher">dispatcher</option>
              </select>
            </label>
            <label>
              Contrasena
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <button
              onClick={handleCreateUser}
              disabled={
                isLoading ||
                !newUsername.trim() ||
                !newFullName.trim() ||
                newPassword.length < 8
              }
            >
              Crear Usuario
            </button>
          </article>

          <article className="panel">
            <h2>Usuarios Registrados</h2>
            <div className="list-stack">
              {users.map((userItem) => (
                <div key={userItem.id} className="list-item">
                  <p>{userItem.full_name}</p>
                  <small>@{userItem.username}</small>
                  <small>Rol: {userItem.role} | Activo: {userItem.is_active ? "si" : "no"}</small>
                  <div className="user-admin-row">
                    <select
                      value={pendingRoleByUser[userItem.id] ?? userItem.role}
                      onChange={(event) => {
                        const nextRole = event.target.value as UserSummary["role"];
                        setPendingRoleByUser((prev) => ({ ...prev, [userItem.id]: nextRole }));
                      }}
                    >
                      <option value="admin">admin</option>
                      <option value="planner">planner</option>
                      <option value="dispatcher">dispatcher</option>
                    </select>
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        void handleUpdateUserRole(userItem.id);
                      }}
                      disabled={isLoading}
                    >
                      Guardar Rol
                    </button>
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        void handleToggleUserStatus(userItem);
                      }}
                      disabled={isLoading}
                    >
                      {userItem.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                  <div className="user-admin-row">
                    <input
                      type="password"
                      placeholder="Nueva contrasena"
                      value={passwordResetByUser[userItem.id] ?? ""}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPasswordResetByUser((prev) => ({ ...prev, [userItem.id]: next }));
                      }}
                    />
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        void handleResetUserPassword(userItem.id);
                      }}
                      disabled={isLoading || (passwordResetByUser[userItem.id]?.length ?? 0) < 8}
                    >
                      Reset Password
                    </button>
                  </div>
                </div>
              ))}
              {!users.length ? <p className="empty">No hay usuarios para mostrar.</p> : null}
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="tag">Consola de Despacho</p>
          <h1>Operacion de Planes, Despachos y Tracking</h1>
        </div>
        <div className="button-row">
          <button
            onClick={() => {
              void refreshDashboard(token);
            }}
            disabled={isLoading}
          >
            Actualizar Panel
          </button>
          {canManageUsers ? (
            <button
              onClick={() => {
                setCurrentView("users");
              }}
            >
              Modulo Usuarios
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {overview ? (
        <>
          <section className="panel control-panel">
            <h2>Consola Operativa</h2>
            <p className="panel-help">Sesion activa: {currentUser?.full_name ?? "Usuario"} ({currentUser?.role ?? "sin rol"})</p>
            <div className="control-grid">
              <label>
                Plan seleccionado
                <select
                  value={selectedPlanId ?? ""}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (!rawValue) {
                      if (selectedPlanId !== null) {
                        markSimulationStale();
                      }
                      setSelectedPlanId(null);
                      setLastActionMessage("Sin plan seleccionado en consola.");
                      return;
                    }

                    const nextPlanId = Number(rawValue);
                    const normalizedNextPlanId = Number.isFinite(nextPlanId) ? nextPlanId : null;
                    if (normalizedNextPlanId !== selectedPlanId) {
                      markSimulationStale();
                    }
                    setSelectedPlanId(normalizedNextPlanId);
                    if (Number.isFinite(nextPlanId)) {
                      setLastActionMessage(`Plan ${nextPlanId} cargado en consola.`);
                    }
                  }}
                >
                  {!planHistory.length ? <option value="">Sin planes</option> : null}
                  {planHistory.map((plan) => (
                    <option key={plan.plan_id} value={plan.plan_id}>
                      Plan {plan.plan_id} - {plan.status} - {formatDate(plan.created_at)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="status-chip-row">
                <span className="status-chip active">
                  Activo: {overview.active_plan_id !== null ? `Plan ${overview.active_plan_id}` : "Sin plan activo"}
                </span>
                <span className={`status-chip ${selectedPlanMeta?.status ?? selectedPlan?.status ?? ""}`}>
                  Seleccionado: {selectedPlanId !== null ? `Plan ${selectedPlanId}` : "Ninguno"}
                  {selectedPlanMeta?.status || selectedPlan?.status ? ` (${selectedPlanMeta?.status ?? selectedPlan?.status})` : ""}
                </span>
                {selectedPlanLoading ? <span className="status-chip">Cargando detalle...</span> : null}
              </div>
            </div>

            <div className="action-buttons">
              <button onClick={handleGeneratePlan} disabled={isLoading}>
                Generar Plan (borrador)
              </button>
              <button
                onClick={handleDispatch}
                disabled={isLoading || selectedPlanId === null || (selectedPlanMeta?.status ?? selectedPlan?.status ?? "") !== "draft"}
              >
                Confirmar Despacho del Plan Seleccionado
              </button>
              <button onClick={handleQuickDispatch} disabled={isLoading}>
                Despacho Rapido (crear + confirmar + tracking)
              </button>
              <button onClick={handleReprogram} disabled={isLoading || selectedPlanId === null}>
                Reprogramar Plan Seleccionado
              </button>
              <button onClick={handleGenerateTracking} disabled={isLoading || selectedPlanId === null}>
                Generar Tracking del Plan Seleccionado
              </button>
            </div>

            <p className="panel-help">
              Cada accion modifica una entidad real en historial. Si no ves cambio, verifica el plan seleccionado y los filtros de vehiculos.
            </p>
            {lastActionMessage ? <p className="success-text">Ultima accion: {lastActionMessage}</p> : null}
          </section>

          <section className="kpi-grid">
            <article className="kpi-card">
              <Truck size={18} />
              <p>Ordenes Pendientes</p>
              <strong>{overview.kpis.pending_orders}</strong>
            </article>
            <article className="kpi-card">
              <Route size={18} />
              <p>Distancia Planificada</p>
              <strong>{overview.kpis.total_distance_km.toFixed(1)} km</strong>
            </article>
            <article className="kpi-card">
              <Clock4 size={18} />
              <p>Despachadas</p>
              <strong>{overview.kpis.dispatched_orders}</strong>
            </article>
            <article className="kpi-card danger">
              <AlertTriangle size={18} />
              <p>Alertas Activas</p>
              <strong>{overview.kpis.active_alerts}</strong>
            </article>
          </section>

          <section className="layout-grid">
            <article className="panel map-panel">
              <h2>Mapa del Plan Seleccionado</h2>
              <div className="map-mode-row">
                <div className="map-mode-buttons">
                  <button
                    type="button"
                    className={`map-mode-btn ${mapViewMode === "plan" ? "active" : ""}`}
                    onClick={() => {
                      setMapViewMode("plan");
                    }}
                  >
                    Solo Ruta
                  </button>
                  <button
                    type="button"
                    className={`map-mode-btn ${mapViewMode === "tracking" ? "active" : ""}`}
                    onClick={() => {
                      setMapViewMode("tracking");
                    }}
                  >
                    Solo Tracking
                  </button>
                  <button
                    type="button"
                    className={`map-mode-btn ${mapViewMode === "both" ? "active" : ""}`}
                    onClick={() => {
                      setMapViewMode("both");
                    }}
                  >
                    Ruta + Tracking
                  </button>
                </div>
                <div className="map-legend">
                  <span className="map-legend-item">
                    <span className="map-dot route" /> Ruta planificada
                  </span>
                  <span className="map-legend-item">
                    <span className="map-dot tracking" /> Tracking generado
                  </span>
                </div>
              </div>
              <RouteMap
                routes={mapRoutesToRender}
                geofences={overview.map.geofences}
                trackingPoints={mapTrackingToRender}
              />
              <p className="panel-help">
                No seleccionas destino manualmente: los destinos salen de las ordenes del plan seleccionado.
              </p>
              <p className="panel-help">
                Vehiculos visibles: {selectedVehicleIds.length}/{vehicles.length} | Pines de ruta: {routePinCount} | Eventos de tracking: {visibleTrackingPoints.length}
              </p>
              {!selectedVehicleIds.length ? <p className="tracking-warning">No hay vehiculos seleccionados. Marca al menos uno para ver pines.</p> : null}
              {selectedVehiclesWithoutStops.length ? (
                <p className="panel-help">Sin paradas en este plan: {selectedVehiclesWithoutStops.join(", ")}.</p>
              ) : null}
              {trackingLoadedForAnotherPlan ? (
                <p className="tracking-warning">
                  El tracking cargado pertenece al plan {trackingPlanId}. Selecciona ese plan o genera tracking del plan actual.
                </p>
              ) : null}
              {mapViewMode !== "tracking" && !visibleRoutes.length ? (
                <p className="tracking-warning">No hay ruta planificada visible para los vehiculos seleccionados.</p>
              ) : null}
              {mapViewMode !== "plan" && !visibleTrackingPoints.length ? (
                <p className="panel-help">No hay eventos de tracking visibles para el plan y vehiculos actuales.</p>
              ) : null}
            </article>

            <article className="panel timeline-panel">
              <h2>Secuencia por Unidad</h2>
              <p className="panel-help">
                Selecciona unidades para filtrar la vista y para definir que vehiculos se usan en planificacion y simulacion.
              </p>
              <div className="button-row vehicle-action-row">
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => {
                    markSimulationStale();
                    setSelectedVehicleIds(vehicles.filter((vehicle) => vehicle.available).map((vehicle) => vehicle.id));
                  }}
                  disabled={isLoading || !vehicles.length}
                >
                  Marcar Disponibles
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => {
                    if (!selectedPlan) {
                      return;
                    }
                    markSimulationStale();
                    const planVehicleIds = Array.from(new Set(selectedPlan.stops.map((stop) => stop.vehicle_id)));
                    setSelectedVehicleIds(planVehicleIds);
                  }}
                  disabled={isLoading || !selectedPlan}
                >
                  Usar Vehiculos del Plan
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => {
                    markSimulationStale();
                    setSelectedVehicleIds([]);
                  }}
                  disabled={isLoading || !selectedVehicleIds.length}
                >
                  Limpiar Seleccion
                </button>
              </div>
              <div className="vehicle-picker">
                {vehicles.map((vehicle) => (
                  <label key={vehicle.id}>
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.includes(vehicle.id)}
                      onChange={(event) => {
                        markSimulationStale();
                        if (event.target.checked) {
                          setSelectedVehicleIds((prev) => (prev.includes(vehicle.id) ? prev : [...prev, vehicle.id]));
                        } else {
                          setSelectedVehicleIds((prev) => prev.filter((id) => id !== vehicle.id));
                        }
                      }}
                    />
                    {vehicle.plate}
                  </label>
                ))}
              </div>

              <div className="timeline-stack">
                {[...timelineByVehicle.entries()]
                  .filter(([vehicleId]) => visibleVehicleIds.has(vehicleId))
                  .map(([vehicleId, items]) => (
                  <div key={vehicleId} className="timeline-group">
                    <h3>Vehiculo {vehicleId}</h3>
                    {items.map((item) => (
                      <div key={`${item.vehicle_id}-${item.order_id}`} className={`timeline-item ${item.risk}`}>
                        <div>
                          <strong>#{item.sequence}</strong> Orden {item.order_id}
                        </div>
                        <span>{item.customer}</span>
                        <time>{formatDate(item.eta)}</time>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="layout-grid second-row">
            <article className="panel">
              <h2>Alertas e Incidencias</h2>
              <div className="list-stack">
                {overview.alerts.map((alert, index) => (
                  <div key={`${alert.type}-${index}`} className={`list-item ${alert.severity}`}>
                    <p>{alert.message}</p>
                    <small>Severidad: {alert.severity}</small>
                  </div>
                ))}
                {openIncidents.map((incident) => (
                  <div key={incident.id} className={`list-item ${incident.severity}`}>
                    <p>{incident.title}</p>
                    <small>{incident.description}</small>
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        void handleResolveIncident(incident.id);
                      }}
                      disabled={isLoading}
                    >
                      Resolver
                    </button>
                  </div>
                ))}
                {!overview.alerts.length && !openIncidents.length ? (
                  <p className="empty">No hay alertas activas por ahora.</p>
                ) : null}
              </div>

              <div className="incident-form">
                <h3>Registrar Incidencia</h3>
                <label>
                  Titulo
                  <input value={incidentTitle} onChange={(event) => setIncidentTitle(event.target.value)} />
                </label>
                <label>
                  Descripcion
                  <input value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} />
                </label>
                <label>
                  Severidad
                  <select
                    value={incidentSeverity}
                    onChange={(event) => setIncidentSeverity(event.target.value as Incident["severity"])}
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <button onClick={handleCreateIncident} disabled={isLoading || !incidentTitle.trim() || !incidentDescription.trim()}>
                  Registrar
                </button>
              </div>
            </article>

            <article className="panel">
              <h2>Simulador What-If</h2>
              <p className="panel-help">Ejecuta una simulacion sin afectar el plan real en operacion.</p>
              <label>
                Nombre del escenario
                <input
                  value={scenarioName}
                  onChange={(event) => {
                    setScenarioName(event.target.value);
                    markSimulationStale();
                  }}
                />
              </label>
              <label>
                Retraso extra (min)
                <input
                  type="number"
                  min={0}
                  value={delayMinutes}
                  onChange={(event) => {
                    setDelayMinutes(Number(event.target.value) || 0);
                    markSimulationStale();
                  }}
                />
              </label>
              <div className="button-row">
                <button className="compact-btn" onClick={handleWhatIf} disabled={isLoading}>
                  Simular Impacto
                </button>
                <button className="compact-btn" onClick={clearSimulation} disabled={isLoading || !whatIfResult}>
                  Limpiar Simulacion
                </button>
              </div>

              {whatIfResult ? (
                <div className="sim-result">
                  <p>
                    Distancia: {whatIfResult.scenario_distance_km.toFixed(1)} km ({whatIfResult.delta_distance_km >= 0 ? "+" : ""}
                    {whatIfResult.delta_distance_km.toFixed(1)})
                  </p>
                  <p>
                    Costo: ${whatIfResult.scenario_cost.toFixed(2)} ({whatIfResult.delta_cost >= 0 ? "+" : ""}
                    {whatIfResult.delta_cost.toFixed(2)})
                  </p>
                  <p>
                    Alertas del escenario: {whatIfResult.alerts.length}
                  </p>
                  {whatIfGeneratedAt ? <small>Generado: {formatDate(whatIfGeneratedAt)}</small> : null}
                  {whatIfIsStale ? <p className="tracking-warning">Parametros cambiaron: vuelve a simular para resultado vigente.</p> : null}
                </div>
              ) : null}
            </article>
          </section>

          <section className="layout-grid second-row">
            <article className="panel">
              <h2>Tracking de Unidades</h2>
              <p className="panel-help">Tracking generado para plan: {trackingPlanId ?? "ninguno"}</p>
              <div className="button-row">
                <button className="compact-btn" onClick={handleGenerateTracking} disabled={isLoading || selectedPlanId === null}>
                  Generar Tracking
                </button>
                <button
                  className="compact-btn"
                  type="button"
                  onClick={clearTracking}
                  disabled={isLoading || (trackingPlanId === null && !trackingPoints.length)}
                >
                  Limpiar Tracking
                </button>
              </div>
              {trackingGeneratedAt ? <small>Ultima generacion: {formatDate(trackingGeneratedAt)}</small> : null}
              {trackingLoadedForAnotherPlan ? (
                <p className="tracking-warning">Hay tracking cargado de otro plan. Genera tracking del plan seleccionado para verlo aqui.</p>
              ) : null}
              <div className="list-stack">
                {visibleTrackingPoints.map((point, index) => (
                  <div key={`${point.vehicle_id}-${point.order_id ?? "hub"}-${index}`} className="list-item">
                    <p>Vehiculo {point.vehicle_id} - {point.label}</p>
                    <small>Estado: {point.status}</small>
                    <small>Hora evento: {formatDate(point.event_time)}</small>
                  </div>
                ))}
                {!visibleTrackingPoints.length ? (
                  <p className="empty">No hay tracking visible para el plan seleccionado.</p>
                ) : null}
              </div>
            </article>

            <article className="panel">
              <h2>Detalle del Plan Seleccionado</h2>
              <p className="panel-help">
                Plan: {selectedPlanId ?? "ninguno"}
                {selectedPlanMeta ? ` | Estado: ${selectedPlanMeta.status}` : ""}
              </p>
              {selectedPlan ? (
                <div className="sim-result">
                  <p>Paradas: {selectedPlan.stops.length}</p>
                  <p>Distancia: {selectedPlan.total_distance_km.toFixed(1)} km</p>
                  <p>Costo: ${selectedPlan.total_cost.toFixed(2)}</p>
                  <p>Alertas: {selectedPlan.alerts.length}</p>
                </div>
              ) : (
                <p className="empty">Selecciona un plan en la consola para ver su detalle.</p>
              )}
            </article>
          </section>

          <section className="panel">
            <h2>Ordenes Disponibles</h2>
            <div className="orders-grid">
              {orders.map((order) => (
                <div key={order.id} className="list-item">
                  <p>Orden {order.id} - {order.customer_name}</p>
                  <small>Prioridad: {order.priority} | Estado: {order.status}</small>
                  <small>
                    Peso: {order.weight_kg.toFixed(1)}kg | Volumen: {order.volume_m3.toFixed(2)}m3 | Tipo: {order.load_type}
                  </small>
                </div>
              ))}
              {!orders.length ? <p className="empty">No hay ordenes para mostrar.</p> : null}
            </div>
          </section>

          <section className="panel">
            <h2>Historial de Planes y Despachos</h2>
            <p className="panel-help">Selecciona un plan aqui para cargarlo en mapa, secuencia y consola.</p>
            <p className="panel-help">Mostrando ultimos {displayedPlanHistory.length} de {planHistory.length} registros.</p>
            <div className="list-stack">
              {displayedPlanHistory.map((plan) => (
                <div key={plan.plan_id} className={`list-item ${plan.status} ${selectedPlanId === plan.plan_id ? "selected" : ""}`}>
                  <p>Plan {plan.plan_id} - Estado: {plan.status}</p>
                  <small>Creado: {formatDate(plan.created_at)}</small>
                  <small>Paradas: {plan.stops_count} | Distancia: {plan.total_distance_km.toFixed(1)} km</small>
                  <small>Costo: ${plan.total_cost.toFixed(2)}</small>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      if (selectedPlanId !== plan.plan_id) {
                        markSimulationStale();
                      }
                      setSelectedPlanId(plan.plan_id);
                      setLastActionMessage(`Plan ${plan.plan_id} cargado desde historial.`);
                    }}
                    disabled={isLoading}
                  >
                    Cargar en Consola
                  </button>
                </div>
              ))}
              {!planHistory.length ? <p className="empty">Aun no se han creado planes.</p> : null}
            </div>
          </section>
        </>
      ) : (
        <p>Cargando vista operativa...</p>
      )}
    </main>
  );
}
