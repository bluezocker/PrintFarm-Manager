"""Druckhistorie - manuelle Einträge + Auswertungen."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import PrintHistory, PrintHistoryFilament, Printer, Filament, User
from app.schemas import PrintHistoryCreate, PrintHistoryRead
from app.services.filament_consumption import consume_from_specific_spool

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[PrintHistoryRead])
def list_history(
    printer_id: int | None = None,
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(PrintHistory).filter(PrintHistory.created_at >= since)
    if printer_id:
        q = q.filter(PrintHistory.printer_id == printer_id)
    return q.order_by(PrintHistory.created_at.desc()).all()


@router.post("", response_model=PrintHistoryRead, status_code=201)
def add_entry(
    data: PrintHistoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not db.query(Printer).filter(Printer.id == data.printer_id).first():
        raise HTTPException(404, "Drucker nicht gefunden")

    payload = data.model_dump(exclude={"filaments"})
    filament_inputs = data.filaments or []

    # Multi-Filament Modus: Gesamt-Gramm und Haupt-Filament ableiten
    if filament_inputs:
        total_g = sum(item.grams_used for item in filament_inputs if item.grams_used)
        if total_g > 0:
            payload["material_used_g"] = total_g
        # Haupt-Filament = mit dem höchsten Verbrauch
        sorted_items = sorted(
            [i for i in filament_inputs if i.filament_id],
            key=lambda x: x.grams_used or 0,
            reverse=True,
        )
        if sorted_items:
            payload["filament_id"] = sorted_items[0].filament_id

    entry = PrintHistory(**payload)
    db.add(entry)
    db.flush()  # ID generieren

    # Filament-Slots speichern und Restbestände reduzieren (FIFO)
    if filament_inputs:
        for item in filament_inputs:
            if not item.grams_used or item.grams_used <= 0:
                continue
            db.add(PrintHistoryFilament(
                history_id=entry.id,
                filament_id=item.filament_id,
                grams_used=item.grams_used,
                slot=item.slot,
            ))
            if item.filament_id:
                # FIFO: reicht die ausgewählte Rolle nicht, wird automatisch
                # aus weiteren Rollen des gleichen Typs entnommen
                consume_from_specific_spool(db, item.filament_id, item.grams_used)
    elif data.filament_id and data.material_used_g:
        # Legacy: Single-Filament auch in usage spiegeln
        db.add(PrintHistoryFilament(
            history_id=entry.id,
            filament_id=data.filament_id,
            grams_used=data.material_used_g,
        ))
        consume_from_specific_spool(db, data.filament_id, data.material_used_g)

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    e = db.query(PrintHistory).filter(PrintHistory.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(e)
    db.commit()


@router.get("/stats")
def get_stats(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Übersichtsstatistiken für das Dashboard."""
    since = datetime.utcnow() - timedelta(days=days)
    base = db.query(PrintHistory).filter(PrintHistory.created_at >= since)

    total = base.count()
    success = base.filter(PrintHistory.status == "success").count()
    failed = base.filter(PrintHistory.status == "failed").count()

    total_minutes = db.query(func.sum(PrintHistory.duration_minutes)).filter(
        PrintHistory.created_at >= since
    ).scalar() or 0

    total_material = db.query(func.sum(PrintHistory.material_used_g)).filter(
        PrintHistory.created_at >= since
    ).scalar() or 0.0

    total_power = db.query(func.sum(PrintHistory.power_used_kwh)).filter(
        PrintHistory.created_at >= since
    ).scalar() or 0.0

    return {
        "period_days": days,
        "total_prints": total,
        "success_count": success,
        "failed_count": failed,
        "success_rate": (success / total * 100) if total else 0,
        "total_hours": round(total_minutes / 60, 1),
        "total_material_g": round(total_material, 1),
        "total_power_kwh": round(total_power, 2),
    }
