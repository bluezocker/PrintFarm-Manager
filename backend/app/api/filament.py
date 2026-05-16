"""Filament- und Lagerortverwaltung.

WICHTIG: Spezifische Routen (z.B. /filaments/brands, /filaments/grouped)
MÜSSEN VOR den generischen (/filaments/{filament_id}) stehen, sonst matcht
FastAPI die ID-Route und versucht "brands" als int zu parsen.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.filament_brands import FILAMENT_MANUFACTURERS
from app.models import Filament, StorageLocation, User
from app.schemas import (
    FilamentCreate, FilamentRead, FilamentUpdate,
    StorageLocationCreate, StorageLocationRead,
)

router = APIRouter(prefix="/api", tags=["filament"])


# ============ Lagerorte ============

@router.get("/storage", response_model=list[StorageLocationRead])
def list_storage(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(StorageLocation).order_by(StorageLocation.name).all()


@router.post("/storage", response_model=StorageLocationRead, status_code=201)
def create_storage(
    data: StorageLocationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = StorageLocation(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/storage/{storage_id}", status_code=204)
def delete_storage(
    storage_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    s = db.query(StorageLocation).filter(StorageLocation.id == storage_id).first()
    if not s:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(s)
    db.commit()


# ============ Filamente - Liste & Anlegen ============

@router.get("/filaments", response_model=list[FilamentRead])
def list_filaments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Filament).order_by(Filament.material, Filament.color).all()


@router.post("/filaments", response_model=FilamentRead, status_code=201)
def create_filament(
    data: FilamentCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    f = Filament(**data.model_dump())
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


# ============ SPEZIFISCHE Routen - MÜSSEN vor /{filament_id} stehen! ============

@router.get("/filaments/brands")
def list_brands(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Vorgeschlagene Hersteller + alle bereits in DB benutzten zusätzlich."""
    db_brands = (
        db.query(Filament.manufacturer)
        .filter(Filament.manufacturer.isnot(None), Filament.manufacturer != "")
        .distinct()
        .all()
    )
    custom = sorted({b[0] for b in db_brands if b[0] not in FILAMENT_MANUFACTURERS})
    return {"suggested": FILAMENT_MANUFACTURERS, "custom": custom}


def _group_key(f: Filament) -> str:
    """Eindeutiger Key pro Filament-Typ: Material + Hersteller + Farbe + Hex."""
    return f"{(f.material or '').strip().lower()}|" \
           f"{(f.manufacturer or '').strip().lower()}|" \
           f"{(f.color or '').strip().lower()}|" \
           f"{(f.color_hex or '').strip().lower()}"


@router.get("/filaments/grouped")
def list_grouped(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Filamente gruppiert nach Material+Hersteller+Farbe.
    Mehrere Rollen werden als ein Typ zusammengefasst.
    """
    all_filaments = db.query(Filament).order_by(Filament.remaining_weight).all()

    groups = {}
    for f in all_filaments:
        key = _group_key(f)
        if key not in groups:
            groups[key] = {
                "key": key,
                "material": f.material,
                "manufacturer": f.manufacturer,
                "color": f.color,
                "color_hex": f.color_hex,
                "spools": [],
                "total_remaining_g": 0.0,
                "total_initial_g": 0.0,
                "spool_count": 0,
                "avg_price_per_kg": 0.0,
                "diameter": f.diameter,
                "lowest_remaining_id": None,
            }
        groups[key]["spools"].append({
            "id": f.id,
            "remaining_weight": f.remaining_weight or 0,
            "spool_weight": f.spool_weight or 1000,
            "purchase_price": f.purchase_price or 0,
            "purchase_date": f.purchase_date.isoformat() if f.purchase_date else None,
            "batch_number": f.batch_number,
            "storage_id": f.storage_id,
            "notes": f.notes,
        })
        groups[key]["total_remaining_g"] += f.remaining_weight or 0
        groups[key]["total_initial_g"] += f.spool_weight or 0
        groups[key]["spool_count"] += 1

    result = []
    for g in groups.values():
        g["spools"].sort(key=lambda s: s["remaining_weight"])
        if g["spools"]:
            g["lowest_remaining_id"] = g["spools"][0]["id"]
        priced = [
            s for s in g["spools"]
            if s["purchase_price"] > 0 and s["spool_weight"] > 0
        ]
        if priced:
            g["avg_price_per_kg"] = round(
                sum(s["purchase_price"] / s["spool_weight"] * 1000 for s in priced) / len(priced),
                2,
            )
        g["total_remaining_g"] = round(g["total_remaining_g"], 1)
        g["total_initial_g"] = round(g["total_initial_g"], 1)
        result.append(g)

    result.sort(key=lambda x: (
        x["material"] or "", x["manufacturer"] or "", x["color"] or "",
    ))
    return result


@router.get("/filaments/lowest-remaining")
def lowest_remaining(
    material: str,
    manufacturer: str,
    color: str | None = None,
    color_hex: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Findet die Rolle eines Typs mit der niedrigsten Restmenge (FIFO)."""
    q = db.query(Filament).filter(
        func.lower(Filament.material) == (material or "").lower(),
        func.lower(Filament.manufacturer) == (manufacturer or "").lower(),
    )
    if color is not None:
        q = q.filter(func.lower(Filament.color) == color.lower())
    if color_hex is not None:
        q = q.filter(func.lower(Filament.color_hex) == color_hex.lower())
    q = q.filter(Filament.remaining_weight > 0)
    spool = q.order_by(Filament.remaining_weight.asc()).first()
    if not spool:
        raise HTTPException(404, "Keine passende Rolle mit Restbestand gefunden")
    return {
        "filament_id": spool.id,
        "material": spool.material,
        "manufacturer": spool.manufacturer,
        "color": spool.color,
        "remaining_weight": spool.remaining_weight,
    }


# ============ Rollen-Operationen mit ID ============

class AddSpoolBody(BaseModel):
    """Body für 'weitere Spule zu existierendem Typ hinzufügen'."""
    spool_weight: float = 1000.0
    remaining_weight: Optional[float] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None
    batch_number: Optional[str] = None
    storage_id: Optional[int] = None
    notes: Optional[str] = None


@router.post("/filaments/{filament_id}/add-spool", response_model=FilamentRead, status_code=201)
def add_spool(
    filament_id: int,
    body: AddSpoolBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Legt eine weitere Spule des gleichen Typs an."""
    template = db.query(Filament).filter(Filament.id == filament_id).first()
    if not template:
        raise HTTPException(404, "Filament nicht gefunden")

    purchase_date = None
    if body.purchase_date:
        try:
            purchase_date = datetime.fromisoformat(body.purchase_date).date()
        except ValueError:
            pass

    new_spool = Filament(
        material=template.material,
        manufacturer=template.manufacturer,
        color=template.color,
        color_hex=template.color_hex,
        diameter=template.diameter,
        nozzle_temp=template.nozzle_temp,
        bed_temp=template.bed_temp,
        spool_weight=body.spool_weight,
        remaining_weight=body.remaining_weight if body.remaining_weight is not None else body.spool_weight,
        purchase_price=body.purchase_price if body.purchase_price is not None else template.purchase_price,
        purchase_date=purchase_date,
        batch_number=body.batch_number,
        storage_id=body.storage_id if body.storage_id is not None else template.storage_id,
        notes=body.notes,
    )
    db.add(new_spool)
    db.commit()
    db.refresh(new_spool)
    return new_spool


# ============ Generische ID-Routen (MÜSSEN am Ende stehen!) ============

@router.get("/filaments/{filament_id}", response_model=FilamentRead)
def get_filament(
    filament_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    f = db.query(Filament).filter(Filament.id == filament_id).first()
    if not f:
        raise HTTPException(404, "Filament nicht gefunden")
    return f


@router.patch("/filaments/{filament_id}", response_model=FilamentRead)
def update_filament(
    filament_id: int,
    data: FilamentUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(Filament).filter(Filament.id == filament_id).first()
    if not f:
        raise HTTPException(404, "Nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    return f


@router.delete("/filaments/{filament_id}", status_code=204)
def delete_filament(
    filament_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    f = db.query(Filament).filter(Filament.id == filament_id).first()
    if not f:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(f)
    db.commit()
