# DigniSafe 🛡️
> **Privacy-Preserving Resident Safety & Intelligent Alert Triage Platform for Assisted Living**

[![Full Project Status](https://img.shields.io/badge/Status-100%25%20Completed-brightgreen.svg)](#milestone-status)
[![Backend Tests](https://img.shields.io/badge/pytest-17%2F17%20passed-success.svg)](#testing--verification)
[![FastAPI](https://img.shields.io/badge/FastAPI-2.0.0-blue.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![HL7 FHIR](https://img.shields.io/badge/Standard-HL7%20FHIR%20R4-orange.svg)](#healthcare-interoperability-hl7-fhir-r4)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](#docker-deployment)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](#license)

---

## 📌 Project Reports & Submissions

- 🏆 **[Final 100% Capstone Report (FINAL_REPORT.md)](FINAL_REPORT.md)**: Full architecture, mathematical derivations, circadian ML entropy algorithm, empirical benchmark results, and production validation.
- 📄 **[Phase 1 Review 1 Evaluation Report (REVIEW_1_REPORT.md)](REVIEW_1_REPORT.md)**: Historical foundational milestone report.
- 📋 **[Review 1 Demo Script (docs/review1_demo.md)](docs/review1_demo.md)**: Step-by-step verification checklist for evaluators.

---

## 💡 What is DigniSafe?

Assisted-living and memory care facilities face an unacceptable choice:
1. **Intrusive Surveillance:** Video cameras, open microphones, and continuous GPS trackers violate elder dignity, induce distress, and face high rejection rates.
2. **Caregiver Alert Fatigue:** Naive threshold sensors flood staff with hundreds of false alarms weekly, causing genuine emergencies to be missed.

**DigniSafe** solves both dilemmas with an ambient, dignity-preserving methodology: **"Monitor events, not people."**

- **Non-Intrusive Ambient Sensing:** Uses solely passive telemetry (PIR motion, magnetic door contacts, emergency pull cords, staff check-in RFID). Video cameras, audio microphones, and GPS tracking are permanently disabled (`OFF`).
- **Explainable Multi-Factor Risk Engine:** Deterministically computes a $0-100$ score adapted to resident independence (`High`, `Moderate`, `Assisted`), inactivity duration, nighttime risk, and mitigating motion.
- **Machine Learning Circadian Sequence Drift Engine:** Compares rolling 24-hour activity density distributions against an established 14-day baseline using divergence entropy (Bhattacharyya metric) to detect nocturnal agitation, wandering risk, and mobility decline.
- **Low-Latency Bidirectional WebSockets (`/ws/alerts`):** Live streaming alert pushes with automatic client chime and visual toast notifications.
- **Multi-Tier Role-Based Access Control (RBAC):** Cryptographic Bearer token auth with distinct personas (`Caregiver`, `Clinical Director`, `Resident Family`, `System Admin`).
- **IoT Edge Hardware Gateway Telemetry:** Ingests live edge packets, monitors battery levels (<15% critical warning), wireless RSSI, firmware versions, and tamper detection.
- **HL7 FHIR Release 4 Compliance:** Native export of standard FHIR collection bundles (`Patient`, `Observation`, `DetectedIssue`, `Encounter`) with interactive formatted viewer.
- **Store-and-Forward Edge Resilience:** Buffers events locally when facility network disconnects and synchronizes without data loss upon restoration.

---

## 🏗️ System Architecture

```
+-----------------------------------------------------------------------------------+
|                              DIGNISAFE SYSTEM TOPOLOGY                            |
+-----------------------------------------------------------------------------------+
                                       |
    [ Edge Ambient Sensors ]           |           [ Edge Hardware Gateway ]
  - PIR Motion (MVMT-R00x)             |         - Gateway: GW-NORTH-01
  - Magnetic Door Contact (DOOR-R00x)  |----->   - Telemetry Ingestion Buffer
  - Emergency Pull Cord (CALL-R00x)    |         - Battery & RSSI Diagnostics
  - Staff Check-in RFID (STAFF-R00x)   |         - Tamper Switch Monitor
                                       |
                                       v
                     +-----------------------------------+
                     |    Store-and-Forward Engine       |
                     |  - Offline Local Storage Buffer   |
                     |  - Temporal Sequence Replay       |
                     +-----------------------------------+
                                       |
                                       v
        +-------------------------------------------------------------+
        |                 FastAPI Core Backend Engine                 |
        |                                                             |
        |  [Consent & Privacy Guard]  --> Permanently blocks Cam/Mic |
        |  [Debounce & Noise Filter]  --> Suppresses 10s chatter      |
        |  [Multi-Factor Risk Engine] --> Weighting: Call (70), etc.  |
        |  [Circadian ML Drift]       --> 24h Baseline vs Recent Dist |
        |  [HL7 FHIR R4 Serializer]   --> Patient, Observation Bundle |
        |  [Emergency Router]         --> SMS / Web Push / Pager      |
        +-------------------------------------------------------------+
               |                                             ^
       WebSocket Live Push (/ws/alerts)                      |
               |                                      REST API (JWT Bearer)
               v                                             |
+-----------------------------------------------------------------------------------+
|                           Production React 18 UI Console                          |
|                                                                                   |
|  * Staff Safety Dashboard         * Resident Profiles & Dynamic Consent Controls |
|  * Real-Time Alert Triage Center  * Circadian ML Activity Histogram & Advisories  |
|  * IoT Sensor Fleet Inventory     * Interactive Event & Journey Simulator        |
|  * 500-Event Benchmark View       * HL7 FHIR R4 Bundle JSON Exporter & Downloader |
|  * Role Switcher (Caregiver, Clinical Director, Family Member, System Admin)     |
+-----------------------------------------------------------------------------------+
```

---

## 🚦 Full Feature Status Matrix (100% Milestone)

| Component / Feature | Implementation Layer | Status |
| :--- | :--- | :---: |
| **Relational Data Schema & Models** | SQLite + SQLAlchemy: Facilities, Rooms, Residents, Users, Alerts, Sensors | **COMPLETED (100%)** |
| **Explainable Multi-Factor Risk Engine** | Dynamic scoring ($0-100$) with resident independence thresholds | **COMPLETED (100%)** |
| **Dynamic Consent Enforcement** | Backend interceptor; non-consented events dropped with audit trail | **COMPLETED (100%)** |
| **Sensor Debouncing & Flapping Suppression** | Software debouncing (<10s) suppressing erratic false alarms | **COMPLETED (100%)** |
| **Store-and-Forward Offline Resilience** | Local edge queue, 503 cutoff handling & replay with delayed flag | **COMPLETED (100%)** |
| **Caregiver Human-in-the-Loop Review** | Full triage state machine (`Verify Incident`, `False Alarm`, `Dismiss`) | **COMPLETED (100%)** |
| **Circadian ML Anomaly Detection Engine** | 24h activity density modeling, divergence entropy, clinical advisories | **COMPLETED (100%)** |
| **Bidirectional WebSockets** | Real-time `/ws/alerts` streaming with auto-reconnect and instant push | **COMPLETED (100%)** |
| **Role-Based Access Control (RBAC)** | Token auth with 4 personas: Caregiver, Director, Family, Admin | **COMPLETED (100%)** |
| **IoT Edge Hardware Telemetry** | Gateway telemetry ingestion, battery gauge (<15% alert), RSSI, tamper | **COMPLETED (100%)** |
| **HL7 FHIR Release 4 Standard** | Official Patient, Observation, DetectedIssue collection bundle exporter | **COMPLETED (100%)** |
| **Emergency Multi-Channel Router** | Priority dispatch: SMS/Pager, Web Push, and Audible console alert | **COMPLETED (100%)** |
| **500-Event Empirical Benchmark** | Rigorous evaluation grid comparing DigniSafe to single-threshold model | **COMPLETED (100%)** |
| **Docker Production Orchestration** | Backend Dockerfile, Frontend Nginx Dockerfile, `docker-compose.yml` | **COMPLETED (100%)** |
| **Automated Test Suite** | 17 Pytest automated unit/integration tests (100% pass rate) | **COMPLETED (100%)** |

---

## 🔬 Empirical Results (500-Event Benchmark)

| Metric | Naive Baseline | DigniSafe Engine | Impact |
|:---|:---:|:---:|:---|
| **True Positives (TP)** | 44 | **42** | Correctly catches emergencies |
| **True Negatives (TN)** | 385 | **441** | Identifies normal routine |
| **False Positives (FP - Spurious Alerts)** | 67 | **11** | **83.6% reduction in caregiver alert fatigue** |
| **False Negatives (FN - Missed Events)** | 4 | **6** | Safe clinical operating margins |
| **Precision** | 39.6% | **79.2%** | **Double the actionable alert reliability** |
| **Recall (Sensitivity)** | 91.7% | **87.5%** | Highly sensitive to genuine hazards |
| **False-Positive Rate** | 14.8% | **2.4%** | Drastically reduced spurious alarms |
| **Total Alerts Dispatched** | 111 | **53** | 52.3% reduction in staff interruptions |
| **Intrusiveness Score** | 50.0% | **45.8%** | **Zero continuous cameras, microphones, or GPS** |

---

## 🗄️ Database Schema Reference

DigniSafe employs an ACID-compliant relational schema implemented with **SQLAlchemy ORM** and SQLite (`dignisafe.db`). The schema is structured around dignity preservation, clinical auditability, and edge resilience.

### Entity-Relationship Topology

```
+----------------+          +----------------+          +---------------------------------+
|   facilities   | 1      * |     rooms      | 1      * |            residents            |
|----------------|--------->|----------------|--------->|---------------------------------|
| PK id (String) |          | PK id (String) |          | PK id (String)                  |
|    name        |          | FK facility_id |          | FK room_id                      |
|    address     |          |    room_number |          |    name                         |
+----------------+          |    ward        |          |    independence_level           |
                            +----------------+          |    current_risk_score           |
                                                        |    current_status               |
                                                        |    anomaly_score                |
                                                        |    drift_category               |
                                                        +---------------------------------+
                                                                   |
            +----------------------+-------------------------------+----------------------+
            | 1                  1 | 1                           * | 1                  * | 1                  *
            v                      v                               v                      v
+-----------------------+  +-----------------------+  +-----------------------+  +-----------------------+
|   consent_settings    |  |        events         |  |        alerts         |  |    sensor_statuses    |
|-----------------------|  |-----------------------|  |-----------------------|  |-----------------------|
| PK id (Integer)       |  | PK id (Integer)       |  | PK id (Integer)       |  | PK id (Integer)       |
| FK resident_id (UNQ)  |  | FK resident_id        |  | FK resident_id        |  | FK resident_id        |
|    movement_enabled   |  |    event_type         |  |    timestamp (UTC)    |  |    sensor_id          |
|    door_enabled       |  |    timestamp (UTC)    |  |    risk_score (0-100) |  |    sensor_type        |
|    emergency_enabled  |  |    sensor_id          |  |    priority           |  |    status             |
|    staff_interact_en  |  |    processed          |  |    trigger_events     |  |    battery_level      |
|    camera_enabled(0)  |  |    blocked_by_consent |  |    explanation        |  |    signal_rssi        |
|    audio_enabled(0)   |  |    network_delayed    |  |    status             |  |    firmware_version   |
|    location_enabled(0)|  +-----------------------+  +-----------------------+  +-----------------------+
+-----------------------+                                          | 1
                                                                   |
                                         +-------------------------+-------------------------+
                                         | 1                                               * | 1                   *
                                         v                                                   v
                              +-----------------------+                           +-----------------------+
                              |       incidents       |                           |     human_reviews     |
                              |-----------------------|                           |-----------------------|
                              | PK id (Integer)       |                           | PK id (Integer)       |
                              | FK resident_id        |                           | FK alert_id           |
                              | FK alert_id           |                           |    action_taken       |
                              |    timestamp (UTC)    |                           |    timestamp (UTC)    |
                              |    description        |                           |    notes              |
                              |    status (ACTIVE)    |                           +-----------------------+
                              +-----------------------+

+---------------------------------------+         +---------------------------------------+
|              audit_logs               |         |                 users                 |
|---------------------------------------|         |---------------------------------------|
| PK id (Integer)                       |         | PK id (String)                        |
|    action (String)                    |         | UNQ username (String, Indexed)        |
|    resident_id (String, Nullable)     |         |    hashed_password (Salted SHA-256)   |
|    timestamp (DateTime UTC)           |         |    full_name (String)                 |
|    details (String, Contextual)       |         |    role (CAREGIVER/DIRECTOR/FAMILY/..) |
+---------------------------------------+         +---------------------------------------+
```

---

### Detailed Table Specifications

#### 1. `facilities`
Represents an assisted living community or care campus.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | VARCHAR | Primary Key, Indexed | — | Unique facility identifier (e.g. `'FAC-01'`). |
| `name` | VARCHAR | NOT NULL | — | Community display name. |
| `address` | VARCHAR | Nullable | NULL | Physical address of the care home. |

#### 2. `rooms`
Represents individual resident suites or units.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | VARCHAR | Primary Key, Indexed | — | Suite identifier (e.g. `'ROOM-101'`). |
| `facility_id` | VARCHAR | Foreign Key (`facilities.id`), NOT NULL | — | Parent facility association. |
| `room_number`| VARCHAR | NOT NULL | — | Door suite number. |
| `ward` | VARCHAR | NOT NULL | — | Care unit (e.g. `'North Wing - Memory Care'`). |

#### 3. `residents`
Core clinical resident entity managing independence tiers and real-time state.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | VARCHAR | Primary Key, Indexed | — | Resident identifier (e.g. `'R001'`, `'R003'`). |
| `name` | VARCHAR | NOT NULL | — | Full resident name. |
| `room_id` | VARCHAR | Foreign Key (`rooms.id`), Nullable | NULL | Resident suite assignment. |
| `independence_level` | VARCHAR | NOT NULL | — | Autonomy level (`'High'`, `'Moderate'`, `'Assisted'`). Controls inactivity thresholds (60m, 30m, 15m). |
| `expected_activity` | VARCHAR | NOT NULL | — | Baseline mobility expectation (`'frequent'`, `'moderate'`, `'lower'`). |
| `alert_sensitivity` | VARCHAR | NOT NULL | — | Triage sensitivity (`'lower'`, `'medium'`, `'high'`). |
| `current_risk_score` | INTEGER | NOT NULL | `0` | Real-time composite risk score (0 to 100). |
| `current_status` | VARCHAR | NOT NULL | `'NORMAL'` | Current operational status (`NORMAL`, `MONITOR`, `REVIEW_REQUIRED`, `HIGH_PRIORITY`). |
| `anomaly_score` | FLOAT | NOT NULL | `0.0` | ML circadian drift divergence score (0.0 to 1.0). |
| `drift_category`| VARCHAR | NOT NULL | `'NORMAL_ROUTINE'`| ML sequence classification (`NORMAL_ROUTINE`, `NOCTURNAL_RESTLESSNESS`, `WANDERING_RISK`, `ROUTINE_DISRUPTION`, `MILD_DRIFT`). |
| `circadian_drift_detected` | BOOLEAN | NOT NULL | `False` | Flag indicating anomaly score >= 0.40. |
| `last_ml_assessment` | DATETIME | NOT NULL | `utcnow()` | UTC timestamp of last circadian analysis. |

#### 4. `events`
Chronological ambient telemetry log.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Event sequence identifier. |
| `resident_id` | VARCHAR | Foreign Key (`residents.id`), NOT NULL | — | Associated resident. |
| `event_type` | VARCHAR | NOT NULL | — | Modality: `movement_detected`, `no_movement`, `door_open`, `door_close`, `emergency_call`, `resident_response`, `staff_check`. |
| `timestamp` | DATETIME | NOT NULL | `utcnow()` | Event trigger timestamp. |
| `sensor_id` | VARCHAR | Nullable | NULL | Hardware device ID (e.g. `'MVMT-R001'`). |
| `processed` | BOOLEAN | NOT NULL | `True` | Whether event was fed into the risk engine. |
| `blocked_by_consent` | BOOLEAN | NOT NULL | `False` | True if event dropped due to revoked consent. |
| `network_delayed` | BOOLEAN | NOT NULL | `False` | True if packet was buffered offline during network outage. |

#### 5. `consent_settings`
Dynamic resident privacy matrix.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Consent record ID. |
| `resident_id` | VARCHAR | Foreign Key (`residents.id`), Unique, NOT NULL | — | 1-to-1 resident association. |
| `movement_enabled` | BOOLEAN | NOT NULL | `True` | Consent for PIR passive motion telemetry. |
| `door_enabled` | BOOLEAN | NOT NULL | `True` | Consent for magnetic door entry contacts. |
| `emergency_enabled` | BOOLEAN | NOT NULL | `True` | Consent for emergency pull-cord/pendant. |
| `staff_interaction_enabled` | BOOLEAN | NOT NULL | `True` | Consent for staff RFID check-in badges. |
| `camera_enabled` | BOOLEAN | NOT NULL | `False` | Optical surveillance (Permanently `False`). |
| `audio_enabled` | BOOLEAN | NOT NULL | `False` | Acoustic microphones (Permanently `False`). |
| `location_enabled` | BOOLEAN | NOT NULL | `False` | GPS tracking (Permanently `False`). |
| `updated_at` | DATETIME | NOT NULL | `utcnow()` | Timestamp of most recent consent toggle. |

#### 6. `alerts`
Algorithmic safety alerts requiring clinical triage.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Alert identifier. |
| `resident_id` | VARCHAR | Foreign Key (`residents.id`), NOT NULL | — | Target resident. |
| `timestamp` | DATETIME | NOT NULL | `utcnow()` | Alert generation timestamp. |
| `risk_score` | INTEGER | NOT NULL | — | Risk score at trigger time (>= 60). |
| `priority` | VARCHAR | NOT NULL | — | Classification (`'REVIEW REQUIRED'`, `'HIGH PRIORITY'`). |
| `trigger_events` | TEXT | Nullable | NULL | JSON list of triggering telemetry types. |
| `explanation` | TEXT | Nullable | NULL | JSON dict of explainable point contributions. |
| `status` | VARCHAR | NOT NULL | `'OPEN'` | Triage state: `OPEN`, `UNDER_REVIEW`, `VERIFIED_INCIDENT`, `FALSE_ALARM`, `DISMISSED`. |

#### 7. `incidents`
Clinically confirmed safety incidents (falls, acute distress).
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Incident record ID. |
| `resident_id` | VARCHAR | Foreign Key (`residents.id`), NOT NULL | — | Subject resident. |
| `alert_id` | INTEGER | Foreign Key (`alerts.id`), Nullable | NULL | Associated alert ID. |
| `timestamp` | DATETIME | NOT NULL | `utcnow()` | Incident verification timestamp. |
| `description` | VARCHAR | Nullable | NULL | Caregiver clinical notes and actions taken. |
| `status` | VARCHAR | NOT NULL | `'ACTIVE'` | Operational status (`'ACTIVE'`, `'RESOLVED'`). |

#### 8. `human_reviews`
Audit log of caregiver human-in-the-loop triage decisions.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Review action ID. |
| `alert_id` | INTEGER | Foreign Key (`alerts.id`), NOT NULL | — | Target alert. |
| `action_taken` | VARCHAR | NOT NULL | — | Decision: `'Call Resident'`, `'Check Room'`, `'Verify Incident'`, `'False Alarm'`, `'Dismiss'`. |
| `timestamp` | DATETIME | NOT NULL | `utcnow()` | Action execution timestamp. |
| `notes` | VARCHAR | Nullable | NULL | Caregiver clinical notes. |

#### 9. `sensor_statuses`
Edge device health and telemetry diagnostics.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Sensor inventory ID. |
| `resident_id` | VARCHAR | Foreign Key (`residents.id`), NOT NULL | — | Room/resident assignment. |
| `sensor_id` | VARCHAR | NOT NULL | — | Hardware device ID (e.g. `'MVMT-R001'`). |
| `sensor_type` | VARCHAR | NOT NULL | — | Classification (`'movement'`, `'door'`, `'emergency'`, `'staff'`). |
| `status` | VARCHAR | NOT NULL | `'ONLINE'` | Health state (`'ONLINE'`, `'NOISY'`, `'MISSING'`, `'LOW_BATTERY'`, `'TAMPER_ALERT'`). |
| `battery_level` | INTEGER | NOT NULL | `95` | Remaining percentage (0 to 100). Alerts if < 15%. |
| `signal_rssi` | INTEGER | NOT NULL | `-65` | Signal strength in dBm. |
| `firmware_version` | VARCHAR | NOT NULL | `'v2.4.1'` | Edge firmware string. |
| `last_seen` | DATETIME | NOT NULL | `utcnow()` | Timestamp of last received packet. |

#### 10. `audit_logs`
Immutable, append-only security and clinical audit trail.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | INTEGER | Primary Key, Autoincrement | — | Audit entry ID. |
| `action` | VARCHAR | NOT NULL | — | Audit action code (e.g. `'CONSENT_CHANGED'`, `'ALERT_REVIEWED'`, `'NETWORK_OFFLINE'`). |
| `resident_id` | VARCHAR | Nullable | NULL | Associated resident, if applicable. |
| `timestamp` | DATETIME | NOT NULL | `utcnow()` | Action execution timestamp. |
| `details` | VARCHAR | Nullable | NULL | Structured narrative of changes. |

#### 11. `users`
Role-Based Access Control (RBAC) user credentials and personas.
| Column | Type | Constraints | Default | Clinical / System Purpose |
|:---|:---|:---|:---|:---|
| `id` | VARCHAR | Primary Key, Indexed | — | User ID (e.g. `'usr_caregiver1'`). |
| `username` | VARCHAR | Unique, Indexed, NOT NULL | — | Login identifier. |
| `hashed_password` | VARCHAR | NOT NULL | — | Salted SHA-256 password hash. |
| `full_name` | VARCHAR | NOT NULL | — | Staff or family display name. |
| `role` | VARCHAR | NOT NULL | — | Security persona: `'CAREGIVER'`, `'CLINICAL_DIRECTOR'`, `'RESIDENT_FAMILY'`, `'SYSTEM_ADMIN'`. |
| `assigned_resident_id`| VARCHAR | Nullable | NULL | Scopes resident data for `'RESIDENT_FAMILY'`. |
| `created_at` | DATETIME | NOT NULL | `utcnow()` | Account creation timestamp. |

---

## 🌐 REST & WebSocket API Specification

Interactive Swagger UI documentation is available locally at `http://localhost:8000/docs` and ReDoc at `http://localhost:8000/redoc`.

### 1. Network Simulation Endpoints
Controls simulated facility connectivity to demonstrate store-and-forward edge resilience.

- **`POST /api/network/offline`**
  - **Description:** Sets facility network to offline. Ingesting real-time events returns HTTP 503 to trigger edge buffering.
  - **Auth:** System Admin / Caregiver
  - **Response (200 OK):** `{"status": "offline"}`
- **`POST /api/network/online`**
  - **Description:** Restores network connectivity, allowing edge buffers to flush queued packets.
  - **Response (200 OK):** `{"status": "online"}`
- **`GET /api/network/status`**
  - **Description:** Queries network connection state.
  - **Response (200 OK):** `{"online": true}`

### 2. Simulation & Scenario Runner
- **`POST /api/simulator/reset`**
  - **Description:** Clears dynamic alerts, incidents, events, and resets resident baselines to factory defaults.
  - **Response (200 OK):** `{"status": "reset success"}`
- **`POST /api/simulator/scenario/{scenario_id}`**
  - **Description:** Executes reproducible demonstration journeys:
    - `low-urgency`: R001 (High independence) with 20m inactivity -> Expected: No alert generated (within 60m threshold).
    - `high-urgency`: R003 (Assisted) with emergency call + immobility -> Expected: Alert generated (Score: 95/100, `HIGH PRIORITY`).
  - **Response (200 OK):** Scenario execution report including resident ID, final risk score, priority, and narrative summary.

### 3. Privacy & Dynamic Consent
- **`GET /api/consent/{resident_id}`**
  - **Description:** Fetches active consent settings for a resident.
  - **Response (200 OK):**
    ```json
    {
      "resident_id": "R001",
      "movement_enabled": true,
      "door_enabled": true,
      "emergency_enabled": true,
      "staff_interaction_enabled": true,
      "camera_enabled": false,
      "audio_enabled": false,
      "location_enabled": false,
      "updated_at": "2026-09-30T04:58:24Z"
    }
    ```
- **`POST /api/consent`**
  - **Query Params:** `resident_id=R001`
  - **Request Body:** `{"movement_enabled": false}`
  - **Response (200 OK):** Updated `ConsentResponse`. An audit log entry (`CONSENT_CHANGED`) is appended.

### 4. Resident Management
- **`GET /api/residents`**
  - **Description:** Lists all registered residents with current real-time risk scores and triage priorities.
  - **Response (200 OK):** Array of `ResidentResponse` objects (`id`, `name`, `independence_level`, `current_risk_score`, `current_status`).
- **`GET /api/residents/{id}`**
  - **Description:** Returns detailed resident profile including room assignment, circadian ML drift metrics, and active alerts.
  - **Response (200 OK):** `ResidentDetailResponse` object.

### 5. Ambient Telemetry Ingestion
- **`GET /api/events`**
  - **Description:** Returns chronological list of all ambient telemetry events across the facility.
- **`POST /api/events`**
  - **Description:** Primary telemetry ingestion pipeline. Evaluates deduplication (1s window), debouncing (<10s window), dynamic consent, and risk scoring.
  - **Request Body:**
    ```json
    {
      "resident_id": "R003",
      "event_type": "emergency_call",
      "sensor_id": "CALL-R003",
      "network_delayed": false
    }
    ```
  - **Response (200 OK):** Ingested `EventResponse` (`processed: true`, `blocked_by_consent: false`).
  - **Errors:** `503 Service Unavailable` if network is offline and `network_delayed=false`.

### 6. Alert Triage & Caregiver Review
- **`GET /api/alerts`**
  - **Description:** Fetches all alerts ordered by timestamp descending.
- **`GET /api/alerts/{id}`**
  - **Description:** Returns detailed alert data, including triggering telemetry list and explainable factor point breakdown (`explanation: {"Emergency call active": 70}`).
- **`POST /api/alerts/{id}/review`**
  - **Description:** Executes human-in-the-loop review on an open alert.
  - **Request Body:**
    ```json
    {
      "action_taken": "Verify Incident",
      "notes": "Fall confirmed near bathroom entrance. First aid dispatched."
    }
    ```
  - **Allowed Actions:** `"Call Resident"`, `"Check Room"`, `"Verify Incident"`, `"False Alarm"`, `"Dismiss"`.
  - **Response (200 OK):** Updated alert with status `VERIFIED_INCIDENT`, `FALSE_ALARM`, `DISMISSED`, or `UNDER_REVIEW`.

### 7. Clinical Metrics & Empirical Benchmark
- **`GET /api/metrics`**
  - **Description:** Computes live facility safety metrics, precision, recall, false alarm rate, and dynamic intrusiveness score.
- **`GET /api/experiment`**
  - **Description:** Executes the reproducible 500-event benchmark comparing DigniSafe to the single-threshold telecare model.
  - **Response (200 OK):**
    ```json
    {
      "baseline": { "true_positives": 44, "false_positives": 67, "precision": 0.396, "recall": 0.917 },
      "dignisafe": { "true_positives": 42, "false_positives": 11, "precision": 0.792, "recall": 0.875 },
      "intrusiveness_baseline": 0.5000,
      "intrusiveness_dignisafe": 0.4583
    }
    ```
- **`GET /api/errors`**
  - **Description:** Error analysis endpoint categorizing false positives, false negatives, sensor noise, and consent blocks with mitigation strategies.

### 8. Authentication & Role-Based Access Control (RBAC)
- **`POST /api/auth/login`**
  - **Request Body:** `{"username": "caregiver1", "password": "password123"}`
  - **Response (200 OK):**
    ```json
    {
      "access_token": "eyJzdWI...HMAC_SIGNATURE",
      "token_type": "bearer",
      "user": { "username": "caregiver1", "full_name": "Sarah Jenkins, RN", "role": "CAREGIVER" }
    }
    ```
- **`GET /api/auth/me`**
  - **Description:** Returns profile and permissions of the currently authenticated Bearer token user.
- **`GET /api/auth/users`**
  - **Description:** Lists pre-seeded personas for rapid evaluator role switching.

### 9. Circadian ML Anomaly Detection Engine
- **`GET /api/ml/analytics/{resident_id}`**
  - **Description:** Computes 24-hour activity density distributions, Bhattacharyya sequence divergence entropy, and clinical care advisories.
  - **Response (200 OK):**
    ```json
    {
      "resident_id": "R001",
      "anomaly_score": 0.12,
      "drift_category": "NORMAL_ROUTINE",
      "circadian_drift_detected": false,
      "divergence_metric": 0.08,
      "hourly_baseline": [1.0, 0.0, ...],
      "hourly_recent": [1.2, 0.0, ...],
      "nighttime_activity_ratio": 0.03,
      "advisories": ["Resident routine remains within expected circadian boundaries."]
    }
    ```

### 10. IoT Edge Hardware Gateway Telemetry
- **`POST /api/gateway/telemetry`**
  - **Description:** Ingests raw telemetry packets from physical edge hardware gateways (ESP32/Zigbee/MQTT).
  - **Request Body:**
    ```json
    {
      "sensor_id": "MVMT-R001",
      "resident_id": "R001",
      "battery_level": 14,
      "signal_rssi": -72,
      "firmware_version": "v2.4.1",
      "tamper_detected": false
    }
    ```
  - **Response (200 OK):** Acknowledges packet; returns `"warning": "CRITICAL_LOW_BATTERY"` when battery <= 15%.
- **`GET /api/gateway/fleet`**
  - **Description:** Returns operational health, battery levels, and wireless RSSI for all registered sensors.
- **`GET /api/gateway/status`**
  - **Description:** Health check of the facility edge gateway node (`GW-NORTH-01`).

### 11. Healthcare Interoperability: HL7 FHIR Release 4
- **`GET /api/residents/{id}/fhir-bundle`**
  - **Description:** Generates an official HL7 FHIR R4 Collection Bundle for EHR export.
  - **Resources Included:**
    - `Patient`: Demographics and care unit context.
    - `Observation`: Ambient telemetry events encoded with LOINC/SNOMED terminology.
    - `DetectedIssue`: Algorithmic risk alerts with explainability factors.
    - `Encounter`: Facility admission and care episode metadata.

### 12. Emergency Notification Routing
- **`GET /api/notifications/history`**
  - **Description:** Retrieves audit history of multi-channel emergency dispatches across SMS, Pager, and Web Push channels.

### 13. Real-Time WebSocket Streaming Channel
- **`WS /ws/alerts`**
  - **Description:** Full-duplex WebSocket connection channel.
  - **Events Broadcasted:**
    - `ALERT_GENERATED`: Real-time push of newly generated alerts with risk score and priority.
    - `ALERT_REVIEWED`: Real-time push of caregiver triage state changes.
    - `GATEWAY_TELEMETRY`: Hardware diagnostics and critical low battery notices.
    - `EVENT_INGESTED`: Live stream of ingested ambient telemetry.
  - **Heartbeat:** Clients send `"ping"`, server replies `{"type": "pong"}` to ensure connection liveness.

---

## 🛡️ Unit Testing & Frontend Error Boundaries Architecture

For a comprehensive, deep-dive technical guide on testing methodology, fixture lifecycles, and React 18 error containment, see:  
📖 **[Granular Technical Documentation on Unit Testing & Error Boundaries (docs/TESTING_AND_ERROR_BOUNDARIES.md)](docs/TESTING_AND_ERROR_BOUNDARIES.md)**

### Backend Testing Highlights (17 Automated Tests)
DigniSafe includes 17 exhaustive automated tests executed via Pytest on an isolated SQLite database fixture:
```bash
.\backend\venv\Scripts\pytest.exe -v backend\tests\test_backend.py
```
- **100% Pass Rate:** 17 passed in ~10 seconds.
- **Coverage Areas:** Multi-factor risk math, independence inactivity limits (15m, 30m, 60m), 10s sensor debouncing, 1s packet deduplication, dynamic consent blocking, store-and-forward 503 offline queueing & replay, 5-action caregiver review state machine, 500-event empirical benchmark, Bhattacharyya circadian ML entropy drift, IoT battery <15% alerts, and HL7 FHIR R4 bundle generation.

### Frontend Error Boundary Highlights (React 18)
To prevent white-screen crashes on clinical monitoring workstations:
1. **Root Application Boundary (`main.tsx`):** Traps fatal unhandled rendering errors and provides emergency fallback UI with interface reload and hard refresh options.
2. **Isolated Subsystem Boundaries (`App.tsx`):** Main viewport modules (Circadian charts, alert triage feed, IoT fleet inventory) are wrapped in isolated boundaries (`isolate={true}`). If a chart rendering error occurs, only that widget displays an inline retry card, while caregiver alert triage and live sensor streams continue without interruption.
3. **Audit & Recovery:** Includes diagnostic stack trace toggle for technical reviews and automated console logging with UTC timestamps and component call stacks.

---

## 🚀 Quick Start & Docker Deployment

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- (Optional) Docker & Docker Compose

### Option A: Docker Compose (One-Command Stack)
```bash
# Clone the repository
git clone https://github.com/CodePraneesh/DigniSafe.git
cd DigniSafe

# Launch entire system
docker-compose up --build

# Access the applications:
# Frontend Console: http://localhost:3000
# Backend Swagger API Docs: http://localhost:8000/docs
```

### Option B: Local Development Setup

#### 1. Backend Service
```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
# Running at: http://localhost:5173
```

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

