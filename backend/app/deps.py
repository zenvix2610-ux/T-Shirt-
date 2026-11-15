from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_user_from_token(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if creds is None:
        return None
    try:
        payload = decode_access_token(creds.credentials)
    except ValueError:
        return None
    user = db.get(User, payload["sub"])
    if user is None or not user.is_active:
        return None
    return user


def require_user(user: User | None = Depends(get_user_from_token)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user
