import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from .models import SensorStatus, Resident, AuditLog

def process_gateway_telemetry_packet(
    db: Session,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Parses and processes an incoming raw edge IoT Gateway packet
    (such as from an ESP32 / Zigbee MQTT broker).
    Updates physical device battery health, signal RSSI, and last_seen.
    """
    sensor_id = payload.get("sensor_id")
    resident_id = payload.get("resident_id")
    battery_level = payload.get("battery_level", 95)
    signal_rssi = payload.get("signal_rssi", -65)
    firmware = payload.get("firmware_version", "v2.4.1")
    tamper = payload.get("tamper_detected", False)
    
    sensor = db.query(SensorStatus).filter(
        SensorStatus.sensor_id == sensor_id,
        SensorStatus.resident_id == resident_id
    ).first()
    
    if not sensor:
        sensor = SensorStatus(
            resident_id=resident_id,
            sensor_id=sensor_id,
            sensor_type=payload.get("sensor_type", "movement"),
            status="ONLINE",
            battery_level=battery_level,
            signal_rssi=signal_rssi,
            firmware_version=firmware,
            last_seen=datetime.datetime.utcnow()
        )
        db.add(sensor)
    else:
        sensor.battery_level = battery_level
        sensor.signal_rssi = signal_rssi
        sensor.firmware_version = firmware
        sensor.last_seen = datetime.datetime.utcnow()
        
        # Check battery health
        if battery_level <= 15:
            sensor.status = "LOW_BATTERY"
            audit = AuditLog(
                action="GATEWAY_LOW_BATTERY",
                resident_id=resident_id,
                details=f"Sensor {sensor_id} reported critical battery: {battery_level}%"
            )
            db.add(audit)
        elif tamper:
            sensor.status = "TAMPER_ALERT"
            audit = AuditLog(
                action="GATEWAY_TAMPER_DETECTED",
                resident_id=resident_id,
                details=f"Sensor {sensor_id} tamper switch triggered"
            )
            db.add(audit)
        else:
            if sensor.status in ["LOW_BATTERY", "TAMPER_ALERT", "MISSING"]:
                sensor.status = "ONLINE"
                
    db.commit()
    db.refresh(sensor)
    
    warning_flag = None
    if sensor.status == "LOW_BATTERY":
        warning_flag = "CRITICAL_LOW_BATTERY"
    elif sensor.status == "TAMPER_ALERT":
        warning_flag = "TAMPER_ALERT"

    return {
        "status": "acknowledged",
        "warning": warning_flag,
        "sensor_id": sensor.sensor_id,
        "resident_id": sensor.resident_id,
        "battery_level": sensor.battery_level,
        "signal_rssi": sensor.signal_rssi,
        "device_status": sensor.status,
        "last_seen": sensor.last_seen.isoformat()
    }

def get_gateway_fleet_status(db: Session) -> List[Dict[str, Any]]:
    sensors = db.query(SensorStatus).all()
    fleet = []
    for s in sensors:
        res = db.query(Resident).filter(Resident.id == s.resident_id).first()
        fleet.append({
            "sensor_id": s.sensor_id,
            "sensor_type": s.sensor_type,
            "resident_id": s.resident_id,
            "resident_name": res.name if res else s.resident_id,
            "status": s.status,
            "battery_level": s.battery_level,
            "signal_rssi": s.signal_rssi,
            "firmware_version": s.firmware_version,
            "last_seen": s.last_seen.isoformat()
        })
    return fleet
