"""
Filament-Verbrauchs-Service mit FIFO-Logik.

Bei mehreren Rollen vom gleichen Typ wird immer von der Rolle mit der
geringsten Restmenge zuerst entnommen (ökonomisch: Rollen leer machen
bevor eine neue angebrochen wird).
"""
import logging
from typing import List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import Filament

logger = logging.getLogger(__name__)


def consume_by_type(
    db: Session,
    material: str,
    manufacturer: str,
    grams: float,
    color: str = None,
    color_hex: str = None,
) -> List[Tuple[int, float]]:
    """
    Bucht 'grams' g von einem Filament-Typ ab, verteilt auf mehrere Rollen
    nach FIFO (niedrigste Restmenge zuerst).

    Returns: Liste von (filament_id, abgezogene_gramm) Tupeln.
    Wenn nicht genug Material vorhanden ist, werden trotzdem die verfügbaren
    Rollen geleert und der Rest wird "geschuldet" (negative Bilanz nicht möglich).
    """
    if grams <= 0:
        return []

    q = db.query(Filament).filter(
        func.lower(Filament.material) == (material or "").lower(),
        func.lower(Filament.manufacturer) == (manufacturer or "").lower(),
        Filament.remaining_weight > 0,
    )
    if color is not None:
        q = q.filter(func.lower(Filament.color) == color.lower())
    if color_hex is not None:
        q = q.filter(func.lower(Filament.color_hex) == color_hex.lower())

    spools = q.order_by(Filament.remaining_weight.asc()).all()
    if not spools:
        logger.warning(f"FIFO-Verbrauch: keine Rollen für {material}/{manufacturer}/{color} gefunden")
        return []

    result = []
    remaining = grams
    for spool in spools:
        if remaining <= 0:
            break
        available = spool.remaining_weight or 0
        if available <= 0:
            continue
        taken = min(available, remaining)
        spool.remaining_weight = max(0, available - taken)
        remaining -= taken
        result.append((spool.id, taken))
        logger.info(f"FIFO: {taken:.1f}g aus Rolle #{spool.id} (Rest: {spool.remaining_weight:.1f}g)")

    if remaining > 0:
        logger.warning(f"FIFO-Verbrauch: {remaining:.1f}g konnten NICHT abgebucht werden (Bestand leer)")

    return result


def consume_from_specific_spool(db: Session, filament_id: int, grams: float) -> Tuple[int, float]:
    """Bucht 'grams' g von einer konkreten Rolle ab. Falls die nicht reicht,
    wird der Rest aus dem nächsten gleichen Typ entnommen (FIFO-Fallback).

    Returns: Liste von (filament_id, taken) Tupeln.
    """
    spool = db.query(Filament).filter(Filament.id == filament_id).first()
    if not spool:
        return []

    available = spool.remaining_weight or 0
    if available >= grams:
        spool.remaining_weight = available - grams
        return [(spool.id, grams)]

    # Rolle leeren
    result = []
    if available > 0:
        spool.remaining_weight = 0
        result.append((spool.id, available))
        remaining = grams - available
    else:
        remaining = grams

    # Restmenge per FIFO aus gleichem Typ holen
    fifo = consume_by_type(
        db, spool.material, spool.manufacturer, remaining,
        color=spool.color, color_hex=spool.color_hex,
    )
    # Den ausgewählten Spool selbst aus FIFO-Liste rausfiltern (sind ja schon 0)
    fifo = [t for t in fifo if t[0] != spool.id]
    result.extend(fifo)
    return result
