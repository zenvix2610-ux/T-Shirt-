import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_user
from ..models import EmailOutbox, RefreshToken, User, utcnow
from ..schemas import ForgotIn, LoginIn, RegisterIn, ResetIn
from ..security import (
    check_login_allowed,
    clear_login_failures,
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    record_login_failure,
    refresh_expiry,
    verify_password,
)
from ..services.sheets import sync_user
from ..config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
    }


def issue_tokens(db: Session, user: User) -> dict:
    raw = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token(raw), expires_at=refresh_expiry()))
    db.commit()
    return {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": raw,
        "token_type": "bearer",
        "user": public_user(user),
    }


@router.post("/register")
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = User(
        name=payload.name.strip(),
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role="customer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    sync_user(db, user)
    return issue_tokens(db, user)


def authenticate(payload: LoginIn, db: Session, required_role: str | None = None) -> User:
    try:
        check_login_allowed(payload.email)
    except PermissionError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        record_login_failure(payload.email)
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is disabled")
    if required_role and user.role != required_role:
        raise HTTPException(status_code=403, detail="Admin access only")
    clear_login_failures(payload.email)
    return user


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = authenticate(payload, db)
    return issue_tokens(db, user)


@router.post("/admin/login")
def admin_login(payload: LoginIn, db: Session = Depends(get_db)):
    user = authenticate(payload, db, required_role="admin")
    return issue_tokens(db, user)


@router.post("/refresh")
def refresh(body: dict, db: Session = Depends(get_db)):
    raw = str(body.get("refresh_token") or "")
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(raw), RefreshToken.revoked.is_(False)).first()
    if row is None or row.expires_at < utcnow():
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")
    row.revoked = True
    db.commit()
    return issue_tokens(db, user)


@router.post("/logout")
def logout(body: dict, db: Session = Depends(get_db)):
    raw = str(body.get("refresh_token") or "")
    if raw:
        row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(raw)).first()
        if row:
            row.revoked = True
            db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(require_user)):
    return public_user(user)


@router.post("/forgot-password")
def forgot(payload: ForgotIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    reveal = None
    if user and user.role == "customer":
        token = secrets.token_urlsafe(32)
        user.reset_token_hash = hash_token(token)
        user.reset_expires = utcnow() + timedelta(minutes=30)
        db.add(
            EmailOutbox(
                to_email=user.email,
                subject="Reset your தமிழ் Drifts password",
                body=f"Use this token within 30 minutes: {token}",
            )
        )
        db.commit()
        if get_settings().is_dev:
            reveal = token
    response = {"message": "If that email belongs to a customer account, a reset token has been created."}
    if reveal:
        response["reset_token"] = reveal
    return response


@router.post("/reset-password")
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token_hash == hash_token(payload.token), User.role == "customer").first()
    if user is None or user.reset_expires is None or user.reset_expires < utcnow():
        raise HTTPException(status_code=400, detail="This reset link is invalid or expired")
    user.password_hash = hash_password(payload.password)
    user.reset_token_hash = None
    user.reset_expires = None
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    db.commit()
    return {"ok": True}
