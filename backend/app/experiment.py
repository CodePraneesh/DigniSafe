import random
import datetime
from typing import List, Dict, Any, Tuple

# Set random seed for reproducibility
RANDOM_SEED = 42

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
    
    # We will generate events sequentially
    # Ground truth: actual_incident is set on specific events that represent true hazards.
    # For example, an emergency call that is genuine, or no movement after a fall.
    
    last_movement = {r["id"]: current_time for r in residents}
    consent_states = {
        "R001": {"movement": True, "door": True, "emergency": True},
        "R002": {"movement": True, "door": True, "emergency": True},
        "R003": {"movement": True, "door": True, "emergency": True}
    }
    
    # Generate 500 events
    for i in range(500):
        # Choose a resident
        res = random.choice(residents)
        rid = res["id"]
        ind = res["independence"]
        
        # Advance time slightly (between 1 to 20 minutes)
        time_step = random.randint(1, 20)
        current_time += datetime.timedelta(minutes=time_step)
        
        # Determine event type based on probability distributions matching independence level
        # R001: high movement, door, no emergency, occasional noise
        # R002: moderate movement, doors, rare emergency
        # R003: lower movement, higher emergency calls
        
        event_roll = random.random()
        event_type = "movement_detected"
        sensor_id = "MVMT-" + rid
        actual_incident = False
        sensor_status = "ONLINE"
        
        # Consent state can fluctuate in the dataset (to represent revoked consent settings)
        # e.g., R001 turns off movement consent for some events
        consent_status = True
        if rid == "R001" and 100 <= i <= 150: # R001 revokes movement consent temporarily
            consent_states["R001"]["movement"] = False
        else:
            consent_states[rid]["movement"] = True
            
        if event_roll < 0.50:
            event_type = "movement_detected"
            sensor_id = "MVMT-" + rid
            last_movement[rid] = current_time
            consent_status = consent_states[rid]["movement"]
            
        elif event_roll < 0.70:
            event_type = "no_movement"
            sensor_id = "MVMT-" + rid
            consent_status = consent_states[rid]["movement"]
            # Is it a genuine incident?
            # E.g. for Assisted resident R003, no_movement after an emergency call is a genuine incident.
            # Or if it's been more than 40 minutes since last movement and roll is high.
            inactivity = (current_time - last_movement[rid]).total_seconds() / 60.0
            if rid == "R003" and inactivity > 15 and random.random() < 0.60:
                actual_incident = True
            elif rid == "R002" and inactivity > 30 and random.random() < 0.30:
                actual_incident = True
            elif rid == "R001" and inactivity > 60 and random.random() < 0.15:
                actual_incident = True
                
        elif event_roll < 0.85:
            # Door events
            event_type = random.choice(["door_open", "door_close"])
            sensor_id = "DOOR-" + rid
            consent_status = consent_states[rid]["door"]
            
        elif event_roll < 0.92:
            # Emergency calls or resident response
            if random.random() < 0.70:
                event_type = "emergency_call"
                sensor_id = "CALL-" + rid
                consent_status = consent_states[rid]["emergency"]
                # 50% chance of being a genuine fall/heart incident
                if random.random() < 0.50:
                    actual_incident = True
            else:
                event_type = "resident_response"
                sensor_id = "CALL-" + rid
                consent_status = consent_states[rid]["emergency"]
                
        elif event_roll < 0.95:
            # Staff check
            event_type = "staff_check"
            sensor_id = "STAFF-" + rid
            
        elif event_roll < 0.98:
            # Failures (sensor missing/noisy)
            event_type = random.choice(["sensor_missing", "sensor_noisy"])
            sensor_id = "MVMT-" + rid
            sensor_status = "MISSING" if event_type == "sensor_missing" else "NOISY"
            
        else:
            # Network outages (offline / online)
            event_type = "network_offline" if random.random() < 0.50 else "network_restored"
            sensor_id = "NET-01"
            
        events.append({
            "id": i + 1,
            "resident_id": rid,
            "event_type": event_type,
            "timestamp": current_time,
            "sensor_id": sensor_id,
            "consent_status": consent_status,
            "sensor_status": sensor_status,
            "actual_incident": actual_incident
        })
        
    return events


def run_experiment() -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Runs the Baseline and DigniSafe models over the synthetic dataset
    and returns metrics for comparison.
    """
    dataset = generate_synthetic_dataset()
    
    # 1. Baseline Model
    # Rules: Fixed 30-minute inactivity threshold.
    # Does not check consent, emergency calls directly, or noise debouncing.
    # Main state: last movement time.
    baseline_tp = 0
    baseline_fp = 0
    baseline_fn = 0
    baseline_tn = 0
    baseline_alerts = 0
    
    last_mvmt_baseline = {}
    
    for e in dataset:
        rid = e["resident_id"]
        etype = e["event_type"]
        ts = e["timestamp"]
        is_actual = e["actual_incident"]
        
        # Track movement
        if etype == "movement_detected":
            last_mvmt_baseline[rid] = ts
            
        baseline_alert = False
        if etype == "no_movement":
            last_ts = last_mvmt_baseline.get(rid)
            if last_ts:
                inactivity_mins = (ts - last_ts).total_seconds() / 60.0
                if inactivity_mins > 30:
                    baseline_alert = True
            else:
                # If no movement yet, and inactivity is high
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
    # Uses resident profile, consent check, noise filtering, event combination, etc.
    dignisafe_tp = 0
    dignisafe_fp = 0
    dignisafe_fn = 0
    dignisafe_tn = 0
    dignisafe_alerts = 0
    
    # We simulate DigniSafe processing sequentially.
    # Keep track of events for each resident to feed into the risk engine.
    history: Dict[str, List[Any]] = {"R001": [], "R002": [], "R003": []}
    
    # Independence config
    profiles = {
        "R001": {"id": "R001", "independence_level": "High"},
        "R002": {"id": "R002", "independence_level": "Moderate"},
        "R003": {"id": "R003", "independence_level": "Assisted"}
    }
    
    # To mock the models.Resident class for the risk engine
    class MockResident:
        def __init__(self, id, independence_level):
            self.id = id
            self.independence_level = independence_level
            
    # Debouncing state (to simulate sensor noise filtering)
    last_event_time = {}
    last_event_type = {}
    
    for e in dataset:
        rid = e["resident_id"]
        etype = e["event_type"]
        ts = e["timestamp"]
        consent_ok = e["consent_status"]
        is_actual = e["actual_incident"]
        
        # Create a mock event object matching SQLAlchemy model interface
        class MockEvent:
            def __init__(self, resident_id, event_type, timestamp, blocked_by_consent, sensor_id=None):
                self.resident_id = resident_id
                self.event_type = event_type
                self.timestamp = timestamp
                self.blocked_by_consent = blocked_by_consent
                self.sensor_id = sensor_id
        
        # Debouncing filter: filter out high-frequency alternating events
        # e.g., toggling between movement/no_movement in less than 1 minute
        is_noisy = False
        if rid in last_event_time:
            time_diff = (ts - last_event_time[rid]).total_seconds()
            if time_diff < 10 and etype != last_event_type[rid]:
                is_noisy = True
                
        last_event_time[rid] = ts
        last_event_type[rid] = etype
        
        if is_noisy:
            # Noisy events are filtered and do not contribute to risk engine
            # We treat this event as not triggering an alert
            if is_actual:
                dignisafe_fn += 1
            else:
                dignisafe_tn += 1
            continue
            
        # Check consent block
        blocked = not consent_ok
        
        # Append mock event to resident's history
        mock_e = MockEvent(rid, etype, ts, blocked, e["sensor_id"])
        history[rid].append(mock_e)
        
        # Run risk engine on history
        # Import the risk engine dynamically or inline its calculation logic
        from .risk_engine import calculate_risk
        
        res_mock = MockResident(rid, profiles[rid]["independence_level"])
        # Calculate risk score
        score, priority, _, _ = calculate_risk(res_mock, history[rid])
        
        dignisafe_alert = (score >= 60) # REVIEW REQUIRED or HIGH PRIORITY
        
        if dignisafe_alert:
            dignisafe_alerts += 1
            if is_actual:
                dignisafe_tp += 1
            else:
                dignisafe_fp += 1
            
            # Simulate caregiver intervention to resolve active alerts
            intervention = MockEvent(rid, "staff_check", ts, False, f"STAFF-{rid}")
            history[rid].append(intervention)
        else:
            if is_actual:
                dignisafe_fn += 1
            else:
                dignisafe_tn += 1
                
    # Calculate performance metrics
    def calc_metrics(tp, tn, fp, fn, alerts) -> Dict[str, Any]:
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        missed = fn
        missed_rate = fn / (tp + fn) if (tp + fn) > 0 else 0.0
        
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
    
    return baseline_metrics, dignisafe_metrics
