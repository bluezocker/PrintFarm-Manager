"""
Druckkalkulations-Service.

Unterstützt einzelne Filamente UND Multi-Color-Drucke mit beliebig vielen Filamenten.

Formel:
  Materialkosten = Summe aller (Filament-Preis/g × Verbrauch)
  Stromkosten    = (Ø Leistung / 1000) × Stunden × €/kWh  ODER gemessene kWh × €/kWh
  Maschinenzeit  = Stundensatz × Stunden
  Selbstkosten   = Material + Strom + Maschinenzeit
  Verkaufspreis  = Selbstkosten × (1 + Marge/100)
"""
from typing import Optional, Dict, List
from sqlalchemy.orm import Session

from app.models import Printer, Filament


def _filament_cost(db: Session, filament_id: int, grams: float) -> Dict:
    """Berechnet Kosten und Detail-Info für ein einzelnes Filament."""
    f = db.query(Filament).filter(Filament.id == filament_id).first()
    if not f:
        return {
            "filament_id": filament_id,
            "name": f"Filament #{filament_id} (gelöscht)",
            "grams": grams,
            "price_per_kg": 0.0,
            "cost": 0.0,
            "has_price": False,
        }
    has_price = bool(f.purchase_price and f.spool_weight)
    price_per_g = (f.purchase_price / f.spool_weight) if has_price else 0.0
    return {
        "filament_id": f.id,
        "name": f"{f.material} {f.color or ''}".strip(),
        "manufacturer": f.manufacturer,
        "grams": grams,
        "price_per_kg": round(price_per_g * 1000, 2),
        "cost": round(price_per_g * grams, 4),
        "has_price": has_price,
    }


def calculate_print_cost(
    db: Session,
    printer_id: int,
    duration_hours: float,
    material_g: Optional[float] = None,
    filament_id: Optional[int] = None,
    filaments: Optional[List] = None,
    actual_kwh: Optional[float] = None,
    quantity: int = 1,
) -> Dict:
    """
    Berechnet die Kosten eines Drucks.

    Material kann auf drei Arten angegeben werden:
    1. `filaments`-Liste: [{filament_id, grams}, ...] - Multi-Color (neu, empfohlen)
    2. `filament_id` + `material_g`: einzelnes Filament (alt, weiter unterstützt)
    3. nur `material_g`: ohne Filamentpreis (kein Materialkostenanteil)
    """
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        raise ValueError(f"Drucker {printer_id} nicht gefunden")

    # Maschinenzeit
    hourly_rate = printer.hourly_rate or 0.0
    machine_cost = hourly_rate * duration_hours

    # Strom
    power_price = printer.power_price_kwh or 0.30
    if actual_kwh is not None and actual_kwh > 0:
        kwh_used = actual_kwh
        power_source = "gemessen"
    else:
        avg_power = printer.avg_power_w or 120.0
        kwh_used = (avg_power / 1000) * duration_hours
        power_source = "geschätzt"
    power_cost = kwh_used * power_price

    # Material - normalisieren auf Liste
    filament_details: List[Dict] = []
    if filaments:
        # Multi-Color Modus
        for item in filaments:
            fid = item.get("filament_id") if isinstance(item, dict) else item.filament_id
            grams = item.get("grams") if isinstance(item, dict) else item.grams
            if fid and grams:
                filament_details.append(_filament_cost(db, fid, float(grams)))
    elif filament_id and material_g:
        # Legacy Single-Filament
        filament_details.append(_filament_cost(db, filament_id, float(material_g)))

    total_grams = sum(f["grams"] for f in filament_details) if filament_details else (material_g or 0.0)
    material_cost = sum(f["cost"] for f in filament_details)

    # Selbstkosten pro Stück
    cost_per_unit = machine_cost + power_cost + material_cost

    # Gesamt für Stückzahl
    total_cost = cost_per_unit * quantity

    # Verkaufspreis mit Marge
    margin = printer.margin_percent or 0.0
    calculated_price = total_cost * (1 + margin / 100)

    return {
        "quantity": quantity,
        "duration_hours": round(duration_hours, 2),
        "material_g": round(total_grams, 1),
        "per_unit": {
            "machine_cost": round(machine_cost, 2),
            "power_cost": round(power_cost, 2),
            "material_cost": round(material_cost, 2),
            "total_cost": round(cost_per_unit, 2),
        },
        "total_cost_net": round(total_cost, 2),
        "calculated_price_net": round(calculated_price, 2),
        "margin_percent": margin,
        "margin_amount": round(calculated_price - total_cost, 2),
        "details": {
            "hourly_rate": hourly_rate,
            "kwh_used": round(kwh_used, 3),
            "power_source": power_source,
            "power_price_kwh": power_price,
            "filaments": filament_details,  # Liste aller verwendeten Filamente mit Einzelkosten
            "printer_name": printer.name,
        },
    }
