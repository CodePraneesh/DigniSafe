import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Resident, Event, ConsentSetting, Alert, Incident, SensorStatus, AuditLog
from app.auth import seed_default_users

# Create a clean SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_dignisafe.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override FastAPI's database dependency to use the test database
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_database():
    # Create tables before each test
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Pre-seed resident profile R003 and R001 for test cases
    r3 = Resident(
        id="R003",
        name="Resident C (Assisted)",
        independence_level="Assisted",
        expected_activity="lower",
        alert_sensitivity="high"
    )
    r1 = Resident(
        id="R001",
        name="Resident A (High)",
        independence_level="High",
        expected_activity="frequent",
        alert_sensitivity="lower"
    )
    db.add_all([r3, r1])
    db.commit()

    # Pre-seed default consent setting
    c3 = ConsentSetting(
        resident_id="R003",
        movement_enabled=True,
        door_enabled=True,
        emergency_enabled=True,
        staff_interaction_enabled=True
    )
    c1 = ConsentSetting(
        resident_id="R001",
        movement_enabled=True,
        door_enabled=True,
        emergency_enabled=True,
        staff_interaction_enabled=True
    )
    db.add_all([c3, c1])
    db.commit()
    seed_default_users(db)
    
    db.close()
    yield
    # Drop tables after each test
    Base.metadata.drop_all(bind=engine)

client = TestClient(app)

def test_emergency_call_generates_high_risk():
    # 1. Simulate emergency call for R003
    response = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })
    assert response.status_code == 200
    
    # 2. Check risk score on resident is high (emergency call = 70 => priority "REVIEW REQUIRED" since it's 60-79)
    res_response = client.get("/api/residents/R003")
    assert res_response.status_code == 200
    res_data = res_response.json()
    assert res_data["current_risk_score"] == 70
    assert res_data["current_status"] == "REVIEW REQUIRED"
    
    # Check that an OPEN alert was generated
    alerts_resp = client.get("/api/alerts")
    assert len(alerts_resp.json()) == 1
    assert alerts_resp.json()[0]["risk_score"] == 70
    assert alerts_resp.json()[0]["priority"] == "REVIEW REQUIRED"


def test_consent_disabled_prevents_processing():
    # 1. Disable movement consent for R003
    consent_resp = client.post("/api/consent?resident_id=R003", json={
        "movement_enabled": False
    })
    assert consent_resp.status_code == 200
    assert consent_resp.json()["movement_enabled"] is False

    # 2. Post a movement event
    event_resp = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "movement_detected",
        "sensor_id": "MVMT-R003"
    })
    assert event_resp.status_code == 200
    event_data = event_resp.json()
    assert event_data["blocked_by_consent"] is True
    assert event_data["processed"] is False

    # 3. Verify risk score did not update (remains 0)
    res_resp = client.get("/api/residents/R003")
    assert res_resp.json()["current_risk_score"] == 0


def test_missing_data_does_not_equal_no_movement():
    # Post missing sensor event
    response = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "sensor_missing",
        "sensor_id": "MVMT-R003"
    })
    assert response.status_code == 200
    
    # Check that sensor status is set to MISSING in database
    res_resp = client.get("/api/residents/R003")
    sensor_statuses = res_resp.json()["sensor_statuses"]
    mvmt_status = [s for s in sensor_statuses if s["sensor_id"] == "MVMT-R003"][0]
    assert mvmt_status["status"] == "MISSING"

    # Check risk score is not automatically a high critical alert (it should only add +10 warning score)
    assert res_resp.json()["current_risk_score"] == 10
    assert res_resp.json()["current_status"] == "NORMAL"


def test_noisy_sensor_events_filtered():
    # Send rapid alternating events (in less than 10 seconds, which happens here with default mock time)
    # The API will detect the toggling speed and mark sensor status as NOISY, and processed = False
    
    # Event 1
    resp1 = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "movement_detected",
        "sensor_id": "MVMT-R003"
    })
    assert resp1.status_code == 200
    
    # Event 2 (immediate toggle)
    resp2 = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "no_movement",
        "sensor_id": "MVMT-R003"
    })
    assert resp2.status_code == 200
    
    # Check that second event is marked noisy or processed=False due to debouncing
    res_resp = client.get("/api/residents/R003")
    sensor_statuses = res_resp.json()["sensor_statuses"]
    mvmt_status = [s for s in sensor_statuses if s["sensor_id"] == "MVMT-R003"][0]
    assert mvmt_status["status"] == "NOISY"


def test_network_offline_queues_and_restores():
    # 1. Put backend network offline
    net_resp = client.post("/api/network/offline")
    assert net_resp.json()["status"] == "offline"

    # 2. Try to post a live event -> should be rejected with 503
    event_resp = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })
    assert event_resp.status_code == 503
    assert "Store-and-forward active" in event_resp.json()["detail"]

    # 3. Put network online
    net_resp2 = client.post("/api/network/online")
    assert net_resp2.json()["status"] == "online"

    # 4. Forward the queued event with network_delayed=True
    event_resp2 = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003",
        "network_delayed": True,
        "timestamp": datetime.datetime.utcnow().isoformat()
    })
    assert event_resp2.status_code == 200
    assert event_resp2.json()["network_delayed"] is True


def test_duplicate_events_rejected():
    # Post first event
    client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })
    
    # Post identical event immediately
    resp = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })
    assert resp.status_code == 200
    
    # Verify only one event is in DB
    events_resp = client.get("/api/events")
    assert len(events_resp.json()) == 1


def test_human_verification_and_metrics():
    # 1. Trigger high priority alert
    client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })
    client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "no_movement",
        "sensor_id": "MVMT-R003"
    })
    
    alerts = client.get("/api/alerts").json()
    assert len(alerts) == 1
    alert_id = alerts[0]["id"]
    
    # 2. Mark alert as VERIFIED_INCIDENT
    review_resp = client.post(f"/api/alerts/{alert_id}/review", json={
        "action_taken": "Verify Incident",
        "notes": "Verified emergency via intercom."
    })
    assert review_resp.status_code == 200
    assert review_resp.json()["status"] == "VERIFIED_INCIDENT"

    # 3. Check metrics report verified incident
    metrics = client.get("/api/metrics").json()
    assert metrics["verified_incidents"] == 1
    assert metrics["open_alerts"] == 0

    # 4. Trigger another alert and review as False Alarm
    # Put alert on R001
    client.post("/api/events", json={
        "resident_id": "R001",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R001"
    })
    client.post("/api/events", json={
        "resident_id": "R001",
        "event_type": "no_movement",
        "sensor_id": "MVMT-R001"
    })
    
    alerts2 = client.get("/api/alerts").json()
    open_alerts = [a for a in alerts2 if a["status"] == "OPEN"]
    assert len(open_alerts) == 1
    alert_id2 = open_alerts[0]["id"]
    
    # Review as False Alarm
    client.post(f"/api/alerts/{alert_id2}/review", json={
        "action_taken": "False Alarm",
        "notes": "Accidental press."
    })
    
    # 5. Check metrics again
    metrics2 = client.get("/api/metrics").json()
    assert metrics2["false_alarms"] == 1
    assert metrics2["precision"] == 0.50 # 1 TP, 1 FP => 50%


def test_baseline_and_dignisafe_experiment_metrics_calculated():
    """
    Verifies that GET /api/experiment calculates all confusion matrix counts
    and performance rates for both baseline and DigniSafe over the 500-event dataset.
    """
    resp = client.get("/api/experiment")
    assert resp.status_code == 200
    data = resp.json()

    baseline = data["baseline"]
    dignisafe = data["dignisafe"]

    # Verify confusion matrix keys
    for model in [baseline, dignisafe]:
        assert "true_positives" in model
        assert "true_negatives" in model
        assert "false_positives" in model
        assert "false_negatives" in model
        assert "precision" in model
        assert "recall" in model
        assert "false_positive_rate" in model
        assert "missed_incident_rate" in model
        assert "alert_count" in model

    # Total evaluated events must equal 500
    total_baseline_events = baseline["true_positives"] + baseline["true_negatives"] + baseline["false_positives"] + baseline["false_negatives"]
    total_dignisafe_events = dignisafe["true_positives"] + dignisafe["true_negatives"] + dignisafe["false_positives"] + dignisafe["false_negatives"]
    assert total_baseline_events == 500
    assert total_dignisafe_events == 500

    # DigniSafe must achieve higher precision and lower false positives than naive baseline
    assert dignisafe["precision"] > baseline["precision"]
    assert dignisafe["false_positives"] < baseline["false_positives"]


def test_intrusiveness_score_calculated_dynamically():
    """
    Verifies that intrusiveness scores are calculated dynamically from monitoring channels,
    not hardcoded, and reflect active consent configurations.
    """
    # 1. Experiment intrusiveness
    exp_resp = client.get("/api/experiment")
    assert exp_resp.status_code == 200
    data = exp_resp.json()

    intrusiveness_baseline = data["intrusiveness_baseline"]
    intrusiveness_dignisafe = data["intrusiveness_dignisafe"]

    # Baseline enables 3 ambient channels (3/6 = 0.50)
    assert 0.0 < intrusiveness_baseline <= 1.0
    assert abs(intrusiveness_baseline - 0.50) < 0.01

    # DigniSafe intrusiveness is calculated from actual consent states and must be <= baseline
    assert 0.0 < intrusiveness_dignisafe <= intrusiveness_baseline

    # 2. Live database metrics intrusiveness calculation
    metrics_resp = client.get("/api/metrics")
    assert metrics_resp.status_code == 200
    live_intrusiveness = metrics_resp.json()["intrusiveness_score"]
    # R001 and R003 both start with 3 channels enabled (movement, door, emergency). (3+3)/(2*6) = 0.50
    assert live_intrusiveness > 0.0

    # Disable door for R001
    client.post("/api/consent?resident_id=R001", json={"door_enabled": False})
    metrics_after = client.get("/api/metrics").json()
    # Intrusiveness score must dynamically drop
    assert metrics_after["intrusiveness_score"] < live_intrusiveness


def test_low_urgency_journey_r001_no_false_alert():
    """
    Tests Journey A (Low Urgency):
    R001 (High independence) exhibits normal movement and door activity,
    followed by 20 minutes of inactivity.
    Because 20m < 60m threshold, no alert is generated and risk score is 0.
    """
    resp = client.post("/api/simulator/scenario/low-urgency")
    assert resp.status_code == 200
    data = resp.json()

    assert data["scenario"] == "low-urgency"
    assert data["resident_id"] == "R001"
    assert data["final_risk_score"] == 0
    assert data["priority"] == "NORMAL"
    assert data["alert_generated"] is False

    # Verify no open alerts for R001
    alerts = client.get("/api/alerts").json()
    r001_alerts = [a for a in alerts if a["resident_id"] == "R001" and a["status"] in ["OPEN", "UNDER_REVIEW"]]
    assert len(r001_alerts) == 0


def test_high_urgency_journey_r003_alert_and_human_review():
    """
    Tests Journey B (High Urgency):
    R003 (Assisted living) triggers an emergency call followed by immobility.
    Risk score escalates to >= 70, raising a REVIEW REQUIRED / HIGH PRIORITY alert.
    Care staff performs human review, verifying the incident.
    """
    resp = client.post("/api/simulator/scenario/high-urgency")
    assert resp.status_code == 200
    data = resp.json()

    assert data["scenario"] == "high-urgency"
    assert data["resident_id"] == "R003"
    assert data["final_risk_score"] >= 70
    assert data["priority"] in ["REVIEW REQUIRED", "HIGH PRIORITY"]
    assert data["alert_generated"] is True
    alert_id = data["alert_id"]

    # Verify alert is in OPEN status
    alert_detail = client.get(f"/api/alerts/{alert_id}").json()
    assert alert_detail["status"] == "OPEN"

    # Human review: Caregiver verifies incident
    review_resp = client.post(f"/api/alerts/{alert_id}/review", json={
        "action_taken": "Verify Incident",
        "notes": "Verified via resident intercom check."
    })
    assert review_resp.status_code == 200
    assert review_resp.json()["status"] == "VERIFIED_INCIDENT"

    # Verify incident record was created in database
    res_detail = client.get("/api/residents/R003").json()
    assert len(res_detail["incidents"]) >= 1


def test_door_and_emergency_consent_backend_enforcement():
    """
    Verifies that revoking door or emergency consent blocks corresponding
    events on the backend and records an audit log.
    """
    # 1. Revoke door consent for R003
    client.post("/api/consent?resident_id=R003", json={"door_enabled": False})

    door_resp = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "door_open",
        "sensor_id": "DOOR-R003"
    })
    assert door_resp.status_code == 200
    assert door_resp.json()["blocked_by_consent"] is True
    assert door_resp.json()["processed"] is False

    # 2. Revoke emergency consent for R003
    client.post("/api/consent?resident_id=R003", json={"emergency_enabled": False})

    emer_resp = client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })
    assert emer_resp.status_code == 200
    assert emer_resp.json()["blocked_by_consent"] is True
    assert emer_resp.json()["processed"] is False


def test_auth_login_and_token_me():
    """
    Verifies user authentication, HMAC token creation, and /api/auth/me resolution.
    """
    # 1. Login as caregiver
    login_resp = client.post("/api/auth/login", json={
        "username": "caregiver1",
        "password": "password123"
    })
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert "access_token" in login_data
    assert login_data["user"]["role"] == "CAREGIVER"
    assert login_data["user"]["username"] == "caregiver1"

    token = login_data["access_token"]

    # 2. Call /api/auth/me with Bearer token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == "caregiver1"
    assert me_resp.json()["role"] == "CAREGIVER"

    # 3. Invalid credentials rejected
    bad_login = client.post("/api/auth/login", json={
        "username": "caregiver1",
        "password": "wrongpassword"
    })
    assert bad_login.status_code == 401


def test_ml_circadian_drift_analytics():
    """
    Verifies the temporal sequence ML engine computes 24-hour baseline distributions,
    anomaly score, divergence metric, and clinical advisories.
    """
    # Inject several events for R001
    client.post("/api/events", json={
        "resident_id": "R001",
        "event_type": "movement_detected",
        "sensor_id": "MVMT-R001"
    })

    resp = client.get("/api/ml/analytics/R001")
    assert resp.status_code == 200
    data = resp.json()

    assert data["resident_id"] == "R001"
    assert "anomaly_score" in data
    assert "drift_category" in data
    assert "divergence_metric" in data
    assert "hourly_baseline" in data
    assert "hourly_recent" in data
    assert len(data["hourly_baseline"]) == 24
    assert len(data["hourly_recent"]) == 24
    assert len(data["advisories"]) > 0


def test_iot_gateway_telemetry_and_fleet_status():
    """
    Verifies IoT edge gateway telemetry ingestion, low battery warning, and fleet query.
    """
    # 1. Post healthy sensor telemetry
    telemetry_resp = client.post("/api/gateway/telemetry", json={
        "gateway_id": "GW-NORTH-01",
        "sensor_id": "MVMT-R001",
        "sensor_type": "passive_infrared",
        "resident_id": "R001",
        "battery_level": 88,
        "signal_rssi": -62,
        "tamper_detected": False
    })
    assert telemetry_resp.status_code == 200
    assert telemetry_resp.json()["status"] == "acknowledged"

    # 2. Post critically low battery packet (< 20%) -> triggers alert
    low_bat_resp = client.post("/api/gateway/telemetry", json={
        "gateway_id": "GW-NORTH-01",
        "sensor_id": "MVMT-R001",
        "sensor_type": "passive_infrared",
        "resident_id": "R001",
        "battery_level": 14,
        "signal_rssi": -70,
        "tamper_detected": False
    })
    assert low_bat_resp.status_code == 200
    assert low_bat_resp.json()["warning"] is not None
    assert "LOW_BATTERY" in low_bat_resp.json()["warning"]

    # 3. Verify fleet status reports updated battery
    fleet_resp = client.get("/api/gateway/status")
    assert fleet_resp.status_code == 200
    fleet_data = fleet_resp.json()
    assert fleet_data["gateway_healthy"] is True
    sensors = [s for s in fleet_data["fleet"] if s["sensor_id"] == "MVMT-R001"]
    assert len(sensors) == 1
    assert sensors[0]["battery_level"] == 14


def test_hl7_fhir_r4_bundle_generation():
    """
    Verifies export of official HL7 FHIR Release 4 Collection Bundle JSON.
    """
    resp = client.get("/api/residents/R001/fhir-bundle")
    assert resp.status_code == 200
    bundle = resp.json()

    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "collection"
    assert "entry" in bundle
    assert len(bundle["entry"]) >= 1

    # First entry must be the Patient resource
    patient_entry = bundle["entry"][0]["resource"]
    assert patient_entry["resourceType"] == "Patient"
    assert patient_entry["id"] == "R001"


def test_emergency_notifications_history():
    """
    Verifies emergency notification routing history retrieval.
    """
    # Trigger emergency event to create an alert and dispatch notifications
    client.post("/api/events", json={
        "resident_id": "R003",
        "event_type": "emergency_call",
        "sensor_id": "CALL-R003"
    })

    notifs_resp = client.get("/api/notifications/history")
    assert notifs_resp.status_code == 200
    notifs = notifs_resp.json()
    assert len(notifs) >= 1
    latest = notifs[0]
    assert "channels" in latest
    assert "delivery_status" in latest
    assert latest["delivery_status"] == "SUCCESS"



