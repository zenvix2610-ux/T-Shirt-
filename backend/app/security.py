import hashlib
import hmac
import secrets
import time
from datetime import timedelta

import jwt

from .config import get_settings
from .models import utcnow

_login_fails: dict[str, list[float]] = {}


def hash_password(password: str) -> str:
    settings = get_settings()
    salt = secrets.token_hex(16)
    iterations = settings.hash_iterations
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, digest = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
        return hmac.compare_digest(check, digest)
    except (ValueError, TypeError):
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(user_id: str, role: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": utcnow() + timedelta(hours=12),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ValueError("Invalid session") from exc
    if payload.get("type") != "access":
        raise ValueError("Invalid session")
    return payload


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def refresh_expiry():
    return utcnow() + timedelta(days=14)


def check_login_allowed(email: str) -> None:
    now = time.time()
    recent = [stamp for stamp in _login_fails.get(email, []) if now - stamp < 600]
    _login_fails[email] = recent
    if len(recent) >= 8:
        raise PermissionError("Too many sign-in attempts. Try again in a few minutes.")


def record_login_failure(email: str) -> None:
    _login_fails.setdefault(email, []).append(time.time())


def clear_login_failures(email: str) -> None:
    _login_fails.pop(email, None)


def razorpay_signature(order_id: str, payment_id: str, secret: str) -> str:
    body = f"{order_id}|{payment_id}".encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
