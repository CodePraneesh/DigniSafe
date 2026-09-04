import datetime
from typing import List, Dict, Tuple
from .models import Resident, Event

# Configuration weights
DEFAULT_WEIGHTS = {
    "emergency_call": 70,
    "no_movement": 25,
    "unexpected_door": 15,
    "sensor_failure": 10,
    "resident_response": -20,
    "normal_movement": -10,
    "staff_check": -20
}

# Inactivity thresholds (in minutes) based on independence level
INACTIVITY_THRESHOLDS = {
    "High": 60,
    "Moderate": 30,
    "Assisted": 15
}

def calculate_risk(resident: Resident, events: List[Event]) -> Tuple[int, str, Dict[str, int], List[str]]:
    """
    Calculates the current risk score and status for a resident based on their events.
    Returns:
        (risk_score, priority, explanation_dict, trigger_event_types)
    """
    sorted_events = sorted(events, key=lambda e: e.timestamp)
    
    # Filter out events blocked by consent
    allowed_events = [e for e in sorted_events if not e.blocked_by_consent]
    
    if not allowed_events:
        return 0, "NORMAL", {}, []
        
    score = 0
    explanation = {}
    trigger_events = []
    
    active_emergency = None
    active_door_open = None
    active_no_movement = None
    last_movement_time = None
    sensor_failures = {}

    # Chronologically evaluate state
    for e in allowed_events:
        if e.event_type == "emergency_call":
            active_emergency = e
        elif e.event_type in ["resident_response", "staff_check"]:
            active_emergency = None

        if e.event_type == "door_open":
            active_door_open = e
        elif e.event_type in ["door_close", "staff_check"]:
            active_door_open = None

        if e.event_type == "movement_detected":
            last_movement_time = e.timestamp
            active_no_movement = None
        elif e.event_type == "no_movement":
            active_no_movement = e
        elif e.event_type == "staff_check":
            last_movement_time = e.timestamp
            active_no_movement = None

        if e.event_type in ["sensor_missing", "sensor_noisy"]:
            sensor_failures[e.sensor_id] = e
        elif e.event_type in ["movement_detected", "door_open", "door_close", "emergency_call", "resident_response", "staff_check"]:
            if e.sensor_id in sensor_failures:
                del sensor_failures[e.sensor_id]

    # Calculate active scores
    if active_emergency:
        w = DEFAULT_WEIGHTS["emergency_call"]
        score += w
        explanation["Emergency call active"] = w
        trigger_events.append("emergency_call")

    if active_no_movement:
        # Determine inactivity duration
        inactivity_duration = 0
        if last_movement_time:
            inactivity_duration = (active_no_movement.timestamp - last_movement_time).total_seconds() / 60.0
        else:
            inactivity_duration = (active_no_movement.timestamp - allowed_events[0].timestamp).total_seconds() / 60.0
            
        threshold = INACTIVITY_THRESHOLDS.get(resident.independence_level, 30)
        
        if inactivity_duration >= threshold:
            # Exceeded threshold: critical warning
            score += 60
            explanation[f"Inactivity ({int(inactivity_duration)} mins) exceeded threshold ({threshold} mins)"] = 60
            trigger_events.append("no_movement")
        else:
            # Below threshold
            if resident.independence_level == "Assisted":
                if active_emergency:
                    # Emergency plus inactivity combination
                    score += 25
                    explanation["Inactivity following emergency call"] = 25
                    trigger_events.append("no_movement")
                else:
                    score += 10
                    explanation["Recent inactivity (below threshold)"] = 10
                    trigger_events.append("no_movement")

    if active_door_open:
        w = DEFAULT_WEIGHTS["unexpected_door"]
        score += w
        explanation["Door remains open"] = w
        trigger_events.append("door_open")

    if sensor_failures:
        w = DEFAULT_WEIGHTS["sensor_failure"]
        score += w
        explanation["Active sensor status warning / failures"] = w
        for f_event in sensor_failures.values():
            trigger_events.append(f_event.event_type)

    # Normal movement mitigation (reduction if moving after an emergency call)
    if active_emergency and last_movement_time and last_movement_time > active_emergency.timestamp:
        w = DEFAULT_WEIGHTS["normal_movement"]
        score += w
        explanation["Normal activity detected after emergency"] = w

    # Clamp score
    score = max(0, min(100, score))

    # Evaluate priority
    if score >= 80:
        priority = "HIGH PRIORITY"
    elif score >= 60:
        priority = "REVIEW REQUIRED"
    elif score >= 30:
        priority = "MONITOR"
    else:
        priority = "NORMAL"

    return score, priority, explanation, trigger_events
