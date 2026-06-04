-- MySQL schema for Transport Operations Planner
-- Compatible with MySQL 8.x

CREATE DATABASE IF NOT EXISTS transport_ops
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE transport_ops;

CREATE TABLE IF NOT EXISTS `user` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'planner', 'dispatcher') NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plate VARCHAR(255) NOT NULL,
  capacity_weight_kg DOUBLE NOT NULL,
  capacity_volume_m3 DOUBLE NOT NULL,
  compatible_load_types VARCHAR(255) NOT NULL DEFAULT 'general',
  shift_start_min INT NOT NULL DEFAULT 360,
  shift_end_min INT NOT NULL DEFAULT 1200,
  available TINYINT(1) NOT NULL DEFAULT 1,
  cost_per_km DOUBLE NOT NULL DEFAULT 1.8,
  cost_per_hour DOUBLE NOT NULL DEFAULT 18.0,
  UNIQUE KEY uq_vehicle_plate (plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  license_type VARCHAR(50) NOT NULL DEFAULT 'C',
  shift_start_min INT NOT NULL DEFAULT 360,
  shift_end_min INT NOT NULL DEFAULT 1200,
  available TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  sla_minutes INT NOT NULL DEFAULT 240,
  weight_kg DOUBLE NOT NULL,
  volume_m3 DOUBLE NOT NULL,
  service_time_min INT NOT NULL DEFAULT 20,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  window_start DATETIME(6) NOT NULL,
  window_end DATETIME(6) NOT NULL,
  load_type VARCHAR(100) NOT NULL DEFAULT 'general',
  status ENUM('pending', 'planned', 'dispatched', 'delivered') NOT NULL DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL,
  created_by INT NOT NULL,
  status ENUM('draft', 'dispatched', 'reprogrammed') NOT NULL DEFAULT 'draft',
  total_distance_km DOUBLE NOT NULL DEFAULT 0,
  total_cost DOUBLE NOT NULL DEFAULT 0,
  scenario_name VARCHAR(255) NULL,
  alerts_json JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planstop (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  order_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  driver_id INT NOT NULL,
  sequence INT NOT NULL,
  eta DATETIME(6) NOT NULL,
  etd DATETIME(6) NOT NULL,
  distance_from_prev_km DOUBLE NOT NULL,
  risk_level VARCHAR(30) NOT NULL DEFAULT 'ok',
  KEY ix_planstop_plan_id (plan_id),
  KEY ix_planstop_order_id (order_id),
  KEY ix_planstop_vehicle_id (vehicle_id),
  KEY ix_planstop_driver_id (driver_id),
  CONSTRAINT fk_planstop_plan FOREIGN KEY (plan_id) REFERENCES plan (id),
  CONSTRAINT fk_planstop_order FOREIGN KEY (order_id) REFERENCES `order` (id),
  CONSTRAINT fk_planstop_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle (id),
  CONSTRAINT fk_planstop_driver FOREIGN KEY (driver_id) REFERENCES driver (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incident (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  is_resolved TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_incident_plan_id (plan_id),
  CONSTRAINT fk_incident_plan FOREIGN KEY (plan_id) REFERENCES plan (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditlog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(6) NOT NULL,
  username VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,
  entity VARCHAR(255) NOT NULL,
  entity_id INT NULL,
  details_json JSON NOT NULL,
  KEY ix_auditlog_timestamp (timestamp),
  KEY ix_auditlog_username (username),
  KEY ix_auditlog_entity (entity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Seed data for quick bootstrap
-- Notes:
-- 1) Users are seeded by backend startup logic with pbkdf2_sha256 hashes.
-- 2) INSERT IGNORE avoids duplicate data on re-runs.
-- ------------------------------------------------------------

INSERT IGNORE INTO vehicle (
  plate,
  capacity_weight_kg,
  capacity_volume_m3,
  compatible_load_types,
  shift_start_min,
  shift_end_min,
  available,
  cost_per_km,
  cost_per_hour
) VALUES
  ('TRK-101', 2800, 16, 'general,refrigerated', 360, 1200, 1, 1.9, 20),
  ('TRK-102', 3500, 21, 'general,hazardous', 360, 1200, 1, 2.1, 21),
  ('VAN-205', 1300, 9, 'general', 360, 1200, 1, 1.5, 16);

INSERT IGNORE INTO driver (
  name,
  license_type,
  shift_start_min,
  shift_end_min,
  available
) VALUES
  ('Ana Rios', 'C3', 360, 1200, 1),
  ('Mateo Ruiz', 'C2', 360, 1200, 1),
  ('Lucia Perez', 'C2', 360, 1200, 1);

INSERT IGNORE INTO `order` (
  customer_name,
  priority,
  sla_minutes,
  weight_kg,
  volume_m3,
  service_time_min,
  latitude,
  longitude,
  window_start,
  window_end,
  load_type,
  status
) VALUES
  ('Cliente Alfa', 5, 180, 700, 3.8, 20, 14.6118, -90.5213, UTC_TIMESTAMP() + INTERVAL 30 MINUTE, UTC_TIMESTAMP() + INTERVAL 150 MINUTE, 'general', 'pending'),
  ('Cliente Beta', 4, 240, 900, 4.0, 25, 14.6487, -90.5133, UTC_TIMESTAMP() + INTERVAL 70 MINUTE, UTC_TIMESTAMP() + INTERVAL 210 MINUTE, 'refrigerated', 'pending'),
  ('Cliente Gamma', 3, 300, 1200, 5.5, 30, 14.6281, -90.5522, UTC_TIMESTAMP() + INTERVAL 100 MINUTE, UTC_TIMESTAMP() + INTERVAL 270 MINUTE, 'hazardous', 'pending'),
  ('Cliente Delta', 5, 200, 500, 2.1, 18, 14.5892, -90.4910, UTC_TIMESTAMP() + INTERVAL 50 MINUTE, UTC_TIMESTAMP() + INTERVAL 180 MINUTE, 'general', 'pending'),
  ('Cliente Epsilon', 2, 360, 300, 1.5, 15, 14.6655, -90.5078, UTC_TIMESTAMP() + INTERVAL 90 MINUTE, UTC_TIMESTAMP() + INTERVAL 330 MINUTE, 'general', 'pending');

INSERT IGNORE INTO incident (
  plan_id,
  severity,
  title,
  description,
  created_at,
  is_resolved
) VALUES
  (NULL, 'medium', 'Retraso vial reportado', 'Congestion en corredor principal de la zona sur', UTC_TIMESTAMP(), 0),
  (NULL, 'low', 'Confirmacion de acceso', 'Cliente solicita aviso 15 minutos antes de llegada', UTC_TIMESTAMP(), 0);

INSERT IGNORE INTO auditlog (
  timestamp,
  username,
  action,
  entity,
  entity_id,
  details_json
) VALUES
  (UTC_TIMESTAMP(), 'system', 'bootstrap_seed', 'database', NULL, JSON_OBJECT('source', 'mysql_schema.sql'));
