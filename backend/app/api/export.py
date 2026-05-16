"""CSV-Export für Aufträge, Rechnungen, Druckhistorie, Filamente."""
import csv
import io
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import (
    PrintJob, Customer, Invoice, PrintHistory, Filament, InventoryItem, User,
)

router = APIRouter(prefix="/api/export", tags=["export"])


def _csv_response(rows, filename):
    """Erzeugt eine CSV-Response (UTF-8 mit BOM für Excel-Kompatibilität)."""
    if not rows:
        rows = [{"info": "Keine Daten"}]
    output = io.StringIO()
    output.write("\ufeff")  # BOM
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()), delimiter=";")
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/jobs")
def export_jobs(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(PrintJob)
    if status:
        q = q.filter(PrintJob.status == status)
    jobs = q.order_by(PrintJob.created_at.desc()).all()
    rows = []
    for j in jobs:
        c = j.customer
        cname = ""
        if c:
            cname = c.company_name if c.customer_type == "business" else \
                f"{c.first_name or ''} {c.last_name or ''}".strip()
        rows.append({
            "Auftragsnummer": j.order_number or "",
            "Titel": j.title,
            "Kunde": cname,
            "Kundennummer": c.customer_number if c else "",
            "Status": j.status,
            "Auftragsdatum": j.order_date.isoformat() if j.order_date else "",
            "Lieferdatum": j.due_date.isoformat() if j.due_date else "",
            "Abschlussdatum": j.completion_date.isoformat() if j.completion_date else "",
            "Stueckzahl": j.quantity or 1,
            "Geschaetzte_Stunden": j.estimated_hours or "",
            "Material_g": j.estimated_material_g or "",
            "Selbstkosten_Netto_EUR": j.calculated_cost_net or "",
            "Verkaufspreis_Netto_EUR": j.price_net or "",
            "MwSt_Prozent": j.vat_rate or "",
            "Verkaufspreis_Brutto_EUR": j.price_gross or "",
            "Anzahl_Druckplatten": len(j.plates) if j.plates else "",
            "Notizen": (j.notes or "").replace("\n", " | "),
        })
    return _csv_response(rows, f"auftraege_{datetime.now():%Y%m%d}.csv")


@router.get("/invoices")
def export_invoices(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Invoice)
    if status:
        q = q.filter(Invoice.status == status)
    invoices = q.order_by(Invoice.invoice_date.desc()).all()
    rows = []
    for inv in invoices:
        c = inv.customer
        cname = ""
        if c:
            cname = c.company_name if c.customer_type == "business" else \
                f"{c.first_name or ''} {c.last_name or ''}".strip()
        rows.append({
            "Rechnungsnummer": inv.invoice_number,
            "Datum": inv.invoice_date.isoformat() if inv.invoice_date else "",
            "Leistungsdatum": inv.service_date.isoformat() if inv.service_date else "",
            "Faelligkeit": inv.due_date.isoformat() if inv.due_date else "",
            "Bezahlt_am": inv.paid_date.isoformat() if inv.paid_date else "",
            "Status": inv.status,
            "Kunde": cname,
            "Kundennummer": c.customer_number if c else "",
            "Netto_EUR": inv.subtotal_net,
            "MwSt_EUR": inv.vat_total,
            "Brutto_EUR": inv.total_gross,
            "Mahnstufe": inv.reminder_count or 0,
            "Zahlungsweise": inv.payment_method or "",
            "Anzahl_Positionen": len(inv.items),
        })
    return _csv_response(rows, f"rechnungen_{datetime.now():%Y%m%d}.csv")


@router.get("/history")
def export_history(
    days: int = Query(default=365, ge=1, le=3650),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=days)
    entries = (
        db.query(PrintHistory)
        .filter(PrintHistory.created_at >= since)
        .order_by(PrintHistory.created_at.desc())
        .all()
    )
    rows = []
    for e in entries:
        filaments_used = []
        for u in e.filament_usage or []:
            if u.filament:
                filaments_used.append(
                    f"{u.filament.material} {u.filament.color or ''} ({u.grams_used:.0f}g)".strip()
                )
            else:
                filaments_used.append(f"unbekannt ({u.grams_used:.0f}g)")
        rows.append({
            "Datum": e.start_time.isoformat() if e.start_time else e.created_at.isoformat(),
            "Job": e.job_name,
            "Datei": e.file_name or "",
            "Drucker_ID": e.printer_id,
            "Auftrag_ID": e.job_id or "",
            "Status": e.status or "",
            "Dauer_Min": e.duration_minutes or "",
            "Material_g": e.material_used_g or "",
            "Strom_kWh": e.power_used_kwh or "",
            "Layer": e.layer_count or "",
            "Filamente": " + ".join(filaments_used) if filaments_used else "",
            "Notizen": (e.notes or "").replace("\n", " | "),
        })
    return _csv_response(rows, f"druckhistorie_{datetime.now():%Y%m%d}.csv")


@router.get("/customers")
def export_customers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    customers = db.query(Customer).order_by(Customer.id).all()
    rows = []
    for c in customers:
        rows.append({
            "Kundennummer": c.customer_number or "",
            "Typ": "Geschaeftskunde" if c.customer_type == "business" else "Privat",
            "Firma": c.company_name or "",
            "Vorname": c.first_name or "",
            "Nachname": c.last_name or "",
            "Email": c.email or "",
            "Telefon": c.phone or "",
            "Strasse": c.street or "",
            "PLZ": c.zip_code or "",
            "Ort": c.city or "",
            "Land": c.country or "",
            "USt_ID": c.vat_id or "",
            "Notizen": (c.notes or "").replace("\n", " | "),
        })
    return _csv_response(rows, f"kunden_{datetime.now():%Y%m%d}.csv")


@router.get("/filaments")
def export_filaments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    filaments = db.query(Filament).order_by(Filament.material, Filament.color).all()
    rows = []
    for f in filaments:
        rows.append({
            "ID": f.id,
            "Material": f.material,
            "Hersteller": f.manufacturer or "",
            "Farbe": f.color or "",
            "Farbcode": f.color_hex or "",
            "Durchmesser_mm": f.diameter or "",
            "Gesamtgewicht_g": f.spool_weight or "",
            "Restmenge_g": f.remaining_weight or 0,
            "Kaufpreis_EUR": f.purchase_price or "",
            "EUR_pro_kg": round(f.purchase_price / f.spool_weight * 1000, 2)
                if f.purchase_price and f.spool_weight else "",
            "Kaufdatum": f.purchase_date.isoformat() if f.purchase_date else "",
            "Charge": f.batch_number or "",
            "Lagerort_ID": f.storage_id or "",
            "Notizen": (f.notes or "").replace("\n", " | "),
        })
    return _csv_response(rows, f"filamente_{datetime.now():%Y%m%d}.csv")


@router.get("/inventory")
def export_inventory(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = db.query(InventoryItem).order_by(
        InventoryItem.category, InventoryItem.name
    ).all()
    rows = []
    for it in items:
        rows.append({
            "Name": it.name,
            "Kategorie": it.category,
            "Hersteller": it.manufacturer or "",
            "Artikelnummer": it.part_number or "",
            "Bestand": it.quantity or 0,
            "Einheit": it.unit or "Stk",
            "Mindestbestand": it.minimum_stock or 0,
            "Stueckpreis_EUR": it.purchase_price or 0,
            "Gesamtwert_EUR": round((it.quantity or 0) * (it.purchase_price or 0), 2),
            "Lieferant": it.supplier or "",
            "Kaufdatum": it.purchase_date.isoformat() if it.purchase_date else "",
            "Lagerort": it.location or "",
            "Notizen": (it.notes or "").replace("\n", " | "),
        })
    return _csv_response(rows, f"inventar_{datetime.now():%Y%m%d}.csv")
