# DigniSafe: Granular Technical Documentation on Unit Testing & Error Boundaries 🛡️

**Document Version:** 2.0.0  
**Project:** DigniSafe — Privacy-Preserving Resident Safety & Intelligent Alert Triage Platform  
**Target Audience:** Technical Evaluators, System Architects, Quality Assurance Engineers, Clinical Reviewers  
**Last Updated:** September 2026  

---

## 1. Executive Summary

In mission-critical assisted living and memory-care environments, software failures carry physical safety risks. A white-screen crash on a caregiver's workstation or a dropped alert during a fall emergency can lead to catastrophic delays in clinical response.

DigniSafe achieves resilience through a dual-layer architectural strategy:
1. **Deterministic Backend Verification:** A comprehensive 17-test automated integration and unit testing suite covering risk evaluation, dynamic privacy consent, hardware debouncing, store-and-forward edge offline queueing, circadian ML drift, IoT telemetry, and HL7 FHIR export.
2. **Hierarchical Frontend Fault Containment:** A multi-tiered React 18 Error Boundary architecture that isolates subsystem failures (such as data visualizer crashes or malformed WebSocket payloads) to individual dashboard cards, preventing application-wide unmounts while preserving continuous resident oversight.

```
+---------------------------------------------------------------------------------------+
|                               DIGNISAFE RESILIENCE TOPOLOGY                           |
+---------------------------------------------------------------------------------------+
                                           |
               +---------------------------+---------------------------+
               |                                                       |
               v                                                       v
+-----------------------------+                         +-----------------------------+
|    BACKEND TESTING SUITE    |                         |   FRONTEND ERROR BOUNDARIES |
|  - 17 Automated Tests (100%)|                         |  - Root Application Boundary|
|  - Isolated SQLite DB Fixture|                        |  - Module Section Boundaries|
|  - Deduplication & Debounce |                         |  - Offline Edge Buffer Queue|
|  - 500-Event Benchmark Grid |                         |  - WebSocket Auto-Reconnect |
|  - HL7 FHIR R4 Bundle Check |                         |  - Inline Diagnostic Traces |
+-----------------------------+                         +-----------------------------+
```

---

## 2. Backend Unit & Integration Testing Architecture

### 2.1 Test Framework & Execution Pipeline

The backend test suite is constructed using **Pytest** and the **FastAPI TestClient** (backed by Starlette and HTTPX). Tests execute against an isolated SQLite test database (`test_dignisafe.db`), ensuring production data remains pristine and each test executes in a clean, reproducible sandbox.

- **Test Suite Location:** [`backend/tests/test_backend.py`](file:///c:/Users/Praneesh/OneDrive/Desktop/DigniSafe/backend/tests/test_backend.py)
- **Target Application:** [`backend/app/main.py`](file:///c:/Users/Praneesh/OneDrive/Desktop/DigniSafe/backend/app/main.py)
- **Current Pass Rate:** **100% (17 passed out of 17 tests)**

### 2.2 Test Fixtures & Database Lifecycle

To avoid test pollution and order-dependent flakiness, DigniSafe employs an automatic session fixture:

```python
@pytest.fixture(autouse=True)
def setup_database():
    # 1. Create clean schema before test execution
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # 2. Pre-seed resident baselines:
    #    - R003: Resident C (Assisted, lower activity, high sensitivity)
    #    - R001: Resident A (High independence, frequent activity, lower sensitivity)
    # 3. Pre-seed default consent settings (all ambient enabled, cameras/mics permanently disabled)
    # 4. Pre-seed RBAC demo personas (Caregiver, Director, Family, Admin)
    ...
    yield
    # 5. Clean teardown: Drop all tables after test completion
    Base.metadata.drop_all(bind=engine)
```

Dependency injection in FastAPI is overridden dynamically:
```python
app.dependency_overrides[get_db] = override_get_db
```

---

### 2.3 Detailed Granular Test Catalog (All 17 Tests)

The following matrix documents each automated test, the targeted architectural subsystem, input conditions, expected assertions, and boundary checks:

| # | Test Function Name | Target Module | Input Conditions & Stimuli | Expected Assertions & Boundary Checks |
|---|:---|:---|:---|:---|
| **1** | `test_emergency_call_generates_high_risk` | `risk_engine.py`, `main.py` | POST `/api/events` with `event_type="emergency_call"`, `sensor_id="CALL-R003"` for resident R003. | • HTTP 200.<br>• Resident risk score jumps to exactly 70.<br>• Status transitions to `REVIEW REQUIRED` (threshold 60-79).<br>• Exactly 1 OPEN alert is generated with `priority="REVIEW REQUIRED"`. |
| **2** | `test_consent_disabled_prevents_processing` | `consent.py`, `main.py` | 1. Disable movement consent for R001 (`movement_enabled=False`).<br>2. Submit `event_type="movement_detected"`. | • Event ingested with `blocked_by_consent=True` and `processed=False`.<br>• Risk score remains strictly 0 (no leakage).<br>• `AuditLog` records `EVENT_BLOCKED_BY_CONSENT`. |
| **3** | `test_missing_data_does_not_equal_no_movement` | `risk_engine.py`, `iot_gateway.py` | Ingest `event_type="sensor_missing"` with `sensor_id="MVMT-R003"`. | • Risk engine adds hardware maintenance penalty (+10), NOT a fall penalty (+60).<br>• `SensorStatus` sets `status="MISSING"`.<br>• Does NOT trigger spurious emergency triage alarm. |
| **4** | `test_noisy_sensor_events_filtered` | `main.py` (Debouncer) | Submit 2 alternating events (`movement_detected` followed by `no_movement`) within 2 seconds (< 10s debouncing threshold). | • Second event is marked `processed=False`.<br>• `SensorStatus` marked as `NOISY`.<br>• `AuditLog` records `SENSOR_NOISE_DETECTED`.<br>• Rapid flapping false alarms suppressed. |
| **5** | `test_network_offline_queues_and_restores` | `main.py` (Store & Forward) | 1. Call POST `/api/network/offline`.<br>2. Submit real-time event. Expect HTTP 503.<br>3. Call POST `/api/network/online`.<br>4. Replay queued event with `network_delayed=True`. | • Offline real-time event rejected with HTTP 503 `Store-and-forward active`.<br>• Online restoration succeeds (HTTP 200).<br>• Delayed replay processed successfully with `network_delayed=True`. |
| **6** | `test_duplicate_events_rejected` | `main.py` (Deduplicator) | Post identical `door_open` event twice with identical timestamp within 1 second. | • Returns the original event record.<br>• Total count in `events` table remains 1 (no duplicate insertion). |
| **7** | `test_human_verification_and_metrics` | `main.py`, `models.py` | 1. Generate alert on R003.<br>2. POST `/api/alerts/{id}/review` with action `"Verify Incident"`.<br>3. Inspect `/api/metrics`. | • Alert status transitions to `VERIFIED_INCIDENT`.<br>• New record created in `incidents` table.<br>• Precision, recall, and TP metrics update dynamically. |
| **8** | `test_baseline_and_dignisafe_experiment_metrics_calculated` | `experiment.py` | Query GET `/api/experiment` executing the 500-event synthetic evaluation grid. | • Returns both `baseline` and `dignisafe` confusion matrices.<br>• DigniSafe false positives significantly lower than naive baseline (FP: 11 vs 67).<br>• Intrusiveness metrics calculated dynamically. |
| **9** | `test_intrusiveness_score_calculated_dynamically` | `main.py`, `experiment.py` | Query GET `/api/metrics` with 3 active ambient channels (movement, door, call) out of 6 total. | • Dynamic Intrusiveness Score evaluates to 0.50 (3 / 6).<br>• Toggling movement consent off for R001 drops score dynamically to 0.4444 (8 / 18). |
| **10** | `test_low_urgency_journey_r001_no_false_alert` | `main.py` (Scenarios) | POST `/api/simulator/scenario/low-urgency` (R001 High independence, normal movement, door open/close, 20m inactivity). | • Final risk score is 0.<br>• Status remains `NORMAL`.<br>• `alert_generated=False` because 20m inactivity is within R001's 60m threshold. |
| **11** | `test_high_urgency_journey_r003_alert_and_human_review` | `main.py` (Scenarios) | POST `/api/simulator/scenario/high-urgency` (R003 Assisted living, emergency call, zero recovery movement). | • Emergency call (70) + compound immobility (25) yields score 95 (`HIGH PRIORITY`).<br>• Alert generated in `OPEN` status.<br>• Review action `"Verify Incident"` creates active Incident record. |
| **12** | `test_door_and_emergency_consent_backend_enforcement` | `consent.py`, `main.py` | Revoke `door_enabled` and `emergency_enabled` on R001. Post corresponding events. | • Both events ingested with `blocked_by_consent=True`.<br>• Both events excluded from risk score calculations.<br>• Zero risk score generated. |
| **13** | `test_auth_login_and_token_me` | `auth.py`, `main.py` | 1. POST `/api/auth/login` with `caregiver1` / `password123`.<br>2. GET `/api/auth/me` with Bearer token header. | • HTTP 200 with Bearer access token.<br>• Token payload verified via HMAC-SHA256 signature.<br>• Role returned is `CAREGIVER`. |
| **14** | `test_ml_circadian_drift_analytics` | `ml_engine.py`, `main.py` | Pre-seed 15 nocturnal sensor transitions for R003 (hours 01:00-04:00). GET `/api/ml/analytics/R003`. | • `circadian_drift_detected=True`.<br>• `drift_category` classified as `NOCTURNAL_RESTLESSNESS`.<br>• Non-empty clinical recommendations list returned. |
| **15** | `test_iot_gateway_telemetry_and_fleet_status` | `iot_gateway.py`, `main.py` | 1. POST `/api/gateway/telemetry` with `battery_level=12%`.<br>2. POST packet with `tamper_detected=True`.<br>3. GET `/api/gateway/fleet`. | • Warning flag `CRITICAL_LOW_BATTERY` returned.<br>• Sensor status set to `LOW_BATTERY`, then `TAMPER_ALERT`.<br>• Fleet diagnostic inventory contains updated device health. |
| **16** | `test_hl7_fhir_r4_bundle_generation` | `fhir_exporter.py`, `main.py` | GET `/api/residents/R003/fhir-bundle`. | • `resourceType="Bundle"`, `type="collection"`.<br>• Contains certified `Patient`, `Observation`, `DetectedIssue`, and `Encounter` entries with LOINC/SNOMED codes. |
| **17** | `test_emergency_notifications_history` | `notifications.py`, `main.py` | Trigger alert on R003. Query GET `/api/notifications/history`. | • Dispatches to SMS, Pager, and Web Push.<br>• History contains dispatched records with recipient addresses and timestamps. |

---

### 2.4 Boundary Values & Edge Case Coverage

```
+------------------------------------------------------------------------------------------+
| Telemetry Ingestion Edge Cases                                                          |
|                                                                                          |
| 1. Sensor Flapping Window (<10.0s)  ──► Rejects jitter, sets status NOISY, logs audit    |
| 2. Packet Deduplication (<=1.0s)    ──► Rejects duplicate timestamp/sensor packet        |
| 3. Network Outage (Offline Mode)    ──► Returns HTTP 503, queues to localStorage         |
| 4. Sync Flush (Delayed Replay)      ──► Ingests with network_delayed=True, recalculates  |
| 5. Missing Telemetry Heartbeat      ──► Flags MISSING (+10 maintenance), NOT fall alarm |
| 6. Consent Revocation Interceptor   ──► Drops event from risk pipeline, appends audit log|
+------------------------------------------------------------------------------------------+
```

---

## 3. Frontend Error Boundaries & Resilience Architecture

### 3.1 Why Error Boundaries are Essential in Clinical Telecare

React 18 components that throw errors during rendering unmount the entire component tree by default. In a senior care console, an unhandled runtime error (e.g. malformed JSON in a WebSocket push or an invalid date in an activity graph) would cause a blank white screen, disabling caregiver alert monitoring for dozens of vulnerable residents.

DigniSafe implements a **hierarchical fault-containment architecture** using custom React Class Error Boundaries:
[`frontend/src/components/ErrorBoundary.tsx`](file:///c:/Users/Praneesh/OneDrive/Desktop/DigniSafe/frontend/src/components/ErrorBoundary.tsx).

---

### 3.2 Error Boundary Implementation Details

The `ErrorBoundary` component implements both React error lifecycle hooks:
1. `static getDerivedStateFromError(error)`: Immediately renders fallback UI upon error detection.
2. `componentDidCatch(error, errorInfo)`: Emits structured error telemetry to console and diagnostic collectors.

```typescript
export class ErrorBoundary extends Component<Props, State> {
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[DigniSafe UI ErrorBoundary] Caught in ${this.props.sectionName}:`, {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });
  }
  ...
}
```

---

### 3.3 Hierarchical Fault-Isolation Topology

DigniSafe deploys error boundaries across two distinct layers:

```
+---------------------------------------------------------------------------------------+
|  [ LAYER 1: Root Application Error Boundary ] (frontend/src/main.tsx)                 |
|  - Encloses entire React tree.                                                        |
|  - Catches unhandled global crashes, fatal routing errors, and theme crashes.          |
|  - Renders full-screen emergency fallback with "Reload Interface" & hard refresh.    |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|  [ LAYER 2: Feature Section Error Boundaries ] (frontend/src/App.tsx)                 |
|  - Encloses the main dashboard viewport (<main>).                                     |
|  - Uses 'isolate={true}' to render compact inline fallback cards.                     |
|  - Protects Recharts SVG charts, real-time alert triage, and IoT telemetry tables.    |
|  - If one module fails, navigation, persona switcher, and live alerts stay ACTIVE.     |
+---------------------------------------------------------------------------------------+
```

#### Feature Boundary Props Configuration:
- `isolate={true}`: Renders an inline rose-tinted alert card rather than a full-screen takeover.
- `sectionName="Module: ML-ANALYTICS"`: Identifies the exact subsystem that encountered difficulty.
- `onReset={() => refetchData()}`: Allows the caregiver to retry rendering without refreshing the browser.
- `toggleDetails()`: Displays the raw JavaScript error name, message, and component call stack for reviewer auditing.

---

### 3.4 Operational Failure Mode Mitigations

| Failure Mode | Failure Impact | DigniSafe Fault Mitigation |
|---|---|---|
| **WebSocket Connection Loss** | Alert push streaming interrupted. | Automatic exponential backoff reconnection (1s, 2s, 4s, 8s max). UI displays amber "WS Reconnecting" badge and falls back to HTTP polling. |
| **Facility Wi-Fi Outage** | Live HTTP requests fail with 503. | Store-and-forward edge buffer captures events into browser `localStorage`. Visual amber indicator displays queued packet count. Auto-flushes upon network recovery. |
| **Recharts Data Anomaly** | Undefined array index crashes SVG canvas. | Caught by Layer 2 Error Boundary. Only the Circadian ML chart displays an inline retry card; the rest of the safety dashboard continues operating. |
| **Malformed FHIR JSON Payload** | Modal render crash. | Trapped in component boundary; displays formatted error with copy button and prevents modal locking. |

---

## 4. Verification & Testing Procedures for Reviewers

### 4.1 Running the Backend Automated Test Suite
From the repository root:
```bash
# Activate virtual environment
.\backend\venv\Scripts\activate

# Run full 17-test verification suite
pytest -v backend\tests\test_backend.py
```

Expected output:
```
====================== 17 passed, 216 warnings in 11.13s ======================
```

### 4.2 Running Backend Code Coverage Analysis
```bash
pytest --cov=app --cov-report=term-missing backend\tests\test_backend.py
```

### 4.3 Verifying Frontend Error Boundary Compilation
```bash
cd frontend
npm run build
```
Expected output:
```
✓ built in ~11s with 0 TypeScript errors.
```

---

## 5. Summary & Review Checklist

- [x] **Granular Backend Test Documentation:** All 17 automated Pytest test cases documented with explicit inputs, assertions, and boundary conditions.
- [x] **React 18 Error Boundaries:** Production-grade `ErrorBoundary` implemented with root application and isolated subsystem containment.
- [x] **Fault Containment:** Visual error cards with diagnostic trace toggles, recovery callbacks, and console telemetry logging.
- [x] **Edge Resilience:** Store-and-forward edge queueing and WebSocket auto-reconnect documented with failure mitigation tables.
