import hmac
import hashlib
import base64
import json
import time
from typing import Optional, List
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

SECRET_KEY = "dignisafe_production_secret_key_change_in_prod"
TOKEN_EXPIRY_SECONDS = 86400 * 7 # 7 days

security = HTTPBearer(auto_error=False)

# Roles
ROLE_CAREGIVER = "CAREGIVER"
ROLE_CLINICAL_DIRECTOR = "CLINICAL_DIRECTOR"
ROLE_RESIDENT_FAMILY = "RESIDENT_FAMILY"
ROLE_SYSTEM_ADMIN = "SYSTEM_ADMIN"

ALL_ROLES = [ROLE_CAREGIVER, ROLE_CLINICAL_DIRECTOR, ROLE_RESIDENT_FAMILY, ROLE_SYSTEM_ADMIN]

def hash_password(password: str, salt: str = "dignisafe_salt") -> str:
    """Deterministic salted SHA-256 hash"""
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed: str, salt: str = "dignisafe_salt") -> bool:
    return hmac.compare_digest(hash_password(plain_password, salt), hashed)

def create_access_token(user_id: str, username: str, role: str) -> str:
    """Creates a signed HMAC-SHA256 token"""
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": int(time.time()) + TOKEN_EXPIRY_SECONDS
    }
    payload_bytes = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).rstrip(b'=')
    sig = hmac.new(SECRET_KEY.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    sig_bytes = base64.urlsafe_b64encode(sig).rstrip(b'=')
    return f"{payload_bytes.decode('utf-8')}.{sig_bytes.decode('utf-8')}"

def decode_access_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_bytes = parts[0].encode("utf-8")
        sig_str = parts[1]
        
        # Pad if needed
        rem = len(payload_bytes) % 4
        if rem > 0:
            payload_bytes += b'=' * (4 - rem)
            
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), parts[0].encode("utf-8"), hashlib.sha256).digest()
        expected_sig_str = base64.urlsafe_b64encode(expected_sig).rstrip(b'=').decode("utf-8")
        
        if not hmac.compare_digest(sig_str, expected_sig_str):
            return None
            
        payload = json.loads(base64.urlsafe_b64decode(payload_bytes).decode("utf-8"))
        if payload.get("exp", 0) < int(time.time()):
            return None # Expired
            
        return payload
    except Exception:
        return None

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    return user

def require_auth(user: Optional[User] = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return user

def require_role(allowed_roles: List[str]):
    def role_checker(user: User = Depends(require_auth)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires role in {allowed_roles}"
            )
        return user
    return role_checker

def seed_default_users(db: Session):
    default_users = [
        {
            "id": "usr_caregiver",
            "username": "caregiver1",
            "password": "password123",
            "full_name": "Nurse Sarah Jenkins, RN",
            "role": ROLE_CAREGIVER,
            "assigned_resident_id": None
        },
        {
            "id": "usr_director",
            "username": "director1",
            "password": "password123",
            "full_name": "Dr. Arthur Vance, Medical Director",
            "role": ROLE_CLINICAL_DIRECTOR,
            "assigned_resident_id": None
        },
        {
            "id": "usr_family",
            "username": "family1",
            "password": "password123",
            "full_name": "Elena Vance (Daughter of Resident A)",
            "role": ROLE_RESIDENT_FAMILY,
            "assigned_resident_id": "R001"
        },
        {
            "id": "usr_admin",
            "username": "admin1",
            "password": "password123",
            "full_name": "System Administrator",
            "role": ROLE_SYSTEM_ADMIN,
            "assigned_resident_id": None
        }
    ]

    for u in default_users:
        existing = db.query(User).filter(User.username == u["username"]).first()
        if not existing:
            user_obj = User(
                id=u["id"],
                username=u["username"],
                hashed_password=hash_password(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                assigned_resident_id=u["assigned_resident_id"]
            )
            db.add(user_obj)
    db.commit()
