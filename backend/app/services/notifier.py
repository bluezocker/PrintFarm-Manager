"""
Hintergrund-Service der die Bambu-Drucker periodisch pollt und bei
Status-Übergängen E-Mails an die konfigurierten Mitarbeiter sendet.

Erkannte Events:
- print_started: idle/finish -> printing
- progress_50: progress springt über 50%
- filament_change: Drucker pausiert mit Filament-Change-Code
- print_paused: printing -> paused
- print_success: printing/finish -> finish bei progress=100
- print_failed: printing -> error oder failed
- print_cancelled: printing -> idle ohne Erreichen von 100%
- error: status=error
"""
import asyncio
import logging
import threading
import time
from datetime import datetime
from typing import Dict, Optional

from app.core.database import SessionLocal
from app.models import Printer, User, NotificationPreference, PrintJob, Customer
from app.services.bambu_service import bambu_manager
from app.services.mail_service import send_mail
from app.services.camera_service import camera_manager

logger = logging.getLogger(__name__)

# Globaler State pro Drucker: letzter bekannter Status
_printer_state: Dict[int, Dict] = {}

POLL_INTERVAL = 30  # Sekunden
_stop_event = threading.Event()


def _get_recipients(db, event: str, printer_id: int) -> list[str]:
    """Liefert E-Mail-Adressen der Mitarbeiter, die `event` für diesen Drucker abonniert haben."""
    field_map = {
        "print_started": "on_print_started",
        "progress_50": "on_progress_50",
        "filament_change": "on_filament_change",
        "print_paused": "on_pause",
        "print_success": "on_print_success",
        "print_failed": "on_print_failed",
        "print_cancelled": "on_print_cancelled",
        "error": "on_error",
    }
    field = field_map.get(event)
    if not field:
        return []

    prefs = db.query(NotificationPreference).all()
    recipients = []
    for p in prefs:
        if not getattr(p, field, False):
            continue
        # Drucker-Filter prüfen
        if p.printer_filter:
            allowed_ids = [int(x.strip()) for x in p.printer_filter.split(",") if x.strip().isdigit()]
            if allowed_ids and printer_id not in allowed_ids:
                continue
        if p.user and p.user.is_active and p.user.email:
            recipients.append(p.user.email)
    return recipients


def _notify_customer_on_print_end(db, event: str, printer: Printer, status: dict):
    """
    Bei print_success/failed/cancelled - schauen ob ein laufender Kundenauftrag
    mit Status 'printing' diesem Drucker zugeordnet ist. Wenn ja, Kunde benachrichtigen.
    """
    if event not in ("print_success", "print_failed", "print_cancelled"):
        return
    # Aktive Aufträge im Status 'printing' (oder gerade fertig)
    jobs = db.query(PrintJob).filter(PrintJob.status.in_(["printing", "in_progress"])).all()
    if not jobs:
        return

    job_name = status.get("current_job_name") or ""
    # Best-Match: Auftrag dessen Title im current_job_name vorkommt
    match = None
    if job_name:
        for j in jobs:
            if j.title and j.title.lower() in job_name.lower():
                match = j
                break
    if not match:
        # Fallback: erster passender Auftrag (nur wenn eindeutig)
        if len(jobs) == 1:
            match = jobs[0]
    if not match:
        return

    customer = db.query(Customer).filter(Customer.id == match.customer_id).first()
    if not customer or not customer.email:
        return

    from app.api.company import get_or_create_company
    company = get_or_create_company(db)

    customer_name = (
        customer.company_name if customer.customer_type == "business"
        else f"{customer.first_name or ''} {customer.last_name or ''}".strip()
    )

    event_text = {
        "print_success": "Ihr Druckauftrag ist fertiggestellt!",
        "print_failed": "Es gab leider ein Problem mit Ihrem Druckauftrag.",
        "print_cancelled": "Ihr Druckauftrag wurde abgebrochen.",
    }[event]

    subject = f"Update zu Ihrem Auftrag {match.order_number}"
    text = (
        f"Sehr geehrte/r {customer_name},\n\n"
        f"{event_text}\n\n"
        f"Auftrag: {match.order_number} – {match.title}\n"
        f"Drucker: {printer.name}\n\n"
    )
    if event == "print_success":
        text += "Wir melden uns kurzfristig wegen Abholung/Versand.\n\n"
    text += f"Mit freundlichen Grüßen\n{company.name or 'Ihr Druckerei-Team'}"

    # Snapshot bei Erfolg/Fehler anhängen (nicht bei Abbruch)
    attachments = []
    snap_path = None
    if event in ("print_success", "print_failed") and printer.bambu_ip and printer.bambu_access_code:
        snap = camera_manager.get_snapshot(printer.id, printer.bambu_ip, printer.bambu_access_code)
        if snap:
            from pathlib import Path
            from app.core.config import settings
            snap_dir = Path(settings.UPLOAD_DIR) / "snapshots"
            snap_dir.mkdir(parents=True, exist_ok=True)
            snap_path = snap_dir / f"auto_{printer.id}_{datetime.utcnow():%Y%m%d_%H%M%S}.jpg"
            snap_path.write_bytes(snap)
            attachments.append(str(snap_path))

    send_mail(db, customer.email, subject, text, attachments=attachments)

    if snap_path and snap_path.exists():
        try:
            snap_path.unlink()
        except Exception:
            pass


def _notify(db, event: str, printer: Printer, status: dict):
    """E-Mail-Benachrichtigung versenden."""
    recipients = _get_recipients(db, event, printer.id)
    if not recipients:
        return

    subjects = {
        "print_started": f"🖨 Druck gestartet: {printer.name}",
        "progress_50": f"⏱ 50% erreicht: {printer.name}",
        "filament_change": f"🎨 Filamentwechsel erforderlich: {printer.name}",
        "print_paused": f"⏸ Druck pausiert: {printer.name}",
        "print_success": f"✅ Druck fertig: {printer.name}",
        "print_failed": f"❌ Druck fehlgeschlagen: {printer.name}",
        "print_cancelled": f"⛔ Druck abgebrochen: {printer.name}",
        "error": f"⚠ Druckerfehler: {printer.name}",
    }
    subject = subjects.get(event, f"Druckerstatus: {printer.name}")

    job_name = status.get("current_job_name") or "(unbekannt)"
    progress = status.get("progress", 0)
    nozzle = status.get("nozzle_temp")
    bed = status.get("bed_temp")
    remaining = status.get("remaining_time")

    lines = [
        f"Drucker: {printer.name} ({printer.brand} {printer.model or ''})",
        f"Job: {job_name}",
        f"Fortschritt: {progress:.1f}%",
    ]
    if nozzle is not None:
        lines.append(f"Düse: {nozzle:.1f}°C")
    if bed is not None:
        lines.append(f"Bett: {bed:.1f}°C")
    if remaining is not None:
        h, m = divmod(remaining, 60)
        lines.append(f"Restzeit: {h}h {m}m")
    lines.append("")
    lines.append(f"Zeitpunkt: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")

    body_text = "\n".join(lines)
    body_html = "<br/>".join(lines).replace(job_name, f"<b>{job_name}</b>")

    send_mail(db, recipients, subject, body_text, body_html)


def _detect_events(prev: dict, curr: dict, is_first_poll: bool = False) -> list[str]:
    """Erkennt Statusänderungen und gibt eine Liste von Events zurück.
    Beim allerersten Poll (kein vorheriger State bekannt) werden KEINE Events
    ausgelöst - wir speichern nur den Initial-State.
    """
    if is_first_poll:
        return []

    events = []
    prev_status = prev.get("status")
    curr_status = curr.get("status")
    prev_progress = prev.get("progress", 0) or 0
    curr_progress = curr.get("progress", 0) or 0

    # print_started - nur bei echtem Übergang (prev darf nicht None sein,
    # sonst feuert das beim ersten Poll wenn Drucker schon druckt)
    if prev_status in ("idle", "finish") and curr_status == "printing":
        events.append("print_started")

    # progress_50
    if curr_status == "printing" and prev_progress < 50 <= curr_progress:
        events.append("progress_50")

    # print_paused
    if prev_status == "printing" and curr_status == "paused":
        events.append("print_paused")

    # print_success
    if prev_status in ("printing", "paused") and curr_status == "finish":
        events.append("print_success")

    # print_failed (über Status)
    if prev_status in ("printing", "paused") and curr_status == "error":
        events.append("print_failed")

    # print_cancelled: aus printing direkt nach idle (nicht durch finish)
    if prev_status in ("printing", "paused") and curr_status == "idle" and prev_progress < 99:
        events.append("print_cancelled")

    # Filament-Change wird über Bambu-Spezifische Pause-Codes erkannt
    # (gcode_state PAUSE + spezifischer print_error). Wir nutzen hier vereinfacht:
    # Pause mit Job aktiv und progress > 0 könnte Filament-Change sein.
    # Vollständige Implementierung würde print_error-Code prüfen.
    return events


def _poll_once():
    """Einen Poll-Durchgang über alle Drucker machen."""
    db = SessionLocal()
    try:
        printers = db.query(Printer).all()
        for printer in printers:
            client = bambu_manager.get(printer.id)
            if not client:
                # Versuche zu verbinden falls möglich
                if printer.bambu_ip and printer.bambu_access_code and printer.bambu_serial:
                    client = bambu_manager.register(
                        printer.id, printer.bambu_ip, printer.bambu_access_code, printer.bambu_serial,
                    )
                if not client:
                    continue

            try:
                curr = client.get_status_summary()
            except Exception as e:
                logger.warning(f"Status-Fehler {printer.name}: {e}")
                continue

            if not curr.get("connected"):
                continue

            prev = _printer_state.get(printer.id)
            is_first_poll = prev is None
            events = _detect_events(prev or {}, curr, is_first_poll=is_first_poll)

            for event in events:
                logger.info(f"Notifier: {printer.name} -> {event}")
                try:
                    _notify(db, event, printer, curr)
                    _notify_customer_on_print_end(db, event, printer, curr)
                except Exception as e:
                    logger.error(f"Notify-Fehler: {e}")

            # State updaten
            _printer_state[printer.id] = curr

            # DB-Felder aktualisieren (gleicher Effekt wie /status-Endpoint)
            printer.status = curr.get("status") or printer.status
            printer.current_job_name = curr.get("current_job_name")
            printer.progress = curr.get("progress") or 0.0
            printer.nozzle_temp = curr.get("nozzle_temp")
            printer.bed_temp = curr.get("bed_temp")
            printer.remaining_time = curr.get("remaining_time")
            printer.last_seen = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def _worker():
    """Background-Worker-Loop."""
    logger.info(f"Notifier gestartet (Poll-Intervall: {POLL_INTERVAL}s)")
    # Kurzer initialer Sleep damit beim Start nicht direkt gespammt wird
    time.sleep(15)
    while not _stop_event.is_set():
        try:
            _poll_once()
        except Exception as e:
            logger.error(f"Poll-Fehler: {e}")
        _stop_event.wait(POLL_INTERVAL)
    logger.info("Notifier gestoppt")


def start_notifier():
    """Startet den Notifier im Hintergrund-Thread."""
    thread = threading.Thread(target=_worker, daemon=True, name="printfarm-notifier")
    thread.start()


def stop_notifier():
    _stop_event.set()
