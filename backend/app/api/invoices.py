"""Rechnungs-Endpoints."""
from datetime import date
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Invoice, InvoiceItem, Customer, PrintJob, Company, User
from app.schemas import InvoiceCreate, InvoiceUpdate, InvoiceRead
from app.services.invoice_service import (
    generate_invoice_number, recalculate_totals, create_invoice_from_job,
)
from app.services.pdf_service import generate_invoice_pdf
from app.services.mail_service import send_mail
from app.api.company import get_or_create_company

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    status: str | None = None,
    customer_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Invoice)
    if status:
        q = q.filter(Invoice.status == status)
    if customer_id:
        q = q.filter(Invoice.customer_id == customer_id)
    return q.order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).all()


@router.post("", response_model=InvoiceRead, status_code=201)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not db.query(Customer).filter(Customer.id == data.customer_id).first():
        raise HTTPException(404, "Kunde nicht gefunden")

    company = get_or_create_company(db)

    payload = data.model_dump(exclude={"items"})
    invoice = Invoice(**payload, invoice_number=generate_invoice_number(db, company))
    for idx, item_data in enumerate(data.items, start=1):
        item_dict = item_data.model_dump()
        item_dict["position"] = item_dict.get("position") or idx
        invoice.items.append(InvoiceItem(**item_dict))

    recalculate_totals(invoice)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/from-job/{job_id}", response_model=InvoiceRead, status_code=201)
def create_from_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Erzeugt automatisch eine Rechnung aus einem Auftrag."""
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Auftrag nicht gefunden")
    customer = db.query(Customer).filter(Customer.id == job.customer_id).first()
    if not customer:
        raise HTTPException(404, "Kunde nicht gefunden")

    company = get_or_create_company(db)
    invoice = create_invoice_from_job(db, job, customer, company)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(
    invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Rechnung nicht gefunden")
    return inv


@router.patch("/{invoice_id}", response_model=InvoiceRead)
def update_invoice(
    invoice_id: int,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")

    update_data = data.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)

    for k, v in update_data.items():
        setattr(inv, k, v)

    if items_data is not None:
        # Positionen komplett ersetzen
        inv.items.clear()
        db.flush()
        for idx, item_data in enumerate(items_data, start=1):
            item_data["position"] = item_data.get("position") or idx
            inv.items.append(InvoiceItem(**item_data))

    recalculate_totals(inv)
    # PDF-Cache invalidieren weil sich Inhalt geändert haben kann
    if inv.pdf_path:
        full = Path(settings.UPLOAD_DIR) / inv.pdf_path
        if full.exists():
            try:
                full.unlink()
            except Exception:
                pass
        inv.pdf_path = None

    db.commit()
    db.refresh(inv)
    return inv


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")
    if inv.pdf_path:
        full = Path(settings.UPLOAD_DIR) / inv.pdf_path
        if full.exists():
            try:
                full.unlink()
            except Exception:
                pass
    db.delete(inv)
    db.commit()


@router.get("/{invoice_id}/pdf")
def get_invoice_pdf(
    invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    """PDF generieren (falls noch nicht vorhanden) und ausliefern."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")
    company = get_or_create_company(db)

    pdf_dir = Path(settings.UPLOAD_DIR) / "invoices"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{inv.invoice_number.replace('/', '_')}.pdf"
    filepath = pdf_dir / filename

    if not filepath.exists() or not inv.pdf_path:
        generate_invoice_pdf(inv, company, str(filepath))
        inv.pdf_path = f"invoices/{filename}"
        db.commit()

    return FileResponse(filepath, media_type="application/pdf", filename=filename)


@router.post("/{invoice_id}/mark-sent")
def mark_sent(
    invoice_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")
    if inv.status == "draft":
        inv.status = "sent"
        db.commit()
    return {"status": inv.status}


@router.post("/{invoice_id}/mark-paid")
def mark_paid(
    invoice_id: int,
    paid_on: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")
    inv.status = "paid"
    inv.paid_date = paid_on or date.today()
    db.commit()
    return {"status": "paid", "paid_date": inv.paid_date.isoformat()}


@router.post("/{invoice_id}/send-email")
def send_invoice_email(
    invoice_id: int,
    recipient: str | None = None,
    subject: str | None = None,
    body: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Sendet Rechnung per E-Mail an Kunden (oder Override-Empfänger)."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")
    company = get_or_create_company(db)

    # PDF erzeugen falls nicht vorhanden
    pdf_dir = Path(settings.UPLOAD_DIR) / "invoices"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{inv.invoice_number.replace('/', '_')}.pdf"
    filepath = pdf_dir / filename
    if not filepath.exists():
        generate_invoice_pdf(inv, company, str(filepath))
        inv.pdf_path = f"invoices/{filename}"

    to = recipient or (inv.customer.email if inv.customer else None)
    if not to:
        raise HTTPException(400, "Keine Empfänger-E-Mail (am Kunden hinterlegen oder Override angeben)")

    subj = subject or f"Rechnung {inv.invoice_number} von {company.name or 'PrintFarm'}"
    customer_name = ""
    if inv.customer:
        if inv.customer.customer_type == "business":
            customer_name = inv.customer.company_name or ""
        else:
            customer_name = f"{inv.customer.first_name or ''} {inv.customer.last_name or ''}".strip()

    default_body = (
        f"Hallo {customer_name},\n\n"
        f"anbei erhalten Sie unsere Rechnung {inv.invoice_number} über {inv.total_gross:.2f} € als PDF.\n\n"
        f"Mit freundlichen Grüßen\n{company.name or 'Ihr Druckerei-Team'}"
    )
    body_text = body or default_body

    ok = send_mail(db, to, subj, body_text, attachments=[str(filepath)])
    if not ok:
        raise HTTPException(503, "Versand fehlgeschlagen - SMTP korrekt konfiguriert?")

    if inv.status == "draft":
        inv.status = "sent"
    db.commit()
    return {"sent_to": to, "status": inv.status}


@router.post("/{invoice_id}/reminder")
def create_reminder(
    invoice_id: int,
    reminder_fee: float = 0.0,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Erhöht den Mahnstufen-Zähler und setzt eine Mahngebühr."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Nicht gefunden")
    inv.reminder_count = (inv.reminder_count or 0) + 1
    inv.last_reminder_date = date.today()
    inv.reminder_fee = (inv.reminder_fee or 0) + reminder_fee
    inv.status = f"reminder_{min(inv.reminder_count, 3)}"
    # PDF-Cache invalidieren
    if inv.pdf_path:
        full = Path(settings.UPLOAD_DIR) / inv.pdf_path
        if full.exists():
            try:
                full.unlink()
            except Exception:
                pass
        inv.pdf_path = None
    recalculate_totals(inv)
    db.commit()
    return {"reminder_count": inv.reminder_count, "status": inv.status}
