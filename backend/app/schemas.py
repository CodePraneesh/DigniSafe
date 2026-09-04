import json
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict
from datetime import datetime

# Events
class EventCreate(BaseModel):
    resident_id: str
    event_type: str
    sensor_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    network_delayed: Optional[bool] = False

class EventResponse(BaseModel):
    id: int
    resident_id: str
    event_type: str
    timestamp: datetime
    sensor_id: Optional[str] = None
    processed: bool
    blocked_by_consent: bool
    network_delayed: bool

    class Config:
        from_attributes = True

# Consent
class ConsentUpdate(BaseModel):
    movement_enabled: Optional[bool] = None
    door_enabled: Optional[bool] = None
    emergency_enabled: Optional[bool] = None
    staff_interaction_enabled: Optional[bool] = None

class ConsentResponse(BaseModel):
    resident_id: str
    movement_enabled: bool
    door_enabled: bool
    emergency_enabled: bool
    staff_interaction_enabled: bool
    camera_enabled: bool
    audio_enabled: bool
    location_enabled: bool
    updated_at: datetime

    class Config:
        from_attributes = True

# Human Review
class HumanReviewResponse(BaseModel):
    id: int
    alert_id: int
    action_taken: str
    timestamp: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class HumanReviewRequest(BaseModel):
    action_taken: str # "Call Resident", "Check Room", "Verify Incident", "False Alarm", "Dismiss"
    notes: Optional[str] = None

# Alerts
class AlertResponse(BaseModel):
    id: int
    resident_id: str
    timestamp: datetime
    risk_score: int
    priority: str
    trigger_events: Optional[List[str]] = None
    explanation: Optional[Dict[str, int]] = None
    status: str
    human_reviews: List[HumanReviewResponse] = []

    class Config:
        from_attributes = True

    @field_validator('trigger_events', mode='before')
    @classmethod
    def parse_trigger_events(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

    @field_validator('explanation', mode='before')
    @classmethod
    def parse_explanation(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v

# Incident
class IncidentResponse(BaseModel):
    id: int
    resident_id: str
    alert_id: Optional[int] = None
    timestamp: datetime
    description: Optional[str] = None
    status: str

    class Config:
        from_attributes = True

# Sensor Status
class SensorStatusResponse(BaseModel):
    sensor_id: str
    sensor_type: str
    status: str
    last_seen: datetime

    class Config:
        from_attributes = True

# Residents
class ResidentResponse(BaseModel):
    id: str
    name: str
    independence_level: str
    expected_activity: str
    alert_sensitivity: str
    current_risk_score: int
    current_status: str
    consent_settings: Optional[ConsentResponse] = None

    class Config:
        from_attributes = True

class ResidentDetailResponse(ResidentResponse):
    events: List[EventResponse] = []
    alerts: List[AlertResponse] = []
    incidents: List[IncidentResponse] = []
    sensor_statuses: List[SensorStatusResponse] = []

    class Config:
        from_attributes = True

# Audit Logs
class AuditLogResponse(BaseModel):
    id: int
    action: str
    resident_id: Optional[str] = None
    timestamp: datetime
    details: Optional[str] = None

    class Config:
        from_attributes = True

# Metrics
class MetricsResponse(BaseModel):
    total_residents: int
    residents_normal: int
    residents_monitor: int
    residents_review: int
    residents_high_priority: int
    open_alerts: int
    verified_incidents: int
    false_alarms: int
    dismissed_alerts: int
    detection_rate: float
    recall: float
    precision: float
    false_positive_rate: float
    missed_incidents: int
    intrusiveness_score: float

# Error Analysis Item
class ErrorAnalysisItem(BaseModel):
    category: str
    count: int
    percentage: float
    example_event: Optional[str] = None
    mitigation: str

class ErrorAnalysisResponse(BaseModel):
    errors: List[ErrorAnalysisItem]

# Experiment
class ExperimentMetrics(BaseModel):
    true_positives: int
    true_negatives: int
    false_positives: int
    false_negatives: int
    precision: float
    recall: float
    false_positive_rate: float
    missed_incident_rate: float
    alert_count: int

class ExperimentResponse(BaseModel):
    baseline: ExperimentMetrics
    dignisafe: ExperimentMetrics
    intrusiveness_baseline: float
    intrusiveness_dignisafe: float
