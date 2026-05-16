"""SMTP-Konfiguration und Notification-Präferenzen."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import SmtpSettings, NotificationPreference, User
from app.schemas import SmtpSettingsBase, SmtpSettingsRead, NotificationPrefBase, NotificationPrefRead
from app.services.mail_service import test_smtp

router = APIRouter(prefix="/api", tags=["notifications"])


# ============ SMTP ============

def _get_or_create_smtp(db: Session) -> SmtpSettings:
    s = db.query(SmtpSettings).first()
    if not s:
        s = SmtpSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/smtp", response_model=SmtpSettingsRead)
def get_smtp(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = _get_or_create_smtp(db)
    # Passwort beim Lesen nicht zurückgeben
    s.password = "" if s.password else ""
    return s


@router.put("/smtp", response_model=SmtpSettingsRead)
def update_smtp(
    data: SmtpSettingsBase,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    s = _get_or_create_smtp(db)
    update_data = data.model_dump(exclude_unset=True)
    # Passwort nur ersetzen, wenn explizit gesetzt
    if not update_data.get("password"):
        update_data.pop("password", None)
    for k, v in update_data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


class TestMailBody(BaseModel):
    to: str


@router.post("/smtp/test")
def test_smtp_endpoint(
    body: TestMailBody,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ok, err = test_smtp(db, body.to)
    if not ok:
        raise HTTPException(503, err or "Versand fehlgeschlagen")
    return {"success": True, "sent_to": body.to}


# ============ Notification-Präferenzen ============

@router.get("/notifications/me", response_model=NotificationPrefRead)
def get_my_prefs(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    p = db.query(NotificationPreference).filter(NotificationPreference.user_id == current.id).first()
    if not p:
        p = NotificationPreference(user_id=current.id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


@router.put("/notifications/me", response_model=NotificationPrefRead)
def update_my_prefs(
    data: NotificationPrefBase,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    p = db.query(NotificationPreference).filter(NotificationPreference.user_id == current.id).first()
    if not p:
        p = NotificationPreference(user_id=current.id)
        db.add(p)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p
