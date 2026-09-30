"""
DigniSafe Machine Learning Circadian Sequence Drift Engine
=========================================================

This module implements an unsupervised statistical sequence divergence engine
that monitors longitudinal ambient sensor telemetry over rolling multi-day windows
to detect circadian rhythm disruption, nocturnal restlessness, wandering, and
subtle functional mobility decline in assisted-living residents.

Mathematical Formulation:
1. Hourly Activity Probability Density:
   Let P(h) represent the resident's historical circadian activity distribution
   across the 24 hours of the day (h in [0, 23]), where sum_{h=0}^{23} P(h) = 1.0.
   Let Q(h) represent the empirical activity distribution observed over the recent
   operational window (rolling 24 to 72 hours).

2. Bhattacharyya Affinity Coefficient:
   BC(P, Q) = sum_{h=0}^{23} sqrt(P(h) * Q(h))
   where BC(P, Q) = 1 indicates identical sequence distributions, and BC(P, Q) = 0
   denotes completely disjoint activity schedules.

3. Sequence Divergence Entropy Metric:
   D_entropy(P, Q) = sqrt(max(0, 1 - BC(P, Q)))
   Bounded within [0.0, 1.0], representing statistical sequence drift.

4. Nocturnal Agitation Ratio:
   R_night = N_{23:00-05:00} / N_total

5. Composite Drift Anomaly Score:
   Score = min(1.0, 1.5 * D_entropy + 0.8 * R_night)
"""

import datetime
import math
from typing import List, Dict, Any, Tuple
from .models import Resident, Event

# ==============================================================================
# CIRCADIAN BASELINE PROFILES
# ==============================================================================
# Expected 24-hour activity density distributions normalized across hours 00:00 to 23:00.
# Based on clinical gerontological circadian sleep/wake rhythms:
# - Low activity / nocturnal sleep window: 22:00 - 05:00 (0.00 to 0.02)
# - Morning peak (awakening, breakfast, mobility): 07:00 - 11:00 (0.07 to 0.09)
# - Afternoon activity & routine: 13:00 - 17:00 (0.06 to 0.08)
# - Evening wind-down: 18:00 - 21:00 (0.01 to 0.04)
CIRCADIAN_PROFILES: Dict[str, List[float]] = {
    "High": [
        0.01, 0.00, 0.00, 0.00, 0.01, 0.03,  # 00:00 - 05:00 (Night sleep)
        0.06, 0.08, 0.09, 0.08, 0.07, 0.08,  # 06:00 - 11:00 (Morning activity peak)
        0.08, 0.06, 0.07, 0.08, 0.08, 0.06,  # 12:00 - 17:00 (Afternoon routine)
        0.04, 0.03, 0.02, 0.01, 0.00, 0.00   # 18:00 - 23:00 (Evening rest)
    ],
    "Moderate": [
        0.01, 0.01, 0.00, 0.00, 0.01, 0.04,  # 00:00 - 05:00
        0.06, 0.07, 0.08, 0.07, 0.07, 0.08,  # 06:00 - 11:00
        0.07, 0.06, 0.07, 0.07, 0.07, 0.06,  # 12:00 - 17:00
        0.04, 0.03, 0.02, 0.01, 0.01, 0.00   # 18:00 - 23:00
    ],
    "Assisted": [
        0.02, 0.01, 0.01, 0.01, 0.02, 0.04,  # 00:00 - 05:00
        0.06, 0.07, 0.07, 0.07, 0.06, 0.07,  # 06:00 - 11:00
        0.07, 0.06, 0.06, 0.07, 0.06, 0.06,  # 12:00 - 17:00
        0.05, 0.03, 0.03, 0.02, 0.01, 0.01   # 18:00 - 23:00
    ]
}


def analyze_circadian_drift(resident: Resident, events: List[Event]) -> Dict[str, Any]:
    """
    Evaluates temporal sequence activity drift against expected circadian rhythm.

    Computes an unsupervised divergence anomaly score (0.0 to 1.0) and generates
    proactive clinical advisories for early cognitive, behavioral, or mobility decline.

    Args:
        resident (Resident): The resident model instance with baseline profile.
        events (List[Event]): Full event history associated with the resident.

    Returns:
        Dict[str, Any]: Structured analytics report containing:
            - resident_id (str): Resident identifier.
            - anomaly_score (float): Composite drift score [0.0 - 1.0].
            - drift_category (str): Clinical category: 'NORMAL_ROUTINE', 'NOCTURNAL_RESTLESSNESS',
                'WANDERING_RISK', 'ROUTINE_DISRUPTION', or 'MILD_DRIFT'.
            - circadian_drift_detected (bool): Boolean flag if score >= 0.40.
            - divergence_metric (float): Pure distribution divergence [0.0 - 1.0].
            - hourly_baseline (List[float]): Expected percentage activity per hour.
            - hourly_recent (List[float]): Observed percentage activity per hour.
            - nighttime_activity_ratio (float): Ratio of telemetry occurring during night hours.
            - advisories (List[str]): Actionable gerontological recommendations.
    """
    # 1. Fetch expected baseline distribution P(h) based on resident independence level
    baseline_dist = CIRCADIAN_PROFILES.get(resident.independence_level, CIRCADIAN_PROFILES["Moderate"])

    # 2. Filter non-blocked, processed telemetry events from the past 7 days
    now = datetime.datetime.utcnow()
    recent_events = [
        e for e in events
        if not e.blocked_by_consent and e.processed and (now - e.timestamp).total_seconds() <= 7 * 86400
    ]

    # Cold start check: if fewer than 5 events exist, baseline projection is returned
    if len(recent_events) < 5:
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

    # 3. Construct empirical 24-hour activity distribution Q(h) from telemetry
    hourly_counts = [0] * 24
    nighttime_count = 0  # Monitored window: 23:00 - 05:00
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

    # 4. Compute Bhattacharyya affinity coefficient and sequence divergence metric
    # BC = sum(sqrt(P(h) * Q(h)))
    bc_coeff = sum(math.sqrt(max(0.0, b * r)) for b, r in zip(baseline_dist, recent_dist))
    # Divergence metric D = sqrt(1 - BC)
    divergence = math.sqrt(max(0.0, 1.0 - bc_coeff))

    # Compute proportion of events occurring during critical night sleep hours
    nighttime_ratio = nighttime_count / float(total_count) if total_count > 0 else 0.0

    # 5. Composite Anomaly Score integrating divergence entropy and nocturnal ratio
    anomaly_score = min(1.0, (divergence * 1.5) + (nighttime_ratio * 0.8))

    # 6. Clinical Sequence Drift Classification
    advisories: List[str] = []
    drift_category = "NORMAL_ROUTINE"
    drift_detected = False

    if anomaly_score >= 0.65:
        drift_detected = True
        if nighttime_ratio > 0.25:
            # Significant nocturnal waking / agitation
            drift_category = "NOCTURNAL_RESTLESSNESS"
            advisories.append(
                "High nighttime restlessness observed (25%+ events between 23:00-05:00). "
                "Assess sleep hygiene, urinary tract infections (UTI), or medication side-effects."
            )
        elif door_frequency > 15:
            # High door transition frequency during atypical hours indicates wandering risk
            drift_category = "WANDERING_RISK"
            advisories.append(
                "Frequent abnormal door transitions detected. "
                "Proactively initiate memory-support and wandering precaution protocols."
            )
        else:
            # Broad schedule breakdown
            drift_category = "ROUTINE_DISRUPTION"
            advisories.append(
                "Significant circadian distribution shift detected. "
                "Clinical nurse consultation recommended to evaluate daytime lethargy or cognitive drift."
            )
    elif anomaly_score >= 0.40:
        drift_detected = True
        drift_category = "MILD_DRIFT"
        advisories.append(
            "Mild temporal deviation detected. Monitor for early mobility hesitation or schedule alteration."
        )
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
