import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Resident, Event, ConsentSetting, Alert, Incident, SensorStatus, AuditLog

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
