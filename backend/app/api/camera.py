"""Kamera-Snapshots und Status-Mails an Kunden."""
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Printer, PrintJob, Customer, User
from app.services.camera_service import capture_snapshot, camera_manager
from app.services.mail_service import send_mail
from app.api.company import get_or_create_company

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["camera"])


@router.get("/printers/{printer_id}/snapshot")
def get_snapshot(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Liefert einen aktuellen Kamera-Snapshot als JPEG."""
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    if not printer.bambu_ip or not printer.bambu_access_code:
        raise HTTPException(400, "Bambu-Daten unvollständig")

    data = camera_manager.get_snapshot(printer.id, printer.bambu_ip, printer.bambu_access_code)
    if not data:
        raise HTTPException(503, "Snapshot konnte nicht abgerufen werden. Läuft die Kamera? "
                                 "Ist LAN-Modus aktiv und Liveview erlaubt?")
    return Response(content=data, media_type="image/jpeg")


class CustomerNotifyBody(BaseModel):
    job_id: Optional[int] = None
    custom_message: Optional[str] = None
    include_snapshot: bool = True
    recipient_email: Optional[str] = None  # Override falls Kunde keine Mail hat
    subject: Optional[str] = None


@router.post("/printers/{printer_id}/notify-customer")
def notify_customer(
    printer_id: int,
    body: CustomerNotifyBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Sendet eine Status-Mail an den Kunden mit aktuellem Druckerstatus + Foto.
    job_id ist optional - wenn gesetzt, wird die Mail an den Auftragskunden gesendet.
    """
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")

    # Empfänger ermitteln
    customer = None
    job = None
    if body.job_id:
        job = db.query(PrintJob).filter(PrintJob.id == body.job_id).first()
        if job:
            customer = db.query(Customer).filter(Customer.id == job.customer_id).first()

    to_email = body.recipient_email or (customer.email if customer else None)
    if not to_email:
        raise HTTPException(400, "Keine Empfänger-Mail (Kunden-E-Mail leer und keine angegeben)")

    company = get_or_create_company(db)

    # Status zusammenbauen
    status_lines = [
        f"Aktueller Status: {printer.status or 'unbekannt'}",
    ]
    if printer.current_job_name:
        status_lines.append(f"Auftrag: {printer.current_job_name}")
    if printer.progress is not None:
        status_lines.append(f"Fortschritt: {printer.progress:.1f}%")
    if printer.remaining_time is not None and printer.remaining_time > 0:
        h, m = divmod(printer.remaining_time, 60)
        status_lines.append(f"Restzeit: {h}h {m}m")

    customer_name = ""
    if customer:
        if customer.customer_type == "business":
            customer_name = customer.company_name or ""
        else:
            customer_name = f"{customer.first_name or ''} {customer.last_name or ''}".strip()

    greeting = f"Sehr geehrte/r {customer_name},\n\n" if customer_name else "Sehr geehrte/r Kunde/in,\n\n"
    body_text = greeting
    if body.custom_message:
        body_text += body.custom_message + "\n\n"
    else:
        body_text += "anbei der aktuelle Status Ihres Druckauftrags:\n\n"

    body_text += "\n".join(status_lines)
    if job:
        body_text += f"\n\nIhr Auftrag: {job.order_number} – {job.title}"
    body_text += f"\n\nMit freundlichen Grüßen\n{company.name or 'Ihr Druckerei-Team'}"

    # Snapshot machen
    attachments = []
    snap_path = None
    if body.include_snapshot and printer.bambu_ip and printer.bambu_access_code:
        snap_data = camera_manager.get_snapshot(printer.id, printer.bambu_ip, printer.bambu_access_code)
        if snap_data:
            snap_dir = Path(settings.UPLOAD_DIR) / "snapshots"
            snap_dir.mkdir(parents=True, exist_ok=True)
            snap_path = snap_dir / f"printer_{printer_id}_{datetime.utcnow():%Y%m%d_%H%M%S}.jpg"
            snap_path.write_bytes(snap_data)
            attachments.append(str(snap_path))
        else:
            logger.warning(f"Snapshot für Drucker {printer_id} nicht verfügbar - sende Mail ohne Foto")

    subject = body.subject or f"Status Ihres Druckauftrags{' #' + job.order_number if job else ''}"

    ok = send_mail(db, to_email, subject, body_text, attachments=attachments)

    # Snapshot aufräumen
    if snap_path and snap_path.exists():
        try:
            snap_path.unlink()
        except Exception:
            pass

    if not ok:
        raise HTTPException(503, "Versand fehlgeschlagen - SMTP konfiguriert?")
    return {"sent_to": to_email, "with_snapshot": bool(attachments)}
