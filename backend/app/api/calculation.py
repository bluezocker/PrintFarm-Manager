"""Druckkalkulations-Endpoints."""
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User, PrintJob, PrintHistory, PrintHistoryFilament, Printer
from app.schemas import CalculationRequest, FilamentInputItem
from app.services.calculation_service import calculate_print_cost

router = APIRouter(prefix="/api/calculation", tags=["calculation"])


@router.post("/calculate")
def calculate(
    data: CalculationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Standalone-Kalkulator: gibt Kostenaufschlüsselung zurück."""
    try:
        return calculate_print_cost(
            db=db,
            printer_id=data.printer_id,
            duration_hours=data.duration_hours,
            material_g=data.material_g,
            filament_id=data.filament_id,
            filaments=data.filaments,
            actual_kwh=data.actual_kwh,
            quantity=data.quantity,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


class JobCalcBody(BaseModel):
    """Body für Auftrags-Kalkulation."""
    printer_id: int
    filaments: Optional[List[FilamentInputItem]] = None
    filament_id: Optional[int] = None  # Einzelfall-Kompatibilität


@router.post("/jobs/{job_id}/calculate")
def calculate_for_job(
    job_id: int,
    body: JobCalcBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Berechnet Kalkulation für einen Auftrag und speichert sie.
    Nutzt estimated_hours aus dem Auftrag.
    Bei Multi-Filament: Liste mit Filament + Gramm.
    Bei Single: filament_id + estimated_material_g vom Auftrag.
    """
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Auftrag nicht gefunden")
    if not job.estimated_hours:
        raise HTTPException(400, "Bitte zuerst Geschätzte Stunden im Auftrag eintragen")

    # Multi-Filament hat Vorrang
    if body.filaments:
        total_g = sum(f.grams for f in body.filaments)
        if total_g <= 0:
            raise HTTPException(400, "Keine Filament-Gramm angegeben")
        result = calculate_print_cost(
            db=db,
            printer_id=body.printer_id,
            duration_hours=job.estimated_hours,
            filaments=body.filaments,
            quantity=job.quantity or 1,
        )
    else:
        if not job.estimated_material_g:
            raise HTTPException(400, "Bitte Materialbedarf eintragen oder Filamente angeben")
        result = calculate_print_cost(
            db=db,
            printer_id=body.printer_id,
            duration_hours=job.estimated_hours,
            material_g=job.estimated_material_g,
            filament_id=body.filament_id,
            quantity=job.quantity or 1,
        )

    # Im Auftrag speichern
    job.calculated_cost_net = result["total_cost_net"]
    job.calculated_price_net = result["calculated_price_net"]
    job.cost_breakdown = json.dumps(result, ensure_ascii=False)
    db.commit()

    return result


@router.get("/history/{history_id}/cost")
def cost_for_history_entry(
    history_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Berechnet die tatsächlichen Kosten eines bereits gedruckten Eintrags."""
    entry = db.query(PrintHistory).filter(PrintHistory.id == history_id).first()
    if not entry:
        raise HTTPException(404, "Eintrag nicht gefunden")

    duration_h = (entry.duration_minutes or 0) / 60
    if duration_h == 0:
        raise HTTPException(400, "Dauer fehlt - kann nicht kalkulieren")

    # Wenn Multi-Filament-Verwendung gespeichert: nutze diese Liste
    filament_usage = db.query(PrintHistoryFilament).filter(
        PrintHistoryFilament.history_id == history_id
    ).all()

    if filament_usage:
        items = [
            FilamentInputItem(filament_id=u.filament_id, grams=u.grams_used)
            for u in filament_usage if u.filament_id and u.grams_used
        ]
        if items:
            return calculate_print_cost(
                db=db,
                printer_id=entry.printer_id,
                duration_hours=duration_h,
                filaments=items,
                actual_kwh=entry.power_used_kwh,
                quantity=1,
            )

    # Fallback: Legacy Single-Filament
    if not entry.material_used_g:
        raise HTTPException(400, "Materialverbrauch fehlt - kann nicht kalkulieren")
    return calculate_print_cost(
        db=db,
        printer_id=entry.printer_id,
        duration_hours=duration_h,
        material_g=entry.material_used_g,
        filament_id=entry.filament_id,
        actual_kwh=entry.power_used_kwh,
        quantity=1,
    )
