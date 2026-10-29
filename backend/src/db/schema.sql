-- =========================================================================
-- Guideline Layer Smart Transit Operations Platform - Database Schema
-- Dialect: MySQL 8.0+
-- Core Rules: Real data relationships, proper PK/FK, indexed for auditability
-- =========================================================================

CREATE DATABASE IF NOT EXISTS `guideline_transit`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `guideline_transit`;

-- 1. Hardware Device Profiles & Operational Budgets
CREATE TABLE IF NOT EXISTS `device_profiles` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT,
  `target_hardware` VARCHAR(255) NOT NULL,
  `cpu_threshold_pct` DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  `ram_threshold_mb` DECIMAL(7,2) NOT NULL DEFAULT 500.00,
  `battery_threshold_pct_hr` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  `bandwidth_threshold_kb_min` DECIMAL(8,2) NOT NULL DEFAULT 1024.00,
  `is_active` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Scoped Users (RBAC: NO Super Admin; Explicit operator vs engineer scopes)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `role` ENUM('operator', 'engineer') NOT NULL DEFAULT 'operator',
  `full_name` VARCHAR(128) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Edge Telemetry & Real-Time Inferences (Output Stage 1 + Stage 2)
CREATE TABLE IF NOT EXISTS `inferences` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `trip_id` INT NOT NULL,
  `direction` VARCHAR(8) NOT NULL DEFAULT 'NB',
  `stop_index` INT NOT NULL,
  `stops_remaining` INT NOT NULL,
  `dist_remaining_km` DECIMAL(6,2) NOT NULL,
  `avg_speed_kmh` DECIMAL(5,2) NOT NULL,
  `elapsed_min` DECIMAL(6,2) NOT NULL,
  `pred_min` DECIMAL(6,2) NOT NULL,
  `actual_min` DECIMAL(6,2) NOT NULL,
  `error_seconds` DECIMAL(6,1) NOT NULL,
  `model_name` VARCHAR(64) NOT NULL,
  `cpu_percent` DECIMAL(5,2) NOT NULL,
  `ram_mb` DECIMAL(7,2) NOT NULL,
  `battery_drain_pct_hr` DECIMAL(5,2) NOT NULL,
  `bandwidth_kb_min` DECIMAL(8,2) NOT NULL,
  `latency_ms` DECIMAL(6,3) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_trip_stop` (`trip_id`, `stop_index`),
  INDEX `idx_model_created` (`model_name`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Guideline Threshold Violations (Module 2 Threshold Checker)
CREATE TABLE IF NOT EXISTS `guideline_violations` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `inference_id` BIGINT NULL,
  `trip_id` INT NOT NULL,
  `metric` VARCHAR(64) NOT NULL,
  `observed_value` DECIMAL(8,2) NOT NULL,
  `threshold_limit` DECIMAL(8,2) NOT NULL,
  `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_metric_created` (`metric`, `created_at`),
  CONSTRAINT `fk_violations_inference`
    FOREIGN KEY (`inference_id`) REFERENCES `inferences` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Autonomous Closed-Loop Directives & Remediation Audit
CREATE TABLE IF NOT EXISTS `remediation_directives` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `trigger_reason` VARCHAR(128) NOT NULL,
  `from_model` VARCHAR(64) NOT NULL,
  `to_model` VARCHAR(64) NOT NULL,
  `executed_by_role` VARCHAR(32) NOT NULL DEFAULT 'system_closed_loop',
  `details` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_remediation_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Fleet Cloud Synchronizations (Module 4 Logging & Fleet Sync)
CREATE TABLE IF NOT EXISTS `fleet_cloud_syncs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `sync_batch_id` VARCHAR(64) NOT NULL,
  `n_inferences` INT NOT NULL,
  `payload_bytes` INT NOT NULL,
  `sync_status` VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
  `synced_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sync_time` (`synced_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================================
-- Initial Seed Data
-- =========================================================================

INSERT INTO `device_profiles` (`id`, `name`, `description`, `target_hardware`, `cpu_threshold_pct`, `ram_threshold_mb`, `battery_threshold_pct_hr`, `bandwidth_threshold_kb_min`, `is_active`)
VALUES
  ('embedded_telematics', 'On-Board Linux Telematics Unit', 'Standard IEEE reference benchmark for vehicle on-board computers', 'ARM Cortex-A53 / Broadcom Telematics Edge', 30.00, 500.00, 20.00, 1024.00, TRUE),
  ('esp32_micro', 'ESP32 / Low-Power Micro-Controller', 'Ultra-constrained IoT tracking node (Paper Ref [4],[6])', 'Xtensa Dual-Core 240MHz / 520KB SRAM', 20.00, 4.00, 15.00, 256.00, FALSE),
  ('mobile_logger', 'Android Edge Smartphone Unit', 'Android device logger used for the real ISCON-PDPU dataset collection', 'Qualcomm Snapdragon 6-series / Android 10+', 25.00, 256.00, 12.00, 512.00, FALSE)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `users` (`username`, `role`, `full_name`)
VALUES
  ('operator1', 'operator', 'Corridor Fleet Operator'),
  ('engineer1', 'engineer', 'Systems & Edge AI Engineer')
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);

