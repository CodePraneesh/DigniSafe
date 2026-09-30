"""
DigniSafe Multi-Factor Explainable Risk Engine
=============================================

This module implements the deterministic, explainable risk scoring pipeline that
transforms multi-modal ambient sensor events (PIR motion, magnetic door reed switches,
emergency pull cords, staff RFID check-ins) into a continuous risk score between 0 and 100.

Mathematical Rationale & Design Principles:
1. Explainability:
   Every score generated is accompanied by an additive factor breakdown (explanation dict)
   detailing exactly why points were added or deducted, ensuring full clinical transparency.
2. Dynamic Independence Calibration:
   Inactivity cutoffs adapt to resident baseline autonomy:
   - High independence: 60 minutes tolerated before immobility penalty.
   - Moderate independence: 30 minutes tolerated before immobility penalty.
   - Assisted living: 15 minutes tolerated before immobility penalty.
3. Mitigation Logic:
   Normal movement or staff check-in detected after an emergency trigger mitigates
   the score, dampening spurious alarms while ensuring safety margins.
"""

import datetime
from typing import List, Dict, Tuple, Optional
from .models import Resident, Event

# ==============================================================================
# RISK ENGINE CONFIGURATION & WEIGHTING CONSTANTS
# ==============================================================================

# Additive hazard and mitigation weights assigned to specific telemetry events
DEFAULT_WEIGHTS: Dict[str, int] = {
    # Critical hazard: resident pull-cord or pendant activation
    "emergency_call": 70,
    # Prolonged immobility: lack of PIR motion beyond calibrated threshold
    "no_movement": 25,
    # Perimeter / room departure: door left ajar without immediate re-closure
    "unexpected_door": 15,
    # Hardware diagnostic warning: missing telemetry packet or debounced flapping
    "sensor_failure": 10,
    # Mitigating factors: evidence of resident safety or physical staff intervention
    "resident_response": -20,
    "normal_movement": -10,
    "staff_check": -20,
}

# Resident autonomy profile inactivity thresholds (in minutes)
# Residents with higher independence are afforded wider temporal leeway before alarms trigger
INACTIVITY_THRESHOLDS: Dict[str, int] = {
    "High": 60,       # Independent living: 1 hour without PIR detection allowed
    "Moderate": 30,   # Moderate support: 30 minutes tolerated
    "Assisted": 15,   # Intensive care / high fall risk: 15 minutes cutoff
}


def calculate_risk(
    resident: Resident,
    events: List[Event]
) -> Tuple[int, str, Dict[str, int], List[str]]:
    """
    Computes the composite, explainable risk score (0-100) and clinical priority
    tier for a resident based on their historical and recent telemetry events.

    Args:
        resident (Resident): The resident entity containing independence profile
            and sensitivity configuration.
        events (List[Event]): Sequence of ambient sensor events recorded for the resident.

    Returns:
        Tuple[int, str, Dict[str, int], List[str]]:
            - score (int): Bounded composite hazard score in range [0, 100].
            - priority (str): Clinical triage priority:
                'NORMAL' (0-29), 'MONITOR' (30-59), 'REVIEW REQUIRED' (60-79), 'HIGH PRIORITY' (80-100).
            - explanation (Dict[str, int]): Additive dictionary mapping each contributing
                clinical factor to its exact point weighting.
            - trigger_events (List[str]): List of distinct sensor event types that contributed.
    """
    # Sort events chronologically to reconstruct state trajectory
    sorted_events = sorted(events, key=lambda e: e.timestamp)

    # Privacy Interceptor: strictly exclude telemetry where consent was revoked
    allowed_events = [e for e in sorted_events if not e.blocked_by_consent]

    if not allowed_events:
        return 0, "NORMAL", {}, []

    score: int = 0
    explanation: Dict[str, int] = {}
    trigger_events: List[str] = []

    # State machine tracking registers
    active_emergency: Optional[Event] = None
    active_door_open: Optional[Event] = None
    active_no_movement: Optional[Event] = None
    last_movement_time: Optional[datetime.datetime] = None
    sensor_failures: Dict[str, Event] = {}

    # Chronologically evaluate telemetry transitions
    for e in allowed_events:
        # 1. Emergency Call tracking (cleared by staff check-in or resident response)
        if e.event_type == "emergency_call":
            active_emergency = e
        elif e.event_type in ["resident_response", "staff_check"]:
            active_emergency = None

        # 2. Door state tracking (cleared by door_close or staff check)
        if e.event_type == "door_open":
            active_door_open = e
        elif e.event_type in ["door_close", "staff_check"]:
            active_door_open = None

        # 3. PIR Motion tracking
        if e.event_type == "movement_detected":
            last_movement_time = e.timestamp
            active_no_movement = None
        elif e.event_type == "no_movement":
            active_no_movement = e
        elif e.event_type == "staff_check":
            last_movement_time = e.timestamp
            active_no_movement = None

        # 4. Hardware health diagnostic tracking
        if e.event_type in ["sensor_missing", "sensor_noisy"]:
            sensor_failures[e.sensor_id] = e
        elif e.event_type in [
            "movement_detected", "door_open", "door_close",
            "emergency_call", "resident_response", "staff_check"
        ]:
            # Receipt of valid telemetry clears the active failure flag for that sensor
            if e.sensor_id in sensor_failures:
                del sensor_failures[e.sensor_id]

    # --------------------------------------------------------------------------
    # FACTOR EVALUATION & POINT ACCUMULATION
    # --------------------------------------------------------------------------

    # Factor A: Unresolved Emergency Call
    if active_emergency:
        w = DEFAULT_WEIGHTS["emergency_call"]
        score += w
        explanation["Emergency call active"] = w
        trigger_events.append("emergency_call")

    # Factor B: Immobility / Prolonged Inactivity Duration
    if active_no_movement:
        # Compute exact inactivity duration in minutes
        inactivity_duration: float = 0.0
        if last_movement_time:
            inactivity_duration = (active_no_movement.timestamp - last_movement_time).total_seconds() / 60.0
        else:
            inactivity_duration = (active_no_movement.timestamp - allowed_events[0].timestamp).total_seconds() / 60.0

        # Retrieve resident-specific threshold (fallback to 30 mins)
        threshold = INACTIVITY_THRESHOLDS.get(resident.independence_level, 30)

        if inactivity_duration >= threshold:
            # Exceeded independence threshold: acute fall / immobility risk
            score += 60
            explanation[f"Inactivity ({int(inactivity_duration)} mins) exceeded threshold ({threshold} mins)"] = 60
            trigger_events.append("no_movement")
        else:
            # Below threshold, but evaluated in context of independence level
            if resident.independence_level == "Assisted":
                if active_emergency:
                    # Acute compound risk: emergency button pressed followed by zero recovery movement
                    score += 25
                    explanation["Inactivity following emergency call"] = 25
                    trigger_events.append("no_movement")
                else:
                    score += 10
                    explanation["Recent inactivity (below threshold)"] = 10
                    trigger_events.append("no_movement")

    # Factor C: Perimeter Door Left Open
    if active_door_open:
        w = DEFAULT_WEIGHTS["unexpected_door"]
        score += w
        explanation["Door remains open"] = w
        trigger_events.append("door_open")

    # Factor D: Sensor Hardware Failure Notices (Missing packets, flapping noise)
    if sensor_failures:
        w = DEFAULT_WEIGHTS["sensor_failure"]
        score += w
        explanation["Active sensor status warning / failures"] = w
        for f_event in sensor_failures.values():
            trigger_events.append(f_event.event_type)

    # Factor E: Normal Activity Mitigation
    # If resident triggers an emergency but subsequently exhibits normal movement,
    # apply a mitigation credit to reduce alert fatigue while keeping alert open for review
    if active_emergency and last_movement_time and last_movement_time > active_emergency.timestamp:
        w = DEFAULT_WEIGHTS["normal_movement"]
        score += w
        explanation["Normal activity detected after emergency"] = w

    # Clamp composite score strictly within [0, 100] bounds
    score = max(0, min(100, score))

    # Determine clinical priority tier based on validated clinical boundaries
    if score >= 80:
        priority = "HIGH PRIORITY"
    elif score >= 60:
        priority = "REVIEW REQUIRED"
    elif score >= 30:
        priority = "MONITOR"
    else:
        priority = "NORMAL"

    return score, priority, explanation, trigger_events
