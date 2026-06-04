# Proyecto Final - Plataforma de Programacion y Despacho de Transporte

Solucion profesional full-stack para programar, despachar y reprogramar operaciones de transporte, con enfoque en restricciones reales de negocio, seguridad por roles y monitoreo operativo.

## Arquitectura

### Backend (Python)
- Framework: FastAPI
- Persistencia: archivo local JSON (sin base de datos)
- Seguridad: JWT Bearer, autenticacion por token, autorizacion por roles (admin, planner, dispatcher)
- Motor de planificacion:
  - Consolidacion de ordenes
  - Asignacion de vehiculo y conductor
  - Validacion de capacidad peso/volumen
  - Compatibilidad por tipo de carga
  - Ventanas de atencion y turnos
  - ETA y riesgo de incumplimiento
  - Estimacion de distancia y costo
- Operaciones soportadas:
  - Programar plan
  - Despachar plan
  - Reprogramar plan
  - Simular escenario What-If
  - Crear usuarios operativos (admin/planner)
  - Registrar y resolver incidencias
  - Auditoria de cambios criticos

### Frontend
- Framework: React + Vite + TypeScript
- UI operativa con:
  - KPIs en tiempo real
  - Mapa interactivo con rutas y geocercas
  - Timeline por unidad con secuencia de visita
  - Tarjetas de alertas/incidencias
  - Simulador de escenarios (What-If)
  - Acciones de generar, despachar y reprogramar

## Estructura principal

```
backend/
  app/
    api/
    core/
    db/
    schemas/
    services/
frontend/
  src/
scripts/
README.md
```

## Ejecucion rapida (Windows / PowerShell)

Abrir dos terminales en la raiz del proyecto.

### Opcion A - Un solo comando (tipo start:dev)
```powershell
npm install
npm run start:dev
```

Esto levanta backend y frontend al mismo tiempo desde una sola terminal.

### Terminal 1 - Backend
```powershell
./scripts/start_backend.ps1
```

Backend disponible en:
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

### Terminal 2 - Frontend
```powershell
./scripts/start_frontend.ps1
```

Frontend disponible en:
- UI: http://localhost:5173

### Error comun CORS / API no disponible

Si frontend muestra error de conexion:

1. Verifica backend arriba en `http://localhost:8000/docs`.
2. Si frontend y backend estan en PCs distintas, configura `frontend/.env` con:
```env
VITE_API_URL=http://IP_DEL_BACKEND:8000/api/v1
```
3. Reinicia frontend despues de cambiar `VITE_API_URL`.
4. El backend ya permite CORS para localhost, 127.0.0.1, hostnames e IP privada por defecto.

## Credenciales demo

- admin / admin123
- planner / planner123
- dispatcher / dispatch123

## Endpoints clave

- `POST /api/v1/auth/token`
- `GET /api/v1/dashboard/overview`
- `POST /api/v1/plans/generate`
- `POST /api/v1/plans/{plan_id}/dispatch`
- `POST /api/v1/plans/{plan_id}/reprogram`
- `POST /api/v1/simulations/what-if`
- `GET /api/v1/resources/vehicles`
- `GET /api/v1/resources/orders`
- `GET /api/v1/incidents/open`
- `POST /api/v1/users`
- `GET /api/v1/users`
- `PATCH /api/v1/users/{user_id}/role`
- `PATCH /api/v1/users/{user_id}/status`
- `PATCH /api/v1/users/{user_id}/password`

## Restricciones de negocio implementadas

- Prioridad de cliente (ordenamiento por prioridad)
- Ventanas de atencion por orden
- Turnos de vehiculo
- Capacidad por peso y volumen
- Compatibilidad de carga por tipo
- Tiempos de servicio en sitio
- Distancia y costo operativo estimado
- Alertas por riesgo de ventana ajustada
- Alertas por orden no asignable

## Notas para evolucion del proyecto

- Integrar motor VRP avanzado (OR-Tools) para optimizacion exacta.
- Incorporar telemetria y tracking GPS en tiempo real.
- Migrar almacenamiento local JSON a un servicio persistente multiusuario.
- Agregar pruebas unitarias/integracion y CI.
