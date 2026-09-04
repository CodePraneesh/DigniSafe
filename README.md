# DigniSafe 🛡️
> **Privacy-Preserving Resident Safety & Intelligent Alert Triage Platform for Assisted Living**

[![Phase 1 Review 1](https://img.shields.io/badge/Review%201-35%25%20Completed-brightgreen.svg)](#milestone-status)
[![Backend Tests](https://img.shields.io/badge/pytest-7%2F7%20passed-success.svg)](#testing--verification)
[![FastAPI](https://img.shields.io/badge/FastAPI-1.0.0-blue.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](#license)

---

## 📌 Phase 1 Review 1 Notice & Document Links

This repository is submitted for the **Phase 1 Project Review – Review 1 (Target: ~35% Milestone)**.

📄 **Official Review 1 Evaluation Report:**  
👉 **[Read the Full REVIEW_1_REPORT.md](REVIEW_1_REPORT.md)** 👈

The report contains:
- **Work completed so far:** Problem statement, architecture, system design, and technology stack.
- **Completed features/modules:** Explainable risk engine, dynamic consent framework, sensor debouncing, store-and-forward edge resilience, and interactive React dashboard.
- **What is currently working:** Pytest test suite execution (7/7 passed), live API endpoints, operational UI flows, and 500-event comparative benchmark results.
- **Pending work and next steps:** Detailed roadmap for Review 2 (~70%) and Final Review (~100%).

---

## 💡 What is DigniSafe?

Elderly and assisted-care monitoring systems face two critical failures:
1. **Intrusive Surveillance:** Cameras and acoustic audio streaming cause severe loss of privacy, resident distress, and high rejection rates.
2. **Alert Fatigue:** Naive threshold sensors flood caregivers with hundreds of false alarms weekly, causing real emergencies to be overlooked.

**DigniSafe** solves both problems with an ambient, privacy-preserving telemetry approach:
- **Non-Intrusive Sensing:** Relies solely on motion (PIR), magnetic door contacts, bed occupancy, and emergency buttons. Camera and audio monitoring are completely disabled.
- **Explainable Multi-Factor Risk Engine:** Computes real-time risk scores ($0-100$) based on baseline resident independence, time-weighted inactivity, and mitigating signals.
- **Dynamic Resident Consent:** Residents or guardians can toggle individual sensor data streams on or off at will with immediate, auditable backend enforcement.
- **Hardware Fault & Noise Filtering:** Software debouncing automatically filters out sensor flapping and distinguishes missing telemetry from confirmed emergencies.
- **Store-and-Forward Edge Resilience:** Caches events locally during facility network drops and synchronizes upon restoration.

---

## 🏗️ System Architecture

```
                      +-----------------------------+
                      | Ambient Non-Intrusive Nodes |
                      | PIR Motion / Door / Button  |
                      +--------------+--------------+
                                     |
                                     v
                       +---------------------------+
                       | FastAPI Telemetry Ingest  |
                       +-------------+-------------+
                                     |
                +--------------------+--------------------+
                |                                         |
                v                                         v
   +-------------------------+               +-------------------------+
   |  Consent Interceptor    |               | Telemetry Resilience    |
   | Drops non-consented data|               | Debouncing & Dedup      |
   +------------+------------+               +------------+------------+
                |                                         |
                +--------------------+--------------------+
                                     |
                                     v
                      +-----------------------------+
                      | Explainable Risk Engine     |
                      | Score: 0-100 | Priority     |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      | SQLite / SQLAlchemy ORM     |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      | React + Vite Dashboard      |
                      | Caregiver Triage & Actions  |
                      +-----------------------------+
```

---

## ⚡ Quick Start & Local Execution

### Prerequisites
- Python 3.10 or higher
- Node.js 18+ and npm

### 1. Start the Backend API Server
```powershell
# Navigate to backend directory
cd backend

# Create and activate virtual environment (Windows PowerShell)
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server
uvicorn app.main:app --reload --port 8000
```
- **REST API Base URL:** `http://127.0.0.1:8000`
- **Interactive Swagger Documentation:** `http://127.0.0.1:8000/docs`

### 2. Run the Automated Test Suite
In the `backend` directory with the virtual environment activated:
```powershell
pytest -v
```
All **7 core functional tests** will execute and pass, verifying emergency alert triggers, consent blocking, debouncing, network offline queuing, and human review verification.

### 3. Start the Frontend Dashboard
```powershell
# In a new terminal, navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
- **Web Application URL:** `http://localhost:5173`

---

## 🔬 Key Completed Features & Modules

### 1. Explainable Risk Engine (`backend/app/risk_engine.py`)
- Adapts inactivity thresholds dynamically according to the resident's independence level:
  - **High:** 60-minute threshold
  - **Moderate:** 30-minute threshold
  - **Assisted:** 15-minute threshold
- Combines cumulative hazard weights (Emergency Call: $+70$, Inactivity past threshold: $+60$, Door open: $+15$, Sensor failure: $+10$).
- Deducts risk when reassuring signals arrive (Normal movement detected after call: $-10$, Staff visit: $-20$).

### 2. Resident Privacy & Dynamic Consent (`backend/app/consent.py`)
- Resident-controlled consent toggles for movement, door, and emergency tracking.
- If a resident turns off movement consent, incoming motion events are immediately flagged as `blocked_by_consent=True`, dropped from risk calculations, and recorded in the audit log.
- Intrusive channels (video cameras, microphone audio, GPS coordinates) are permanently disabled (`False`).

### 3. Edge Resilience & Sensor Health
- **Sensor Debouncing:** Detects rapid binary toggling ($<10\text{s}$) and marks the sensor as `NOISY` to eliminate false alarms.
- **Missing Telemetry Isolation:** Disconnected sensor heartbeats raise a `MISSING` hardware warning without falsely categorizing it as resident immobility.
- **Store-and-Forward Queue:** When the facility network goes offline, events are buffered on the client edge and delivered with `network_delayed=True` upon reconnection.

### 4. Interactive Caregiver Web Dashboard (`frontend/src/`)
- **Facility Overview (`dashboard`):** Real-time monitoring metrics, status distribution, and intrusiveness index.
- **Resident Directory (`residents`):** Individual resident cards, independence levels, sensor statuses, and live consent switches.
- **Alert Triage (`alerts`):** Priority queues (`REVIEW REQUIRED`, `HIGH PRIORITY`) with itemized score explanations and caregiver action buttons.
- **Fault Simulator (`simulator`):** Interactive trigger panel to test emergency calls, rapid flapping, sensor failures, and network cutoffs.
- **Comparative Experiment (`experiment`):** Side-by-side benchmark evaluation on 500 events comparing baseline telecare vs DigniSafe.
- **Error Analysis Matrix (`errors`):** Detailed breakdown of false alarms, false negatives, sensor noise, and consent trade-offs.

---

## 🧪 Testing & Verification

| Test Case | Description | Result |
| :--- | :--- | :---: |
| `test_emergency_call_generates_high_risk` | Validates emergency button generates score 70 and high alert | ✅ PASSED |
| `test_consent_disabled_prevents_processing` | Validates revoked consent halts risk calculation | ✅ PASSED |
| `test_missing_data_does_not_equal_no_movement`| Verifies offline sensor produces hardware warning, not fall alert | ✅ PASSED |
| `test_noisy_sensor_events_filtered` | Proves rapid flapping sensor is debounced | ✅ PASSED |
| `test_network_offline_queues_and_restores` | Verifies edge store-and-forward queue under HTTP 503 | ✅ PASSED |
| `test_duplicate_events_rejected` | Proves duplicate timestamps within 1 second are deduplicated | ✅ PASSED |
| `test_human_verification_and_metrics` | Validates caregiver triage and dynamic precision calculation | ✅ PASSED |

---

## 🗺️ Project Roadmap

- [x] **Phase 1: Review 1 (~35% Milestone - Current)**
  - Core data schemas, SQLite persistence, and migrations
  - Explainable heuristic risk scoring engine
  - Granular dynamic consent enforcement & audit logging
  - Sensor debouncing & network store-and-forward edge handling
  - Full-stack working prototype (FastAPI + React/TypeScript)
  - 100% passing automated test suite & 500-event benchmark simulation
- [ ] **Phase 2: Review 2 (~70% Milestone)**
  - Unsupervised temporal sequence anomaly detection (LSTM / Isolation Forest)
  - WebSocket bidirectional streaming for real-time alert dispatch
  - Multi-tier Role-Based Access Control (RBAC)
  - Physical IoT Gateway integration (MQTT / Zigbee bridge)
- [ ] **Phase 3: Final Review (~100% Milestone)**
  - Mobile caregiver push notifications (PWA / Twilio SMS fallback)
  - FHIR / HL7 compliant healthcare record export
  - Docker Compose multi-container production deployment
  - Comprehensive field trial evaluation report

---

## 📄 License
This project is licensed under the MIT License.
