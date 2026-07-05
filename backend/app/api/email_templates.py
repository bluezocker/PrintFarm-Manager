"""API für die Verwaltung der Status-Email-Templates."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_admin
from app.models import EmailTemplate, User
from app.services.notifier import DEFAULT_STATUS_TEMPLATES, seed_default_email_templates

router = APIRouter(prefix="/api/email-templates", tags=["email-templates"])


class TemplateRead(BaseModel):
    id: int
    status_key: str
    label: Optional[str] = None
    subject: str
    body: str
    enabled: bool = True
    model_config = ConfigDict(from_attributes=True)


class TemplateUpdate(BaseModel):
    label: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("", response_model=List[TemplateRead])
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    seed_default_email_templates(db)
    order = ["new", "in_progress", "printing", "completed", "paid", "cancelled"]
    templates = db.query(EmailTemplate).all()
    templates.sort(key=lambda t: order.index(t.status_key) if t.status_key in order else 99)
    return templates


@router.patch("/{template_id}", response_model=TemplateRead)
def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(404, "Template nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.post("/{template_id}/reset", response_model=TemplateRead)
def reset_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(404, "Template nicht gefunden")
    defaults = DEFAULT_STATUS_TEMPLATES.get(t.status_key)
    if not defaults:
        raise HTTPException(400, "Kein Default für diesen Status-Key")
    t.label = defaults["label"]
    t.subject = defaults["subject"]
    t.body = defaults["body"]
    t.enabled = True
    db.commit()
    db.refresh(t)
    return t


@router.post("/{template_id}/preview")
def preview_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(404, "Template nicht gefunden")

    from app.api.company import get_or_create_company
    company = get_or_create_company(db)

    sample_context = {
        "customer_name": "Max Mustermann",
        "order_number": "A-2026-0042",
        "title": "Beispiel-Auftrag",
        "due_date": "15.06.2026",
        "company": company.name or "Ihre Druckerei",
    }
    from app.services.notifier import _render_template
    return {
        "subject": _render_template(t.subject, sample_context),
        "body": _render_template(t.body, sample_context),
    }
