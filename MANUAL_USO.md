# Manual de Uso - Plataforma de Programacion y Despacho de Transporte

## 1. Objetivo

Esta aplicacion permite:
- Programar operaciones de transporte.
- Despachar planes operativos.
- Reprogramar ante incidencias o restricciones de ultima hora.
- Simular escenarios What-If antes de ejecutar cambios.

La solucion es full-stack:
- Backend en FastAPI (Python).
- Frontend en React + Vite.

## 2. Requisitos previos

Instalar en tu equipo:
- Python 3.11 o superior.
- Node.js 20 o superior.
- npm (incluido con Node.js).
- PowerShell (Windows).

Verificacion sugerida:
- python --version
- node --version
- npm --version

## 3. Estructura relevante del proyecto

- backend/: API, motor de planificacion, seguridad y persistencia.
- frontend/: interfaz operativa web.
- scripts/: scripts de arranque para backend y frontend.
- README.md: resumen tecnico general.

## 4. Como ejecutar el sistema

Abre dos terminales en la raiz del proyecto.

Terminal 1 (backend):
1. Ejecuta: ./scripts/start_backend.ps1
2. El script crea el entorno virtual si no existe.
3. Instala dependencias de Python.
4. Levanta Uvicorn en puerto 8000.

Terminal 2 (frontend):
1. Ejecuta: ./scripts/start_frontend.ps1
2. El script instala dependencias npm si no existen.
3. Inicia Vite en puerto 5173.

URLs esperadas:
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Frontend: http://localhost:5173

## 5. Usuarios demo

- admin / admin123
- planner / planner123
- dispatcher / dispatch123

## 6. Flujo de uso funcional

### 6.1 Iniciar sesion
1. Abre el frontend en http://localhost:5173.
2. Ingresa con un usuario demo.
3. El frontend solicita token JWT al backend.

### 6.2 Generar plan
1. Selecciona los vehiculos disponibles.
2. Pulsa Generar Plan.
3. El sistema calcula asignaciones usando restricciones operativas.
4. Revisa KPIs, mapa, timeline y alertas.

### 6.3 Despachar plan
1. Verifica que exista un plan activo.
2. Pulsa Confirmar Despacho.
3. El plan pasa a estado despachado.
4. Las ordenes del plan se marcan como despachadas.

### 6.4 Reprogramar
1. Sobre plan activo, ajusta condiciones (por ejemplo, retraso).
2. Pulsa Reprogramar.
3. Se crea un nuevo plan derivado y el anterior queda reprogramado.

### 6.5 Simular What-If
1. En Simulador What-If, define nombre de escenario.
2. Configura retraso adicional en minutos.
3. Ejecuta Simular Escenario.
4. Compara distancia, costo y alertas contra la linea base.

### 6.6 Monitorear alertas e incidencias
1. Revisa Alertas e Incidencias en el panel.
2. Identifica riesgos por ventanas ajustadas o no asignaciones.

### 6.7 Generar tracking
1. Asegura que exista un plan activo (draft o dispatched).
2. Pulsa Generar Tracking.
3. El sistema genera eventos por unidad (salida de hub, en ruta, entrega).
4. Visualiza los puntos de tracking en mapa y panel Tracking de Unidades.

## 7. Que hace cada boton del panel

- Generar Plan: calcula asignaciones orden-unidad-conductor y crea un plan nuevo en estado draft.
- Confirmar Despacho: marca el plan activo como dispatched y actualiza las ordenes de ese plan.
- Crear Despacho Rapido: ejecuta Generar Plan + Confirmar Despacho en un solo paso.
- Reprogramar: crea un plan derivado aplicando restricciones nuevas (retrasos y/o unidades no disponibles).
- Generar Tracking: genera eventos de seguimiento por unidad para el plan activo.
- Simular Escenario (What-If): corre una simulacion comparativa sin modificar el plan operativo real.

## 8. Modulo de usuarios (Fase 2)

- Disponible para roles admin y planner.
- Permite:
  - Crear usuario con rol.
  - Cambiar rol de usuario existente.
  - Activar/Desactivar usuario.
  - Resetear contrasena.

Notas:
- Un usuario desactivado no puede iniciar sesion.
- El usuario actual no puede desactivarse a si mismo.

## 9. Secuencia por Unidad y filtros

- Los checks de unidades tienen doble funcion:
  - Filtran que unidades ves en mapa, timeline y tracking.
  - Definen que unidades se usan al planificar/simular.

Si no seleccionas ninguna unidad, el sistema toma todas las disponibles.

## 10. Como se generan los pines del mapa

- Hub: se pinta desde `DEPOT_LATITUDE` y `DEPOT_LONGITUDE`.
- Ordenes: se pintan desde `latitude` y `longitude` de cada orden asignada en el plan.
- Tracking: se pintan desde eventos generados por unidad (`salida_hub`, `en_ruta`, `entregado`).
- Geocerca: circulo operativo alrededor del hub.

Los datos demo estan ajustados para Ciudad de Guatemala.

## 11. Restricciones de negocio aplicadas por el motor

El backend considera:
- Prioridad de orden.
- Ventanas de atencion.
- Capacidad por peso y volumen.
- Compatibilidad de tipo de carga.
- Turnos de vehiculos.
- Tiempo de servicio por parada.
- ETA estimado por distancia y velocidad promedio.
- Riesgo de incumplimiento por margen de ventana.
- Costo estimado por kilometro y por hora.

## 12. Seguridad implementada

- Autenticacion basada en token JWT.
- Autorizacion por roles (admin, planner, dispatcher).
- Para facilitar operacion demo, planner puede confirmar despacho.
- Auditoria de acciones criticas:
  - generate_plan
  - dispatch_plan
  - reprogram_plan
  - create_incident
  - resolve_incident

## 13. Endpoints principales

- POST /api/v1/auth/token
- GET /api/v1/auth/me
- GET /api/v1/dashboard/overview
- POST /api/v1/plans/generate
- POST /api/v1/plans/{plan_id}/dispatch
- POST /api/v1/plans/{plan_id}/reprogram
- POST /api/v1/simulations/what-if
- POST /api/v1/tracking/generate
- POST /api/v1/users
- GET /api/v1/users
- PATCH /api/v1/users/{user_id}/role
- PATCH /api/v1/users/{user_id}/status
- PATCH /api/v1/users/{user_id}/password
- GET /api/v1/resources/orders
- GET /api/v1/resources/vehicles
- GET /api/v1/resources/drivers
- GET /api/v1/incidents/open

## 14. Troubleshooting rapido

Si falla start_backend.ps1:
- Asegura que Python este en PATH.
- Ejecuta PowerShell como usuario con permisos.
- Si falla la activacion de scripts, revisa ExecutionPolicy.

Si falla start_frontend.ps1:
- Verifica Node.js y npm.
- Borra node_modules y package-lock.json, luego reinstala.

Si hay error de CORS:
- Verifica que backend este arriba en http://localhost:8000/docs.
- Si frontend/backend corren en PCs distintas, crea frontend/.env con VITE_API_URL=http://IP_DEL_BACKEND:8000/api/v1.
- Reinicia frontend despues de cambiar VITE_API_URL.

## 15. Limitaciones actuales

- El motor es heuristico (no optimizacion VRP exacta con solver).
- No hay integracion de GPS en tiempo real.
- No hay pruebas automaticas de regresion todavia.
- No hay edicion drag-and-drop de secuencias de visita en UI.

## 16. Recomendaciones para pasar a produccion

- Migrar almacenamiento local JSON a un servicio persistente multiusuario.
- Integrar OR-Tools para optimizacion avanzada.
- Agregar pruebas unitarias, integracion y CI/CD.
- Contenerizar con Docker y orquestar despliegue.
- Endurecer seguridad (rotacion de claves, expiraciones cortas, refresh tokens).
