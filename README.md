# DigniSafe 🛡️
> **Privacy-Preserving Resident Safety & Intelligent Alert Triage Platform for Assisted Living**

[![Phase 1 Review 1](https://img.shields.io/badge/Review%201-35%25%20Completed-brightgreen.svg)](#milestone-status)
[![Backend Tests](https://img.shields.io/badge/pytest-12%2F12%20passed-success.svg)](#testing--verification)
[![FastAPI](https://img.shields.io/badge/FastAPI-1.0.0-blue.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](#license)

---

> [!IMPORTANT]
> **Prototype Scope & Evaluation Notice:**  
> This repository represents the **Phase 1 (Review 1, ~35% Milestone)** submission.  
> It is a **synthetic, software-only prototype** designed to prove the safety-monitoring workflow, privacy consent engine, sensor debouncing, and explainable risk triage.  
> It does **not** claim real clinical patient trials, physical IoT gateway hardware deployment, or medical diagnostic efficacy at this early foundational stage.

---

## 📌 Phase 1 Review 1 Documentation Links

- 📄 **[Official Review 1 Evaluation Report](REVIEW_1_REPORT.md)**: Full report covering problem statement, architecture, working features, 12 test verifications, un-faked 500-event benchmark results, and requirement traceability.
- 📋 **[Review 1 Step-by-Step Demo Script](docs/review1_demo.md)**: Complete 26-step verification checklist for evaluators.
- 🔍 **[Comprehensive Review 1 Audit Matrix](docs/REVIEW1_AUDIT.md)**: Complete audit matrix evaluating each requirement area with exact test results.

---

## 💡 What is DigniSafe?

Elderly care facilities face a painful compromise:
1. **Intrusive Surveillance:** Video cameras and continuous acoustic listening strip residents of dignity, trigger distress, and face high rejection rates.
2. **Caregiver Alert Fatigue:** Naive threshold sensors flood staff with hundreds of false alarms weekly, causing genuine emergencies to go unnoticed.

**DigniSafe** solves both problems with an ambient, privacy-preserving approach:
- **Non-Intrusive Sensing:** Uses solely passive telemetry (PIR motion, magnetic door contacts, emergency buttons). Video cameras, audio microphones, and GPS tracking are permanently disabled (`OFF`).
- **Explainable Multi-Factor Risk Engine:** Deterministically computes a $0-100$ score adapted to resident independence (`High`, `Moderate`, `Assisted`), inactivity duration, and mitigating motion.
- **Dynamic Resident Consent:** Residents maintain autonomous control over telemetry streams; revoked channels are dropped at the backend ingestion layer and logged to an immutable audit trail.
- **Hardware Fault & Noise Filtering:** Software debouncing automatically suppresses rapid sensor flapping (<10s) and isolates missing sensor packets without falsely assuming immobility.
- **Store-and-Forward Edge Resilience:** Buffers events locally when facility network disconnects and synchronizes upon restoration.

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

## 🚦 Feature Status Matrix (Honest Review 1 Audit)

| Component / Feature | Implementation Level | Status |
| :--- | :--- | :---: |
| **Relational Data Schema & ORM** | SQLite + SQLAlchemy: Residents, Events, Consent, Alerts, Incidents | **COMPLETED (~35%)** |
| **Explainable Risk Engine** | Dynamic heuristic scoring ($0-100$) with resident independence thresholds | **COMPLETED (~35%)** |
| **Dynamic Consent Enforcement** | Backend interceptor; non-consented events dropped with audit log | **COMPLETED (~35%)** |
| **Sensor Debouncing** | Software debouncing of rapid flapping (<10s) to suppress false alarms | **COMPLETED (~35%)** |
| **Missing Telemetry Isolation** | Missing sensor flags hardware notice (+10) without false fall alert | **COMPLETED (~35%)** |
| **Store-and-Forward Caching** | HTTP 503 cutoff handling, local edge queue & sync replay with delayed flag | **COMPLETED (~35%)** |
| **Caregiver Human Review** | 5-action triage state machine (`Verify`, `False Alarm`, `Dismiss`, etc.) | **COMPLETED (~35%)** |
| **Two Resident Journeys** | 1-click reproducible Low Urgency (R001) & High Urgency (R003) demos | **COMPLETED (~35%)** |
| **Automated Test Suite** | 12 Pytest tests covering all critical functional paths (100% pass) | **COMPLETED (~35%)** |
| **Full-Stack Working Dashboard** | 6-tab React/TypeScript UI (Dashboard, Residents, Alerts, Sim, Exp, Errors) | **COMPLETED (~35%)** |
| **Temporal ML Anomaly Models** | Unsupervised circadian sequence anomaly models (LSTM / Isolation Forest) | *PLANNED (Review 2, ~70%)* |
| **Bidirectional WebSockets** | Real-time push streaming replacing 4s HTTP polling | *PLANNED (Review 2, ~70%)* |
| **Physical IoT Gateway Bridge** | Microcontroller hardware packet reception via MQTT / Zigbee | *PLANNED (Review 2, ~70%)* |
| **Mobile Push & EHR Sync** | Twilio SMS emergency alerts and HL7 / FHIR clinical record compliance | *PLANNED (Final, 100%)* |

---

## ⚡ Quick Start & Local Execution

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Start the Backend API Server
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run server
uvicorn app.main:app --reload --port 8000
```
- **REST API Base URL:** `http://127.0.0.1:8000`
- **Interactive Swagger Documentation:** `http://127.0.0.1:8000/docs`

### 2. Run the Automated Test Suite
In the `backend` directory:
```powershell
pytest -v
```
All **12 automated unit and integration tests** will execute and pass cleanly in ~5 seconds.

### 3. Start the Frontend Dashboard
```powershell
cd ../frontend
npm install
npm run dev
```
- **Web Application URL:** `http://localhost:5173`

---

## 🧪 Testing & Verification Summary

```text
tests/test_backend.py::test_emergency_call_generates_high_risk PASSED       [  8%]
tests/test_backend.py::test_consent_disabled_prevents_processing PASSED     [ 16%]
tests/test_backend.py::test_missing_data_does_not_equal_no_movement PASSED  [ 25%]
tests/test_backend.py::test_noisy_sensor_events_filtered PASSED             [ 33%]
tests/test_backend.py::test_network_offline_queues_and_restores PASSED      [ 41%]
tests/test_backend.py::test_duplicate_events_rejected PASSED                [ 50%]
tests/test_backend.py::test_human_verification_and_metrics PASSED           [ 58%]
tests/test_backend.py::test_baseline_and_dignisafe_experiment_metrics PASSED[ 66%]
tests/test_backend.py::test_intrusiveness_score_calculated_dynamically PASSED[75%]
tests/test_backend.py::test_low_urgency_journey_r001_no_false_alert PASSED  [ 83%]
tests/test_backend.py::test_high_urgency_journey_r003_alert_and_review PASSED[91%]
tests/test_backend.py::test_door_and_emergency_consent_enforcement PASSED  [100%]

======================= 12 passed in 5.24s =======================
```

---

## 🔬 Empirical 500-Event Benchmark Results

Evaluated over the identical 500-event synthetic validation dataset (`RANDOM_SEED = 42`):

| Evaluation Metric | Naive Telecare Baseline | DigniSafe (Current System) | Performance Difference |
| :--- | :---: | :---: | :--- |
| **True Positives (TP)** | 29 | **28** | Captures genuine safety incidents |
| **True Negatives (TN)** | 383 | **416** | Correctly recognizes normal routine |
| **False Positives (FP)** | 86 | **53** | **38.4% Reduction in False Alarms** |
| **False Negatives (FN)** | 2 | **3** | Low, safe miss profile |
| **Precision Rate** | 25.22% | **34.57%** | **+9.35% Precision Gain** |
| **Recall Rate** | 93.55% | **90.32%** | High sensitivity retained |
| **False-Positive Rate** | 18.34% | **11.30%** | **38.4% Relative Reduction** |
| **Missed Incident Rate** | 6.45% | **9.68%** | Controlled risk profile |
| **Total Alerts Dispatched** | 115 | **81** | **29.6% Reduction in Alert Interruptions** |
| **Intrusiveness Score** | 50.00% | **49.27%** | Dynamically lower via consent enforcement |

---

## 📄 License
This project is licensed under the MIT License.
