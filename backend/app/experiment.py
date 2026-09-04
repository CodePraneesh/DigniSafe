import random
import datetime
from typing import List, Dict, Any, Tuple

# Set random seed for reproducibility
RANDOM_SEED = 42

# Defined monitoring channels for intrusiveness metric calculation
# Intrusiveness Score = (number of enabled monitoring channels) / (total possible monitoring channels)
ALL_MONITORING_CHANNELS = [
    "camera",
    "audio",
    "location",
    "movement",
    "door",
    "emergency"
]
TOTAL_POSSIBLE_CHANNELS = len(ALL_MONITORING_CHANNELS)  # 6


def calculate_channel_intrusiveness(channels_dict: Dict[str, bool]) -> float:
    """
    Computes intrusiveness score as:
    enabled monitoring channels / total possible monitoring channels (6)
    """
    enabled = sum(1 for ch in ALL_MONITORING_CHANNELS if channels_dict.get(ch, False))
    return enabled / float(TOTAL_POSSIBLE_CHANNELS)


def generate_synthetic_dataset() -> List[Dict[str, Any]]:
    """
    Generates a synthetic validation dataset containing 500 events
    distributed across R001, R002, R003.
    Includes normal activities, sensor noise, network outages, consent blocks,
    and genuine incidents vs false alarms.
    """
    random.seed(RANDOM_SEED)

    residents = [
        {"id": "R001", "independence": "High"},
        {"id": "R002", "independence": "Moderate"},
        {"id": "R003", "independence": "Assisted"}
    ]

    events = []
    current_time = datetime.datetime(2026, 8, 20, 8, 0, 0)

    last_movement = {r["id"]: current_time for r in residents}
    consent_states = {
        "R001": {"movement": True, "door": True, "emergency": True},
        "R002": {"movement": True, "door": True, "emergency": True},
        "R003": {"movement": True, "door": True, "emergency": True}
    }

    # Generate 500 events
    for i in range(500):
        res = random.choice(residents)
        rid = res["id"]

        # Advance time slightly (between 1 to 20 minutes)
        time_step = random.randint(1, 20)
        current_time += datetime.timedelta(minutes=time_step)

        event_roll = random.random()
        event_type = "movement_detected"
        sensor_id = "MVMT-" + rid
        actual_incident = False
        sensor_status = "ONLINE"

        # Consent state can fluctuate in the dataset (to represent revoked consent settings)
        # e.g., R001 turns off movement consent temporarily between event 100 and 150
        if rid == "R001" and 100 <= i <= 150:
            consent_states["R001"]["movement"] = False
        else:
            consent_states[rid]["movement"] = True

        consent_status = True

        if event_roll < 0.50:
            event_type = "movement_detected"
            sensor_id = "MVMT-" + rid
            last_movement[rid] = current_time
            consent_status = consent_states[rid]["movement"]

        elif event_roll < 0.70:
            event_type = "no_movement"
            sensor_id = "MVMT-" + rid
            consent_status = consent_states[rid]["movement"]
            inactivity = (current_time - last_movement[rid]).total_seconds() / 60.0
            if rid == "R003" and inactivity > 15 and random.random() < 0.60:
                actual_incident = True
            elif rid == "R002" and inactivity > 30 and random.random() < 0.30:
                actual_incident = True
            elif rid == "R001" and inactivity > 60 and random.random() < 0.15:
                actual_incident = True

        elif event_roll < 0.85:
            event_type = random.choice(["door_open", "door_close"])
            sensor_id = "DOOR-" + rid
            consent_status = consent_states[rid]["door"]

        elif event_roll < 0.92:
            if random.random() < 0.70:
                event_type = "emergency_call"
                sensor_id = "CALL-" + rid
                consent_status = consent_states[rid]["emergency"]
                if random.random() < 0.50:
                    actual_incident = True
            else:
                event_type = "resident_response"
                sensor_id = "CALL-" + rid
                consent_status = consent_states[rid]["emergency"]

        elif event_roll < 0.95:
            event_type = "staff_check"
            sensor_id = "STAFF-" + rid
            last_movement[rid] = current_time

        elif event_roll < 0.98:
            event_type = random.choice(["sensor_missing", "sensor_noisy"])
            sensor_id = "MVMT-" + rid
            sensor_status = "MISSING" if event_type == "sensor_missing" else "NOISY"

        else:
            event_type = "network_offline" if random.random() < 0.50 else "network_restored"
            sensor_id = "NET-01"

        # Baseline channel configuration: Traditional telecare forces Movement, Door, Emergency on without consent.
        # Camera, Audio, Location are False.
        baseline_channels = {
            "camera": False,
            "audio": False,
            "location": False,
            "movement": True,
            "door": True,
            "emergency": True
        }

        # DigniSafe channel configuration: Camera, Audio, Location are always False to preserve dignity.
        # Ambient channels respect the resident's active consent configuration at event timestamp.
        dignisafe_channels = {
            "camera": False,
            "audio": False,
            "location": False,
            "movement": bool(consent_states[rid].get("movement", True)),
            "door": bool(consent_states[rid].get("door", True)),
            "emergency": bool(consent_states[rid].get("emergency", True))
        }

        events.append({
            "id": i + 1,
            "resident_id": rid,
            "event_type": event_type,
            "timestamp": current_time,
            "sensor_id": sensor_id,
            "consent_status": consent_status,
            "sensor_status": sensor_status,
            "actual_incident": actual_incident,
            "baseline_channels": baseline_channels,
            "dignisafe_channels": dignisafe_channels
        })

    return events


def run_experiment() -> Tuple[Dict[str, Any], Dict[str, Any], float, float]:
    """
    Runs the Baseline and DigniSafe models over the identical synthetic dataset
    and returns confusion matrix metrics and dynamically computed intrusiveness scores.

    Returns:
        (baseline_metrics, dignisafe_metrics, intrusiveness_baseline, intrusiveness_dignisafe)
    """
    dataset = generate_synthetic_dataset()

    # Calculate dynamic intrusiveness scores from the actual simulated channel configurations
    intrusiveness_baseline_scores = [calculate_channel_intrusiveness(e["baseline_channels"]) for e in dataset]
    intrusiveness_dignisafe_scores = [calculate_channel_intrusiveness(e["dignisafe_channels"]) for e in dataset]

    intrusiveness_baseline = sum(intrusiveness_baseline_scores) / float(len(dataset))
    intrusiveness_dignisafe = sum(intrusiveness_dignisafe_scores) / float(len(dataset))

    # 1. Baseline Model
    # Characteristics of naive baseline:
    # - Fixed 30-minute inactivity threshold for all residents (no profile adaptation)
    # - Immediate alert on any emergency call (no context verification or movement mitigation)
    # - No sensor debouncing: noisy sensor toggling triggers alerts
    # - Missing sensor data treated as prolonged immobility, causing false alarms
    # - Ignores consent settings (always active)
    baseline_tp = 0
    baseline_fp = 0
    baseline_fn = 0
    baseline_tn = 0
    baseline_alerts = 0

    last_mvmt_baseline: Dict[str, datetime.datetime] = {}

    for e in dataset:
        rid = e["resident_id"]
        etype = e["event_type"]
        ts = e["timestamp"]
        is_actual = e["actual_incident"]

        if etype == "movement_detected":
            last_mvmt_baseline[rid] = ts

        baseline_alert = False

        if etype == "emergency_call":
            baseline_alert = True
        elif etype == "no_movement":
            last_ts = last_mvmt_baseline.get(rid)
            if last_ts:
                inactivity_mins = (ts - last_ts).total_seconds() / 60.0
                if inactivity_mins > 30:  # Fixed 30m threshold for all
                    baseline_alert = True
            else:
                baseline_alert = True
        elif etype == "sensor_noisy":
            # Without debouncing, noisy flapping raises a baseline alarm
            baseline_alert = True
        elif etype == "sensor_missing":
            # Missing data misinterpreted as lack of activity
            baseline_alert = True

        if baseline_alert:
            baseline_alerts += 1
            if is_actual:
                baseline_tp += 1
            else:
                baseline_fp += 1
        else:
            if is_actual:
                baseline_fn += 1
            else:
                baseline_tn += 1

    # 2. DigniSafe Model
    # Characteristics:
    # - Dynamic consent enforcement: blocked events discarded from risk evaluation
    # - Profile-adapted thresholds (High: 60m, Moderate: 30m, Assisted: 15m)
    # - Software debouncing: rapid toggling (<10s) filtered and marked NOISY
    # - Missing data raises sensor status warning (+10), not immobility alert (+60)
    # - Contextual combination with mitigating movement
    dignisafe_tp = 0
    dignisafe_fp = 0
    dignisafe_fn = 0
    dignisafe_tn = 0
    dignisafe_alerts = 0

    history: Dict[str, List[Any]] = {"R001": [], "R002": [], "R003": []}

    profiles = {
        "R001": {"id": "R001", "independence_level": "High"},
        "R002": {"id": "R002", "independence_level": "Moderate"},
        "R003": {"id": "R003", "independence_level": "Assisted"}
    }

    class MockResident:
        def __init__(self, id, independence_level):
            self.id = id
            self.independence_level = independence_level

    class MockEvent:
        def __init__(self, resident_id, event_type, timestamp, blocked_by_consent, sensor_id=None):
            self.resident_id = resident_id
            self.event_type = event_type
            self.timestamp = timestamp
            self.blocked_by_consent = blocked_by_consent
            self.sensor_id = sensor_id

    last_event_time: Dict[str, datetime.datetime] = {}
    last_event_type: Dict[str, str] = {}

    from .risk_engine import calculate_risk

    for e in dataset:
        rid = e["resident_id"]
        etype = e["event_type"]
        ts = e["timestamp"]
        consent_ok = e["consent_status"]
        is_actual = e["actual_incident"]

        # Debouncing filter: filter rapid alternating events within 10 seconds
        is_noisy = False
        if rid in last_event_time:
            time_diff = (ts - last_event_time[rid]).total_seconds()
            if time_diff < 10 and etype != last_event_type[rid] and etype in ["movement_detected", "no_movement"]:
                is_noisy = True

        last_event_time[rid] = ts
        last_event_type[rid] = etype

        if is_noisy:
            if is_actual:
                dignisafe_fn += 1
            else:
                dignisafe_tn += 1
            continue

        # Check consent
        blocked = not consent_ok

        mock_e = MockEvent(rid, etype, ts, blocked, e["sensor_id"])
        history[rid].append(mock_e)

        # Run risk engine
        res_mock = MockResident(rid, profiles[rid]["independence_level"])
        score, priority, _, _ = calculate_risk(res_mock, history[rid])

        dignisafe_alert = (score >= 60)  # REVIEW REQUIRED or HIGH PRIORITY

        if dignisafe_alert:
            dignisafe_alerts += 1
            if is_actual:
                dignisafe_tp += 1
            else:
                dignisafe_fp += 1

            # Care staff checks resident upon alert, resolving the active alert
            intervention = MockEvent(rid, "staff_check", ts, False, f"STAFF-{rid}")
            history[rid].append(intervention)
        else:
            if is_actual:
                dignisafe_fn += 1
            else:
                dignisafe_tn += 1

    # Safe metric calculations
    def calc_metrics(tp: int, tn: int, fp: int, fn: int, alerts: int) -> Dict[str, Any]:
        actual_incidents = tp + fn
        precision = tp / float(tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / float(tp + fn) if (tp + fn) > 0 else 0.0
        fpr = fp / float(fp + tn) if (fp + tn) > 0 else 0.0
        missed_rate = fn / float(actual_incidents) if actual_incidents > 0 else 0.0

        return {
            "true_positives": tp,
            "true_negatives": tn,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "false_positive_rate": round(fpr, 4),
            "missed_incident_rate": round(missed_rate, 4),
            "alert_count": alerts
        }

    baseline_metrics = calc_metrics(baseline_tp, baseline_tn, baseline_fp, baseline_fn, baseline_alerts)
    dignisafe_metrics = calc_metrics(dignisafe_tp, dignisafe_tn, dignisafe_fp, dignisafe_fn, dignisafe_alerts)

    return baseline_metrics, dignisafe_metrics, intrusiveness_baseline, intrusiveness_dignisafe
