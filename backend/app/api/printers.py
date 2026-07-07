"""Druckerverwaltung mit Bambu-Live-Status und Wartungseinträgen."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Printer, Maintenance, User
from app.schemas import (
    PrinterCreate, PrinterRead, PrinterUpdate,
    MaintenanceCreate, MaintenanceRead,
)
from app.services.bambu_service import bambu_manager
from app.services.camera_service import camera_manager

router = APIRouter(prefix="/api/printers", tags=["printers"])


@router.get("", response_model=list[PrinterRead])
def list_printers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Printer).order_by(Printer.name).all()


def _register_printer_mqtt(printer: Printer, db: Session):
    """Verbindet einen Drucker je nach Modus mit LAN oder Cloud.

    Cloud-Modus liest die Account-Daten aus IntegrationSettings (Verwaltung → Integrationen).
    """
    if not printer.bambu_serial:
        return  # ohne Serial geht gar nichts

    if printer.connection_mode == "cloud":
        # Cloud-Account aus Integrationen laden
        from app.models import IntegrationSettings
        s = db.query(IntegrationSettings).first()
        if not s or not s.bambu_enabled or not s.bambu_cloud_email or not s.bambu_cloud_password:
            # Keine Cloud-Daten konfiguriert - nichts tun, User muss erst in Integrationen pflegen
            return
        bambu_manager.register_cloud(
            printer.id, printer.bambu_serial,
            s.bambu_cloud_email, s.bambu_cloud_password,
        )
        # Im Cloud-Modus keine LAN-Kamera
        return

    # LAN-Modus (Default)
    if printer.bambu_ip and printer.bambu_access_code:
        bambu_manager.register_lan(
            printer.id, printer.bambu_ip, printer.bambu_access_code, printer.bambu_serial,
        )
        camera_manager.register(printer.id, printer.bambu_ip, printer.bambu_access_code)


@router.post("", response_model=PrinterRead, status_code=201)
def create_printer(
    data: PrinterCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = Printer(**data.model_dump())
    db.add(printer)
    db.commit()
    db.refresh(printer)
    _register_printer_mqtt(printer, db)
    return printer


@router.get("/{printer_id}", response_model=PrinterRead)
def get_printer(printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    return printer


@router.patch("/{printer_id}", response_model=PrinterRead)
def update_printer(
    printer_id: int,
    data: PrinterUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(printer, k, v)
    db.commit()
    db.refresh(printer)
    _register_printer_mqtt(printer, db)
    return printer


@router.delete("/{printer_id}", status_code=204)
def delete_printer(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Nicht gefunden")
    bambu_manager.unregister(printer_id)
    camera_manager.unregister(printer_id)
    db.delete(printer)
    db.commit()


# ============ Live-Status via Bambu MQTT ============

@router.get("/{printer_id}/status")
def get_live_status(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")

    client = bambu_manager.get(printer_id)
    if not client and printer.bambu_serial:
        # Lazy-Register beim ersten Status-Abruf
        _register_printer_mqtt(printer, db)
        client = bambu_manager.get(printer_id)

    if not client:
        return {"connected": False, "error": "Bambu-Daten nicht konfiguriert"}

    status = client.get_status_summary()

    # In DB persistieren
    if status.get("status"):
        printer.status = status["status"]
        printer.current_job_name = status.get("current_job_name")
        printer.progress = status.get("progress") or 0.0
        printer.nozzle_temp = status.get("nozzle_temp")
        printer.bed_temp = status.get("bed_temp")
        printer.remaining_time = status.get("remaining_time")
        printer.last_seen = datetime.utcnow()
        db.commit()

    return status


@router.post("/{printer_id}/pause")
def pause_print(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.pause_print()}


@router.post("/{printer_id}/resume")
def resume_print(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.resume_print()}


@router.post("/{printer_id}/stop")
def stop_print(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.stop_print()}


# ============ Wartungseinträge ============

@router.get("/{printer_id}/maintenances", response_model=list[MaintenanceRead])
def list_maintenances(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    return (
        db.query(Maintenance)
        .filter(Maintenance.printer_id == printer_id)
        .order_by(Maintenance.date.desc())
        .all()
    )


@router.post("/{printer_id}/maintenances", response_model=MaintenanceRead, status_code=201)
def add_maintenance(
    printer_id: int,
    data: MaintenanceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not db.query(Printer).filter(Printer.id == printer_id).first():
        raise HTTPException(404, "Drucker nicht gefunden")
    m = Maintenance(printer_id=printer_id, **data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/maintenances/{maintenance_id}", status_code=204)
def delete_maintenance(
    maintenance_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    m = db.query(Maintenance).filter(Maintenance.id == maintenance_id).first()
    if not m:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(m)
    db.commit()


# ============ Erweiterte Bambu-Steuerung ============

@router.post("/{printer_id}/led")
def set_led(
    printer_id: int,
    on: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.set_led(on)}


@router.post("/{printer_id}/home")
def home_printer(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.home_printer()}


@router.post("/{printer_id}/speed")
def set_speed(
    printer_id: int,
    level: int = 2,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if level < 1 or level > 4:
        raise HTTPException(400, "Level muss zwischen 1 und 4 sein")
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.set_print_speed(level)}


@router.post("/{printer_id}/move")
def move_axis(
    printer_id: int,
    axis: str,
    distance: float,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if axis.upper() not in ("X", "Y", "Z"):
        raise HTTPException(400, "Achse muss X, Y oder Z sein")
    if abs(distance) > 200:
        raise HTTPException(400, "Distanz zu groß (max ±200mm)")
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.move_axis(axis, distance)}
