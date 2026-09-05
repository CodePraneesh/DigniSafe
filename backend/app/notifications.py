import datetime
import logging
from typing import Dict, Any, List

logger = logging.getLogger("dignisafe.notifications")

# Simulated notification dispatch history
DISPATCH_HISTORY: List[Dict[str, Any]] = []

def dispatch_emergency_notification(
    alert_id: int,
    resident_id: str,
    resident_name: str,
    risk_score: int,
    priority: str,
    explanation: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Dispatches multi-channel notification (SMS / Pager / Web Push)
    based on the alert priority level.
    """
    now = datetime.datetime.utcnow()
    channels_used = []
    status_msg = "SUCCESS"
    
    if priority == "HIGH PRIORITY":
        channels_used.extend(["SMS_PAGE", "WEB_PUSH", "AUDIBLE_CHIME"])
        recipient = "On-Duty Lead Nurse (+1-555-0199)"
        msg = f"[DIGNISAFE URGENT] High risk ({risk_score}/100) detected for {resident_name} ({resident_id}). Immediate room check required."
    elif priority == "REVIEW REQUIRED":
        channels_used.extend(["WEB_PUSH", "CONSOLE_BANNER"])
        recipient = "Floor Staff Station"
        msg = f"[DIGNISAFE] Review required ({risk_score}/100) for {resident_name} ({resident_id})."
    else:
        channels_used.append("SYSTEM_LOG")
        recipient = "Internal Log"
        msg = f"Routine alert ({risk_score}/100) recorded for {resident_name}."

    dispatch_record = {
        "dispatch_id": len(DISPATCH_HISTORY) + 1,
        "alert_id": alert_id,
        "resident_id": resident_id,
        "recipient": recipient,
        "channels": channels_used,
        "message": msg,
        "timestamp": now.isoformat(),
        "delivery_status": status_msg
    }
    DISPATCH_HISTORY.append(dispatch_record)
    logger.info(f"Notification dispatched: {dispatch_record}")
    
    return dispatch_record

def get_dispatch_history(limit: int = 50) -> List[Dict[str, Any]]:
    return sorted(DISPATCH_HISTORY, key=lambda x: x["timestamp"], reverse=True)[:limit]
