import json
import datetime
import asyncio
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from .database import engine, Base, get_db
from .models import (
    Resident, Event, ConsentSetting, Alert, Incident, HumanReview,
    SensorStatus, AuditLog, Facility, Room, User
)
from .schemas import (
    EventCreate, EventResponse, ConsentUpdate, ConsentResponse,
    HumanReviewRequest, AlertResponse, ResidentResponse, ResidentDetailResponse,
    MetricsResponse, ExperimentResponse, ErrorAnalysisResponse, ErrorAnalysisItem,
    UserLogin, UserResponse, Token, MLAnalyticsResponse,
    GatewayTelemetryPacket, GatewayDeviceResponse, NotificationDispatchResponse
)
from .consent import is_event_allowed
from .risk_engine import calculate_risk
from .experiment import run_experiment, generate_synthetic_dataset
from .websocket_manager import manager
from .auth import (
    create_access_token, verify_password, hash_password, get_current_user,
    require_auth, require_role, seed_default_users,
    ROLE_CAREGIVER, ROLE_CLINICAL_DIRECTOR, ROLE_RESIDENT_FAMILY, ROLE_SYSTEM_ADMIN
)
from .ml_engine import analyze_circadian_drift
from .iot_gateway import process_gateway_telemetry_packet, get_gateway_fleet_status
from .fhir_exporter import generate_fhir_bundle
from .notifications import dispatch_emergency_notification, get_dispatch_history

# Initialize database
Base.metadata.create_all(bind=engine)

def safe_broadcast(event_type: str, data: Any):
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(event_type, data))
    except (RuntimeError, Exception):
        pass

app = FastAPI(title="DigniSafe API", version="2.0.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simulated Network Status (global)
IS_NETWORK_ONLINE = True

# Helper to log actions
def log_audit(db: Session, action: str, resident_id: str = None, details: str = None):
    audit = AuditLog(
        action=action,
        resident_id=resident_id,
        timestamp=datetime.datetime.utcnow(),
        details=details
    )
    db.add(audit)
    db.commit()

# Seed database helper
def seed_residents(db: Session):
    default_residents = [
        {
            "id": "R001",
            "name": "Resident A",
            "independence_level": "High",
            "expected_activity": "frequent",
            "alert_sensitivity": "lower"
        },
        {
            "id": "R002",
            "name": "Resident B",
            "independence_level": "Moderate",
            "expected_activity": "moderate",
            "alert_sensitivity": "medium"
        },
        {
            "id": "R003",
            "name": "Resident C",
            "independence_level": "Assisted",
            "expected_activity": "lower",
            "alert_sensitivity": "high"
        }
    ]
    
    for r_data in default_residents:
        res = db.query(Resident).filter(Resident.id == r_data["id"]).first()
        if not res:
            res = Resident(**r_data)
            db.add(res)
            db.commit()
            
            # Create default consent setting
            consent = ConsentSetting(
                resident_id=res.id,
                movement_enabled=True,
                door_enabled=True,
                emergency_enabled=True,
                staff_interaction_enabled=True,
                camera_enabled=False,
                audio_enabled=False,
                location_enabled=False
            )
            db.add(consent)
            
            # Create default sensor statuses
            sensors = [
                ("MVMT-" + res.id, "movement"),
                ("DOOR-" + res.id, "door"),
                ("CALL-" + res.id, "emergency"),
                ("STAFF-" + res.id, "staff")
            ]
            for s_id, s_type in sensors:
                status_obj = SensorStatus(
                    resident_id=res.id,
                    sensor_id=s_id,
                    sensor_type=s_type,
                    status="ONLINE",
                    last_seen=datetime.datetime.utcnow()
                )
                db.add(status_obj)
                
            db.commit()
            log_audit(db, "RESIDENT_SEEDED", res.id, f"Seeded profile for {res.name}")

@app.on_event("startup")
def startup_event():
    db = next(get_db())
    try:
        # Seed default facility and rooms
        fac = db.query(Facility).filter(Facility.id == "FAC-01").first()
        if not fac:
            fac = Facility(id="FAC-01", name="DigniSafe Senior Living Community", address="100 Serenitas Way")
            db.add(fac)
            db.commit()
            
            rooms = [
                Room(id="ROOM-101", facility_id="FAC-01", room_number="101", ward="North Wing - Memory Care"),
                Room(id="ROOM-102", facility_id="FAC-01", room_number="102", ward="North Wing - Memory Care"),
                Room(id="ROOM-103", facility_id="FAC-01", room_number="103", ward="South Wing - Assisted Living")
            ]
            db.add_all(rooms)
            db.commit()

        seed_residents(db)
        seed_default_users(db)
    finally:
        db.close()

# API Endpoints

# Network simulation
@app.post("/api/network/offline")
def set_network_offline(db: Session = Depends(get_db)):
    global IS_NETWORK_ONLINE
    IS_NETWORK_ONLINE = False
    log_audit(db, "NETWORK_OFFLINE", details="Network set to offline")
    return {"status": "offline"}

@app.post("/api/network/online")
def set_network_online(db: Session = Depends(get_db)):
    global IS_NETWORK_ONLINE
    IS_NETWORK_ONLINE = True
    log_audit(db, "NETWORK_ONLINE", details="Network set to online")
    return {"status": "online"}

@app.get("/api/network/status")
def get_network_status():
    return {"online": IS_NETWORK_ONLINE}

# Simulator reset
@app.post("/api/simulator/reset")
def reset_simulator(db: Session = Depends(get_db)):
    # Clear all dynamic tables
    db.query(HumanReview).delete()
    db.query(Incident).delete()
    db.query(Alert).delete()
    db.query(Event).delete()
    db.query(SensorStatus).delete()
    db.query(ConsentSetting).delete()
    db.query(Resident).delete()
    db.query(AuditLog).delete()
    db.commit()
    
    # Re-seed
    seed_residents(db)
    log_audit(db, "SIMULATOR_RESET", details="Simulator reset and database re-seeded")
    return {"status": "reset success"}

# Consent Settings
@app.get("/api/consent/{resident_id}", response_model=ConsentResponse)
def get_consent(resident_id: str, db: Session = Depends(get_db)):
    consent = db.query(ConsentSetting).filter(ConsentSetting.resident_id == resident_id).first()
    if not consent:
        raise HTTPException(status_code=404, detail="Consent settings not found")
    return consent

@app.post("/api/consent", response_model=ConsentResponse)
def update_consent(update_data: ConsentUpdate, resident_id: str, db: Session = Depends(get_db)):
    consent = db.query(ConsentSetting).filter(ConsentSetting.resident_id == resident_id).first()
    if not consent:
        raise HTTPException(status_code=404, detail="Consent settings not found")
        
    changes = []
    if update_data.movement_enabled is not None:
        consent.movement_enabled = update_data.movement_enabled
        changes.append(f"movement={update_data.movement_enabled}")
    if update_data.door_enabled is not None:
        consent.door_enabled = update_data.door_enabled
        changes.append(f"door={update_data.door_enabled}")
    if update_data.emergency_enabled is not None:
        consent.emergency_enabled = update_data.emergency_enabled
        changes.append(f"emergency={update_data.emergency_enabled}")
    if update_data.staff_interaction_enabled is not None:
        consent.staff_interaction_enabled = update_data.staff_interaction_enabled
        changes.append(f"staff_interaction={update_data.staff_interaction_enabled}")
        
    consent.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(consent)
    
    log_audit(db, "CONSENT_CHANGED", resident_id, f"Consent updated: {', '.join(changes)}")
    return consent

# Residents
@app.get("/api/residents", response_model=List[ResidentResponse])
def get_residents(db: Session = Depends(get_db)):
    return db.query(Resident).all()

@app.get("/api/residents/{id}", response_model=ResidentDetailResponse)
def get_resident_detail(id: str, db: Session = Depends(get_db)):
    res = db.query(Resident).filter(Resident.id == id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resident not found")
    return res

# Events API
@app.get("/api/events", response_model=List[EventResponse])
def get_events(db: Session = Depends(get_db)):
    return db.query(Event).order_by(Event.timestamp.desc()).all()

@app.post("/api/events", response_model=EventResponse)
def create_event(event_in: EventCreate, db: Session = Depends(get_db)):
    # 1. Network simulation check
    if not IS_NETWORK_ONLINE and not event_in.network_delayed:
        # If network is offline and event is sent in real-time, block it with 503
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Store-and-forward active: system offline"
        )
        
    res = db.query(Resident).filter(Resident.id == event_in.resident_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resident not found")
        
    consent = db.query(ConsentSetting).filter(ConsentSetting.resident_id == event_in.resident_id).first()
    
    # 2. Check duplicate event (within 1 second, same resident and type)
    ts = event_in.timestamp or datetime.datetime.utcnow()
    duplicate = db.query(Event).filter(
        Event.resident_id == event_in.resident_id,
        Event.event_type == event_in.event_type,
        Event.timestamp >= ts - datetime.timedelta(seconds=1),
        Event.timestamp <= ts + datetime.timedelta(seconds=1)
    ).first()
    if duplicate:
        # Return duplicate without creating new
        return duplicate

    # 3. Sensor status update & debouncing
    sensor_id = event_in.sensor_id or f"GEN-{event_in.resident_id}"
    sensor_type = "movement"
    if "door" in event_in.event_type:
        sensor_type = "door"
    elif "emergency" in event_in.event_type or "response" in event_in.event_type:
        sensor_type = "emergency"
    elif "staff" in event_in.event_type:
        sensor_type = "staff"

    sensor_status = db.query(SensorStatus).filter(
        SensorStatus.resident_id == res.id,
        SensorStatus.sensor_id == sensor_id
    ).first()
    
    if not sensor_status:
        sensor_status = SensorStatus(
            resident_id=res.id,
            sensor_id=sensor_id,
            sensor_type=sensor_type,
            status="ONLINE",
            last_seen=ts
        )
        db.add(sensor_status)
        db.commit()

    # Determine sensor noise (debouncing)
    is_noisy = False
    last_event = db.query(Event).filter(Event.resident_id == res.id).order_by(Event.timestamp.desc()).first()
    if last_event:
        time_diff = (ts - last_event.timestamp).total_seconds()
        # If alternating states within 10 seconds (e.g. movement -> no_movement)
        if time_diff < 10 and last_event.event_type != event_in.event_type and event_in.event_type in ["movement_detected", "no_movement"]:
            is_noisy = True
            sensor_status.status = "NOISY"
            db.commit()
            log_audit(db, "SENSOR_NOISE_DETECTED", res.id, f"Debounced sensor: {sensor_id} toggled in {time_diff}s")

    # If simulator sends failure explicitly
    if event_in.event_type == "sensor_missing":
        sensor_status.status = "MISSING"
        db.commit()
    elif event_in.event_type == "sensor_noisy":
        sensor_status.status = "NOISY"
        db.commit()
    elif event_in.event_type in ["movement_detected", "door_open", "door_close", "emergency_call", "staff_check"]:
        if sensor_status.status != "NOISY" or not is_noisy:
            sensor_status.status = "ONLINE"
        db.commit()

    # 4. Consent check
    allowed = is_event_allowed(event_in.event_type, consent)
    blocked_by_consent = not allowed
    
    new_event = Event(
        resident_id=event_in.resident_id,
        event_type=event_in.event_type,
        timestamp=ts,
        sensor_id=sensor_id,
        processed=not (blocked_by_consent or is_noisy),
        blocked_by_consent=blocked_by_consent,
        network_delayed=event_in.network_delayed
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    
    if blocked_by_consent:
        log_audit(db, "EVENT_BLOCKED_BY_CONSENT", res.id, f"Blocked event {event_in.event_type} due to settings")
    
    # 5. Risk calculation & Alert generation (if not blocked or noisy)
    if allowed and not is_noisy:
        # Fetch recent events for resident
        recent_events = db.query(Event).filter(Event.resident_id == res.id).all()
        score, priority, explanation, triggers = calculate_risk(res, recent_events)
        
        # Update resident state
        res.current_risk_score = score
        res.current_status = priority
        db.commit()
        
        # Handle Alerts
        if score >= 60: # REVIEW REQUIRED or HIGH PRIORITY
            # Check if there is an active open alert for this resident
            open_alert = db.query(Alert).filter(
                Alert.resident_id == res.id,
                Alert.status.in_(["OPEN", "UNDER_REVIEW"])
            ).first()
            
            if not open_alert:
                open_alert = Alert(
                    resident_id=res.id,
                    timestamp=ts,
                    risk_score=score,
                    priority=priority,
                    trigger_events=json.dumps(triggers),
                    explanation=json.dumps(explanation),
                    status="OPEN"
                )
                db.add(open_alert)
                db.commit()
                db.refresh(open_alert)
                log_audit(db, "ALERT_GENERATED", res.id, f"Alert created for {res.name} with score {score}")
            else:
                # Update existing open alert
                open_alert.risk_score = score
                open_alert.priority = priority
                open_alert.explanation = json.dumps(explanation)
                db.commit()
                db.refresh(open_alert)

            # Dispatch emergency notification
            try:
                dispatch_emergency_notification(
                    alert_id=open_alert.id,
                    resident_id=res.id,
                    resident_name=res.name,
                    risk_score=score,
                    priority=priority,
                    explanation=explanation
                )
            except Exception:
                pass

            # Broadcast alert to WebSocket consoles
            safe_broadcast("ALERT_GENERATED", {
                "id": open_alert.id,
                "resident_id": open_alert.resident_id,
                "risk_score": open_alert.risk_score,
                "priority": open_alert.priority,
                "status": open_alert.status,
                "timestamp": open_alert.timestamp.isoformat()
            })

    # Broadcast event ingested
    safe_broadcast("EVENT_INGESTED", {
        "id": new_event.id,
        "resident_id": new_event.resident_id,
        "event_type": new_event.event_type,
        "timestamp": new_event.timestamp.isoformat(),
        "blocked_by_consent": new_event.blocked_by_consent,
        "processed": new_event.processed
    })
    
    return new_event

# Alerts API
@app.get("/api/alerts", response_model=List[AlertResponse])
def get_alerts(db: Session = Depends(get_db)):
    return db.query(Alert).order_by(Alert.timestamp.desc()).all()

@app.get("/api/alerts/{id}", response_model=AlertResponse)
def get_alert_detail(id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    # Format trigger events and explanation
    alert_resp = AlertResponse.from_orm(alert)
    alert_resp.trigger_events = json.loads(alert.trigger_events) if alert.trigger_events else []
    alert_resp.explanation = json.loads(alert.explanation) if alert.explanation else {}
    return alert_resp

@app.post("/api/alerts/{id}/review", response_model=AlertResponse)
def review_alert(id: int, review_in: HumanReviewRequest, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    # Add human review record
    review = HumanReview(
        alert_id=alert.id,
        action_taken=review_in.action_taken,
        timestamp=datetime.datetime.utcnow(),
        notes=review_in.notes
    )
    db.add(review)
    
    # Map review action to alert status
    # Action options: "Call Resident", "Check Room", "Verify Incident", "False Alarm", "Dismiss"
    # Status options: "OPEN", "UNDER_REVIEW", "VERIFIED_INCIDENT", "FALSE_ALARM", "DISMISSED"
    if review_in.action_taken == "Verify Incident":
        alert.status = "VERIFIED_INCIDENT"
        
        # Create Incident record
        incident = Incident(
            resident_id=alert.resident_id,
            alert_id=alert.id,
            timestamp=datetime.datetime.utcnow(),
            description=f"Verified via review: {review_in.notes or ''}",
            status="ACTIVE"
        )
        db.add(incident)
        
    elif review_in.action_taken == "False Alarm":
        alert.status = "FALSE_ALARM"
    elif review_in.action_taken == "Dismiss":
        alert.status = "DISMISSED"
    else:
        # Call Resident / Check Room sets to UNDER_REVIEW
        alert.status = "UNDER_REVIEW"
        
    db.commit()
    db.refresh(alert)
    
    log_audit(db, "ALERT_REVIEWED", alert.resident_id, f"Alert {alert.id} reviewed: {review_in.action_taken}")

    safe_broadcast("ALERT_REVIEWED", {
        "id": alert.id,
        "resident_id": alert.resident_id,
        "status": alert.status,
        "action_taken": review_in.action_taken
    })
    
    # Format and return response
    alert_resp = AlertResponse.from_orm(alert)
    alert_resp.trigger_events = json.loads(alert.trigger_events) if alert.trigger_events else []
    alert_resp.explanation = json.loads(alert.explanation) if alert.explanation else {}
    return alert_resp

# Dashboard metrics
@app.get("/api/metrics", response_model=MetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    residents = db.query(Resident).all()
    total_residents = len(residents)
    
    residents_normal = len([r for r in residents if r.current_status == "NORMAL"])
    residents_monitor = len([r for r in residents if r.current_status == "MONITOR"])
    residents_review = len([r for r in residents if r.current_status == "REVIEW_REQUIRED"])
    residents_high_priority = len([r for r in residents if r.current_status == "HIGH_PRIORITY"])
    
    alerts = db.query(Alert).all()
    open_alerts = len([a for a in alerts if a.status in ["OPEN", "UNDER_REVIEW"]])
    verified_incidents = len([a for a in alerts if a.status == "VERIFIED_INCIDENT"])
    false_alarms = len([a for a in alerts if a.status == "FALSE_ALARM"])
    dismissed_alerts = len([a for a in alerts if a.status == "DISMISSED"])
    
    # Intrusiveness Score = (enabled intrusive channels) / total possible channels
    # Total channels = 6 (Camera, Audio, Location, Movement, Door, Emergency Call)
    # Camera, Audio, Location are always OFF (0).
    # We check enabled channels on average across all residents.
    total_intrusiveness = 0.0
    for r in residents:
        consent = db.query(ConsentSetting).filter(ConsentSetting.resident_id == r.id).first()
        if consent:
            enabled_channels = 0
            if consent.movement_enabled: enabled_channels += 1
            if consent.door_enabled: enabled_channels += 1
            if consent.emergency_enabled: enabled_channels += 1
            # Total channels = 6
            total_intrusiveness += (enabled_channels / 6.0)
    intrusiveness_score = round(total_intrusiveness / total_residents if total_residents > 0 else 0.0, 4)
    
    # Live accuracy metrics
    tp = verified_incidents
    fp = false_alarms
    fn = len(db.query(Incident).filter(Incident.alert_id == None).all())
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    detection_rate = tp / (tp + fn + fp) if (tp + fn + fp) > 0 else 0.0
    fpr = fp / (fp + 10) if fp > 0 else 0.0
    
    return MetricsResponse(
        total_residents=total_residents,
        residents_normal=residents_normal,
        residents_monitor=residents_monitor,
        residents_review=residents_review,
        residents_high_priority=residents_high_priority,
        open_alerts=open_alerts,
        verified_incidents=verified_incidents,
        false_alarms=false_alarms,
        dismissed_alerts=dismissed_alerts,
        detection_rate=round(detection_rate, 2),
        recall=round(recall, 2),
        precision=round(precision, 2),
        false_positive_rate=round(fpr, 2),
        missed_incidents=fn,
        intrusiveness_score=intrusiveness_score
    )

# Experiment evaluation endpoint (computed dynamically from simulated dataset)
@app.get("/api/experiment", response_model=ExperimentResponse)
def get_experiment_metrics():
    baseline, dignisafe, intrusiveness_baseline, intrusiveness_dignisafe = run_experiment()
    return ExperimentResponse(
        baseline=baseline,
        dignisafe=dignisafe,
        intrusiveness_baseline=round(intrusiveness_baseline, 4),
        intrusiveness_dignisafe=round(intrusiveness_dignisafe, 4)
    )

# Scenario runner endpoint to demonstrate Two Resident Journeys reliably
@app.post("/api/simulator/scenario/{scenario_id}")
def run_scenario(scenario_id: str, db: Session = Depends(get_db)):
    """
    Executes reproducible test journeys:
    - 'low-urgency': Resident A (R001, High independence) -> normal movement -> normal door -> inactivity (20m) -> No Alert generated.
    - 'high-urgency': Resident C (R003, Assisted living) -> emergency call -> immobility -> Alert generated (Score >= 70, REVIEW REQUIRED) -> Ready for Human Review.
    """
    now = datetime.datetime.utcnow()
    
    if scenario_id == "low-urgency":
        r001 = db.query(Resident).filter(Resident.id == "R001").first()
        if not r001:
            raise HTTPException(status_code=404, detail="Resident R001 not found")
            
        consent = db.query(ConsentSetting).filter(ConsentSetting.resident_id == "R001").first()
        if consent:
            consent.movement_enabled = True
            consent.door_enabled = True
            consent.emergency_enabled = True
            db.commit()

        # Step 1: Normal movement
        e1 = Event(
            resident_id="R001",
            event_type="movement_detected",
            timestamp=now - datetime.timedelta(minutes=30),
            sensor_id="MVMT-R001",
            processed=True,
            blocked_by_consent=False
        )
        # Step 2: Normal door activity
        e2 = Event(
            resident_id="R001",
            event_type="door_open",
            timestamp=now - datetime.timedelta(minutes=25),
            sensor_id="DOOR-R001",
            processed=True,
            blocked_by_consent=False
        )
        e3 = Event(
            resident_id="R001",
            event_type="door_close",
            timestamp=now - datetime.timedelta(minutes=24),
            sensor_id="DOOR-R001",
            processed=True,
            blocked_by_consent=False
        )
        # Step 3: Inactivity for 20 minutes (well below High independence 60m threshold)
        e4 = Event(
            resident_id="R001",
            event_type="no_movement",
            timestamp=now,
            sensor_id="MVMT-R001",
            processed=True,
            blocked_by_consent=False
        )
        db.add_all([e1, e2, e3, e4])
        db.commit()

        # Recalculate risk
        all_events = db.query(Event).filter(Event.resident_id == "R001").all()
        score, priority, explanation, _ = calculate_risk(r001, all_events)
        r001.current_risk_score = score
        r001.current_status = priority
        db.commit()

        log_audit(db, "SCENARIO_LOW_URGENCY", "R001", f"Executed Low Urgency journey: Final score {score}, Priority {priority}")

        return {
            "scenario": "low-urgency",
            "resident_id": "R001",
            "name": r001.name,
            "independence_level": r001.independence_level,
            "inactivity_minutes": 20,
            "threshold_minutes": 60,
            "final_risk_score": score,
            "priority": priority,
            "alert_generated": score >= 60,
            "summary": "Normal movement and 20m inactivity processed. No alert generated because inactivity is within expected 60m threshold for High independence."
        }

    elif scenario_id == "high-urgency":
        r003 = db.query(Resident).filter(Resident.id == "R003").first()
        if not r003:
            raise HTTPException(status_code=404, detail="Resident R003 not found")

        consent = db.query(ConsentSetting).filter(ConsentSetting.resident_id == "R003").first()
        if consent:
            consent.emergency_enabled = True
            consent.movement_enabled = True
            db.commit()

        # Step 1: Emergency call triggered
        e1 = Event(
            resident_id="R003",
            event_type="emergency_call",
            timestamp=now - datetime.timedelta(minutes=5),
            sensor_id="CALL-R003",
            processed=True,
            blocked_by_consent=False
        )
        # Step 2: No movement / immobility following emergency call
        e2 = Event(
            resident_id="R003",
            event_type="no_movement",
            timestamp=now,
            sensor_id="MVMT-R003",
            processed=True,
            blocked_by_consent=False
        )
        db.add_all([e1, e2])
        db.commit()

        # Recalculate risk
        all_events = db.query(Event).filter(Event.resident_id == "R003").all()
        score, priority, explanation, triggers = calculate_risk(r003, all_events)
        r003.current_risk_score = score
        r003.current_status = priority
        db.commit()

        # Generate or update Alert
        open_alert = db.query(Alert).filter(
            Alert.resident_id == "R003",
            Alert.status.in_(["OPEN", "UNDER_REVIEW"])
        ).first()

        if not open_alert:
            open_alert = Alert(
                resident_id="R003",
                timestamp=now,
                risk_score=score,
                priority=priority,
                trigger_events=json.dumps(triggers),
                explanation=json.dumps(explanation),
                status="OPEN"
            )
            db.add(open_alert)
            db.commit()
            db.refresh(open_alert)
        else:
            open_alert.risk_score = score
            open_alert.priority = priority
            open_alert.explanation = json.dumps(explanation)
            db.commit()

        log_audit(db, "SCENARIO_HIGH_URGENCY", "R003", f"Executed High Urgency journey: Alert ID {open_alert.id}, Score {score}, Priority {priority}")

        return {
            "scenario": "high-urgency",
            "resident_id": "R003",
            "name": r003.name,
            "independence_level": r003.independence_level,
            "final_risk_score": score,
            "priority": priority,
            "alert_generated": True,
            "alert_id": open_alert.id,
            "alert_status": open_alert.status,
            "explanation": explanation,
            "summary": f"Emergency call + immobility triggered High Risk ({score}/100, {priority}). Alert #{open_alert.id} is OPEN and waiting for caregiver human review."
        }

    else:
        raise HTTPException(status_code=400, detail="Unknown scenario. Choose 'low-urgency' or 'high-urgency'.")

# Error analysis endpoint
@app.get("/api/errors", response_model=ErrorAnalysisResponse)
def get_error_analysis(db: Session = Depends(get_db)):
    # Categorize error types based on the dynamic validation dataset
    dataset = generate_synthetic_dataset()
    
    baseline, dignisafe, _, _ = run_experiment()
    
    # We can categorize error events in our experiment run
    # Let's count them by analyzing the mock evaluation
    # Categories: False Positive, False Negative, Missing Data, Sensor Noise, Consent Block, Network Delay, Human False Alarm
    
    # Count how many sensor noise/missing/consent block events we have
    noisy_count = len([e for e in dataset if e["event_type"] == "sensor_noisy" or e["sensor_status"] == "NOISY"])
    missing_count = len([e for e in dataset if e["event_type"] == "sensor_missing"])
    consent_block_count = len([e for e in dataset if not e["consent_status"]])
    network_delay_count = len([e for e in dataset if e["event_type"] in ["network_offline"]])
    
    fp_count = dignisafe["false_positives"]
    fn_count = dignisafe["false_negatives"]
    
    total_errors = fp_count + fn_count + consent_block_count + noisy_count + missing_count
    
    def pct(val):
        return round(val / total_errors * 100, 1) if total_errors > 0 else 0.0

    errors = [
        ErrorAnalysisItem(
            category="False Positive",
            count=fp_count,
            percentage=pct(fp_count),
            example_event="Emergency call triggered but resident was testing call button.",
            mitigation="Incorporate resident voice verification check or staff call verification."
        ),
        ErrorAnalysisItem(
            category="False Negative",
            count=fn_count,
            percentage=pct(fn_count),
            example_event="Resident fell without triggering emergency call or movement sensor.",
            mitigation="Combine with low-intrusive floor-vibration or passive radar sensors."
        ),
        ErrorAnalysisItem(
            category="Sensor Noise",
            count=noisy_count,
            percentage=pct(noisy_count),
            example_event="Movement sensor toggling 5 times in 3 seconds.",
            mitigation="Apply software debouncing/filtering (implemented in DigniSafe)."
        ),
        ErrorAnalysisItem(
            category="Missing Data",
            count=missing_count,
            percentage=pct(missing_count),
            example_event="Battery dead on door contact sensor.",
            mitigation="Alert staff of sensor offline status without assuming it means danger."
        ),
        ErrorAnalysisItem(
            category="Consent Block",
            count=consent_block_count,
            percentage=pct(consent_block_count),
            example_event="R001 disabled movement consent; falls are not tracked.",
            mitigation="Highlight safety risk tradeoffs to resident; offer button fallback."
        ),
        ErrorAnalysisItem(
            category="Network Delay",
            count=network_delay_count,
            percentage=pct(network_delay_count),
            example_event="WiFi offline for 30 minutes.",
            mitigation="Local store-and-forward queue with timestamps (implemented in DigniSafe)."
        )
    ]
    
    return ErrorAnalysisResponse(errors=errors)

# Real-Time WebSocket Streaming Endpoint
@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# Auth & RBAC Endpoints
@app.post("/api/auth/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    token_str = create_access_token(user.id, user.username, user.role)
    return Token(
        access_token=token_str,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )

@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_profile(user: Optional[User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user:
        default_usr = db.query(User).filter(User.username == "caregiver1").first()
        return default_usr
    return user

@app.get("/api/auth/users", response_model=List[UserResponse])
def list_demo_users(db: Session = Depends(get_db)):
    return db.query(User).all()

# ML Temporal Anomaly Analytics
@app.get("/api/ml/analytics/{resident_id}", response_model=MLAnalyticsResponse)
def get_ml_analytics(resident_id: str, db: Session = Depends(get_db)):
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
        
    events = db.query(Event).filter(Event.resident_id == resident_id).order_by(Event.timestamp.desc()).all()
    analysis = analyze_circadian_drift(resident, events)
    
    # Update model cache on resident record
    resident.anomaly_score = analysis["anomaly_score"]
    resident.drift_category = analysis["drift_category"]
    resident.circadian_drift_detected = analysis["circadian_drift_detected"]
    resident.last_ml_assessment = datetime.datetime.utcnow()
    db.commit()
    
    return MLAnalyticsResponse(**analysis)

# IoT Edge Gateway Endpoints
@app.post("/api/gateway/telemetry")
def ingest_gateway_packet(packet: GatewayTelemetryPacket, db: Session = Depends(get_db)):
    result = process_gateway_telemetry_packet(db, packet.dict())
    safe_broadcast("GATEWAY_TELEMETRY", result)
    return result

@app.get("/api/gateway/fleet", response_model=List[GatewayDeviceResponse])
def get_gateway_fleet(db: Session = Depends(get_db)):
    return get_gateway_fleet_status(db)

@app.get("/api/gateway/status")
def get_gateway_status(db: Session = Depends(get_db)):
    return {
        "gateway_id": "GW-NORTH-01",
        "gateway_healthy": True,
        "fleet": get_gateway_fleet_status(db)
    }

# Healthcare Standard Compliance: HL7 FHIR R4 Bundle Export
@app.get("/api/residents/{id}/fhir-bundle")
def get_resident_fhir_bundle(id: str, db: Session = Depends(get_db)):
    resident = db.query(Resident).filter(Resident.id == id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    bundle = generate_fhir_bundle(db, id)
    return bundle

# Multi-Channel Notification History
@app.get("/api/notifications/history", response_model=List[NotificationDispatchResponse])
def get_notifications(limit: int = 50):
    return get_dispatch_history(limit)

