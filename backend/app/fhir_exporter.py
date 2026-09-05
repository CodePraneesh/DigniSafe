import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from .models import Resident, Alert, Incident, HumanReview

def generate_fhir_bundle(db: Session, resident_id: str) -> Dict[str, Any]:
    """
    Exports resident health records, telemetry assessments, and safety triage
    into an official HL7 FHIR (Fast Healthcare Interoperability Resources) R4 Bundle JSON.
    """
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        return {}

    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    
    entries = []

    # 1. FHIR Patient Resource
    patient_resource = {
        "fullUrl": f"urn:uuid:patient-{resident.id}",
        "resource": {
            "resourceType": "Patient",
            "id": resident.id,
            "identifier": [
                {
                    "system": "http://dignisafe.facility.org/residents",
                    "value": resident.id
                }
            ],
            "active": True,
            "name": [
                {
                    "use": "official",
                    "text": resident.name,
                    "family": resident.name.split(" ")[-1] if " " in resident.name else resident.name,
                    "given": [resident.name.split(" ")[0]]
                }
            ],
            "gender": "other",
            "managingOrganization": {
                "display": "DigniSafe Assisted Living Community"
            }
        }
    }
    entries.append(patient_resource)

    # 2. FHIR Observation: Baseline Independence Assessment
    independence_obs = {
        "fullUrl": f"urn:uuid:obs-independence-{resident.id}",
        "resource": {
            "resourceType": "Observation",
            "id": f"obs-independence-{resident.id}",
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "survey",
                            "display": "Survey"
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "80356-9",
                        "display": "Mobility and Self-Care Independence Assessment"
                    }
                ],
                "text": "Independence Level"
            },
            "subject": {"reference": f"urn:uuid:patient-{resident.id}"},
            "effectiveDateTime": now_iso,
            "valueString": resident.independence_level
        }
    }
    entries.append(independence_obs)

    # 3. FHIR Observation: Temporal ML Circadian Drift Score
    ml_obs = {
        "fullUrl": f"urn:uuid:obs-ml-drift-{resident.id}",
        "resource": {
            "resourceType": "Observation",
            "id": f"obs-ml-drift-{resident.id}",
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "activity",
                            "display": "Activity"
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://dignisafe.facility.org/codes",
                        "code": "ML-CIRCADIAN-DRIFT",
                        "display": "Circadian Routine Anomaly Index"
                    }
                ],
                "text": "Circadian Anomaly Score"
            },
            "subject": {"reference": f"urn:uuid:patient-{resident.id}"},
            "effectiveDateTime": now_iso,
            "valueQuantity": {
                "value": resident.anomaly_score,
                "unit": "ratio",
                "system": "http://unitsofmeasure.org",
                "code": "1"
            },
            "interpretation": [
                {
                    "text": resident.drift_category
                }
            ]
        }
    }
    entries.append(ml_obs)

    # 4. FHIR DetectedIssue: Active Safety Alerts
    alerts = db.query(Alert).filter(Alert.resident_id == resident.id).all()
    for alert in alerts:
        issue_resource = {
            "fullUrl": f"urn:uuid:detected-issue-{alert.id}",
            "resource": {
                "resourceType": "DetectedIssue",
                "id": f"alert-{alert.id}",
                "status": "final" if alert.status in ["VERIFIED_INCIDENT", "FALSE_ALARM", "DISMISSED"] else "preliminary",
                "code": {
                    "text": f"Safety Risk Alert ({alert.priority})"
                },
                "severity": "high" if alert.priority == "HIGH PRIORITY" else "moderate",
                "patient": {"reference": f"urn:uuid:patient-{resident.id}"},
                "identifiedDateTime": alert.timestamp.isoformat() + "Z",
                "detail": f"Risk score: {alert.risk_score}/100. Status: {alert.status}."
            }
        }
        entries.append(issue_resource)

    # 5. FHIR Encounter: Verified Incidents
    incidents = db.query(Incident).filter(Incident.resident_id == resident.id).all()
    for inc in incidents:
        encounter_resource = {
            "fullUrl": f"urn:uuid:encounter-incident-{inc.id}",
            "resource": {
                "resourceType": "Encounter",
                "id": f"incident-{inc.id}",
                "status": "finished" if inc.status == "RESOLVED" else "in-progress",
                "class": {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": "EMER",
                    "display": "Emergency Triage Encounter"
                },
                "subject": {"reference": f"urn:uuid:patient-{resident.id}"},
                "period": {
                    "start": inc.timestamp.isoformat() + "Z"
                },
                "reasonCode": [
                    {
                        "text": inc.description or "Assisted Living Emergency Event"
                    }
                ]
            }
        }
        entries.append(encounter_resource)

    # Wrap into FHIR Bundle
    bundle = {
        "resourceType": "Bundle",
        "id": f"dignisafe-bundle-{resident.id}",
        "type": "collection",
        "timestamp": now_iso,
        "total": len(entries),
        "entry": entries
    }

    return bundle
