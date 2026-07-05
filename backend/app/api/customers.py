"""Kundenverwaltung und Druckaufträge."""
from datetime import datetime, date as Date
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.models import (
    Customer, PrintJob, PrintJobFilament, PrintJobPlate, Filament,
    PrintHistory, PrintHistoryFilament, User,
)
from app.schemas import (
    CustomerCreate, CustomerRead, CustomerUpdate,
    PrintJobCreate, PrintJobRead, PrintJobUpdate,
)
from app.services.filament_consumption import consume_from_specific_spool

router = APIRouter(prefix="/api", tags=["customers"])


def _next_customer_number(db: Session) -> str:
    """Generiert nächste Kundennummer im Format K-0001."""
    last = (
        db.query(Customer)
        .filter(Customer.customer_number.like("K-%"))
        .order_by(Customer.id.desc())
        .first()
    )
    if last and last.customer_number:
        try:
            n = int(last.customer_number.split("-")[1]) + 1
        except (IndexError, ValueError):
            n = (db.query(Customer).count() or 0) + 1
    else:
        n = 1
    while db.query(Customer).filter(Customer.customer_number == f"K-{n:04d}").first():
        n += 1
    return f"K-{n:04d}"


# ============ Kunden ============

@router.get("/customers", response_model=list[CustomerRead])
def list_customers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Customer).order_by(Customer.id).all()


@router.post("/customers", response_model=CustomerRead, status_code=201)
def create_customer(
    data: CustomerCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    payload = data.model_dump()
    if not payload.get("customer_number"):
        payload["customer_number"] = _next_customer_number(db)
    c = Customer(**payload)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("/customers/{customer_id}", response_model=CustomerRead)
def get_customer(
    customer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "Kunde nicht gefunden")
    return c


@router.patch("/customers/{customer_id}", response_model=CustomerRead)
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "Nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/customers/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(c)
    db.commit()


# ============ Druckaufträge ============

def _reserve_filaments(db: Session, job: PrintJob, items, plate_id: int | None = None):
    """Reserviert Filamente für einen Auftrag und reduziert Bestand per FIFO.
    Optional einer Platte zuordnen. Wenn `items` leer, passiert nichts.
    """
    for item in items or []:
        if not item.filament_id or not item.grams_reserved:
            continue
        f = db.query(Filament).filter(Filament.id == item.filament_id).first()
        if not f:
            continue
        from sqlalchemy import func
        total_available = db.query(func.sum(Filament.remaining_weight)).filter(
            func.lower(Filament.material) == (f.material or "").lower(),
            func.lower(Filament.manufacturer) == (f.manufacturer or "").lower(),
            func.lower(Filament.color or "") == (f.color or "").lower(),
        ).scalar() or 0
        if total_available < item.grams_reserved:
            raise HTTPException(
                400,
                f"Nicht genug {f.material} {f.color or ''}: nur {total_available:.0f}g insgesamt verfügbar, "
                f"benötigt {item.grams_reserved:.0f}g",
            )
        consumed = consume_from_specific_spool(db, item.filament_id, item.grams_reserved)
        for spool_id, taken in consumed:
            db.add(PrintJobFilament(
                job_id=job.id,
                plate_id=plate_id,
                filament_id=spool_id,
                grams_reserved=taken,
                slot=item.slot,
            ))


def _save_plates(db: Session, job: PrintJob, plates_data):
    """Legt Druckplatten an und reserviert Filamente pro Platte.
    Setzt zusätzlich job.estimated_hours und estimated_material_g aus den Summen.
    """
    if not plates_data:
        return

    total_hours = 0.0
    total_grams = 0.0

    for idx, plate in enumerate(plates_data, start=1):
        plate_obj = PrintJobPlate(
            job_id=job.id,
            position=plate.position or idx,
            name=plate.name or f"Platte {idx}",
            duration_hours=plate.duration_hours or 0,
        )
        db.add(plate_obj)
        db.flush()  # ID generieren

        total_hours += plate.duration_hours or 0
        for f_item in plate.filaments or []:
            total_grams += f_item.grams_reserved or 0

        # Filamente dieser Platte reservieren
        _reserve_filaments(db, job, plate.filaments, plate_id=plate_obj.id)

    # Auftrag mit Summen aktualisieren
    job.estimated_hours = round(total_hours, 2)
    job.estimated_material_g = round(total_grams, 1)


def _release_reservation(db: Session, job: PrintJob):
    """Gibt eine Reservierung wieder frei (z.B. beim Bearbeiten oder Abbrechen)."""
    for r in list(job.reserved_filaments):
        if r.filament_id and r.grams_reserved:
            f = db.query(Filament).filter(Filament.id == r.filament_id).first()
            if f:
                f.remaining_weight = (f.remaining_weight or 0) + r.grams_reserved
        db.delete(r)


def _move_to_history(db: Session, job: PrintJob, user_name: str = None):
    """Übernimmt den Auftrag in die Druckhistorie."""
    if not job.reserved_filaments:
        return None
    # Verhindern dass mehrfach übernommen wird
    existing = db.query(PrintHistory).filter(PrintHistory.job_id == job.id).first()
    if existing:
        return existing

    # Drucker aus der Auftrags-Kalkulation entnehmen (falls vorhanden) - sonst None
    printer_id = None
    if job.cost_breakdown:
        try:
            import json
            data = json.loads(job.cost_breakdown)
            printer_id = data.get("details", {}).get("printer_id")
        except Exception:
            pass

    if not printer_id:
        # Fallback: ersten Drucker nehmen
        from app.models import Printer
        first = db.query(Printer).first()
        printer_id = first.id if first else None

    if not printer_id:
        return None

    total_used = sum(
        (r.grams_used if r.grams_used is not None else r.grams_reserved) or 0
        for r in job.reserved_filaments
    )

    main_f = sorted(
        job.reserved_filaments,
        key=lambda r: (r.grams_used if r.grams_used is not None else r.grams_reserved) or 0,
        reverse=True,
    )[0] if job.reserved_filaments else None

    duration_min = int((job.estimated_hours or 0) * 60)

    # Notes mit Platten-Aufschlüsselung anreichern
    notes_parts = [
        f"Automatisch aus Auftrag {job.order_number} übernommen"
        + (f" von {user_name}" if user_name else "")
    ]
    if job.plates:
        notes_parts.append("")
        notes_parts.append(f"Aufteilung in {len(job.plates)} Druckplatten:")
        for plate in sorted(job.plates, key=lambda p: p.position or 0):
            plate_grams = sum(
                (f.grams_used if f.grams_used is not None else f.grams_reserved) or 0
                for f in plate.filaments
            )
            notes_parts.append(
                f"  • {plate.name or f'Platte {plate.position}'}: "
                f"{plate.duration_hours:.1f}h · {plate_grams:.0f}g"
            )

    entry = PrintHistory(
        printer_id=printer_id,
        job_id=job.id,
        filament_id=main_f.filament_id if main_f else None,
        job_name=job.title,
        duration_minutes=duration_min,
        material_used_g=total_used,
        status="success",
        notes="\n".join(notes_parts),
    )
    db.add(entry)
    db.flush()

    for r in job.reserved_filaments:
        used = r.grams_used if r.grams_used is not None else r.grams_reserved
        if used and used > 0:
            db.add(PrintHistoryFilament(
                history_id=entry.id,
                filament_id=r.filament_id,
                grams_used=used,
                slot=r.slot,
            ))
            # Eventuelle Differenz zwischen Reserviert und tatsächlich nutzen:
            # Wenn weniger gebraucht als reserviert -> Rest zurückgeben
            if r.grams_used is not None and r.grams_reserved and r.grams_used < r.grams_reserved:
                f = db.query(Filament).filter(Filament.id == r.filament_id).first()
                if f:
                    f.remaining_weight = (f.remaining_weight or 0) + (r.grams_reserved - r.grams_used)

    return entry


@router.get("/jobs", response_model=list[PrintJobRead])
def list_jobs(
    status: str | None = None,
    customer_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(PrintJob)
    if status:
        q = q.filter(PrintJob.status == status)
    if customer_id:
        q = q.filter(PrintJob.customer_id == customer_id)
    return q.order_by(PrintJob.created_at.desc()).all()


@router.get("/jobs/calendar")
def list_jobs_for_calendar(
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Kompakte Auftragsliste für die Kalenderansicht."""
    q = db.query(PrintJob).filter(
        ~PrintJob.status.in_(["completed", "paid", "cancelled"])
    )
    if from_date and to_date:
        try:
            from_d = datetime.strptime(from_date, "%Y-%m-%d").date()
            to_d = datetime.strptime(to_date, "%Y-%m-%d").date()
            q = q.filter(
                (PrintJob.due_date == None) |
                ((PrintJob.due_date >= from_d) & (PrintJob.due_date <= to_d))
            )
        except ValueError:
            raise HTTPException(400, "Datumsformat muss YYYY-MM-DD sein")

    jobs = q.order_by(PrintJob.due_date.asc().nulls_last()).all()

    result = []
    for j in jobs:
        customer = db.query(Customer).filter(Customer.id == j.customer_id).first()
        customer_name = ""
        if customer:
            customer_name = (
                customer.company_name if customer.customer_type == "business"
                else f"{customer.first_name or ''} {customer.last_name or ''}".strip()
            )
        result.append({
            "id": j.id,
            "title": j.title or "(ohne Titel)",
            "order_number": j.order_number,
            "status": j.status,
            "due_date": j.due_date.isoformat() if j.due_date else None,
            "estimated_hours": j.estimated_hours,
            "quantity": j.quantity,
            "customer_id": j.customer_id,
            "customer_name": customer_name,
            "price_gross": j.price_gross,
        })
    return result


@router.patch("/jobs/{job_id}/due-date", response_model=PrintJobRead)
def update_job_due_date(
    job_id: int,
    due_date: str | None = Body(None, embed=True),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Schneller Endpoint für Drag&Drop im Kalender."""
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Auftrag nicht gefunden")
    if due_date:
        try:
            j.due_date = datetime.strptime(due_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "Datumsformat muss YYYY-MM-DD sein")
    else:
        j.due_date = None
    db.commit()
    db.refresh(j)
    return j


@router.post("/jobs", response_model=PrintJobRead, status_code=201)
def create_job(
    data: PrintJobCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    if not db.query(Customer).filter(Customer.id == data.customer_id).first():
        raise HTTPException(404, "Kunde nicht gefunden")
    payload = data.model_dump(exclude={"filaments", "plates"})
    job = PrintJob(**payload)
    job.order_number = f"AUF-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    db.add(job)
    db.flush()

    # Wenn Plates übergeben wurden: Platten-basierte Reservierung
    if data.plates:
        _save_plates(db, job, data.plates)
    elif data.filaments:
        # Legacy: direkt Filamente ohne Platten
        _reserve_filaments(db, job, data.filaments)

    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs/{job_id}", response_model=PrintJobRead)
def get_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Auftrag nicht gefunden")
    return j


@router.patch("/jobs/{job_id}", response_model=PrintJobRead)
def update_job(
    job_id: int,
    data: PrintJobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Nicht gefunden")

    update_data = data.model_dump(exclude_unset=True)
    filament_data = update_data.pop("filaments", None)
    plates_data = update_data.pop("plates", None)
    old_status = j.status

    for k, v in update_data.items():
        setattr(j, k, v)

    # Wenn neue Platten-Daten kommen: alte freigeben + neu anlegen
    if plates_data is not None:
        _release_reservation(db, j)
        # Alte Platten löschen (cascade entfernt auch Filamente)
        for plate in list(j.plates):
            db.delete(plate)
        db.flush()
        # Plates neu anlegen
        from app.schemas import JobPlateInput
        plate_objs = [JobPlateInput(**p) if isinstance(p, dict) else p for p in plates_data]
        _save_plates(db, j, plate_objs)
    elif filament_data is not None:
        # Legacy: nur Filamente ohne Platten
        _release_reservation(db, j)
        db.flush()
        from app.schemas import JobFilamentInput
        items = [JobFilamentInput(**it) if isinstance(it, dict) else it for it in filament_data]
        _reserve_filaments(db, j, items)

    # Auto-History bei Statuswechsel auf completed
    if old_status != "completed" and j.status == "completed":
        if not j.completion_date:
            j.completion_date = Date.today()
        _move_to_history(db, j, user_name=current_user.username)

    db.commit()
    db.refresh(j)

    # Email an Kunden bei manuellem Statuswechsel
    if old_status != j.status:
        try:
            from app.services.notifier import notify_customer_on_status_change
            notify_customer_on_status_change(db, j, j.status)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Status-Mail Fehler: {e}")
    return j


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Nicht gefunden")
    # Reservierung freigeben bevor gelöscht wird
    _release_reservation(db, j)
    db.delete(j)
    db.commit()


@router.post("/jobs/{job_id}/move-to-history")
def move_job_to_history(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manuell einen Auftrag in die Druckhistorie übernehmen."""
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Nicht gefunden")
    if not j.reserved_filaments:
        raise HTTPException(400, "Auftrag hat keine reservierten Filamente")
    entry = _move_to_history(db, j, user_name=current_user.username)
    if not entry:
        raise HTTPException(400, "Bereits in Historie oder kein Drucker konfiguriert")
    if j.status != "completed":
        j.status = "completed"
        j.completion_date = Date.today()
    db.commit()
    return {"history_id": entry.id, "job_status": j.status}


# ===================== Druckergebnis-Foto =====================

ALLOWED_PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024


def _photo_dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "result_photos"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/jobs/{job_id}/photo")
async def upload_result_photo(
    job_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Lädt ein Druckergebnis-Foto hoch."""
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Auftrag nicht gefunden")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_PHOTO_EXT:
        raise HTTPException(
            400,
            f"Dateityp nicht erlaubt. Erlaubt: {', '.join(sorted(ALLOWED_PHOTO_EXT))}"
        )

    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(400, f"Datei zu groß (max. {MAX_PHOTO_BYTES // 1024 // 1024} MB)")

    if j.result_photo_path:
        old = Path(j.result_photo_path)
        if old.exists():
            try:
                old.unlink()
            except Exception:
                pass

    filename = f"job_{job_id}_{datetime.utcnow():%Y%m%d_%H%M%S}{ext}"
    target = _photo_dir() / filename
    target.write_bytes(content)

    j.result_photo_path = str(target)
    db.commit()
    db.refresh(j)
    return {"success": True, "path": str(target), "filename": filename}


@router.get("/jobs/{job_id}/photo")
def get_result_photo(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j or not j.result_photo_path:
        raise HTTPException(404, "Kein Foto vorhanden")
    p = Path(j.result_photo_path)
    if not p.exists():
        raise HTTPException(404, "Foto-Datei nicht gefunden")
    return FileResponse(p)


@router.delete("/jobs/{job_id}/photo", status_code=204)
def delete_result_photo(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Auftrag nicht gefunden")
    if j.result_photo_path:
        p = Path(j.result_photo_path)
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass
    j.result_photo_path = None
    db.commit()
