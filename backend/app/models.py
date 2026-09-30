"""
DigniSafe Relational Database Models & Schema Definitions
========================================================

This module defines the relational schema using SQLAlchemy ORM for the SQLite database.
The models represent assisted-living facilities, rooms, resident profiles, ambient telemetry
events, dynamic consent matrices, clinical alert triage state, incidents, human review actions,
IoT edge sensor hardware health, append-only audit trails, and multi-tier RBAC user accounts.

Database Architecture Highlights:
- Privacy-Preserving Guarantee:
  Consent settings explicitly record intrusive surveillance channels (camera, audio, location),
  which are hardcoded to False in the DigniSafe ambient architecture.
- Full Traceability & Auditability:
  All state-changing events, consent updates, and alert triage transitions append records
  to the `audit_logs` table with UTC timestamps.
- Forensic Event Integrity:
  The `events` table captures incoming telemetry with flags for consent blocking (`blocked_by_consent`)
  and delayed store-and-forward edge synchronization (`network_delayed`).
"""

import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from .database import Base


class Facility(Base):
    """
    Represents an assisted living community, care campus, or residential care facility.
    
    Attributes:
        id (str): Primary key identifier (e.g., 'FAC-01').
        name (str): Human-readable community name.
        address (str): Physical street address.
        rooms (relationship): One-to-many relationship with resident rooms.
    """
    __tablename__ = "facilities"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)

    # Cascading relationship: Deleting a facility cascades to its constituent rooms
    rooms = relationship("Room", back_populates="facility", cascade="all, delete-orphan")


class Room(Base):
    """
    Represents an individual resident suite or apartment within a facility.
    
    Attributes:
        id (str): Primary key identifier (e.g., 'ROOM-101').
        facility_id (str): Foreign key referencing facilities.id.
        room_number (str): Suite number (e.g., '101').
        ward (str): Wing or specialized unit (e.g., 'North Wing - Memory Care').
        facility (relationship): Many-to-one relationship with the parent facility.
        residents (relationship): One-to-many relationship with resident occupants.
    """
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, index=True)
    facility_id = Column(String, ForeignKey("facilities.id"), nullable=False)
    room_number = Column(String, nullable=False)
    ward = Column(String, nullable=False)

    facility = relationship("Facility", back_populates="rooms")
    residents = relationship("Resident", back_populates="room")


class Resident(Base):
    """
    Represents an individual resident residing in the assisted living facility.
    
    Attributes:
        id (str): Primary key identifier (e.g., 'R001', 'R002', 'R003').
        name (str): Full legal or preferred name of the resident.
        room_id (str): Foreign key referencing rooms.id.
        independence_level (str): Autonomy classification ('High', 'Moderate', 'Assisted').
            Directly governs the inactivity tolerance threshold in the risk engine.
        expected_activity (str): Baseline physical mobility ('frequent', 'moderate', 'lower').
        alert_sensitivity (str): Sensitivity profile ('lower', 'medium', 'high').
        current_risk_score (int): Real-time composite hazard score [0 - 100].
        current_status (str): Operational triage status:
            'NORMAL' (0-29), 'MONITOR' (30-59), 'REVIEW_REQUIRED' (60-79), 'HIGH_PRIORITY' (80-100).
        anomaly_score (float): Temporal sequence drift metric computed by ML engine [0.0 - 1.0].
        drift_category (str): ML sequence classification ('NORMAL_ROUTINE', 'NOCTURNAL_RESTLESSNESS',
            'WANDERING_RISK', 'ROUTINE_DISRUPTION', 'MILD_DRIFT').
        circadian_drift_detected (bool): True if ML anomaly score exceeds drift threshold (>= 0.40).
        last_ml_assessment (datetime): UTC timestamp of the most recent circadian evaluation.
    """
    __tablename__ = "residents"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=True)
    independence_level = Column(String, nullable=False)
    expected_activity = Column(String, nullable=False)
    alert_sensitivity = Column(String, nullable=False)
    current_risk_score = Column(Integer, default=0)
    current_status = Column(String, default="NORMAL")

    # Machine Learning Circadian Anomaly Fields
    anomaly_score = Column(Float, default=0.0)
    drift_category = Column(String, default="NORMAL_ROUTINE")
    circadian_drift_detected = Column(Boolean, default=False)
    last_ml_assessment = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    room = relationship("Room", back_populates="residents")
    events = relationship("Event", back_populates="resident", cascade="all, delete-orphan")
    consent_settings = relationship("ConsentSetting", back_populates="resident", uselist=False, cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="resident", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="resident", cascade="all, delete-orphan")
    sensor_statuses = relationship("SensorStatus", back_populates="resident", cascade="all, delete-orphan")


class Event(Base):
    """
    Represents an atomic ambient telemetry event ingested from facility sensors or edge gateways.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        resident_id (str): Foreign key referencing residents.id.
        event_type (str): Ambient telemetry type:
            'movement_detected', 'no_movement', 'door_open', 'door_close',
            'emergency_call', 'resident_response', 'staff_check',
            'sensor_missing', 'sensor_noisy'.
        timestamp (datetime): UTC timestamp when the sensor triggered.
        sensor_id (str): Hardware device identifier (e.g., 'MVMT-R001', 'CALL-R003').
        processed (bool): Indicates if the event was fed into the risk engine.
        blocked_by_consent (bool): True if dynamic consent revoked permission for this modality.
        network_delayed (bool): True if buffered locally during offline network disconnection.
    """
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    event_type = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    sensor_id = Column(String, nullable=True)
    processed = Column(Boolean, default=True)
    blocked_by_consent = Column(Boolean, default=False)
    network_delayed = Column(Boolean, default=False)

    resident = relationship("Resident", back_populates="events")


class ConsentSetting(Base):
    """
    Defines resident autonomy and privacy preferences.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        resident_id (str): Foreign key referencing residents.id (unique 1-to-1).
        movement_enabled (bool): Consented to ambient PIR passive motion telemetry.
        door_enabled (bool): Consented to magnetic door entry/exit contact sensors.
        emergency_enabled (bool): Consented to emergency pull-cord/pendant notifications.
        staff_interaction_enabled (bool): Consented to staff RFID check-in badges.
        camera_enabled (bool): Optical video feed (Permanently False in DigniSafe).
        audio_enabled (bool): Acoustic microphone surveillance (Permanently False in DigniSafe).
        location_enabled (bool): Precision continuous GPS tracking (Permanently False in DigniSafe).
        updated_at (datetime): UTC timestamp of the most recent consent toggle.
    """
    __tablename__ = "consent_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), unique=True, nullable=False)
    movement_enabled = Column(Boolean, default=True)
    door_enabled = Column(Boolean, default=True)
    emergency_enabled = Column(Boolean, default=True)
    staff_interaction_enabled = Column(Boolean, default=True)

    # Intrusive channels (Must remain False to preserve dignity)
    camera_enabled = Column(Boolean, default=False)
    audio_enabled = Column(Boolean, default=False)
    location_enabled = Column(Boolean, default=False)

    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    resident = relationship("Resident", back_populates="consent_settings")


class Alert(Base):
    """
    Represents an algorithmic safety alert requiring caregiver or clinical attention.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        resident_id (str): Foreign key referencing residents.id.
        timestamp (datetime): UTC timestamp when the alert threshold was crossed.
        risk_score (int): Composite hazard score computed at alert generation [60 - 100].
        priority (str): Priority classification ('REVIEW REQUIRED' or 'HIGH PRIORITY').
        trigger_events (str): JSON-serialized list of telemetry event types that triggered alert.
        explanation (str): JSON-serialized dictionary of explainable factor weight contributions.
        status (str): Caregiver triage state machine:
            'OPEN', 'UNDER_REVIEW', 'VERIFIED_INCIDENT', 'FALSE_ALARM', 'DISMISSED'.
    """
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    risk_score = Column(Integer, nullable=False)
    priority = Column(String, nullable=False)
    trigger_events = Column(String, nullable=True)
    explanation = Column(String, nullable=True)
    status = Column(String, default="OPEN")

    resident = relationship("Resident", back_populates="alerts")
    human_reviews = relationship("HumanReview", back_populates="alert", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="alert")


class Incident(Base):
    """
    Represents a verified adverse safety event (e.g., fall, acute medical distress).
    Generated only when a clinical caregiver reviews an open alert and confirms it.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        resident_id (str): Foreign key referencing residents.id.
        alert_id (int): Foreign key referencing alerts.id.
        timestamp (datetime): UTC timestamp of verification.
        description (str): Caregiver clinical documentation and observations.
        status (str): Incident lifecycle status ('ACTIVE', 'RESOLVED').
    """
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="ACTIVE")

    resident = relationship("Resident", back_populates="incidents")
    alert = relationship("Alert", back_populates="incidents")


class HumanReview(Base):
    """
    Captures human-in-the-loop review actions taken by care staff on an alert.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        alert_id (int): Foreign key referencing alerts.id.
        action_taken (str): Clinical decision:
            'Call Resident', 'Check Room', 'Verify Incident', 'False Alarm', 'Dismiss'.
        timestamp (datetime): UTC timestamp when action was executed.
        notes (str): Caregiver notes explaining rationale or findings.
    """
    __tablename__ = "human_reviews"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=False)
    action_taken = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    notes = Column(String, nullable=True)

    alert = relationship("Alert", back_populates="human_reviews")


class SensorStatus(Base):
    """
    Tracks operational health, battery levels, and telemetry diagnostics for edge sensors.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        resident_id (str): Foreign key referencing residents.id.
        sensor_id (str): Hardware identifier (e.g., 'MVMT-R001', 'CALL-R003').
        sensor_type (str): Device classification ('movement', 'door', 'emergency', 'staff').
        status (str): Diagnostic state: 'ONLINE', 'NOISY' (debouncing), 'MISSING'.
        battery_level (int): Percentage remaining [0 - 100]. Under 15% triggers alert.
        signal_rssi (int): Wireless signal strength in dBm (e.g., -65 dBm).
        firmware_version (str): Edge firmware version string (e.g., 'v2.4.1').
        last_seen (datetime): UTC timestamp of most recent heartbeat or telemetry packet.
    """
    __tablename__ = "sensor_statuses"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    sensor_id = Column(String, nullable=False)
    sensor_type = Column(String, nullable=False)
    status = Column(String, default="ONLINE")
    battery_level = Column(Integer, default=95)
    signal_rssi = Column(Integer, default=-65)
    firmware_version = Column(String, default="v2.4.1")
    last_seen = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    resident = relationship("Resident", back_populates="sensor_statuses")


class AuditLog(Base):
    """
    Immutable append-only audit trail logging security, consent, and clinical actions.
    
    Attributes:
        id (int): Auto-incrementing primary key.
        action (str): Event code (e.g., 'CONSENT_CHANGED', 'ALERT_GENERATED', 'ALERT_REVIEWED').
        resident_id (str): Associated resident identifier, if applicable.
        timestamp (datetime): UTC timestamp when action occurred.
        details (str): Contextual descriptive payload.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action = Column(String, nullable=False)
    resident_id = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    details = Column(String, nullable=True)


class User(Base):
    """
    User accounts supporting Role-Based Access Control (RBAC).
    
    Attributes:
        id (str): Primary key identifier (e.g., 'usr_caregiver1').
        username (str): Unique username used for Bearer token authentication.
        hashed_password (str): Salted SHA-256 cryptographic password hash.
        full_name (str): Full display name of the staff member or family user.
        role (str): Security role persona:
            - 'CAREGIVER': Safety dashboard, real-time alert triage, review actions.
            - 'CLINICAL_DIRECTOR': Circadian ML longitudinal trends, advisories.
            - 'RESIDENT_FAMILY': Read-only dashboard for assigned resident.
            - 'SYSTEM_ADMIN': Hardware fleet health, gateway diagnostics, DB controls.
        assigned_resident_id (str): Resident identifier for family role scoping.
        created_at (datetime): UTC account creation timestamp.
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    assigned_resident_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
