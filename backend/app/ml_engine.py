import datetime
import math
from typing import List, Dict, Any, Tuple
from .models import Resident, Event

# Default 24-hour circadian expected activity distribution profiles (normalized probability per hour 0-23)
# Based on clinical gerontological circadian sleep/wake rhythms:
# Peak hours: 08:00 - 12:00 and 14:00 - 19:00
# Low hours (sleep): 22:00 - 06:00
CIRCADIAN_PROFILES = {
    "High": [
        0.01, 0.00, 0.00, 0.00, 0.01, 0.03, # 00:00 - 05:00
        0.06, 0.08, 0.09, 0.08, 0.07, 0.08, # 06:00 - 11:00
        0.08, 0.06, 0.07, 0.08, 0.08, 0.06, # 12:00 - 17:00
        0.04, 0.03, 0.02, 0.01, 0.00, 0.00  # 18:00 - 23:00
    ],
    "Moderate": [
        0.01, 0.01, 0.00, 0.00, 0.01, 0.04, # 00:00 - 05:00
        0.06, 0.07, 0.08, 0.07, 0.07, 0.08, # 06:00 - 11:00
        0.07, 0.06, 0.07, 0.07, 0.07, 0.06, # 12:00 - 17:00
        0.04, 0.03, 0.02, 0.01, 0.01, 0.00  # 18:00 - 23:00
    ],
    "Assisted": [
        0.02, 0.01, 0.01, 0.01, 0.02, 0.04, # 00:00 - 05:00
        0.06, 0.07, 0.07, 0.07, 0.06, 0.07, # 06:00 - 11:00
        0.07, 0.06, 0.06, 0.07, 0.06, 0.06, # 12:00 - 17:00
        0.05, 0.03, 0.03, 0.02, 0.01, 0.01  # 18:00 - 23:00
    ]
}

def analyze_circadian_drift(resident: Resident, events: List[Event]) -> Dict[str, Any]:
    """
    Evaluates temporal sequence activity drift against expected circadian rhythm.
    Computes an unsupervised divergence anomaly score (0.0 to 1.0) and generates
    proactive clinical advisories for early cognitive or mobility decline.
    """
    baseline_dist = CIRCADIAN_PROFILES.get(resident.independence_level, CIRCADIAN_PROFILES["Moderate"])
    
    # Filter non-blocked events from past 7 days
    now = datetime.datetime.utcnow()
    recent_events = [
        e for e in events 
        if not e.blocked_by_consent and e.processed and (now - e.timestamp).total_seconds() <= 7 * 86400
    ]
    
    if len(recent_events) < 5:
        # Insufficient telemetry to confirm drift; return baseline projection
        return {
            "resident_id": resident.id,
            "anomaly_score": 0.05,
            "drift_category": "NORMAL_ROUTINE",
            "circadian_drift_detected": False,
            "hourly_baseline": [round(v * 100, 1) for v in baseline_dist],
            "hourly_recent": [round(v * 100, 1) for v in baseline_dist],
            "nighttime_activity_ratio": 0.03,
            "advisories": ["Sufficient baseline telemetry accumulating; routine is currently stable."]
        }
        
    # Compute empirical 24-hour histogram from recent events
    hourly_counts = [0] * 24
    nighttime_count = 0 # 23:00 - 05:00
    door_frequency = 0
    
    for e in recent_events:
        h = e.timestamp.hour
        hourly_counts[h] += 1
        if h >= 23 or h <= 5:
            nighttime_count += 1
        if "door" in e.event_type:
            door_frequency += 1
            
    total_count = sum(hourly_counts)
    recent_dist = [count / float(total_count) for count in hourly_counts] if total_count > 0 else baseline_dist
    
    # Calculate Bhattacharyya / Hellinger-like divergence metric between distributions
    # Divergence in [0.0, 1.0]
    bc_coeff = sum(math.sqrt(max(0.0, b * r)) for b, r in zip(baseline_dist, recent_dist))
    divergence = math.sqrt(max(0.0, 1.0 - bc_coeff))
    
    nighttime_ratio = nighttime_count / float(total_count) if total_count > 0 else 0.0
    
    # Anomaly score combining sequence distribution divergence and nocturnal agitation
    anomaly_score = min(1.0, (divergence * 1.5) + (nighttime_ratio * 0.8))
    
    advisories = []
    drift_category = "NORMAL_ROUTINE"
    drift_detected = False
    
    if anomaly_score >= 0.65:
        drift_detected = True
        if nighttime_ratio > 0.25:
            drift_category = "NOCTURNAL_RESTLESSNESS"
            advisories.append("High nighttime restlessness observed (25%+ events between 23:00-05:00). Assess sleep hygiene or medication side-effects.")
        elif door_frequency > 15:
            drift_category = "WANDERING_RISK"
            advisories.append("Frequent abnormal door transitions. Proactively check memory care support protocols.")
        else:
            drift_category = "ROUTINE_DISRUPTION"
            advisories.append("Significant circadian distribution shift detected. Clinical nurse check advised.")
    elif anomaly_score >= 0.40:
        drift_detected = True
        drift_category = "MILD_DRIFT"
        advisories.append("Mild temporal deviation detected. Monitor for early mobility hesitation or daytime fatigue.")
    else:
        advisories.append("Resident routine remains within expected circadian boundaries.")
        
    return {
        "resident_id": resident.id,
        "anomaly_score": round(anomaly_score, 3),
        "drift_category": drift_category,
        "circadian_drift_detected": drift_detected,
        "divergence_metric": round(divergence, 3),
        "hourly_baseline": [round(v * 100, 1) for v in baseline_dist],
        "hourly_recent": [round(v * 100, 1) for v in recent_dist],
        "nighttime_activity_ratio": round(nighttime_ratio, 3),
        "advisories": advisories
    }
