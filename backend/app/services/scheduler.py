"""Scheduler für zeitgesteuerte Aufträge und Auto-Power via Tuya.

Läuft als Hintergrund-Thread, prüft alle 60 Sekunden:

1. **Scheduled Prints:**
   - Jobs mit `scheduled_start_at <= NOW` und `scheduled_processed=False`
   - Werden an Position 1 der Queue gesetzt (falls Queue-Printer zugewiesen)
   - Kunde bekommt eine Info-Mail

2. **Auto Power On:**
   - Findet Jobs deren `scheduled_start_at` in den nächsten `lead_minutes` liegt
   - Wenn Drucker `auto_power_enabled` + Tuya-Device → Steckdose an

3. **Auto Power Off:**
   - Findet Drucker die idle sind + `auto_power_enabled`
   - Wenn letzter Job vor > `cooldown_minutes` fertig UND Bett < `power_off_bed_temp`
   - → Steckdose aus
"""
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func

from app.core.database import SessionLocal
from app.models import PrintJob, Printer

logger = logging.getLogger(__name__)

# Sekunden zwischen Polls
POLL_INTERVAL_SEC = 60

_stop_event = threading.Event()
_thread: Optional[threading.Thread] = None

# Merken welche Drucker wir zuletzt eingeschaltet haben (Anti-Duplicate-Toggle)
_recently_powered_on: dict[int, datetime] = {}
_recently_powered_off: dict[int, datetime] = {}


def _now_utc() -> datetime:
    """Immer timezone-aware UTC."""
    return datetime.now(timezone.utc)


def _ensure_tz(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLAlchemy kann tz-naive Datums zurückgeben - dann UTC annehmen."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _tuya_power_on(printer: Printer) -> bool:
    """Steckdose eines Druckers einschalten."""
    if not printer.tuya_device_id:
        return False
    try:
        from app.services.tuya_service import tuya_service
        result = tuya_service.switch_device(printer.tuya_device_id, True)
        if result:
            logger.info(f"Auto-Power ON: {printer.name} (Device {printer.tuya_device_id})")
            _recently_powered_on[printer.id] = _now_utc()
        return bool(result)
    except Exception as e:
        logger.error(f"Auto-Power ON fehlgeschlagen für {printer.name}: {e}")
        return False


def _tuya_power_off(printer: Printer) -> bool:
    """Steckdose eines Druckers ausschalten."""
    if not printer.tuya_device_id:
        return False
    try:
        from app.services.tuya_service import tuya_service
        result = tuya_service.switch_device(printer.tuya_device_id, False)
        if result:
            logger.info(f"Auto-Power OFF: {printer.name} (Device {printer.tuya_device_id})")
            _recently_powered_off[printer.id] = _now_utc()
        return bool(result)
    except Exception as e:
        logger.error(f"Auto-Power OFF fehlgeschlagen für {printer.name}: {e}")
        return False


def _get_current_bed_temp(printer_id: int) -> Optional[float]:
    """Holt die aktuelle Bett-Temperatur aus dem Bambu-Live-Status."""
    try:
        from app.services.bambu_service import bambu_manager
        client = bambu_manager.get(printer_id)
        if not client:
            return None
        status = client.get_status_summary()
        return status.get("bed_temp")
    except Exception:
        return None


def _get_printer_status(printer_id: int) -> Optional[str]:
    """Holt den aktuellen Drucker-Status."""
    try:
        from app.services.bambu_service import bambu_manager
        client = bambu_manager.get(printer_id)
        if not client:
            return None
        status = client.get_status_summary()
        return status.get("status")
    except Exception:
        return None


def _process_scheduled_jobs(db):
    """Findet fällige geplante Aufträge und verarbeitet sie."""
    now = _now_utc()

    # Fällige Jobs suchen
    due_jobs = db.query(PrintJob).filter(
        PrintJob.scheduled_start_at.isnot(None),
        PrintJob.scheduled_start_at <= now,
        PrintJob.scheduled_processed == False,   # noqa: E712
        ~PrintJob.status.in_(["completed", "paid", "cancelled"]),
    ).all()

    for job in due_jobs:
        try:
            # An Position 1 der Queue setzen (falls Drucker zugewiesen)
            if job.queue_printer_id:
                # Existierende Queue-Positionen ab 1 alle um eins hoch
                db.query(PrintJob).filter(
                    PrintJob.queue_printer_id == job.queue_printer_id,
                    PrintJob.queue_position.isnot(None),
                    PrintJob.id != job.id,
                ).update({PrintJob.queue_position: PrintJob.queue_position + 1})
                job.queue_position = 1
                logger.info(f"Scheduled: Job {job.id} '{job.title}' an Queue-Position 1 gesetzt (Drucker {job.queue_printer_id})")
            else:
                logger.info(f"Scheduled: Job {job.id} '{job.title}' fällig, aber kein Drucker zugewiesen")

            job.scheduled_processed = True

            # Kunde informieren (falls Kunde + Mail vorhanden)
            try:
                from app.services.notifier import notify_customer_on_status_change
                # Status auf "in_progress" wenn er noch "new" war
                if job.status == "new":
                    job.status = "in_progress"
                    notify_customer_on_status_change(db, job, "in_progress")
            except Exception as e:
                logger.warning(f"Scheduled: Konnte Kunde nicht benachrichtigen: {e}")

        except Exception as e:
            logger.error(f"Scheduled: Fehler bei Job {job.id}: {e}")

    if due_jobs:
        db.commit()


def _process_auto_power_on(db):
    """Schaltet Steckdosen ein für Aufträge die in Kürze starten."""
    now = _now_utc()

    printers = db.query(Printer).filter(
        Printer.auto_power_enabled == True,   # noqa: E712
        Printer.tuya_device_id.isnot(None),
    ).all()

    for printer in printers:
        lead = printer.power_on_lead_minutes or 5
        window_end = now + timedelta(minutes=lead)

        # Anti-Duplicate: nicht mehrfach hintereinander schalten
        last_on = _recently_powered_on.get(printer.id)
        if last_on and (now - last_on).total_seconds() < 300:
            continue

        # Ist ein Job in den nächsten `lead` Minuten geplant für einen Drucker?
        upcoming = db.query(PrintJob).filter(
            PrintJob.queue_printer_id == printer.id,
            PrintJob.scheduled_start_at.isnot(None),
            PrintJob.scheduled_start_at > now,
            PrintJob.scheduled_start_at <= window_end,
            PrintJob.scheduled_processed == False,   # noqa: E712
        ).first()

        if not upcoming:
            continue

        # Drucker-Status prüfen - wenn er schon läuft, nix tun
        current_status = _get_printer_status(printer.id)
        if current_status in ("printing", "paused"):
            continue

        _tuya_power_on(printer)


def _process_auto_power_off(db):
    """Schaltet Steckdosen aus wenn Druck fertig und Bett kalt genug."""
    now = _now_utc()

    printers = db.query(Printer).filter(
        Printer.auto_power_enabled == True,   # noqa: E712
        Printer.tuya_device_id.isnot(None),
    ).all()

    for printer in printers:
        # Anti-Duplicate
        last_off = _recently_powered_off.get(printer.id)
        if last_off and (now - last_off).total_seconds() < 600:
            continue

        # Drucker muss idle/finish sein
        status = _get_printer_status(printer.id)
        if status not in ("idle", "finish", None):
            continue

        # Bett-Temperatur prüfen
        bed_temp = _get_current_bed_temp(printer.id)
        threshold = printer.power_off_bed_temp or 40.0
        if bed_temp is not None and bed_temp > threshold:
            continue

        # Gibt es einen ausstehenden Job in der Queue in Kürze? → nicht ausschalten!
        lead = printer.power_on_lead_minutes or 5
        upcoming = db.query(PrintJob).filter(
            PrintJob.queue_printer_id == printer.id,
            PrintJob.scheduled_start_at.isnot(None),
            PrintJob.scheduled_start_at <= now + timedelta(minutes=lead + 5),
            PrintJob.scheduled_processed == False,   # noqa: E712
        ).first()
        if upcoming:
            continue

        # Letzte Aktivität checken - wir wollen mindestens `cooldown` Minuten warten
        # nachdem der letzte Druck fertig wurde. Wir approximieren das über last_seen.
        cooldown = printer.power_off_cooldown_minutes or 15
        if printer.last_seen:
            last_seen = _ensure_tz(printer.last_seen)
            elapsed = (now - last_seen).total_seconds() / 60
            # Wenn last_seen erst kürzlich war, könnte der Drucker gerade fertig geworden sein
            # -> warten
            if elapsed < cooldown:
                continue

        _tuya_power_off(printer)


def _poll_once():
    """Ein Poll-Durchlauf."""
    db = SessionLocal()
    try:
        _process_scheduled_jobs(db)
        _process_auto_power_on(db)
        _process_auto_power_off(db)
    except Exception as e:
        logger.error(f"Scheduler-Poll-Fehler: {e}", exc_info=True)
    finally:
        db.close()


def _worker():
    logger.info("Scheduler gestartet")
    # Ersten Poll mit kleiner Verzögerung damit App voll geladen ist
    _stop_event.wait(10)
    while not _stop_event.is_set():
        try:
            _poll_once()
        except Exception as e:
            logger.error(f"Scheduler-Fehler: {e}", exc_info=True)
        _stop_event.wait(POLL_INTERVAL_SEC)
    logger.info("Scheduler beendet")


def start_scheduler():
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_worker, daemon=True, name="scheduler")
    _thread.start()


def stop_scheduler():
    _stop_event.set()
    if _thread:
        _thread.join(timeout=5)


# ==== API-fähige Utility-Funktionen ====

def manual_power_on(printer_id: int) -> dict:
    """Für manuellen Power-On Endpoint."""
    db = SessionLocal()
    try:
        p = db.query(Printer).filter(Printer.id == printer_id).first()
        if not p:
            return {"success": False, "error": "Drucker nicht gefunden"}
        if not p.tuya_device_id:
            return {"success": False, "error": "Kein Tuya-Device konfiguriert"}
        ok = _tuya_power_on(p)
        return {"success": ok}
    finally:
        db.close()


def manual_power_off(printer_id: int) -> dict:
    """Für manuellen Power-Off Endpoint."""
    db = SessionLocal()
    try:
        p = db.query(Printer).filter(Printer.id == printer_id).first()
        if not p:
            return {"success": False, "error": "Drucker nicht gefunden"}
        if not p.tuya_device_id:
            return {"success": False, "error": "Kein Tuya-Device konfiguriert"}
        ok = _tuya_power_off(p)
        return {"success": ok}
    finally:
        db.close()
