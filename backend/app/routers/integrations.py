import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..schemas import SheetWebhookIn
from ..services.sheets import apply_sheet_edit

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.post("/sheets/webhook")
def sheet_webhook(
    payload: SheetWebhookIn,
    x_sync_secret: str = Header(default=""),
    db: Session = Depends(get_db),
):
    configured_secret = get_settings().sync_webhook_secret
    if not configured_secret:
        raise HTTPException(status_code=503, detail="Spreadsheet webhook is not configured")
    if not hmac.compare_digest(x_sync_secret, configured_secret):
        raise HTTPException(status_code=401, detail="Invalid synchronization credential")
    try:
        result = apply_sheet_edit(db, payload.sheet, payload.row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if "not found" in result or result.startswith("sheet is"):
        raise HTTPException(status_code=400, detail=result)
    return {"ok": True, "message": result}
