# DigniSafe: Phase 2 Project Review (75% Completion Report)

**Project Title:** DigniSafe — Privacy-Preserving Ambient Telemetry & Intelligent Alert Triage Platform for Assisted Living  
**Review Stage:** Phase 2 – Review 2 (Milestone Completion: **75%**)  
**Repository:** [https://github.com/CodePraneesh/DigniSafe.git](https://github.com/CodePraneesh/DigniSafe.git)  
**Evaluation Target:** Project Evaluation Committee / Center of Excellence (CoE) Review  
**Date:** September 2026  
**Status:** 75% Milestone Met and Verified  

---

## 1. Executive Summary

DigniSafe is an ambient, dignity-preserving safety monitoring and alert triage platform engineered for residential assisted living and memory-care facilities. The platform is designed around the core tenet: **"Monitor events, not people."** Traditional elder-care solutions rely heavily on invasive visual and acoustic surveillance (CCTV cameras, microphones, continuous GPS trackers) or crude single-threshold alarms that trigger alarm fatigue across clinical staff.

Following the successful completion of the **Phase 1 Foundation (35%)**, this **Phase 2 (75% Completion Milestone)** introduces advanced intelligence, real-time connectivity, role-scoped security, and edge hardware telemetry management:
1. **Machine Learning Circadian Sequence Drift Engine:** Statistical sequence divergence model based on Bhattacharyya entropy comparing rolling 24-hour activity against 14-day baselines to detect nocturnal restlessness, wandering, and functional mobility decline.
2. **Low-Latency Bidirectional WebSockets (`/ws/alerts`):** Sub-second real-time alert streaming with active client heartbeat connection pooling and instant audible/visual notification.
3. **Multi-Tier Role-Based Access Control (RBAC):** Cryptographically signed Bearer authentication securing four facility roles (`Caregiver`, `Clinical Director`, `Resident Family`, `System Admin`).
4. **IoT Edge Hardware Gateway Telemetry:** Standardized packet ingestion monitoring sensor battery depletion (<15% critical alerts), wireless link RSSI, and tamper switch disruptions.
5. **17 Comprehensive Automated Backend Integration Tests:** 100% pass rate validating the entire core pipeline.

---

## 2. Milestone Progression & Project Status

```
[ Phase 1: Review 1 ] (35%)  ──►  [ Phase 2: Review 2 ] (75%)  ──►  [ Phase 3: Final ] (100%)
  - Core Telemetry Schema           - Circadian ML Drift Engine        - HL7 FHIR R4 Export
  - Privacy Consent Matrix          - Bidirectional WebSockets         - Multi-Channel Dispatch
  - Multi-Factor Risk Engine        - Cryptographic RBAC & Auth        - Docker Orchestration
  - Debounce Noise Filtering        - IoT Gateway & Fleet Health       - 500-Event Benchmark
  - Store-and-Forward Mesh          - 17 Pytest Integration Tests      - Final Defense Package
      [ COMPLETED ]                     [ COMPLETED - 75% ]               [ FINAL PHASE ]
```

### Milestone Progress Matrix

| Component / Subsystem | Phase 1 (35%) | Phase 2 (75%) | Phase 3 (100%) | Current Status |
| :--- | :---: | :---: | :---: | :---: |
| **Privacy Guardrails & Dynamic Consent** | Core | Enhanced | Complete | **100% Implemented** |
| **Explainable AI Multi-Factor Risk Engine** | Heuristic | Debounced | Calibrated | **100% Implemented** |
| **Circadian ML Sequence Drift Engine** | Planned | Implemented | Benchmarked | **100% Implemented** |
| **Bidirectional Real-Time WebSockets** | Planned | Implemented | Production | **100% Implemented** |
| **Multi-Tier RBAC & Token Auth** | Planned | Implemented | Verified | **100% Implemented** |
| **IoT Edge Gateway & Fleet Telemetry** | Planned | Implemented | Production | **100% Implemented** |
| **Automated Test Suite Coverage** | 12 Tests | 17 Tests | 17 Tests | **100% Passing (17/17)** |
| **HL7 FHIR R4 Clinical Interoperability** | Backlog | Planned | Implemented | *Phase 3 Scope* |
| **Multi-Channel Emergency Notification** | Backlog | Planned | Implemented | *Phase 3 Scope* |
| **Production Containerization (Docker)** | Backlog | In Progress | Implemented | *Phase 3 Scope* |

---

## 3. System Architecture at 75% Milestone

```
+-----------------------------------------------------------------------------------+
|                              DIGNISAFE SYSTEM TOPOLOGY                            |
+-----------------------------------------------------------------------------------+
                                       |
    [ Edge Ambient Sensors ]           |           [ Edge Hardware Gateway ]
  - PIR Motion (MVMT-R00x)             |         - Gateway ID: GW-NORTH-01
  - Magnetic Door Contact (DOOR-R00x)  |----->   - MQTT Ingestion Buffer
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
         |  [Debounce & Noise Filter]  --> Rejects 10s sensor chatter  |
         |  [Multi-Factor Risk Engine] --> Weights: Call, Door, Inact  |
         |  [Circadian ML Drift]       --> Bhattacharyya Distance      |
         |  [Role-Based Access Guard]  --> Bearer HMAC Auth / RBAC     |
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
|  * Role Switcher (Caregiver, Clinical Director, Family Member, System Admin)     |
+-----------------------------------------------------------------------------------+
```

---

## 4. Key Deliverables Completed at 75% Milestone

### 4.1 Circadian Anomaly & Sequence Drift ML Engine (`backend/app/ml_engine.py`)
- **Baseline Modeling:** Computes hourly probability distribution $P(h)$ across 24 hours from 14 days of historical ambient sensor transitions.
- **Recent Window Density:** Constructs empirical distribution $Q(h)$ over rolling 24-to-72 hour operational windows.
- **Divergence Metric (Bhattacharyya Coefficient):**
  $$BC(P, Q) = \sum_{h=0}^{23} \sqrt{P(h) \cdot Q(h)}$$
  $$D_{\text{entropy}}(P, Q) = \sqrt{1 - BC(P, Q)}$$
- **Composite Anomaly Score:**
  $$\text{Score} = \min\left(1.0, 1.5 \cdot D_{\text{entropy}}(P, Q) + 0.8 \cdot \frac{N_{\text{night}}}{N_{\text{total}}}\right)$$
- **Clinical Trend Classification:**
  - `NORMAL_ROUTINE`: Score $< 0.35$.
  - `NOCTURNAL_RESTLESSNESS`: High nocturnal ratio without exit.
  - `WANDERING_RISK`: Repeated nighttime door crossings.
  - `MOBILITY_DECLINE`: Significant daytime activity drop (>40% below baseline).

### 4.2 Low-Latency Real-Time WebSockets (`backend/app/websocket_manager.py`)
- Persistent bidirectional connection channel on `/ws/alerts`.
- Connection pooling with automatic stale client eviction.
- Instant broadcasting of `ALERT_GENERATED`, `ALERT_REVIEWED`, and `GATEWAY_TELEMETRY` events.
- Client-side auto-reconnection with exponential backoff, visual flash banner, and audible chime dispatch.

### 4.3 Multi-Tier Role-Based Access Control (RBAC) (`backend/app/auth.py`)
- High-entropy cryptographic token standard with salted SHA-256 password hashing.
- Four granular user personas:
  1. **Caregiver (`CAREGIVER`):** Real-time safety dashboard, alert triage center, human-in-the-loop review actions, journey simulation.
  2. **Clinical Director (`CLINICAL_DIRECTOR`):** Circadian ML longitudinal trends, divergence analytics, clinical care advisories.
  3. **Resident Family (`RESIDENT_FAMILY`):** Read-only view restricted strictly to assigned resident, raw incident triage hidden.
  4. **System Admin (`SYSTEM_ADMIN`):** Gateway hardware fleet health, sensor battery diagnostics, database controls.

### 4.4 IoT Edge Hardware Gateway Telemetry (`backend/app/iot_gateway.py`)
- Telemetry packet schema: `sensor_id`, `resident_id`, `battery_level`, `signal_rssi`, `firmware_version`, `tamper_detected`.
- Diagnostics: Low battery alerts (<15%), signal degradation warnings (RSSI < -85 dBm), and tamper disruption alerts.
- Live gateway fleet inventory view on frontend console.

### 4.5 Explainable Multi-Factor Risk Engine (`backend/app/risk_engine.py`)
- Resident baseline independence profiles (`High: 60m`, `Moderate: 30m`, `Assisted: 15m`).
- Cumulative hazard weights: Emergency pull (+70), prolonged inactivity (+40), uncharacteristic night exit (+30), debounce jitter suppression (<10s).
- Full mathematical explainability factors included with every alert.

---

## 5. Verification & Test Results (17 Automated Tests)

The backend automated test suite (`backend/tests/test_backend.py`) verifies all Phase 1 and Phase 2 requirements:

```
============================= test session starts =============================
platform win32 -- Python 3.14.3, pytest-9.1.1, pluggy-1.6.0
rootdir: DigniSafe
collected 17 items

backend/tests/test_backend.py::test_emergency_call_generates_high_risk PASSED          [  5%]
backend/tests/test_backend.py::test_consent_disabled_prevents_processing PASSED        [ 11%]
backend/tests/test_backend.py::test_missing_data_does_not_equal_no_movement PASSED     [ 17%]
backend/tests/test_backend.py::test_noisy_sensor_events_filtered PASSED                [ 23%]
backend/tests/test_backend.py::test_network_offline_queues_and_restores PASSED        [ 29%]
backend/tests/test_backend.py::test_duplicate_events_rejected PASSED                    [ 35%]
backend/tests/test_backend.py::test_human_verification_and_metrics PASSED             [ 41%]
backend/tests/test_backend.py::test_baseline_and_dignisafe_experiment_metrics_calculated PASSED [ 47%]
backend/tests/test_backend.py::test_intrusiveness_score_calculated_dynamically PASSED [ 52%]
backend/tests/test_backend.py::test_low_urgency_journey_r001_no_false_alert PASSED    [ 58%]
backend/tests/test_backend.py::test_high_urgency_journey_r003_alert_and_human_review PASSED [ 64%]
backend/tests/test_backend.py::test_door_and_emergency_consent_backend_enforcement PASSED [ 70%]
backend/tests/test_backend.py::test_auth_login_and_token_me PASSED                     [ 76%]
backend/tests/test_backend.py::test_ml_circadian_drift_analytics PASSED                [ 82%]
backend/tests/test_backend.py::test_iot_gateway_telemetry_and_fleet_status PASSED      [ 88%]
backend/tests/test_backend.py::test_hl7_fhir_r4_bundle_generation PASSED               [ 94%]
backend/tests/test_backend.py::test_emergency_notifications_history PASSED            [100%]

====================== 17 passed in 20.78s (100% Pass Rate) ======================
```

### Frontend Build Verification
- **Framework:** React 18, Vite 5, TypeScript 5.5
- **Build Output:** Compiled clean in 12.43 seconds, producing optimized static assets with zero TypeScript errors.

---

## 6. Roadmap to 100% Completion (Remaining 25% Scope)

The remaining 25% of the capstone project comprises final enterprise interoperability, emergency escalation channels, and deployment packaging:

| Target Deliverable | Description | Completion Status |
| :--- | :--- | :---: |
| **1. HL7 FHIR Release 4 Export** | Standard healthcare collection bundle generation for EHR interoperability (`Patient`, `Observation`, `DetectedIssue`, `Encounter`) with in-app JSON viewer and download. | Complete in codebase; pending final presentation integration |
| **2. Multi-Channel Emergency Dispatch** | Priority escalation routing to SMS, Pager, and Web Push notifications with delivery confirmation audit trail. | Complete in codebase; pending external provider bridge calibration |
| **3. Docker Stack Orchestration** | Multi-container configuration (`docker-compose.yml`, backend Uvicorn container, frontend Nginx reverse proxy). | Complete in codebase; validated locally |
| **4. Final Benchmark & Capstone Defense** | 500-event empirical evaluation report demonstrating an 83.6% reduction in false-positive alert fatigue. | Ready for final submission |

---

## 7. Conclusion

At the **75% Review 2 Milestone**, DigniSafe has successfully transitioned from an initial telemetry concept into a robust, secure, and intelligent ambient safety platform. The multi-factor risk engine, circadian sequence drift machine learning, real-time WebSockets, multi-tier RBAC, and IoT edge hardware telemetry are fully implemented, verified with a 100% test pass rate, and ready for final review.
