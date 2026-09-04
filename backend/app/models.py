import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from .database import Base

class Resident(Base):
    __tablename__ = "residents"

    id = Column(String, primary_key=True, index=True) # e.g. "R001"
    name = Column(String, nullable=False)
    independence_level = Column(String, nullable=False) # "High", "Moderate", "Assisted"
    expected_activity = Column(String, nullable=False) # "frequent", "moderate", "lower"
    alert_sensitivity = Column(String, nullable=False) # "lower", "medium", "high"
    current_risk_score = Column(Integer, default=0)
    current_status = Column(String, default="NORMAL") # "NORMAL", "MONITOR", "REVIEW_REQUIRED", "HIGH_PRIORITY"

    events = relationship("Event", back_populates="resident", cascade="all, delete-orphan")
    consent_settings = relationship("ConsentSetting", back_populates="resident", uselist=False, cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="resident", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="resident", cascade="all, delete-orphan")
    sensor_statuses = relationship("SensorStatus", back_populates="resident", cascade="all, delete-orphan")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    event_type = Column(String, nullable=False) # movement_detected, no_movement, door_open, door_close, emergency_call, etc.
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    sensor_id = Column(String, nullable=True)
    processed = Column(Boolean, default=True)
    blocked_by_consent = Column(Boolean, default=False)
    network_delayed = Column(Boolean, default=False)

    resident = relationship("Resident", back_populates="events")

class ConsentSetting(Base):
    __tablename__ = "consent_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), unique=True, nullable=False)
    movement_enabled = Column(Boolean, default=True)
    door_enabled = Column(Boolean, default=True)
    emergency_enabled = Column(Boolean, default=True)
    staff_interaction_enabled = Column(Boolean, default=True)
    
    # Intrusive channels (Must always remain False in our prototype to preserve dignity)
    camera_enabled = Column(Boolean, default=False)
    audio_enabled = Column(Boolean, default=False)
    location_enabled = Column(Boolean, default=False)
    
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    resident = relationship("Resident", back_populates="consent_settings")

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    risk_score = Column(Integer, nullable=False)
    priority = Column(String, nullable=False) # "NORMAL", "MONITOR", "REVIEW REQUIRED", "HIGH PRIORITY"
    trigger_events = Column(String, nullable=True) # JSON list of triggering events/types
    explanation = Column(String, nullable=True) # JSON dict of explanations (e.g. {"emergency_call": 70})
    status = Column(String, default="OPEN") # "OPEN", "UNDER_REVIEW", "VERIFIED_INCIDENT", "FALSE_ALARM", "DISMISSED"

    resident = relationship("Resident", back_populates="alerts")
    human_reviews = relationship("HumanReview", back_populates="alert", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="alert")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="ACTIVE") # "ACTIVE", "RESOLVED"

    resident = relationship("Resident", back_populates="incidents")
    alert = relationship("Alert", back_populates="incidents")

class HumanReview(Base):
    __tablename__ = "human_reviews"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=False)
    action_taken = Column(String, nullable=False) # "Call Resident", "Check Room", "Verify Incident", "False Alarm", "Dismiss"
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    notes = Column(String, nullable=True)

    alert = relationship("Alert", back_populates="human_reviews")

class SensorStatus(Base):
    __tablename__ = "sensor_statuses"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    resident_id = Column(String, ForeignKey("residents.id"), nullable=False)
    sensor_id = Column(String, nullable=False)
    sensor_type = Column(String, nullable=False) # "movement", "door", "emergency", "staff"
    status = Column(String, default="ONLINE") # "ONLINE", "NOISY", "MISSING"
    last_seen = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    resident = relationship("Resident", back_populates="sensor_statuses")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action = Column(String, nullable=False) # e.g. "CONSENT_CHANGED", "ALERT_STATE_CHANGED"
    resident_id = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    details = Column(String, nullable=True)
