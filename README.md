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

## 🧪 Testing & Verification

Run the complete 17-test automated verification suite:
```bash
# In repository root:
.\backend\venv\Scripts\pytest.exe -v backend\tests\test_backend.py
```

All 17 tests pass with 100% success rate:
- `test_emergency_call_generates_high_risk` PASSED
- `test_consent_disabled_prevents_processing` PASSED
- `test_missing_data_does_not_equal_no_movement` PASSED
- `test_noisy_sensor_events_filtered` PASSED
- `test_network_offline_queues_and_restores` PASSED
- `test_duplicate_events_rejected` PASSED
- `test_human_verification_and_metrics` PASSED
- `test_baseline_and_dignisafe_experiment_metrics_calculated` PASSED
- `test_intrusiveness_score_calculated_dynamically` PASSED
- `test_low_urgency_journey_r001_no_false_alert` PASSED
- `test_high_urgency_journey_r003_alert_and_human_review` PASSED
- `test_door_and_emergency_consent_backend_enforcement` PASSED
- `test_auth_login_and_token_me` PASSED
- `test_ml_circadian_drift_analytics` PASSED
- `test_iot_gateway_telemetry_and_fleet_status` PASSED
- `test_hl7_fhir_r4_bundle_generation` PASSED
- `test_emergency_notifications_history` PASSED

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
