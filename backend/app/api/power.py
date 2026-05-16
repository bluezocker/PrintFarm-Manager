"""Strom-API über Tuya Cloud."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Printer, PowerReading, User
from app.schemas import PowerReadingRead, PowerSummary
from app.services.tuya_service import tuya_service

router = APIRouter(prefix="/api/power", tags=["power"])


@router.get("/{printer_id}/current")
def get_current_power(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    """Liest aktuelle Werte live von der Tuya-Steckdose."""
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    if not printer.tuya_device_id:
        raise HTTPException(400, "Keine Tuya-Steckdose verknüpft")

    data = tuya_service.get_device_status(printer.tuya_device_id)
    if not data:
        raise HTTPException(503, "Tuya nicht erreichbar oder Gerät offline")

    # Sample speichern
    reading = PowerReading(
        printer_id=printer_id,
        power_w=data.get("power_w"),
        voltage_v=data.get("voltage_v"),
        current_ma=data.get("current_ma"),
        energy_kwh=data.get("energy_kwh"),
    )
    db.add(reading)
    db.commit()
    return data


@router.get("/{printer_id}/summary", response_model=PowerSummary)
def get_summary(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    """Aggregierte Verbrauchsdaten aus den gespeicherten Readings."""
    today = datetime.utcnow().date()
    month_start = today.replace(day=1)

    last = (
        db.query(PowerReading)
        .filter(PowerReading.printer_id == printer_id)
        .order_by(PowerReading.timestamp.desc())
        .first()
    )

    # Tages-/Monatsverbrauch: höchster minus niedrigster energy_kwh-Wert im Zeitraum
    def range_consumption(start_date):
        rows = (
            db.query(
                func.min(PowerReading.energy_kwh),
                func.max(PowerReading.energy_kwh),
            )
            .filter(
                PowerReading.printer_id == printer_id,
                PowerReading.timestamp >= start_date,
                PowerReading.energy_kwh.isnot(None),
            )
            .first()
        )
        if rows and rows[0] is not None and rows[1] is not None:
            return max(rows[1] - rows[0], 0)
        return None

    return PowerSummary(
        current_power_w=last.power_w if last else None,
        today_kwh=range_consumption(today),
        month_kwh=range_consumption(month_start),
        total_kwh=last.energy_kwh if last else None,
        last_update=last.timestamp if last else None,
    )


@router.get("/{printer_id}/history", response_model=list[PowerReadingRead])
def get_history(
    printer_id: int,
    hours: int = 24,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Verlauf der letzten N Stunden (Standard: 24h)."""
    since = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(PowerReading)
        .filter(PowerReading.printer_id == printer_id, PowerReading.timestamp >= since)
        .order_by(PowerReading.timestamp)
        .all()
    )
