"""Druckerverwaltung mit Bambu-Live-Status und Wartungseinträgen."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
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
    """Verbindet einen Drucker je nach Modus."""
    # OctoPrint-Modus
    if printer.connection_mode == "octoprint":
        from app.services.octoprint_service import octoprint_manager
        bambu_manager.unregister(printer.id)
        if printer.octo_url and printer.octo_api_key:
            octoprint_manager.register(
                printer.id, printer.octo_url, printer.octo_api_key,
            )
        return

    # Bei Wechsel: OctoPrint-Polling stoppen
    from app.services.octoprint_service import octoprint_manager
    octoprint_manager.unregister(printer.id)

    if not printer.bambu_serial:
        return

    if printer.connection_mode == "cloud":
        from app.models import IntegrationSettings
        s = db.query(IntegrationSettings).first()
        if not s or not s.bambu_enabled or not s.bambu_cloud_email or not s.bambu_cloud_password:
            return
        bambu_manager.register_cloud(
            printer.id, printer.bambu_serial,
            s.bambu_cloud_email, s.bambu_cloud_password,
        )
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

def _get_client(printer: Printer):
    """Holt passenden Client je nach connection_mode."""
    if printer.connection_mode == "octoprint":
        from app.services.octoprint_service import octoprint_manager
        client = octoprint_manager.get(printer.id)
        if not client:
            return None, None
        return client, client.get_status
    client = bambu_manager.get(printer.id)
    if not client:
        return None, None
    return client, client.get_status_summary


@router.get("/{printer_id}/status")
def get_live_status(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")

    client, get_status_fn = _get_client(printer)
    if not client:
        _register_printer_mqtt(printer, db)
        client, get_status_fn = _get_client(printer)

    if not client:
        if printer.connection_mode == "octoprint":
            return {"connected": False, "error": "OctoPrint-Daten nicht konfiguriert"}
        return {"connected": False, "error": "Bambu-Daten nicht konfiguriert"}

    status = get_status_fn()

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
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    if printer.connection_mode == "octoprint":
        from app.services.octoprint_service import octoprint_manager
        client = octoprint_manager.get(printer_id)
        if not client:
            raise HTTPException(400, "OctoPrint nicht verbunden")
        return {"success": client.pause()}
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.pause_print()}


@router.post("/{printer_id}/resume")
def resume_print(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    if printer.connection_mode == "octoprint":
        from app.services.octoprint_service import octoprint_manager
        client = octoprint_manager.get(printer_id)
        if not client:
            raise HTTPException(400, "OctoPrint nicht verbunden")
        return {"success": client.resume()}
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.resume_print()}


@router.post("/{printer_id}/stop")
def stop_print(
    printer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(404, "Drucker nicht gefunden")
    if printer.connection_mode == "octoprint":
        from app.services.octoprint_service import octoprint_manager
        client = octoprint_manager.get(printer_id)
        if not client:
            raise HTTPException(400, "OctoPrint nicht verbunden")
        return {"success": client.cancel()}
    client = bambu_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "Drucker nicht verbunden")
    return {"success": client.stop_print()}


# ============ OctoPrint-spezifische Endpoints ============

@router.get("/{printer_id}/octoprint/files")
def list_octoprint_files(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer or printer.connection_mode != "octoprint":
        raise HTTPException(400, "Nur für OctoPrint-Drucker verfügbar")
    from app.services.octoprint_service import octoprint_manager
    client = octoprint_manager.get(printer_id)
    if not client:
        _register_printer_mqtt(printer, db)
        client = octoprint_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "OctoPrint nicht erreichbar")
    return {"files": client.list_files()}


@router.post("/{printer_id}/octoprint/upload")
async def upload_octoprint_file(
    printer_id: int,
    file: UploadFile = File(...),
    print_now: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer or printer.connection_mode != "octoprint":
        raise HTTPException(400, "Nur für OctoPrint-Drucker verfügbar")
    from app.services.octoprint_service import octoprint_manager
    client = octoprint_manager.get(printer_id)
    if not client:
        _register_printer_mqtt(printer, db)
        client = octoprint_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "OctoPrint nicht erreichbar")
    content = await file.read()
    ok, result = client.upload_file(content, file.filename or "upload.gcode", print_now)
    if not ok:
        raise HTTPException(400, f"Upload fehlgeschlagen: {result}")
    return {"success": True, "path": result, "filename": file.filename, "print_started": print_now}


@router.post("/{printer_id}/octoprint/print")
def start_octoprint_print(
    printer_id: int,
    file_path: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer or printer.connection_mode != "octoprint":
        raise HTTPException(400, "Nur für OctoPrint-Drucker verfügbar")
    from app.services.octoprint_service import octoprint_manager
    client = octoprint_manager.get(printer_id)
    if not client:
        raise HTTPException(400, "OctoPrint nicht erreichbar")
    ok = client.select_and_print(file_path, print_now=True)
    if not ok:
        raise HTTPException(400, "Druck konnte nicht gestartet werden")
    return {"success": True}


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
