from .models import ConsentSetting

EVENT_TO_CONSENT_MAP = {
    "movement_detected": "movement_enabled",
    "no_movement": "movement_enabled",
    "door_open": "door_enabled",
    "door_close": "door_enabled",
    "emergency_call": "emergency_enabled",
    "resident_response": "emergency_enabled",
    "staff_check": "staff_interaction_enabled"
}

def is_event_allowed(event_type: str, consent: ConsentSetting) -> bool:
    """
    Checks if the event is permitted under the current consent settings.
    Failure/network events (e.g. sensor_missing, sensor_noisy, network_offline,
    network_restored) are always processed as they represent system health.
    """
    consent_field = EVENT_TO_CONSENT_MAP.get(event_type)
    if not consent_field:
        # System status events are not blocked by consent
        return True
    
    # Check corresponding attribute on ConsentSetting model
    return getattr(consent, consent_field, False)
